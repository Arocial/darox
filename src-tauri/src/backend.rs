use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessStatus {
    Stopped,
    Starting,
    Running,
    Crashed { exit_code: Option<i32> },
}

pub struct BackendManager {
    child: Option<Child>,
    status: ProcessStatus,
    port: u16,
    restart_count: u32,
    shutdown: Arc<AtomicBool>,
}

impl Default for BackendManager {
    fn default() -> Self {
        Self {
            child: None,
            status: ProcessStatus::Stopped,
            port: 0,
            restart_count: 0,
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub type BackendState = Arc<Mutex<BackendManager>>;

const BINARY: &str = "arox-coder";
const HOST: &str = "127.0.0.1";

fn find_available_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to find available port: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();
    drop(listener);
    Ok(port)
}

fn emit_status(app: &AppHandle, status: &ProcessStatus, port: u16) {
    let payload = match status {
        ProcessStatus::Stopped => serde_json::json!({"status": "Stopped", "port": port}),
        ProcessStatus::Starting => serde_json::json!({"status": "Starting", "port": port}),
        ProcessStatus::Running => serde_json::json!({"status": "Running", "port": port}),
        ProcessStatus::Crashed { exit_code } => {
            serde_json::json!({"status": "Crashed", "exit_code": exit_code, "port": port})
        }
    };
    let _ = app.emit("backend-status", payload);
}

fn spawn_process(port: u16) -> Result<Child, String> {
    Command::new(BINARY)
        .args([
            "--ui", "vercel_ai",
            "--host", HOST,
            "--port", &port.to_string(),
        ])
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn backend: {}", e))
}

async fn check_health(port: u16) -> bool {
    let addr = format!("{}:{}", HOST, port);
    tokio::net::TcpStream::connect(&addr).await.is_ok()
}

pub async fn start(state: &BackendState, app: &AppHandle) -> Result<u16, String> {
    // Stop existing process if any, without holding the lock during wait
    stop(state, app).await;

    let mut mgr = state.lock().await;
    let port = find_available_port()?;
    mgr.shutdown = Arc::new(AtomicBool::new(false));
    mgr.restart_count = 0;
    mgr.port = port;

    let child = spawn_process(port)?;
    mgr.status = ProcessStatus::Starting;
    mgr.child = Some(child);
    emit_status(app, &mgr.status, port);

    let shutdown = mgr.shutdown.clone();
    drop(mgr);

    // Spawn health check task
    let state_clone = state.clone();
    let app_clone = app.clone();
    let shutdown_clone = shutdown.clone();
    tauri::async_runtime::spawn(async move {
        health_check_loop(state_clone, app_clone, port, shutdown_clone).await;
    });

    // Spawn monitor task
    let state_clone = state.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        monitor_loop(state_clone, app_clone, shutdown).await;
    });

    Ok(port)
}

async fn health_check_loop(
    state: BackendState,
    app: AppHandle,
    port: u16,
    shutdown: Arc<AtomicBool>,
) {
    loop {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }
        sleep(Duration::from_secs(2)).await;
        if shutdown.load(Ordering::SeqCst) {
            break;
        }

        if check_health(port).await {
            let mut mgr = state.lock().await;
            if matches!(mgr.status, ProcessStatus::Starting) {
                mgr.status = ProcessStatus::Running;
                mgr.restart_count = 0;
                emit_status(&app, &mgr.status, port);
                log::info!("Backend is now running on {}:{}", HOST, port);
            }
        }
    }
}

async fn monitor_loop(state: BackendState, app: AppHandle, shutdown: Arc<AtomicBool>) {
    loop {
        if shutdown.load(Ordering::SeqCst) {
            break;
        }

        let exit_status = {
            let mut mgr = state.lock().await;
            if let Some(ref mut child) = mgr.child {
                match child.try_wait() {
                    Ok(Some(status)) => Some(Ok(status)),
                    Ok(None) => None,
                    Err(e) => Some(Err(e)),
                }
            } else {
                None
            }
        };

        if shutdown.load(Ordering::SeqCst) {
            break;
        }

        match exit_status {
            Some(Ok(status)) => {
                let exit_code = status.code();
                log::warn!("Backend process exited with code: {:?}", exit_code);

                let mut mgr = state.lock().await;
                mgr.child = None;
                let port = mgr.port;
                mgr.status = ProcessStatus::Crashed { exit_code };
                emit_status(&app, &mgr.status, port);

                // Exponential backoff
                let delay = std::cmp::min(1u64 << mgr.restart_count, 30);
                mgr.restart_count += 1;
                drop(mgr);

                log::info!("Restarting backend in {}s...", delay);
                sleep(Duration::from_secs(delay)).await;

                if shutdown.load(Ordering::SeqCst) {
                    break;
                }

                // Reuse the same port for restart
                let mut mgr = state.lock().await;
                let port = mgr.port;
                match spawn_process(port) {
                    Ok(child) => {
                        mgr.child = Some(child);
                        mgr.status = ProcessStatus::Starting;
                        emit_status(&app, &mgr.status, port);
                    }
                    Err(e) => {
                        log::error!("Failed to restart backend: {}", e);
                        break;
                    }
                }
            }
            Some(Err(e)) => {
                log::error!("Error waiting for backend process: {}", e);
                break;
            }
            None => {
                sleep(Duration::from_millis(500)).await;
            }
        }
    }
}

pub async fn stop(state: &BackendState, app: &AppHandle) {
    let mut child_to_kill = {
        let mut mgr = state.lock().await;
        mgr.shutdown.store(true, Ordering::SeqCst);
        let port = mgr.port;
        mgr.status = ProcessStatus::Stopped;
        emit_status(app, &mgr.status, port);
        mgr.child.take()
    };

    if let Some(ref mut child) = child_to_kill {
        #[cfg(unix)]
        if let Some(pid) = child.id() {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
            let child_wait = child.wait();
            match tokio::time::timeout(Duration::from_secs(5), child_wait).await {
                Ok(_) => {
                    log::info!("Backend stopped gracefully");
                }
                Err(_) => {
                    log::warn!("Backend did not stop gracefully, sending SIGKILL");
                    let _ = child.kill().await;
                }
            }
        }

        #[cfg(not(unix))]
        {
            let _ = child.kill().await;
        }
    }
}

pub async fn get_status(state: &BackendState) -> (ProcessStatus, u16) {
    let mgr = state.lock().await;
    (mgr.status.clone(), mgr.port)
}
