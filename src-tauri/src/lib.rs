use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use std::time::UNIX_EPOCH;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::ipc::Channel;
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
    // The project this file belongs to: the folder holding its .uproject/.sln/.blend
    // (resolved by walking up the tree). None when no project marker is found.
    project_root: Option<String>,
    project_name: Option<String>,
}

#[derive(Serialize, Clone)]
struct AiSearchResult {
    path: String,
    name: String,
    size: u64,
    is_dir: bool,
    ext: String,
    last_modified: u64,
    app: Option<String>,
    score: i32,
    reason: String,
}

#[derive(Serialize)]
struct AiSearchResponse {
    query: String,
    terms: Vec<String>,
    ollama_used: bool,
    searched_files: u64,
    results: Vec<AiSearchResult>,
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

// ── App profiles (knowledge base) ─────────────────────────────────────────────
// Loaded from app_profiles.json (embedded at build time). This is the single
// source of truth for which files matter, which app owns them, and how to locate
// a file's project root. Add a tool there — not here.

#[derive(Deserialize, Serialize, Clone)]
struct AppProfile {
    name: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    color: String,
    #[serde(default)]
    category: String,
    extensions: Vec<String>,
    #[serde(default)]
    structure: String,
    #[serde(default)]
    self_contained: bool,
    #[serde(default)]
    root_marker_exts: Vec<String>,
    #[serde(default)]
    root_marker_files: Vec<String>,
    #[serde(default)]
    notes: String,
}

#[derive(Deserialize)]
struct ProfileFile {
    #[serde(default)]
    apps: Vec<AppProfile>,
}

static PROFILES: OnceLock<Vec<AppProfile>> = OnceLock::new();
static EXT_INDEX: OnceLock<HashMap<String, usize>> = OnceLock::new();

fn profiles() -> &'static Vec<AppProfile> {
    PROFILES.get_or_init(|| {
        serde_json::from_str::<ProfileFile>(include_str!("../app_profiles.json"))
            .map(|f| f.apps)
            .unwrap_or_default()
    })
}

// ext (lowercased) -> index into profiles(); first profile to claim an ext wins.
fn ext_index() -> &'static HashMap<String, usize> {
    EXT_INDEX.get_or_init(|| {
        let mut m = HashMap::new();
        for (i, p) in profiles().iter().enumerate() {
            for e in &p.extensions {
                m.entry(e.to_lowercase()).or_insert(i);
            }
        }
        m
    })
}

fn profile_for_ext(ext: &str) -> Option<&'static AppProfile> {
    ext_index().get(&ext.to_lowercase()).map(|&i| &profiles()[i])
}

fn ext_to_app(ext: &str) -> Option<&'static str> {
    profile_for_ext(ext).map(|p| p.name.as_str())
}

fn is_interesting(ext: &str) -> bool {
    ext_index().contains_key(&ext.to_lowercase())
}

#[tauri::command]
fn get_app_profiles() -> Vec<AppProfile> {
    profiles().clone()
}

// ── Project-root resolution ───────────────────────────────────────────────────
// Walk up from a file to the folder that defines its project, using the markers
// declared in that file's app profile (app_profiles.json). Self-contained apps
// (Blender, Photoshop…) use the file's own folder. Cached per (profile, directory).

fn dir_has_ext(dir: &std::path::Path, exts: &[String]) -> bool {
    if exts.is_empty() {
        return false;
    }
    let Ok(rd) = fs::read_dir(dir) else { return false; };
    for entry in rd.flatten() {
        if let Some(ext) = entry.path().extension() {
            let e = ext.to_string_lossy().to_lowercase();
            if exts.iter().any(|x| x.to_lowercase() == e) {
                return true;
            }
        }
    }
    false
}

fn dir_has_file(dir: &std::path::Path, names: &[String]) -> bool {
    if names.is_empty() {
        return false;
    }
    let Ok(rd) = fs::read_dir(dir) else { return false; };
    for entry in rd.flatten() {
        let n = entry.file_name();
        let n = n.to_string_lossy();
        if names.iter().any(|x| x.eq_ignore_ascii_case(&n)) {
            return true;
        }
    }
    false
}

fn dir_is_project_root(dir: &std::path::Path, profile: &AppProfile) -> bool {
    dir_has_ext(dir, &profile.root_marker_exts) || dir_has_file(dir, &profile.root_marker_files)
}

/// Walk up from a file looking for the directory that defines its project, per the
/// profile's markers. Caches results per (profile, directory) so files sharing
/// folders are cheap.
fn find_project_root(
    file: &std::path::Path,
    profile_idx: usize,
    profile: &AppProfile,
    cache: &mut HashMap<(usize, std::path::PathBuf), Option<std::path::PathBuf>>,
) -> Option<std::path::PathBuf> {
    // A single document is its own project — no need to walk.
    if profile.self_contained {
        return file.parent().map(|p| p.to_path_buf());
    }

    let mut cur = file.parent().map(|p| p.to_path_buf());
    let mut visited: Vec<std::path::PathBuf> = Vec::new();
    let mut found: Option<std::path::PathBuf> = None;
    let mut depth = 0;

    while let Some(d) = cur {
        if depth > 25 {
            break;
        }
        if let Some(cached) = cache.get(&(profile_idx, d.clone())) {
            found = cached.clone();
            break;
        }
        visited.push(d.clone());
        if dir_is_project_root(&d, profile) {
            found = Some(d.clone());
            break;
        }
        cur = d.parent().map(|p| p.to_path_buf());
        depth += 1;
    }

    for v in visited {
        cache.entry((profile_idx, v)).or_insert_with(|| found.clone());
    }
    found
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
            project_root: None,
            project_name: None,
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
                project_root: None,
                project_name: None,
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

    // Resolve each file's owning project so the UI can group by project. Done after
    // truncation so we only walk the tree for the handful of files we actually return.
    let mut cache: HashMap<(usize, std::path::PathBuf), Option<std::path::PathBuf>> = HashMap::new();
    for f in &mut files {
        if let Some(idx) = ext_index().get(&f.ext.to_lowercase()).copied() {
            let profile = &profiles()[idx];
            if let Some(root) = find_project_root(std::path::Path::new(&f.path), idx, profile, &mut cache) {
                f.project_name = root.file_name().map(|n| n.to_string_lossy().into_owned());
                f.project_root = Some(root.to_string_lossy().into_owned());
            }
        }
    }

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
            project_root: None,
            project_name: None,
        });
        if files.len() >= 20_000 {
            break;
        }
    }

    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    files.truncate(cap);

    // Every file lives under the scanned project root — label them all with it.
    let root_str = root.to_string_lossy().into_owned();
    let root_name = root.file_name().map(|n| n.to_string_lossy().into_owned());
    for f in &mut files {
        f.project_root = Some(root_str.clone());
        f.project_name = root_name.clone();
    }

    files
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() >= 2)
        .map(|s| s.to_string())
        .collect()
}

fn clean_terms(text: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for part in text.split(|c: char| c == ',' || c == '\n' || c == ';') {
        let cleaned = part
            .trim()
            .trim_matches(|c: char| c == '-' || c == '*' || c == '"' || c == '\'' || c == '`')
            .to_lowercase();
        if cleaned.len() < 2 || cleaned.len() > 60 {
            continue;
        }
        if seen.insert(cleaned.clone()) {
            out.push(cleaned);
        }
        if out.len() >= 12 {
            break;
        }
    }
    out
}

fn fuzzy_subsequence(needle: &str, haystack: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    let mut chars = needle.chars();
    let Some(mut wanted) = chars.next() else { return false; };
    for ch in haystack.chars() {
        if ch == wanted {
            match chars.next() {
                Some(next) => wanted = next,
                None => return true,
            }
        }
    }
    false
}

fn ollama_terms(query: &str) -> Option<Vec<String>> {
    let prompt = format!(
        "Extract up to 10 short file-search terms for this request. Return only comma-separated terms, no explanation.\nRequest: {}",
        query
    );
    let body = json!({
        "model": "llama3.1",
        "prompt": prompt,
        "stream": false,
        "options": { "temperature": 0.1 }
    })
    .to_string();

    let mut stream = std::net::TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().ok()?,
        Duration::from_millis(700),
    ).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(4)));
    let request = format!(
        "POST /api/generate HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let body = response.split("\r\n\r\n").nth(1)?;
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let text = value.get("response")?.as_str()?;
    let terms = clean_terms(text);
    if terms.is_empty() { None } else { Some(terms) }
}

fn score_search_candidate(name: &str, path: &str, ext: &str, query: &str, terms: &[String]) -> (i32, String) {
    let name_l = name.to_lowercase();
    let path_l = path.to_lowercase();
    let ext_l = ext.to_lowercase();
    let query_l = query.to_lowercase();
    let mut score = 0;
    let mut reasons: Vec<&str> = Vec::new();

    if !query_l.is_empty() {
        if name_l.contains(&query_l) {
            score += 120;
            reasons.push("filename contains your phrase");
        } else if path_l.contains(&query_l) {
            score += 60;
            reasons.push("path contains your phrase");
        } else if fuzzy_subsequence(&query_l.replace(' ', ""), &name_l) {
            score += 24;
            reasons.push("filename is a fuzzy match");
        }
    }

    for term in terms {
        if name_l.contains(term) {
            score += 28;
            reasons.push("matched search term in filename");
        } else if path_l.contains(term) {
            score += 10;
            reasons.push("matched search term in path");
        } else if ext_l == term.trim_start_matches('.') {
            score += 16;
            reasons.push("matched file extension");
        }
    }

    let reason = if reasons.is_empty() {
        "weak related match".to_string()
    } else {
        let mut uniq = Vec::new();
        for r in reasons {
            if !uniq.contains(&r) {
                uniq.push(r);
            }
            if uniq.len() >= 2 {
                break;
            }
        }
        uniq.join(", ")
    };

    (score, reason)
}

#[tauri::command]
async fn ai_search_files(paths: Vec<String>, query: String, limit: usize) -> Result<AiSearchResponse, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(AiSearchResponse {
            query,
            terms: Vec::new(),
            ollama_used: false,
            searched_files: 0,
            results: Vec::new(),
        });
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut terms = tokenize(&query);
        let mut ollama_used = false;
        if let Some(extra) = ollama_terms(&query) {
            ollama_used = true;
            for term in extra {
                if !terms.iter().any(|t| t == &term) {
                    terms.push(term);
                }
            }
        }
        terms.sort();
        terms.dedup();

        let mut results: Vec<AiSearchResult> = Vec::new();
        let mut searched_files: u64 = 0;

        for path in &paths {
            let walker = WalkDir::new(path)
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
                searched_files += 1;
                if searched_files > 100_000 {
                    break;
                }

                let p = entry.path();
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                let path_str = p.to_string_lossy().into_owned();
                let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default();
                let (score, reason) = score_search_candidate(&name, &path_str, &ext, &query, &terms);
                if score <= 0 {
                    continue;
                }

                let last_modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                results.push(AiSearchResult {
                    path: path_str,
                    name,
                    size: meta.len(),
                    is_dir: false,
                    ext: ext.clone(),
                    last_modified,
                    app: ext_to_app(&ext).map(|s| s.to_string()),
                    score,
                    reason,
                });
            }
        }

        results.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| b.last_modified.cmp(&a.last_modified))
        });
        results.truncate(limit.min(100));

        Ok(AiSearchResponse {
            query,
            terms,
            ollama_used,
            searched_files,
            results,
        })
    })
    .await
    .map_err(|e| e.to_string())?
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
    use sysinfo::{ProcessRefreshKind, RefreshKind, System, UpdateKind};

    // Only load process names + command lines — not memory/disks/CPU/etc. This is
    // far cheaper than System::new_all() and keeps the 5s poll from causing lag.
    let sys = System::new_with_specifics(
        RefreshKind::new()
            .with_processes(ProcessRefreshKind::new().with_cmd(UpdateKind::Always)),
    );
    // One entry per (app, project) so multiple open windows of the same app
    // (e.g. two Blender scenes) are each tracked, not collapsed into one.
    let mut found: Vec<RunningApp> = Vec::new();

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

                let dup = found
                    .iter()
                    .any(|r| r.app == app_name && r.project_path == project_path);
                if !dup {
                    found.push(RunningApp {
                        app: app_name.to_string(),
                        project: project_name,
                        project_path,
                    });
                }
            }
        }
    }

    found
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
    // Total time (seconds) the app has been open with this project — accumulated
    // across polls. Drives the "how much have I worked on this" progress bars.
    #[serde(default)]
    active_seconds: u64,
}

// A gap larger than this between sightings counts as a new working session.
const SESSION_GAP_SECS: u64 = 10 * 60;

// Only count the gap between two sightings as active time if it's this small,
// i.e. the app was seen continuously (poll runs every 5s).
const ACTIVE_CONTINUITY_SECS: u64 = 30;

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
                let gap = now.saturating_sub(e.last_seen);
                if gap > SESSION_GAP_SECS {
                    e.sessions += 1;
                }
                // Accumulate active time only across continuous sightings.
                if gap <= ACTIVE_CONTINUITY_SECS {
                    e.active_seconds += gap;
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
                    active_seconds: 0,
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

/// Reject strings that could break out of a quoted argument or aren't real
/// filesystem paths. Both open commands shell out with the caller-supplied
/// string, so validate it is an existing local path with no quote/control
/// characters (blocks arg injection via raw_arg and URLs like https://…).
fn validate_local_path(path: &str) -> Result<&std::path::Path, String> {
    if path.contains('"') || path.chars().any(|c| c.is_control()) {
        return Err("Path contains invalid characters.".into());
    }
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err("Path does not exist.".into());
    }
    Ok(p)
}

/// Open a path in the system file manager. On Windows: a file is revealed with it
/// selected; a folder (or a file's parent) is opened directly.
#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = validate_local_path(&path)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("explorer");
        if p.is_file() {
            cmd.raw_arg(format!("/select,\"{}\"", p.display()));
        } else {
            let dir = if p.is_dir() {
                p.to_path_buf()
            } else {
                p.parent().map(|x| x.to_path_buf()).unwrap_or_else(|| p.to_path_buf())
            };
            cmd.raw_arg(format!("\"{}\"", dir.display()));
        }
        cmd.spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = p;
        Err("Opening the file manager is only supported on Windows.".into())
    }
}

/// Open a file/folder with the default OS association. This is used for project
/// files like .blend and .uproject where the intent is to launch the app.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    validate_local_path(&path)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

// ── Duplicate scanning ────────────────────────────────────────────────────────

// Set true to ask an in-progress duplicate scan to stop. Reset at scan start.
static SCAN_CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct DuplicateFile {
    path: String,
    name: String,
    size: u64,
    last_modified: u64,
}

#[derive(Serialize, Clone)]
struct DuplicateGroup {
    size: u64,
    count: usize,
    wasted: u64, // reclaimable bytes if all but one copy were removed
    files: Vec<DuplicateFile>,
}

#[derive(Serialize, Clone)]
struct ScanProgress {
    phase: String, // "indexing" | "hashing" | "done"
    processed: u64,
    total: u64,
    current: String,
}

// Full-content SHA-256, read in chunks so memory stays bounded on huge files.
fn hash_file(path: &std::path::Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

const PREFIX_HASH_BYTES: usize = 65536;

// SHA-256 of just the first 64 KiB — a cheap prefilter so same-size files that
// differ early are never read in full. For files ≤ 64 KiB this IS the full hash.
fn hash_file_prefix(path: &std::path::Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; PREFIX_HASH_BYTES];
    let mut read = 0;
    while read < buf.len() {
        let n = file.read(&mut buf[read..]).ok()?;
        if n == 0 {
            break;
        }
        read += n;
    }
    hasher.update(&buf[..read]);
    Some(format!("{:x}", hasher.finalize()))
}

fn scan_duplicates(paths: Vec<String>, progress: Channel<ScanProgress>) -> Result<Vec<DuplicateGroup>, String> {
    // 1) Index files by size — cheap (metadata only). Files of a unique size can't
    //    have a content-duplicate, so they're skipped before any hashing.
    let mut by_size: HashMap<u64, Vec<std::path::PathBuf>> = HashMap::new();
    let mut scanned: u64 = 0;
    'index: for path in &paths {
        let walker = WalkDir::new(path).into_iter().filter_entry(|e| {
            e.file_name().to_str().map(|n| !should_skip(n)).unwrap_or(true)
        });
        for entry in walker.filter_map(|e| e.ok()) {
            if SCAN_CANCEL.load(Ordering::Relaxed) {
                break 'index;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let size = meta.len();
            if size == 0 {
                continue;
            }
            let p = entry.path();
            if scanned % 1000 == 0 {
                let _ = progress.send(ScanProgress {
                    phase: "indexing".into(),
                    processed: scanned,
                    total: 0,
                    current: p.to_string_lossy().into_owned(),
                });
            }
            by_size.entry(size).or_default().push(p.to_path_buf());
            scanned += 1;
        }
    }

    // Stopped during indexing — nothing hashed yet.
    if SCAN_CANCEL.load(Ordering::Relaxed) {
        let _ = progress.send(ScanProgress { phase: "done".into(), processed: 0, total: 0, current: String::new() });
        return Ok(Vec::new());
    }

    // 2) Hash only files that share a size with at least one other file.
    let to_hash: u64 = by_size.values().filter(|v| v.len() > 1).map(|v| v.len() as u64).sum();
    let mut hashed: u64 = 0;
    let mut groups: Vec<DuplicateGroup> = Vec::new();

    for (size, files) in by_size {
        if SCAN_CANCEL.load(Ordering::Relaxed) {
            break;
        }
        if files.len() < 2 {
            continue;
        }
        // 2a) Cheap prefix hash (first 64 KiB). Same-size files that differ in their
        //     opening bytes are ruled out here without ever reading them fully.
        let mut by_prefix: HashMap<String, Vec<std::path::PathBuf>> = HashMap::new();
        for f in files {
            if SCAN_CANCEL.load(Ordering::Relaxed) {
                break;
            }
            if hashed % 20 == 0 {
                let _ = progress.send(ScanProgress {
                    phase: "hashing".into(),
                    processed: hashed,
                    total: to_hash,
                    current: f.to_string_lossy().into_owned(),
                });
            }
            if let Some(h) = hash_file_prefix(&f) {
                by_prefix.entry(h).or_default().push(f);
            }
            hashed += 1;
        }

        // 2b) Full-content hash, but only for groups that still collide after the
        //     prefix pass. Small files are already fully hashed by the prefix.
        let mut by_hash: HashMap<String, Vec<std::path::PathBuf>> = HashMap::new();
        for (prefix_hash, group) in by_prefix {
            if SCAN_CANCEL.load(Ordering::Relaxed) {
                break;
            }
            if group.len() < 2 {
                continue;
            }
            if size <= PREFIX_HASH_BYTES as u64 {
                by_hash.insert(prefix_hash, group);
                continue;
            }
            for f in group {
                if SCAN_CANCEL.load(Ordering::Relaxed) {
                    break;
                }
                if let Some(h) = hash_file(&f) {
                    by_hash.entry(h).or_default().push(f);
                }
            }
        }
        for (_h, dups) in by_hash {
            if dups.len() >= 2 {
                let wasted = size.saturating_mul(dups.len() as u64 - 1);
                let files: Vec<DuplicateFile> = dups
                    .iter()
                    .map(|p| {
                        let last_modified = fs::metadata(p)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        DuplicateFile {
                            path: p.to_string_lossy().into_owned(),
                            name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                            size,
                            last_modified,
                        }
                    })
                    .collect();
                groups.push(DuplicateGroup { size, count: dups.len(), wasted, files });
            }
        }
    }

    groups.sort_by(|a, b| b.wasted.cmp(&a.wasted));
    groups.truncate(1000);

    let _ = progress.send(ScanProgress {
        phase: "done".into(),
        processed: hashed,
        total: to_hash,
        current: String::new(),
    });
    Ok(groups)
}

/// Deep duplicate scan: hashes the full contents of every file (after a size
/// pre-filter) to find exact duplicates. Runs on a background blocking thread so
/// the UI stays responsive, and streams progress back over a Channel.
#[tauri::command]
async fn find_duplicates(
    paths: Vec<String>,
    on_progress: Channel<ScanProgress>,
) -> Result<Vec<DuplicateGroup>, String> {
    SCAN_CANCEL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || scan_duplicates(paths, on_progress))
        .await
        .map_err(|e| e.to_string())?
}

/// Ask an in-progress duplicate scan to stop. It returns the duplicates found so far.
#[tauri::command]
fn cancel_duplicate_scan() {
    SCAN_CANCEL.store(true, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_drives,
            scan_directory,
            get_recent_files,
            get_project_files,
            ai_search_files,
            detect_apps,
            get_app_profiles,
            load_settings,
            save_settings,
            get_running_apps,
            poll_activity,
            get_activity_log,
            clear_activity_log,
            open_in_explorer,
            open_path,
            find_duplicates,
            cancel_duplicate_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
