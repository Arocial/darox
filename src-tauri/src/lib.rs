mod backend;

use backend::{BackendState, ProcessStatus};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[tauri::command]
async fn start_backend(
    state: tauri::State<'_, BackendState>,
    app: tauri::AppHandle,
) -> Result<u16, String> {
    backend::start(&state, &app).await
}

#[tauri::command]
async fn stop_backend(
    state: tauri::State<'_, BackendState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    backend::stop(&state, &app).await;
    Ok(())
}

#[tauri::command]
async fn restart_backend(
    state: tauri::State<'_, BackendState>,
    app: tauri::AppHandle,
) -> Result<u16, String> {
    backend::stop(&state, &app).await;
    backend::start(&state, &app).await
}

#[tauri::command]
async fn get_backend_status(
    state: tauri::State<'_, BackendState>,
) -> Result<(ProcessStatus, u16), String> {
    Ok(backend::get_status(&state).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(
            backend::BackendManager::default(),
        )) as BackendState)
        .invoke_handler(tauri::generate_handler![
            start_backend,
            stop_backend,
            restart_backend,
            get_backend_status,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Auto-start backend on launch
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<BackendState>();
                match backend::start(&state, &handle).await {
                    Ok(port) => log::info!("Backend auto-started on port {}", port),
                    Err(e) => log::error!("Failed to auto-start backend: {}", e),
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<BackendState>();
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(async {
                    backend::stop(&state, &app).await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
