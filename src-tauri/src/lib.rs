use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

#[tauri::command]
fn get_cursor_pos() -> (f64, f64) {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut pt = POINT { x: 0, y: 0 };
        unsafe { GetCursorPos(&mut pt) };
        (pt.x as f64, pt.y as f64)
    }
    #[cfg(target_os = "macos")]
    {
        use objc::runtime::Object;
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_screen_class = class!(NSScreen);
            let main_screen: *mut Object = msg_send![ns_screen_class, mainScreen];
            let frame: (f64, f64, f64, f64) = msg_send![main_screen, frame];
            let screen_h = frame.3;
            let ns_event_class = class!(NSEvent);
            let loc: (f64, f64) = msg_send![ns_event_class, mouseLocation];
            (loc.0, screen_h - loc.1)
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        (0.0, 0.0)
    }
}

// Registry key used for Windows autostart
#[cfg(target_os = "windows")]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(target_os = "windows")]
const APP_NAME: &str = "PitchGauge";

#[tauri::command]
fn set_autostart(enable: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enable {
            let exe = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            // Launch with --hidden so the window starts invisible
            let value = format!("\"{}\" --hidden", exe);
            std::process::Command::new("reg")
                .args(["add", RUN_KEY, "/v", APP_NAME, "/t", "REG_SZ", "/d", &value, "/f"])
                .output()
                .map_err(|e| e.to_string())?;
        } else {
            // Ignore errors when key doesn't exist
            let _ = std::process::Command::new("reg")
                .args(["delete", RUN_KEY, "/v", APP_NAME, "/f"])
                .output();
        }
    }
    Ok(())
}

#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("reg")
            .args(["query", RUN_KEY, "/v", APP_NAME])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("toggle-visibility", ());
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Hide window at startup when launched with --hidden (autostart scenario)
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--hidden".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            app.global_shortcut()
                .register(Shortcut::new(None, Code::Backquote))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_cursor_pos, set_autostart, get_autostart])
        .run(tauri::generate_context!())
        .expect("error running pitch gauge");
}
