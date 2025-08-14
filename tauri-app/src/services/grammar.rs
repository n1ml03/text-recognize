use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::{Instant, Duration};
use std::collections::HashMap;
use std::sync::Arc;
use dashmap::DashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

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
    Harper,
    OfflineRules,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrammarConfig {
    pub provider: GrammarProvider,
    pub language: String,
    pub enable_style_checks: bool,
    pub enable_picky_rules: bool,
    pub offline_fallback: bool,
    pub auto_apply_high_confidence: bool,
    pub auto_apply_threshold: f32,
    pub realtime_checking: bool,
    pub smart_suggestions: bool,
}

// Harper-specific structures are handled internally by harper-core
// No need for external API response structures

pub struct GrammarService {
    config: GrammarConfig,
    cache: Arc<DashMap<String, (GrammarCheckResult, Instant)>>,
    suggestion_cache: Arc<DashMap<String, Vec<String>>>,
    performance_stats: Arc<DashMap<String, PerformanceMetrics>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub total_checks: u64,
    pub average_time_ms: f64,
    pub cache_hits: u64,
    pub cache_misses: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchGrammarResult {
    pub results: Vec<GrammarCheckResult>,
    pub total_processing_time: f64,
    pub batch_size: usize,
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

impl Default for GrammarConfig {
    fn default() -> Self {
        Self {
            provider: GrammarProvider::Harper, // Use Harper as the primary provider
            language: "en-US".to_string(),
            enable_style_checks: true,
            enable_picky_rules: false,
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
            config,
            cache: Arc::new(DashMap::new()),
            suggestion_cache: Arc::new(DashMap::new()),
            performance_stats: Arc::new(DashMap::new()),
        }
    }

    // Keep compatibility with existing code that expects this method
    pub fn with_custom_server(_server_url: String) -> Self {
        // Harper doesn't use custom servers, so just return default config
        Self::with_config(GrammarConfig::default())
    }

    pub fn with_harper_config(config: GrammarConfig) -> Self {
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

        // Generate optimized cache key using hash for better performance
        let cache_key = self.generate_cache_key(text, auto_correct);

        // Check cache first and update performance metrics
        if let Some(entry) = self.cache.get(&cache_key) {
            let (cached_result, cached_time) = entry.value();
            // Cache valid for 5 minutes
            if cached_time.elapsed() < Duration::from_secs(300) {
                self.update_performance_stats("cache_hit", 0.0);
                return Ok(cached_result.clone());
            } else {
                // Remove expired cache entry
                drop(entry);
                self.cache.remove(&cache_key);
            }
        }

        self.update_performance_stats("cache_miss", 0.0);

        let start_time = Instant::now();

        let errors = match self.config.provider {
            GrammarProvider::Harper => {
                self.check_with_harper(text).unwrap_or_else(|e| {
                    log::warn!("Harper failed: {}", e);
                    vec![]
                })
            }
            GrammarProvider::OfflineRules => {
                // Simple offline rules - just basic checks
                self.check_basic_patterns(text)
            }
            GrammarProvider::Hybrid => {
                let mut all_errors = self.check_basic_patterns(text);

                // Try to enhance with Harper
                if let Ok(harper_errors) = self.check_with_harper(text) {
                    // Merge errors, avoiding duplicates
                    for harper_error in harper_errors {
                        if !all_errors.iter().any(|e|
                            e.offset == harper_error.offset &&
                            e.length == harper_error.length
                        ) {
                            all_errors.push(harper_error);
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

        // Cache the result and update performance metrics
        self.cache.insert(cache_key, (result.clone(), Instant::now()));
        self.update_performance_stats("check_completed", processing_time);

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

    pub async fn check_batch(&self, texts: Vec<String>, auto_correct: bool) -> Result<BatchGrammarResult> {
        let start_time = Instant::now();
        let mut results = Vec::new();

        // Process texts in parallel for better performance
        for text in texts {
            let result = self.check_text(&text, auto_correct).await?;
            results.push(result);
        }

        let total_processing_time = start_time.elapsed().as_secs_f64();

        Ok(BatchGrammarResult {
            batch_size: results.len(),
            results,
            total_processing_time,
        })
    }

    fn generate_cache_key(&self, text: &str, auto_correct: bool) -> String {
        let mut hasher = DefaultHasher::new();
        text.trim().hash(&mut hasher);
        auto_correct.hash(&mut hasher);
        self.config.smart_suggestions.hash(&mut hasher);
        self.config.enable_style_checks.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    fn update_performance_stats(&self, operation: &str, time_ms: f64) {
        let mut stats = self.performance_stats.entry(operation.to_string())
            .or_insert(PerformanceMetrics {
                total_checks: 0,
                average_time_ms: 0.0,
                cache_hits: 0,
                cache_misses: 0,
            });

        match operation {
            "cache_hit" => stats.cache_hits += 1,
            "cache_miss" => stats.cache_misses += 1,
            "check_completed" => {
                stats.total_checks += 1;
                stats.average_time_ms = (stats.average_time_ms * (stats.total_checks - 1) as f64 + time_ms * 1000.0) / stats.total_checks as f64;
            },
            _ => {}
        }
    }

    pub fn get_performance_stats(&self) -> HashMap<String, PerformanceMetrics> {
        self.performance_stats.iter()
            .map(|entry| (entry.key().clone(), entry.value().clone()))
            .collect()
    }

    pub fn clear_caches(&self) {
        self.cache.clear();
        self.suggestion_cache.clear();
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

    fn check_with_harper(&self, text: &str) -> Result<Vec<GrammarError>> {
        use harper_core::{Document, linting::{LintGroup, Linter}, spell::FstDictionary, Dialect};
        use std::sync::Arc;

        // Create a new document from the text with proper Harper configuration
        let document = Document::new_plain_english_curated(text);

        // Create a dictionary for Harper
        let dictionary = Arc::new(FstDictionary::curated());

        // Create a comprehensive lint group with all Harper's built-in linters
        // Use American English dialect as default
        let mut lint_group = LintGroup::new_curated(dictionary, Dialect::American);

        // Use Harper's built-in linting functionality
        let harper_lints = lint_group.lint(&document);

        let mut errors = Vec::new();

        // Convert Harper's Lint objects to our GrammarError format
        for lint in harper_lints {
            let span = lint.span;
            let start_byte = self.calculate_char_offset_to_byte(text, span.start);
            let end_byte = self.calculate_char_offset_to_byte(text, span.end);
            let length = end_byte.saturating_sub(start_byte);

            // Convert Harper's suggestions to our format
            let suggestions: Vec<String> = lint.suggestions.iter()
                .map(|suggestion| {
                    match suggestion {
                        harper_core::linting::Suggestion::ReplaceWith(replacement) => {
                            replacement.iter().collect()
                        }
                        harper_core::linting::Suggestion::Remove => {
                            "".to_string()
                        }
                        harper_core::linting::Suggestion::InsertAfter(insertion) => {
                            insertion.iter().collect()
                        }
                    }
                })
                .collect();

            // Map Harper's LintKind to our ErrorType and severity
            let (error_type, severity, confidence) = self.map_harper_lint_kind(&lint.lint_kind);

            errors.push(GrammarError {
                message: lint.message,
                rule_id: format!("HARPER_{:?}", lint.lint_kind),
                category: self.get_harper_category(&lint.lint_kind),
                offset: start_byte,
                length,
                context: self.extract_context(text, start_byte, length),
                suggestions,
                severity,
                confidence,
                error_type,
            });
        }

        // OCR-specific checks are handled by Harper's built-in rules

        log::info!("Harper grammar checking completed with {} lints from Harper's built-in rules", errors.len());
        Ok(errors)
    }

    fn map_harper_lint_kind(&self, lint_kind: &harper_core::linting::LintKind) -> (ErrorType, String, f32) {
        use harper_core::linting::LintKind;

        match lint_kind {
            LintKind::Spelling => (ErrorType::Spelling, "error".to_string(), 0.9),
            LintKind::Repetition => (ErrorType::Redundancy, "info".to_string(), 0.8),
            LintKind::Capitalization => (ErrorType::Grammar, "error".to_string(), 0.85),
            LintKind::Punctuation => (ErrorType::Punctuation, "warning".to_string(), 0.8),
            LintKind::Readability => (ErrorType::Clarity, "info".to_string(), 0.6),
            LintKind::Miscellaneous => (ErrorType::Other, "info".to_string(), 0.5),
            // New Harper lint kinds that exist
            LintKind::Agreement => (ErrorType::Grammar, "error".to_string(), 0.9),
            LintKind::BoundaryError => (ErrorType::Other, "warning".to_string(), 0.7),
            LintKind::Eggcorn => (ErrorType::Spelling, "warning".to_string(), 0.8),
            LintKind::Enhancement => (ErrorType::Style, "info".to_string(), 0.6),
            LintKind::Formatting => (ErrorType::Style, "info".to_string(), 0.7),
            LintKind::Redundancy => (ErrorType::Redundancy, "info".to_string(), 0.8),
            LintKind::WordChoice => (ErrorType::Style, "info".to_string(), 0.6),
            // Catch-all for any other lint kinds
            _ => (ErrorType::Other, "info".to_string(), 0.5),
        }
    }

    fn get_harper_category(&self, lint_kind: &harper_core::linting::LintKind) -> String {
        use harper_core::linting::LintKind;

        match lint_kind {
            LintKind::Spelling => "Spelling".to_string(),
            LintKind::Repetition => "Repetition".to_string(),
            LintKind::Capitalization => "Capitalization".to_string(),
            LintKind::Punctuation => "Punctuation".to_string(),
            LintKind::Readability => "Readability".to_string(),
            LintKind::Miscellaneous => "Grammar".to_string(),
            // New Harper lint kinds that exist
            LintKind::Agreement => "Grammar".to_string(),
            LintKind::BoundaryError => "Formatting".to_string(),
            LintKind::Eggcorn => "Spelling".to_string(),
            LintKind::Enhancement => "Style".to_string(),
            LintKind::Formatting => "Formatting".to_string(),
            LintKind::Redundancy => "Redundancy".to_string(),
            LintKind::WordChoice => "Style".to_string(),
            // Catch-all for any other lint kinds
            _ => "Other".to_string(),
        }
    }

    fn calculate_char_offset_to_byte(&self, text: &str, char_index: usize) -> usize {
        // Convert character index to byte offset in the original text
        // This is a simplified approach that works for most cases
        text.char_indices()
            .nth(char_index)
            .map(|(byte_index, _)| byte_index)
            .unwrap_or(text.len())
    }



    fn extract_context(&self, text: &str, offset: usize, length: usize) -> String {
        let context_size = 50;
        let start = offset.saturating_sub(context_size);
        let end = (offset + length + context_size).min(text.len());

        text.chars()
            .skip(start)
            .take(end - start)
            .collect()
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

    fn check_basic_patterns(&self, text: &str) -> Vec<GrammarError> {
        let mut errors = Vec::new();

        // Check for double spaces
        if let Some(pos) = text.find("  ") {
            errors.push(GrammarError {
                message: "Multiple consecutive spaces found".to_string(),
                rule_id: "DOUBLE_SPACE".to_string(),
                category: "Whitespace".to_string(),
                offset: pos,
                length: 2,
                context: self.extract_context(text, pos, 2),
                suggestions: vec![" ".to_string()],
                severity: "info".to_string(),
                confidence: 0.9,
                error_type: ErrorType::Style,
            });
        }

        errors
    }
}
