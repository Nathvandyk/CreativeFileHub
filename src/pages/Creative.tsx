import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext, useLive } from "../context/AppContext";
import type { FileEntry, AppProfile } from "../types";
import { formatBytes, formatRelativeTime, EXT_COLOR } from "../utils";

const colorMap: Record<string, { bar: string; badge: string; ring: string }> = {
  orange:  { bar: "bg-orange-500",  badge: "bg-orange-900/30 text-orange-400",   ring: "border-orange-800"  },
  purple:  { bar: "bg-purple-500",  badge: "bg-purple-900/30 text-purple-400",   ring: "border-purple-800"  },
  blue:    { bar: "bg-blue-500",    badge: "bg-blue-900/30 text-blue-400",       ring: "border-blue-800"    },
  yellow:  { bar: "bg-yellow-500",  badge: "bg-yellow-900/30 text-yellow-400",   ring: "border-yellow-800"  },
  sky:     { bar: "bg-sky-500",     badge: "bg-sky-900/30 text-sky-400",         ring: "border-sky-800"     },
  pink:    { bar: "bg-pink-500",    badge: "bg-pink-900/30 text-pink-400",       ring: "border-pink-800"    },
  violet:  { bar: "bg-violet-500",  badge: "bg-violet-900/30 text-violet-400",   ring: "border-violet-800"  },
  teal:    { bar: "bg-teal-500",    badge: "bg-teal-900/30 text-teal-400",       ring: "border-teal-800"    },
  green:   { bar: "bg-green-500",   badge: "bg-green-900/30 text-green-400",     ring: "border-green-800"   },
  red:     { bar: "bg-red-500",     badge: "bg-red-900/30 text-red-400",         ring: "border-red-800"     },
  indigo:  { bar: "bg-indigo-500",  badge: "bg-indigo-900/30 text-indigo-400",   ring: "border-indigo-800"  },
  amber:   { bar: "bg-amber-500",   badge: "bg-amber-900/30 text-amber-400",     ring: "border-amber-800"   },
  lime:    { bar: "bg-lime-500",    badge: "bg-lime-900/30 text-lime-400",       ring: "border-lime-800"    },
  fuchsia: { bar: "bg-fuchsia-500", badge: "bg-fuchsia-900/30 text-fuchsia-400", ring: "border-fuchsia-800" },
  rose:    { bar: "bg-rose-500",    badge: "bg-rose-900/30 text-rose-400",       ring: "border-rose-800"    },
  cyan:    { bar: "bg-cyan-500",    badge: "bg-cyan-900/30 text-cyan-400",       ring: "border-cyan-800"    },
  zinc:    { bar: "bg-zinc-400",    badge: "bg-zinc-800 text-zinc-400",          ring: "border-zinc-600"    },
};

// ── Folder grouping helpers ───────────────────────────────────────────────────

function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx > 0 ? path.slice(0, idx) : path;
}

function folderLabel(parent: string): string {
  const idx = Math.max(parent.lastIndexOf("\\"), parent.lastIndexOf("/"));
  return idx >= 0 ? parent.slice(idx + 1) : parent;
}

// A file's location relative to its project root (e.g. "Content\levels").
// Empty string => the file sits directly in the project root.
function subPath(f: FileEntry): string {
  const dir = parentDir(f.path);
  if (f.project_root && dir.toLowerCase().startsWith(f.project_root.toLowerCase())) {
    return dir.slice(f.project_root.length).replace(/^[\\/]+/, "");
  }
  return folderLabel(dir);
}

type FileGroup = { key: string; label: string; files: FileEntry[] };

// Group files by the project the backend resolved for them.
function groupFiles(files: FileEntry[]): FileGroup[] {
  const groups: FileGroup[] = [];
  const index = new Map<string, number>();
  for (const f of files) {
    const key   = f.project_root ?? parentDir(f.path);
    const label = f.project_name ?? folderLabel(parentDir(f.path));
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
  const { trackedApps, watchedPaths, refreshTick, appProfiles, recentFiles, recentLoading, triggerRefresh } = useAppContext();
  const { runningApps } = useLive();
  const [projectFiles, setProjectFiles]     = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded]             = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Pull each open project's files. runningApps keeps a stable reference between
  // polls unless the running set actually changes, so this won't refire every 5s.
  useEffect(() => {
    runningApps.forEach((r) => {
      if (r.project_path) {
        invoke<FileEntry[]>("get_project_files", { path: r.project_path, limit: 40 })
          .then((files) => setProjectFiles((prev) => ({ ...prev, [r.app]: files })))
          .catch(() => {});
      }
    });
  }, [runningApps, refreshTick]);

  const visibleApps = appProfiles.filter((p) => trackedApps.includes(p.name));

  function filesForApp(p: AppProfile): FileEntry[] {
    const exts = p.extensions.map((e) => e.toLowerCase());
    return recentFiles.filter((f) => exts.includes(f.ext.toLowerCase())).slice(0, 20);
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
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
          disabled={recentLoading}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          {recentLoading ? "Refreshing..." : "⟳ Refresh"}
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
          const appFiles   = projFiles && projFiles.length > 0 ? projFiles.slice(0, 40) : filesForApp(app);
          const groups     = groupFiles(appFiles);

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
                      <div className={`${c.bar} h-1.5 rounded-full`} style={{ width: appFiles.length > 0 ? "60%" : "10%" }} />
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {appFiles.length} file{appFiles.length !== 1 ? "s" : ""}
                      {groups.length > 1 ? ` · ${groups.length} projects` : ""}
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
                        : `No ${app.extensions.slice(0, 4).map((e) => `.${e}`).join(", ")} files found in watched paths`}
                    </p>
                  ) : (
                    groups.map((group) => {
                      const gkey      = `${app.name}::${group.key}`;
                      const collapsed = collapsedGroups.has(gkey);
                      return (
                        <div key={group.key}>
                          {/* Project header — a collapsible dropdown */}
                          <button
                            onClick={() => toggleGroup(gkey)}
                            className="w-full flex items-center gap-2 px-5 py-2 bg-zinc-800/40 hover:bg-zinc-800/70 border-t border-zinc-800/50 text-left transition-colors"
                          >
                            <span className={`text-zinc-500 text-xs transition-transform ${collapsed ? "-rotate-90" : ""}`}>▾</span>
                            <span className="text-xs">📁</span>
                            <span className="text-xs font-semibold text-zinc-200 truncate font-mono">{group.label}</span>
                            <span className="text-xs text-zinc-600 shrink-0">
                              · {group.files.length} file{group.files.length !== 1 ? "s" : ""}
                            </span>
                          </button>

                          {/* Files nested under the project */}
                          {!collapsed && group.files.map((f, i) => {
                            const sub = subPath(f);
                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between pl-11 pr-5 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer border-t border-zinc-800/30"
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${EXT_COLOR[f.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                                    .{f.ext}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm text-white font-medium truncate">{f.name}</p>
                                    {sub && (
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
                      );
                    })
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
