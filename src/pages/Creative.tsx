import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext, useLive } from "../context/AppContext";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import type { FileEntry, AppProfile, ActivityEntry } from "../types";
import { formatBytes, formatRelativeTime, formatDuration, activeSecondsByApp, EXT_COLOR, openInExplorer } from "../utils";

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

function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function extOf(path: string): string {
  const n = baseName(path);
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1).toLowerCase() : "";
}

// Turn an activity-log project (a main project file we detected as open) into a
// FileEntry so it shows in the Creative Hub even if its folder isn't a watched
// path — keeping Creative in sync with the Dashboard's Recent Projects.
function activityFilesForApp(activityLog: ActivityEntry[], appName: string): FileEntry[] {
  const out: FileEntry[] = [];
  for (const e of activityLog) {
    if (e.app !== appName || !e.project_path) continue;
    const root = parentDir(e.project_path);
    out.push({
      path: e.project_path,
      name: baseName(e.project_path),
      ext: extOf(e.project_path),
      size: 0,
      is_dir: false,
      last_modified: e.last_seen,
      project_root: root,
      project_name: folderLabel(root),
    });
  }
  return out;
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

// Combine several file lists, de-duplicating by path and sorting newest-first.
function mergeFiles(...lists: FileEntry[][]): FileEntry[] {
  const seen = new Set<string>();
  const out: FileEntry[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (!seen.has(f.path)) { seen.add(f.path); out.push(f); }
    }
  }
  out.sort((a, b) => b.last_modified - a.last_modified);
  return out;
}

export default function Creative() {
  const { trackedApps, watchedPaths, refreshTick, appProfiles, recentFiles, recentLoading, triggerRefresh } = useAppContext();
  const { runningApps, activityLog } = useLive();
  const { menu, open, close } = useContextMenu();
  const [projectFiles, setProjectFiles]     = useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded]             = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Pull each open project's files, keyed by project path so multiple open
  // instances of the same app (e.g. two Blender scenes) are each fetched.
  useEffect(() => {
    runningApps.forEach((r) => {
      if (r.project_path) {
        const key = r.project_path;
        invoke<FileEntry[]>("get_project_files", { path: key, limit: 40 })
          .then((files) => setProjectFiles((prev) => ({ ...prev, [key]: files })))
          .catch(() => {});
      }
    });
  }, [runningApps, refreshTick]);

  const visibleApps = appProfiles.filter((p) => trackedApps.includes(p.name));

  // Worked-time per app drives the progress bars (relative to the busiest app).
  const activeByApp = activeSecondsByApp(activityLog);
  const maxActive   = Math.max(1, ...visibleApps.map((a) => activeByApp[a.name] ?? 0));

  // Worked-time per exact file/project path (activity log is keyed by path), so a
  // specific .blend / .uproject shows its own logged hours.
  const secondsByPath: Record<string, number> = {};
  for (const e of activityLog) {
    if (e.project_path) secondsByPath[e.project_path] = (secondsByPath[e.project_path] ?? 0) + e.active_seconds;
  }
  // Total worked-time for a project folder (sums every tracked file under it).
  const hoursForGroup = (groupKey: string) =>
    activityLog.reduce(
      (s, e) => (e.project_path && parentDir(e.project_path) === groupKey ? s + e.active_seconds : s),
      0,
    );

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
    <div className="w-full">
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
          // Every open window of this app (multiple instances supported).
          const instances  = runningApps.filter((r) => r.app === app.name);
          const running    = instances.length > 0;
          // Files from the open projects, merged with everything recently worked on.
          const liveFiles  = instances.flatMap((r) => (r.project_path ? (projectFiles[r.project_path] ?? []) : []));
          const appFiles   = mergeFiles(liveFiles, filesForApp(app), activityFilesForApp(activityLog, app.name)).slice(0, 40);
          const groups     = groupFiles(appFiles);
          const openRoots  = new Set(
            instances.map((r) => (r.project_path ? parentDir(r.project_path) : "")).filter(Boolean),
          );
          const openNames  = instances.map((r) => r.project).filter(Boolean) as string[];
          const openLabel  = openNames.length > 0 ? `Open: ${openNames.join(", ")}` : "Running";
          const secs       = activeByApp[app.name] ?? 0;
          const pct        = secs > 0 ? Math.max(4, Math.round((secs / maxActive) * 100)) : 0;

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
                        {openLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                      <div className={`${c.bar} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {formatDuration(secs)} · {appFiles.length} file{appFiles.length !== 1 ? "s" : ""}
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
                      const groupSecs = hoursForGroup(group.key);
                      return (
                        <div key={group.key}>
                          {/* Project header — a collapsible dropdown */}
                          <button
                            onClick={() => toggleGroup(gkey)}
                            onContextMenu={(e) => open(e, [
                              { label: "Open project folder", icon: "📂", onClick: () => openInExplorer(group.key) },
                            ])}
                            className="w-full flex items-center gap-2 px-5 py-2 bg-zinc-800/40 hover:bg-zinc-800/70 border-t border-zinc-800/50 text-left transition-colors"
                          >
                            <span className={`text-zinc-500 text-xs transition-transform ${collapsed ? "-rotate-90" : ""}`}>▾</span>
                            <span className="text-xs">📁</span>
                            <span className="text-xs font-semibold text-zinc-200 truncate font-mono">{group.label}</span>
                            <span className="text-xs text-zinc-600 shrink-0">
                              · {group.files.length} file{group.files.length !== 1 ? "s" : ""}
                            </span>
                            {groupSecs > 0 && (
                              <span className="text-xs text-emerald-400/80 shrink-0">· {formatDuration(groupSecs)}</span>
                            )}
                            {openRoots.has(group.key) && (
                              <span className="flex items-center gap-1 text-xs text-green-400 shrink-0 ml-auto">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                open now
                              </span>
                            )}
                          </button>

                          {/* Files nested under the project */}
                          {!collapsed && group.files.map((f, i) => {
                            const sub = subPath(f);
                            const fileSecs = secondsByPath[f.path] ?? 0;
                            return (
                              <div
                                key={i}
                                onContextMenu={(e) => open(e, [
                                  { label: "Open file location", icon: "📂", onClick: () => openInExplorer(f.path) },
                                ])}
                                className="flex items-center justify-between pl-11 pr-5 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer border-t border-zinc-800/30"
                              >
                                <div className="min-w-0 flex items-center gap-3">
                                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${EXT_COLOR[f.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                                    .{f.ext}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-white font-medium truncate">{f.name}</p>
                                      {fileSecs > 0 && (
                                        <span className="text-xs text-emerald-400/90 shrink-0">{formatDuration(fileSecs)}</span>
                                      )}
                                    </div>
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

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
