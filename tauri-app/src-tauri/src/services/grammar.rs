use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use std::collections::HashMap;
use tokio::time::{timeout, Duration};
use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarCheckResult {
    pub original_text: String,
    pub corrected_text: String,
    pub errors: Vec<GrammarError>,
    pub processing_time: f64,
    pub error_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarError {
    pub message: String,
    pub rule_id: String,
    pub category: String,
    pub offset: usize,
    pub length: usize,
    pub context: String,
    pub suggestions: Vec<String>,
    pub severity: String,
    pub confidence: f32,
    pub error_type: ErrorType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorType {
    Spelling,
    Grammar,
    Punctuation,
    Style,
    Redundancy,
    Clarity,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GrammarProvider {
    LanguageTool,
    OfflineRules,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarConfig {
    pub provider: GrammarProvider,
    pub language: String,
    pub enable_style_checks: bool,
    pub enable_picky_rules: bool,
    pub custom_server_url: Option<String>,
    pub offline_fallback: bool,
    pub auto_apply_high_confidence: bool,
    pub auto_apply_threshold: f32,
    pub realtime_checking: bool,
    pub smart_suggestions: bool,
}

#[derive(Debug, Deserialize)]
struct LanguageToolResponse {
    matches: Vec<LanguageToolMatch>,
}

#[derive(Debug, Deserialize)]
struct LanguageToolMatch {
    message: String,
    #[serde(rename = "shortMessage")]
    short_message: Option<String>,
    offset: usize,
    length: usize,
    replacements: Vec<LanguageToolReplacement>,
    context: LanguageToolContext,
    rule: LanguageToolRule,
}

#[derive(Debug, Deserialize)]
struct LanguageToolReplacement {
    value: String,
}

#[derive(Debug, Deserialize)]
struct LanguageToolContext {
    text: String,
    offset: usize,
    length: usize,
}

#[derive(Debug, Deserialize)]
struct LanguageToolRule {
    id: String,
    category: LanguageToolCategory,
}

#[derive(Debug, Deserialize)]
struct LanguageToolCategory {
    id: String,
    name: String,
}

pub struct GrammarService {
    client: Client,
    config: GrammarConfig,
    offline_rules: OfflineGrammarChecker,
    cache: Arc<DashMap<String, (GrammarCheckResult, Instant)>>,
}

impl Default for GrammarConfig {
    fn default() -> Self {
        Self {
            provider: GrammarProvider::Hybrid,
            language: "en-US".to_string(),
            enable_style_checks: true,
            enable_picky_rules: false,
            custom_server_url: None,
            offline_fallback: true,
            auto_apply_high_confidence: true,
            auto_apply_threshold: 0.9,
            realtime_checking: true,
            smart_suggestions: true,
        }
    }
}

impl GrammarService {
    pub fn new() -> Self {
        Self::with_config(GrammarConfig::default())
    }

    pub fn with_config(config: GrammarConfig) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
            offline_rules: OfflineGrammarChecker::new(),
            config,
            cache: Arc::new(DashMap::new()),
        }
    }

    pub fn with_custom_server(server_url: String) -> Self {
        let mut config = GrammarConfig::default();
        config.custom_server_url = Some(server_url);
        Self::with_config(config)
    }

    pub async fn check_text(&self, text: &str, auto_correct: bool) -> Result<GrammarCheckResult> {
        if text.trim().is_empty() {
            return Ok(GrammarCheckResult {
                original_text: text.to_string(),
                corrected_text: text.to_string(),
                errors: vec![],
                processing_time: 0.0,
                error_count: 0,
            });
        }

        // Check cache first
        let cache_key = format!("{}_{}_{}", text.trim(), auto_correct, self.config.smart_suggestions);
        if let Some(entry) = self.cache.get(&cache_key) {
            let (cached_result, cached_time) = entry.value();
            // Cache valid for 5 minutes
            if cached_time.elapsed() < Duration::from_secs(300) {
                return Ok(cached_result.clone());
            } else {
                // Remove expired cache entry
                drop(entry);
                self.cache.remove(&cache_key);
            }
        }

        let start_time = Instant::now();

        let errors = match self.config.provider {
            GrammarProvider::LanguageTool => {
                self.check_with_languagetool(text).await.unwrap_or_else(|e| {
                    log::warn!("LanguageTool failed: {}, falling back to offline", e);
                    if self.config.offline_fallback {
                        self.offline_rules.check_text(text)
                    } else {
                        vec![]
                    }
                })
            }
            GrammarProvider::OfflineRules => {
                self.offline_rules.check_text(text)
            }
            GrammarProvider::Hybrid => {
                let mut all_errors = self.offline_rules.check_text(text);

                // Try to enhance with LanguageTool
                if let Ok(online_errors) = self.check_with_languagetool(text).await {
                    // Merge errors, avoiding duplicates
                    for online_error in online_errors {
                        if !all_errors.iter().any(|e|
                            e.offset == online_error.offset &&
                            e.length == online_error.length
                        ) {
                            all_errors.push(online_error);
                        }
                    }
                }

                all_errors
            }
        };

        // Apply corrections if requested or if smart auto-correction is enabled
        let corrected_text = if auto_correct && !errors.is_empty() {
            self.apply_smart_corrections(text, &errors)
        } else if self.config.auto_apply_high_confidence && !errors.is_empty() {
            self.apply_high_confidence_corrections(text, &errors)
        } else {
            text.to_string()
        };

        let processing_time = start_time.elapsed().as_secs_f64();

        let result = GrammarCheckResult {
            original_text: text.to_string(),
            corrected_text,
            errors: errors.clone(),
            processing_time,
            error_count: errors.len(),
        };

        // Cache the result
        self.cache.insert(cache_key, (result.clone(), Instant::now()));
        
        // Limit cache size
        if self.cache.len() > 100 {
            self.cleanup_cache();
        }

        Ok(result)
    }

    fn cleanup_cache(&self) {
        let now = Instant::now();
        let expired_keys: Vec<String> = self.cache
            .iter()
            .filter_map(|entry| {
                let (key, (_, timestamp)) = entry.pair();
                if now.duration_since(*timestamp) > Duration::from_secs(300) {
                    Some(key.clone())
                } else {
                    None
                }
            })
            .collect();

        for key in expired_keys {
            self.cache.remove(&key);
        }

        // If still too many entries, remove oldest ones
        if self.cache.len() > 50 {
            let mut entries: Vec<_> = self.cache
                .iter()
                .map(|entry| {
                    let (key, (_, timestamp)) = entry.pair();
                    (key.clone(), *timestamp)
                })
                .collect();
            
            entries.sort_by_key(|(_, timestamp)| *timestamp);
            
            for (key, _) in entries.into_iter().take(self.cache.len() - 50) {
                self.cache.remove(&key);
            }
        }
    }

    pub async fn apply_specific_corrections(
        &self,
        text: &str,
        error_indices: &[usize],
    ) -> Result<String> {
        // First get all errors
        let result = self.check_text(text, false).await?;
        
        if error_indices.is_empty() || result.errors.is_empty() {
            return Ok(text.to_string());
        }

        // Filter errors by indices and sort by offset in reverse order
        let mut selected_errors: Vec<&GrammarError> = error_indices
            .iter()
            .filter_map(|&i| result.errors.get(i))
            .collect();
        
        selected_errors.sort_by(|a, b| b.offset.cmp(&a.offset));

        // Apply corrections
        let mut corrected_text = text.to_string();
        for error in selected_errors {
            if let Some(suggestion) = error.suggestions.first() {
                let start = error.offset;
                let end = error.offset + error.length;
                
                if end <= corrected_text.len() {
                    corrected_text.replace_range(start..end, suggestion);
                }
            }
        }

        Ok(corrected_text)
    }

    fn apply_corrections(&self, text: &str, errors: &[GrammarError]) -> String {
        let mut corrected = text.to_string();
        
        // Sort errors by offset in reverse order to avoid position shifts
        let mut sorted_errors = errors.to_vec();
        sorted_errors.sort_by(|a, b| b.offset.cmp(&a.offset));

        for error in sorted_errors {
            if let Some(suggestion) = error.suggestions.first() {
                let start = error.offset;
                let end = error.offset + error.length;
                
                if end <= corrected.len() {
                    corrected.replace_range(start..end, suggestion);
                }
            }
        }

        corrected
    }

    fn apply_smart_corrections(&self, text: &str, errors: &[GrammarError]) -> String {
        let mut corrected = text.to_string();
        
        // Sort errors by confidence and severity
        let mut sorted_errors = errors.to_vec();
        sorted_errors.sort_by(|a, b| {
            // Sort by confidence descending, then by severity priority
            let conf_cmp = b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal);
            if conf_cmp == std::cmp::Ordering::Equal {
                self.get_severity_priority(&b.severity).cmp(&self.get_severity_priority(&a.severity))
            } else {
                conf_cmp
            }
        });

        // Then sort by offset in reverse order to avoid position shifts
        sorted_errors.sort_by(|a, b| b.offset.cmp(&a.offset));

        for error in sorted_errors {
            if self.should_auto_apply(&error) {
                if let Some(suggestion) = self.get_best_suggestion(&error) {
                    let start = error.offset;
                    let end = error.offset + error.length;
                    
                    if end <= corrected.len() {
                        corrected.replace_range(start..end, suggestion);
                    }
                }
            }
        }

        corrected
    }

    fn apply_high_confidence_corrections(&self, text: &str, errors: &[GrammarError]) -> String {
        let mut corrected = text.to_string();
        
        // Filter and sort high-confidence errors
        let mut high_conf_errors: Vec<_> = errors.iter()
            .filter(|e| e.confidence >= self.config.auto_apply_threshold && self.is_safe_to_auto_correct(e))
            .collect();
        
        high_conf_errors.sort_by(|a, b| b.offset.cmp(&a.offset));

        for error in high_conf_errors {
            if let Some(suggestion) = self.get_best_suggestion(error) {
                let start = error.offset;
                let end = error.offset + error.length;
                
                if end <= corrected.len() {
                    corrected.replace_range(start..end, suggestion);
                }
            }
        }

        corrected
    }

    fn should_auto_apply(&self, error: &GrammarError) -> bool {
        if !self.config.smart_suggestions {
            return error.confidence >= self.config.auto_apply_threshold;
        }

        // Smart logic: auto-apply for common, safe error types
        match error.error_type {
            ErrorType::Spelling => error.confidence >= 0.8,
            ErrorType::Punctuation => error.confidence >= 0.9,
            ErrorType::Grammar => error.confidence >= 0.95, // More conservative for grammar
            ErrorType::Style => false, // Never auto-apply style changes
            ErrorType::Redundancy => error.confidence >= 0.9,
            ErrorType::Clarity => false, // Subjective, user should decide
            ErrorType::Other => error.confidence >= 0.95,
        }
    }

    fn is_safe_to_auto_correct(&self, error: &GrammarError) -> bool {
        // Define safe categories for auto-correction
        matches!(error.error_type, 
            ErrorType::Spelling | 
            ErrorType::Punctuation | 
            ErrorType::Redundancy
        ) && error.severity == "error"
    }

    fn get_best_suggestion<'a>(&self, error: &'a GrammarError) -> Option<&'a String> {
        if !self.config.smart_suggestions {
            return error.suggestions.first();
        }

        // Smart suggestion selection
        error.suggestions.iter().find(|suggestion| {
            // Prefer shorter, simpler suggestions for high-confidence errors
            if error.confidence >= 0.9 {
                suggestion.len() <= error.length + 10 // Reasonable length limit
            } else {
                true
            }
        })
    }

    fn get_severity_priority(&self, severity: &str) -> u8 {
        match severity {
            "error" => 3,
            "warning" => 2,
            "info" => 1,
            _ => 0,
        }
    }

    async fn check_with_languagetool(&self, text: &str) -> Result<Vec<GrammarError>> {
        let default_url = "https://api.languagetool.org/v2/check".to_string();
        let server_url = self.config.custom_server_url
            .as_ref()
            .unwrap_or(&default_url);

        let mut params = vec![
            ("text", text),
            ("language", &self.config.language),
            ("enabledOnly", "false"),
        ];

        if self.config.enable_picky_rules {
            params.push(("level", "picky"));
        }

        let response = timeout(
            Duration::from_secs(8),
            self.client
                .post(server_url)
                .form(&params)
                .send()
        )
        .await
        .map_err(|_| anyhow!("LanguageTool request timed out"))?
        .map_err(|e| anyhow!("Failed to send request to LanguageTool: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "LanguageTool returned error: {}",
                response.status()
            ));
        }

        let lt_response: LanguageToolResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse LanguageTool response: {}", e))?;

        let errors = lt_response
            .matches
            .into_iter()
            .map(|m| {
                let error_type = self.categorize_error(&m.rule.category.id);
                GrammarError {
                    message: m.message,
                    rule_id: m.rule.id,
                    category: m.rule.category.name,
                    offset: m.offset,
                    length: m.length,
                    context: m.context.text,
                    suggestions: m.replacements.into_iter().map(|r| r.value).take(5).collect(),
                    severity: self.determine_severity(&m.rule.category.id),
                    confidence: 0.9, // LanguageTool generally has high confidence
                    error_type,
                }
            })
            .collect();

        Ok(errors)
    }

    fn categorize_error(&self, category_id: &str) -> ErrorType {
        match category_id {
            "TYPOS" => ErrorType::Spelling,
            "GRAMMAR" => ErrorType::Grammar,
            "PUNCTUATION" => ErrorType::Punctuation,
            "STYLE" => ErrorType::Style,
            "REDUNDANCY" => ErrorType::Redundancy,
            "CLARITY" => ErrorType::Clarity,
            _ => ErrorType::Other,
        }
    }

    fn determine_severity(&self, category_id: &str) -> String {
        match category_id {
            "TYPOS" => "error",
            "GRAMMAR" => "error",
            "PUNCTUATION" => "warning",
            "STYLE" => "info",
            "REDUNDANCY" => "info",
            "CLARITY" => "info",
            _ => "info",
        }.to_string()
    }

    pub async fn get_language_stats(&self, text: &str) -> Result<LanguageStats> {
        let words = text.split_whitespace().count();
        let characters = text.chars().count();
        let characters_no_spaces = text.chars().filter(|c| !c.is_whitespace()).count();
        let sentences = text.split(&['.', '!', '?'][..]).filter(|s| !s.trim().is_empty()).count();
        let paragraphs = text.split("\n\n").filter(|p| !p.trim().is_empty()).count();

        Ok(LanguageStats {
            words,
            characters,
            characters_no_spaces,
            sentences,
            paragraphs,
            reading_time_minutes: (words as f64 / 200.0).ceil() as usize, // Assuming 200 WPM
        })
    }
}

pub struct OfflineGrammarChecker {
    spelling_dict: HashMap<String, bool>,
    common_errors: HashMap<String, String>,
}

impl OfflineGrammarChecker {
    pub fn new() -> Self {
        let mut checker = Self {
            spelling_dict: HashMap::new(),
            common_errors: HashMap::new(),
        };

        checker.initialize_rules();
        checker
    }

    fn initialize_rules(&mut self) {
        // Add common spelling corrections
        self.common_errors.insert("teh".to_string(), "the".to_string());
        self.common_errors.insert("recieve".to_string(), "receive".to_string());
        self.common_errors.insert("seperate".to_string(), "separate".to_string());
        self.common_errors.insert("definately".to_string(), "definitely".to_string());
        self.common_errors.insert("occured".to_string(), "occurred".to_string());
        self.common_errors.insert("accomodate".to_string(), "accommodate".to_string());
        self.common_errors.insert("neccessary".to_string(), "necessary".to_string());
        self.common_errors.insert("embarass".to_string(), "embarrass".to_string());
        self.common_errors.insert("existance".to_string(), "existence".to_string());
        self.common_errors.insert("maintainance".to_string(), "maintenance".to_string());

        // Add basic dictionary words (in a real implementation, this would be loaded from a file)
        let common_words = vec![
            "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
            "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their",
        ];

        for word in common_words {
            self.spelling_dict.insert(word.to_string(), true);
        }
    }

    pub fn check_text(&self, text: &str) -> Vec<GrammarError> {
        let mut errors = Vec::new();

        // Check for spelling errors
        errors.extend(self.check_spelling(text));

        // Check for basic grammar patterns
        errors.extend(self.check_basic_grammar(text));

        // Check for punctuation issues
        errors.extend(self.check_punctuation(text));

        errors
    }

    fn check_spelling(&self, text: &str) -> Vec<GrammarError> {
        let mut errors = Vec::new();
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut offset = 0;

        for word in words {
            let clean_word = word.trim_matches(|c: char| !c.is_alphabetic()).to_lowercase();

            if !clean_word.is_empty() {
                if let Some(correction) = self.common_errors.get(&clean_word) {
                    errors.push(GrammarError {
                        message: format!("Possible spelling mistake found: '{}'", word),
                        rule_id: "SPELLING_MISTAKE".to_string(),
                        category: "Spelling".to_string(),
                        offset,
                        length: word.len(),
                        context: text.to_string(),
                        suggestions: vec![correction.clone()],
                        severity: "error".to_string(),
                        confidence: 0.8,
                        error_type: ErrorType::Spelling,
                    });
                }
            }

            offset += word.len() + 1; // +1 for space
        }

        errors
    }

    fn check_basic_grammar(&self, text: &str) -> Vec<GrammarError> {
        let mut errors = Vec::new();

        // Check for double spaces
        if let Some(pos) = text.find("  ") {
            errors.push(GrammarError {
                message: "Multiple consecutive spaces found".to_string(),
                rule_id: "DOUBLE_SPACE".to_string(),
                category: "Whitespace".to_string(),
                offset: pos,
                length: 2,
                context: text.to_string(),
                suggestions: vec![" ".to_string()],
                severity: "info".to_string(),
                confidence: 0.9,
                error_type: ErrorType::Style,
            });
        }

        // Check for sentence starting with lowercase (basic check)
        let sentences: Vec<&str> = text.split(&['.', '!', '?'][..]).collect();
        let mut offset = 0;

        for (i, sentence) in sentences.iter().enumerate() {
            let trimmed = sentence.trim();
            if !trimmed.is_empty() && i > 0 {
                if let Some(first_char) = trimmed.chars().next() {
                    if first_char.is_lowercase() {
                        errors.push(GrammarError {
                            message: "Sentence should start with a capital letter".to_string(),
                            rule_id: "SENTENCE_CAPITALIZATION".to_string(),
                            category: "Grammar".to_string(),
                            offset: offset + sentence.len() - trimmed.len(),
                            length: 1,
                            context: text.to_string(),
                            suggestions: vec![first_char.to_uppercase().to_string()],
                            severity: "warning".to_string(),
                            confidence: 0.7,
                            error_type: ErrorType::Grammar,
                        });
                    }
                }
            }
            offset += sentence.len() + 1; // +1 for punctuation
        }

        errors
    }

    fn check_punctuation(&self, text: &str) -> Vec<GrammarError> {
        let mut errors = Vec::new();

        // Check for space before punctuation
        let punctuation_chars = [',', '.', '!', '?', ';', ':'];
        for &punct in &punctuation_chars {
            let pattern = format!(" {}", punct);
            if let Some(pos) = text.find(&pattern) {
                errors.push(GrammarError {
                    message: format!("Unnecessary space before '{}'", punct),
                    rule_id: "SPACE_BEFORE_PUNCTUATION".to_string(),
                    category: "Punctuation".to_string(),
                    offset: pos,
                    length: 2,
                    context: text.to_string(),
                    suggestions: vec![punct.to_string()],
                    severity: "warning".to_string(),
                    confidence: 0.8,
                    error_type: ErrorType::Punctuation,
                });
            }
        }

        errors
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageStats {
    pub words: usize,
    pub characters: usize,
    pub characters_no_spaces: usize,
    pub sentences: usize,
    pub paragraphs: usize,
    pub reading_time_minutes: usize,
}
