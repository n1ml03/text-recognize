use crate::services::{GrammarService, GrammarCheckResult, LanguageStats, GrammarConfig};
use crate::error::ToTauriResult;
use tokio::sync::Mutex;
use tauri::State;


pub struct GrammarState(pub Mutex<GrammarService>);

#[tauri::command]
pub async fn check_grammar(
    text: String,
    auto_correct: bool,
    state: State<'_, GrammarState>,
) -> Result<GrammarCheckResult, String> {
    let grammar_service = state.0.lock().await;
    grammar_service
        .check_text(&text, auto_correct)
        .await
        .to_tauri_result()
}

#[tauri::command]
pub async fn apply_specific_corrections(
    text: String,
    error_indices: Vec<usize>,
    state: State<'_, GrammarState>,
) -> Result<String, String> {
    let grammar_service = state.0.lock().await;
    grammar_service
        .apply_specific_corrections(&text, &error_indices)
        .await
        .map_err(|e| format!("Failed to apply corrections: {}", e))
}

#[tauri::command]
pub async fn get_language_statistics(
    text: String,
    state: State<'_, GrammarState>,
) -> Result<LanguageStats, String> {
    let grammar_service = state.0.lock().await;
    grammar_service
        .get_language_stats(&text)
        .await
        .map_err(|e| format!("Failed to get language statistics: {}", e))
}

#[tauri::command]
pub async fn set_grammar_server_url(
    server_url: String,
    state: State<'_, GrammarState>,
) -> Result<(), String> {
    let mut grammar_service = state.0.lock().await;

    // Replace the service with a new one using the custom server
    *grammar_service = GrammarService::with_custom_server(server_url);

    Ok(())
}

#[tauri::command]
pub async fn set_grammar_config(
    config: GrammarConfig,
    state: State<'_, GrammarState>,
) -> Result<(), String> {
    let mut grammar_service = state.0.lock().await;

    // Replace the service with a new one using the provided config
    *grammar_service = GrammarService::with_config(config);

    Ok(())
}

#[tauri::command]
pub async fn get_grammar_providers() -> Result<Vec<String>, String> {
    Ok(vec![
        "Harper".to_string(),
        "OfflineRules".to_string(),
        "Hybrid".to_string(),
    ])
}

#[tauri::command]
pub async fn get_supported_languages() -> Result<Vec<String>, String> {
    Ok(vec![
        "en-US".to_string(),
        "en-GB".to_string(),
        "de-DE".to_string(),
        "fr-FR".to_string(),
        "es-ES".to_string(),
        "it-IT".to_string(),
        "pt-PT".to_string(),
        "nl-NL".to_string(),
        "pl-PL".to_string(),
        "ru-RU".to_string(),
    ])
}

#[tauri::command]
pub async fn smart_grammar_check(
    text: String,
    state: State<'_, GrammarState>,
) -> Result<GrammarCheckResult, String> {
    let grammar_service = state.0.lock().await;
    grammar_service
        .check_text(&text, true) // Enable smart auto-correction
        .await
        .map_err(|e| format!("Smart grammar checking failed: {}", e))
}

#[tauri::command]
pub async fn apply_selective_corrections(
    text: String,
    correction_types: Vec<String>, // e.g., ["spelling", "punctuation"]
    state: State<'_, GrammarState>,
) -> Result<String, String> {
    let grammar_service = state.0.lock().await;

    // First get all errors
    let result = grammar_service
        .check_text(&text, false)
        .await
        .map_err(|e| format!("Failed to check text: {}", e))?;

    // Filter errors by type
    let filtered_indices: Vec<usize> = result.errors.iter()
        .enumerate()
        .filter(|(_, error)| {
            let error_type_str = match error.error_type {
                crate::services::ErrorType::Spelling => "spelling",
                crate::services::ErrorType::Grammar => "grammar",
                crate::services::ErrorType::Punctuation => "punctuation",
                crate::services::ErrorType::Style => "style",
                crate::services::ErrorType::Redundancy => "redundancy",
                crate::services::ErrorType::Clarity => "clarity",
                crate::services::ErrorType::Other => "other",
            };
            correction_types.contains(&error_type_str.to_string())
        })
        .map(|(i, _)| i)
        .collect();

    grammar_service
        .apply_specific_corrections(&text, &filtered_indices)
        .await
        .map_err(|e| format!("Failed to apply selective corrections: {}", e))
}


