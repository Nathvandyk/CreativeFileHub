use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::time::UNIX_EPOCH;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone)]
struct DriveInfo {
    letter: String,
    name: String,
    total_bytes: u64,
    free_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct FileEntry {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
    ext: String,
    last_modified: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct AppSettings {
    tracked_apps: Vec<String>,
    watched_paths: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            tracked_apps: vec![
                "Blender".into(),
                "Unreal Engine".into(),
                "VS Code".into(),
                "Visual Studio".into(),
            ],
            watched_paths: vec![],
        }
    }
}

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "build", "dist", ".cache",
    "Windows", "System32", "$Recycle.Bin", "AppData", "ProgramData",
    "Program Files", "Program Files (x86)", "Temp", "tmp",
    "__pycache__", ".venv", "venv", ".next", ".nuxt", ".vs",
    // build / cache output for creative + IDE projects
    "obj", "Intermediate", "Saved", "Binaries", "DerivedDataCache", "Library",
];

// Files older than this are treated as not "recent" — keeps installed-app and
// SDK files (whose timestamps are months/years old) out of recent-file results.
const RECENT_CUTOFF_SECS: u64 = 365 * 24 * 60 * 60;

fn should_skip(name: &str) -> bool {
    SKIP_DIRS.iter().any(|s| s.eq_ignore_ascii_case(name))
}

fn ext_to_app(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "blend"                       => Some("Blender"),
        "uproject" | "uasset" | "umap" => Some("Unreal Engine"),
        "sln" | "csproj" | "vcxproj"  => Some("Visual Studio"),
        "py"                          => Some("Python"),
        "js" | "ts" | "tsx" | "jsx" | "mjs" | "cjs" => Some("VS Code"),
        "psd" | "psb"                 => Some("Photoshop"),
        "ai"                          => Some("Illustrator"),
        "xd"                          => Some("Adobe XD"),
        "prproj"                      => Some("Premiere Pro"),
        "aep"                         => Some("After Effects"),
        "godot" | "tscn" | "tres"    => Some("Godot"),
        "unity" | "prefab"            => Some("Unity"),
        _ => None,
    }
}

const INTERESTING_EXTS: &[&str] = &[
    "blend", "uproject", "uasset", "umap",
    "sln", "csproj", "vcxproj",
    "py", "js", "ts", "tsx", "jsx", "mjs",
    "psd", "psb", "ai", "xd",
    "prproj", "aep",
    "godot", "tscn", "tres",
    "unity", "prefab",
    "rs", "cpp", "c", "h", "hpp", "cs", "java", "go",
    "html", "css", "scss", "json", "toml", "yaml", "yml", "sql",
    "md", "txt",
];

fn is_interesting(ext: &str) -> bool {
    let lower = ext.to_lowercase();
    INTERESTING_EXTS.contains(&lower.as_str())
}

#[tauri::command]
fn list_drives() -> Vec<DriveInfo> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|d| DriveInfo {
            letter: d.mount_point().to_string_lossy().to_string(),
            name: d.name().to_string_lossy().to_string(),
            total_bytes: d.total_space(),
            free_bytes: d.available_space(),
        })
        .collect()
}

#[tauri::command]
fn scan_directory(path: String, max_depth: u32) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let walker = WalkDir::new(&path)
        .max_depth(max_depth as usize)
        .into_iter()
        .filter_entry(|e| {
            e.file_name()
                .to_str()
                .map(|n| !should_skip(n))
                .unwrap_or(true)
        });

    for entry in walker.filter_map(|e| e.ok()) {
        let Ok(meta) = entry.metadata() else { continue };
        let last_modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let p = entry.path();
        entries.push(FileEntry {
            path: p.to_string_lossy().to_string(),
            name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            size: if meta.is_file() { meta.len() } else { 0 },
            is_dir: meta.is_dir(),
            ext: p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default(),
            last_modified,
        });
        if entries.len() >= 5_000 {
            break;
        }
    }
    entries
}

#[tauri::command]
fn get_recent_files(paths: Vec<String>, limit: usize) -> Vec<FileEntry> {
    let cap = limit.min(500);
    let now = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cutoff = now.saturating_sub(RECENT_CUTOFF_SECS);

    let mut files: Vec<FileEntry> = Vec::new();

    for path in &paths {
        let walker = WalkDir::new(path)
            .max_depth(7)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| !should_skip(n))
                    .unwrap_or(true)
            });

        for entry in walker.filter_map(|e| e.ok()) {
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let p = entry.path();
            let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
            if !is_interesting(&ext) {
                continue;
            }
            let last_modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            // Drop stale files so the freshest work isn't buried under old app data.
            if last_modified < cutoff {
                continue;
            }
            files.push(FileEntry {
                path: p.to_string_lossy().to_string(),
                name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                size: meta.len(),
                is_dir: false,
                ext,
                last_modified,
            });
            // Generous safety bound only — the recency filter keeps this small in practice,
            // so traversal reaches genuinely recent files instead of stopping early on junk.
            if files.len() >= 50_000 {
                break;
            }
        }
    }

    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    files.truncate(cap);
    files
}

/// Scan a single project directory (or the folder containing a project file) for
/// its recently-modified files. Used to surface what you're working on inside an
/// app that's currently open, regardless of file extension matching.
#[tauri::command]
fn get_project_files(path: String, limit: usize) -> Vec<FileEntry> {
    let p = std::path::Path::new(&path);
    let root = if p.is_file() {
        p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| p.to_path_buf())
    } else {
        p.to_path_buf()
    };
    let cap = limit.min(100);
    let mut files: Vec<FileEntry> = Vec::new();

    let walker = WalkDir::new(&root)
        .max_depth(12)
        .into_iter()
        .filter_entry(|e| {
            e.file_name()
                .to_str()
                .map(|n| !should_skip(n))
                .unwrap_or(true)
        });

    for entry in walker.filter_map(|e| e.ok()) {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let fp = entry.path();
        let ext = fp.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
        if !is_interesting(&ext) {
            continue;
        }
        let last_modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        files.push(FileEntry {
            path: fp.to_string_lossy().to_string(),
            name: fp.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            size: meta.len(),
            is_dir: false,
            ext,
            last_modified,
        });
        if files.len() >= 20_000 {
            break;
        }
    }

    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    files.truncate(cap);
    files
}

#[tauri::command]
fn detect_apps(paths: Vec<String>) -> Vec<String> {
    let mut detected: HashSet<&str> = HashSet::new();

    for path in &paths {
        let walker = WalkDir::new(path)
            .max_depth(6)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .map(|n| !should_skip(n))
                    .unwrap_or(true)
            });

        for entry in walker.filter_map(|e| e.ok()) {
            if let Some(ext) = entry.path().extension() {
                if let Some(app) = ext_to_app(&ext.to_string_lossy()) {
                    detected.insert(app);
                }
            }
        }
    }

    detected.into_iter().map(|s| s.to_string()).collect()
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> AppSettings {
    let Ok(data_dir) = app.path().app_data_dir() else {
        return AppSettings::default();
    };
    fs::read_to_string(data_dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(data_dir.join("settings.json"), content).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Clone)]
struct RunningApp {
    app: String,
    project: Option<String>,
    project_path: Option<String>,
}

const KNOWN_PROCESSES: &[(&str, &str)] = &[
    ("UnrealEditor.exe", "Unreal Engine"),
    ("UE4Editor.exe",    "Unreal Engine"),
    ("blender.exe",      "Blender"),
    ("devenv.exe",       "Visual Studio"),
    ("Code.exe",         "VS Code"),
    ("godot.exe",        "Godot"),
    ("Unity.exe",        "Unity"),
    ("AfterFX.exe",      "After Effects"),
    ("Photoshop.exe",    "Photoshop"),
    ("Premiere Pro.exe", "Premiere Pro"),
];

fn extract_project_from_cmd(cmd: &[String], app: &str) -> Option<String> {
    match app {
        "Unreal Engine" => cmd.iter()
            .find(|a| a.to_lowercase().ends_with(".uproject"))
            .cloned(),
        "Blender" => cmd.iter().skip(1)
            .find(|a| a.to_lowercase().ends_with(".blend"))
            .cloned(),
        "Visual Studio" => cmd.iter().skip(1)
            .find(|a| {
                let l = a.to_lowercase();
                l.ends_with(".sln") || l.ends_with(".csproj")
            })
            .cloned(),
        _ => None,
    }
}

fn detect_running_apps() -> Vec<RunningApp> {
    use sysinfo::System;

    let sys = System::new_all();
    let mut best: HashMap<String, RunningApp> = HashMap::new();

    for (_pid, process) in sys.processes() {
        // name() may return &str or &OsStr depending on sysinfo version — normalise via OsStr
        let proc_name: String = {
            let s: &OsStr = process.name().as_ref();
            s.to_string_lossy().to_lowercase()
        };

        // cmd() may return &[String] or &[OsString] — normalise each element via OsStr
        let cmd: Vec<String> = process.cmd().iter()
            .map(|s| {
                let s: &OsStr = s.as_ref();
                s.to_string_lossy().into_owned()
            })
            .collect();

        for &(exe, app_name) in KNOWN_PROCESSES {
            if proc_name == exe.to_lowercase() {
                let project_path = extract_project_from_cmd(&cmd, app_name);
                let project_name = project_path.as_deref()
                    .and_then(|p| std::path::Path::new(p).file_stem())
                    .map(|s| s.to_string_lossy().to_string());

                let entry = best.entry(app_name.to_string()).or_insert(RunningApp {
                    app: app_name.to_string(),
                    project: None,
                    project_path: None,
                });

                if entry.project_path.is_none() && project_path.is_some() {
                    entry.project = project_name;
                    entry.project_path = project_path;
                }
            }
        }
    }

    best.into_values().collect()
}

#[tauri::command]
fn get_running_apps() -> Vec<RunningApp> {
    detect_running_apps()
}

#[derive(Serialize, Deserialize, Clone)]
struct ActivityEntry {
    app: String,
    project: Option<String>,
    project_path: Option<String>,
    first_seen: u64,
    last_seen: u64,
    sessions: u64,
}

// A gap larger than this between sightings counts as a new working session.
const SESSION_GAP_SECS: u64 = 10 * 60;

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_activity_log(app: &tauri::AppHandle) -> Vec<ActivityEntry> {
    let Ok(dir) = app.path().app_data_dir() else { return Vec::new(); };
    fs::read_to_string(dir.join("activity_log.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_activity_log(app: &tauri::AppHandle, log: &[ActivityEntry]) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::create_dir_all(&dir);
        if let Ok(content) = serde_json::to_string_pretty(log) {
            let _ = fs::write(dir.join("activity_log.json"), content);
        }
    }
}

/// Detect open apps, fold them into the persistent activity log, and return the
/// currently-running apps. Called on a timer so the log accumulates a history of
/// every app + project you've worked in and when you last had it open.
#[tauri::command]
fn poll_activity(app: tauri::AppHandle) -> Vec<RunningApp> {
    let running = detect_running_apps();
    let now = now_secs();
    let mut log = read_activity_log(&app);

    for r in &running {
        match log
            .iter_mut()
            .find(|e| e.app == r.app && e.project_path == r.project_path)
        {
            Some(e) => {
                if now.saturating_sub(e.last_seen) > SESSION_GAP_SECS {
                    e.sessions += 1;
                }
                e.last_seen = now;
                if e.project.is_none() && r.project.is_some() {
                    e.project = r.project.clone();
                }
            }
            None => {
                log.push(ActivityEntry {
                    app: r.app.clone(),
                    project: r.project.clone(),
                    project_path: r.project_path.clone(),
                    first_seen: now,
                    last_seen: now,
                    sessions: 1,
                });
            }
        }
    }

    write_activity_log(&app, &log);
    running
}

#[tauri::command]
fn get_activity_log(app: tauri::AppHandle) -> Vec<ActivityEntry> {
    let mut log = read_activity_log(&app);
    log.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    log
}

#[tauri::command]
fn clear_activity_log(app: tauri::AppHandle) {
    write_activity_log(&app, &[]);
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            list_drives,
            scan_directory,
            get_recent_files,
            get_project_files,
            detect_apps,
            load_settings,
            save_settings,
            get_running_apps,
            poll_activity,
            get_activity_log,
            clear_activity_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
