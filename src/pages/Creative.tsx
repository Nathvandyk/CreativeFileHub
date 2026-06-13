import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "../context/AppContext";
import type { FileEntry } from "../types";
import { formatBytes, formatRelativeTime, EXT_COLOR } from "../utils";

type AppDef = {
  name: string;
  icon: string;
  category: string;
  color: string;
  exts: string[];
};

const APP_DEFS: AppDef[] = [
  { name: "Blender",       icon: "🟠", category: "3D / Animation",    color: "orange", exts: ["blend"] },
  { name: "Unreal Engine", icon: "🎮", category: "Game Development",  color: "purple", exts: ["uproject", "uasset", "umap"] },
  { name: "VS Code",       icon: "💙", category: "Code Editor",       color: "blue",   exts: ["js", "ts", "tsx", "jsx", "rs", "cpp", "c", "h", "cs", "go", "py"] },
  { name: "Visual Studio", icon: "🔵", category: "IDE",               color: "blue",   exts: ["sln", "csproj", "vcxproj"] },
  { name: "Python",        icon: "🐍", category: "Language",          color: "yellow", exts: ["py"] },
  { name: "Photoshop",     icon: "🖼️", category: "Image Editing",     color: "sky",    exts: ["psd", "psb"] },
  { name: "Illustrator",   icon: "✏️", category: "Vector Design",     color: "orange", exts: ["ai"] },
  { name: "Adobe XD",      icon: "📐", category: "UI Design",         color: "pink",   exts: ["xd"] },
  { name: "Premiere Pro",  icon: "🎬", category: "Video Editing",     color: "pink",   exts: ["prproj"] },
  { name: "After Effects", icon: "🎞️", category: "Motion Graphics",   color: "violet", exts: ["aep"] },
  { name: "Godot",         icon: "🎯", category: "Game Development",  color: "teal",   exts: ["godot", "tscn", "tres"] },
  { name: "Unity",         icon: "⬛", category: "Game Development",  color: "zinc",   exts: ["unity", "prefab"] },
];

const colorMap: Record<string, { bar: string; badge: string; ring: string }> = {
  orange: { bar: "bg-orange-500", badge: "bg-orange-900/30 text-orange-400", ring: "border-orange-800" },
  purple: { bar: "bg-purple-500", badge: "bg-purple-900/30 text-purple-400", ring: "border-purple-800" },
  blue:   { bar: "bg-blue-500",   badge: "bg-blue-900/30   text-blue-400",   ring: "border-blue-800"   },
  yellow: { bar: "bg-yellow-500", badge: "bg-yellow-900/30 text-yellow-400", ring: "border-yellow-800" },
  sky:    { bar: "bg-sky-500",    badge: "bg-sky-900/30    text-sky-400",     ring: "border-sky-800"    },
  pink:   { bar: "bg-pink-500",   badge: "bg-pink-900/30   text-pink-400",    ring: "border-pink-800"   },
  violet: { bar: "bg-violet-500", badge: "bg-violet-900/30 text-violet-400",  ring: "border-violet-800" },
  teal:   { bar: "bg-teal-500",   badge: "bg-teal-900/30   text-teal-400",    ring: "border-teal-800"   },
  zinc:   { bar: "bg-zinc-400",   badge: "bg-zinc-800      text-zinc-400",    ring: "border-zinc-600"   },
};

// ── Folder grouping helpers ───────────────────────────────────────────────────

function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx > 0 ? path.slice(0, idx) : path;
}

// Label a folder relative to the open project (e.g. "Content\levels"); falls back
// to just the immediate folder name when no project root is known.
function folderLabel(parent: string, projectPath: string | null): string {
  if (projectPath) {
    const rootDir = parentDir(projectPath);
    if (parent.toLowerCase().startsWith(rootDir.toLowerCase())) {
      const rel = parent.slice(rootDir.length).replace(/^[\\/]+/, "");
      return rel || "(project root)";
    }
  }
  const idx = Math.max(parent.lastIndexOf("\\"), parent.lastIndexOf("/"));
  return idx >= 0 ? parent.slice(idx + 1) : parent;
}

type FileGroup = { key: string; label: string; files: FileEntry[] };

// Show a file's location relative to its project root (e.g. "Content\levels").
// Empty string means the file sits directly in the project root.
function subPath(f: FileEntry): string {
  const dir = parentDir(f.path);
  if (f.project_root && dir.toLowerCase().startsWith(f.project_root.toLowerCase())) {
    return dir.slice(f.project_root.length).replace(/^[\\/]+/, "");
  }
  return folderLabel(dir, null);
}

// Group files by the project the backend resolved for them (the folder holding the
// .uproject/.sln/.blend). Files without a detected project fall back to their folder.
function groupFiles(files: FileEntry[]): FileGroup[] {
  const groups: FileGroup[] = [];
  const index = new Map<string, number>();
  for (const f of files) {
    const key   = f.project_root ?? parentDir(f.path);
    const label = f.project_name ?? folderLabel(parentDir(f.path), null);
    let gi = index.get(key);
    if (gi === undefined) {
      gi = groups.length;
      index.set(key, gi);
      groups.push({ key, label, files: [] });
    }
    groups[gi].files.push(f);
  }
  return groups;
}

export default function Creative() {
  const { trackedApps, watchedPaths, refreshTick, runningApps, triggerRefresh } = useAppContext();
  const [recentFiles, setRecentFiles]   = useState<FileEntry[]>([]);
  const [projectFiles, setProjectFiles] = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (watchedPaths.length === 0) return;
    setLoading(true);
    invoke<FileEntry[]>("get_recent_files", { paths: watchedPaths, limit: 200 })
      .then(setRecentFiles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [watchedPaths, refreshTick]);

  // For each open app with a known project, pull that project's recent files directly
  useEffect(() => {
    runningApps.forEach((r) => {
      if (r.project_path) {
        invoke<FileEntry[]>("get_project_files", { path: r.project_path, limit: 30 })
          .then((files) => setProjectFiles((prev) => ({ ...prev, [r.app]: files })))
          .catch(() => {});
      }
    });
  }, [runningApps, refreshTick]);

  const visibleApps = APP_DEFS.filter((a) => trackedApps.includes(a.name));

  function filesForApp(app: AppDef): FileEntry[] {
    return recentFiles
      .filter((f) => app.exts.includes(f.ext.toLowerCase()))
      .slice(0, 12);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Creative Hub</h2>
          <p className="text-zinc-400 mt-1 text-sm">Tracked apps and their recent project files</p>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={loading}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          {loading ? "Refreshing..." : "⟳ Refresh"}
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Apps Tracked</p>
          <p className="text-3xl font-bold text-white">{visibleApps.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Recent Files</p>
          <p className="text-3xl font-bold text-white">{recentFiles.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Watched Paths</p>
          <p className="text-3xl font-bold text-white">{watchedPaths.length}</p>
        </div>
      </div>

      {visibleApps.length === 0 && (
        <div className="text-center py-16 text-zinc-600 text-sm">
          No apps tracked — enable them in Applications
        </div>
      )}

      {/* App cards */}
      <div className="flex flex-col gap-3">
        {visibleApps.map((app) => {
          const c          = colorMap[app.color] ?? colorMap.zinc;
          const isExpanded = expanded === app.name;
          const running    = runningApps.find((r) => r.app === app.name);
          const projFiles  = running?.project_path ? (projectFiles[app.name] ?? []) : null;
          const appFiles   = projFiles && projFiles.length > 0 ? projFiles.slice(0, 20) : filesForApp(app);

          return (
            <div
              key={app.name}
              className={`bg-zinc-900 border rounded-xl overflow-hidden transition-colors ${isExpanded ? c.ring : "border-zinc-800"}`}
            >
              <button
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
                onClick={() => setExpanded(isExpanded ? null : app.name)}
              >
                <span className="text-2xl">{app.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white">{app.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{app.category}</span>
                    {running && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-900/30 text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        {running.project ? `Open: ${running.project}` : "Running"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                      <div
                        className={`${c.bar} h-1.5 rounded-full`}
                        style={{ width: appFiles.length > 0 ? "60%" : "10%" }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {projFiles && projFiles.length > 0 ? `${appFiles.length} project files` : `${appFiles.length} recent files`}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {appFiles[0] ? (
                    <p className="text-xs text-zinc-400">Last: {formatRelativeTime(appFiles[0].last_modified)}</p>
                  ) : (
                    <p className="text-xs text-zinc-600">No files found</p>
                  )}
                </div>

                <span className={`text-zinc-600 text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
              </button>

              {isExpanded && (
                <div className="border-t border-zinc-800">
                  {appFiles.length === 0 ? (
                    <p className="text-xs text-zinc-600 px-5 py-4">
                      {watchedPaths.length === 0
                        ? "Add watched paths in Applications to see files"
                        : `No ${app.exts.map((e) => `.${e}`).join(", ")} files found in watched paths`}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-zinc-500 uppercase tracking-widest px-5 py-3">
                        {projFiles && projFiles.length > 0 ? "Files in open project" : "Recent project files"}
                      </p>
                      {groupFiles(appFiles).map((group) => (
                        <div key={group.key}>
                          {/* Project header — named after the .uproject / .sln / .blend folder */}
                          <div className="flex items-center gap-2 px-5 py-2 bg-zinc-800/40 border-t border-zinc-800/50">
                            <span className="text-xs">📁</span>
                            <span className="text-xs font-semibold text-zinc-200 truncate font-mono">{group.label}</span>
                            <span className="text-xs text-zinc-600 shrink-0">
                              · {group.files.length} file{group.files.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {/* Files nested under the project */}
                          {group.files.map((f, i) => {
                            const sub = subPath(f);
                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between pl-10 pr-5 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer border-t border-zinc-800/30"
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${EXT_COLOR[f.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                                    .{f.ext}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm text-white font-medium truncate">{f.name}</p>
                                    {sub && sub !== "(project root)" && (
                                      <p className="text-xs text-zinc-600 font-mono truncate mt-0.5">{sub}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-4">
                                  <p className="text-xs text-zinc-400">{formatRelativeTime(f.last_modified)}</p>
                                  <p className="text-xs text-zinc-600 mt-0.5">{formatBytes(f.size)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
