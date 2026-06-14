import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext, useLive } from "../context/AppContext";
import { useContextMenu, ContextMenu } from "../components/ContextMenu";
import type { DriveInfo } from "../types";
import { formatBytes, formatRelativeTime, formatDuration, activeSecondsByApp, extToApp, EXT_COLOR, openInExplorer } from "../utils";

type Page = "dashboard" | "scanner" | "duplicates" | "organise" | "recent" | "creative" | "activity" | "applications";

// Palette name (from app_profiles.json) -> tailwind bar colour.
const BAR_COLORS: Record<string, string> = {
  orange: "bg-orange-500", purple: "bg-purple-500", blue: "bg-blue-500",
  yellow: "bg-yellow-500", sky: "bg-sky-500", pink: "bg-pink-500",
  violet: "bg-violet-500", teal: "bg-teal-500", green: "bg-green-500",
  red: "bg-red-500", indigo: "bg-indigo-500", amber: "bg-amber-500",
  lime: "bg-lime-500", fuchsia: "bg-fuchsia-500", rose: "bg-rose-500",
  cyan: "bg-cyan-500", zinc: "bg-zinc-400",
};

export default function Dashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { trackedApps, watchedPaths, refreshTick, appProfiles, recentFiles: allRecent, recentLoading, triggerRefresh } = useAppContext();
  const { runningApps, activityLog } = useLive();
  const { menu, open, close } = useContextMenu();
  const [drives, setDrives] = useState<DriveInfo[]>([]);

  const recentFiles  = allRecent.slice(0, 5);
  const loadingFiles = recentLoading;

  const profileByName: Record<string, { icon: string; color: string }> = {};
  appProfiles.forEach((p) => { profileByName[p.name] = { icon: p.icon, color: p.color }; });
  const iconFor = (name: string) => profileByName[name]?.icon ?? "📦";
  const barFor  = (name: string) => BAR_COLORS[profileByName[name]?.color ?? ""] ?? "bg-zinc-500";

  // How much each tracked app has been worked on (total active seconds).
  const activeByApp = activeSecondsByApp(activityLog);
  const maxActive   = Math.max(1, ...trackedApps.map((a) => activeByApp[a] ?? 0));

  useEffect(() => {
    invoke<DriveInfo[]>("list_drives").then(setDrives).catch(() => {});
  }, [refreshTick]);

  const totalBytes = drives.reduce((s, d) => s + d.total_bytes, 0);
  const usedBytes  = drives.reduce((s, d) => s + (d.total_bytes - d.free_bytes), 0);

  const stats = [
    { label: "Drives Detected", value: drives.length > 0 ? String(drives.length) : "—", sub: "connected drives" },
    { label: "Total Size",      value: totalBytes > 0 ? formatBytes(totalBytes) : "—",  sub: "across all drives" },
    { label: "Used Space",      value: usedBytes  > 0 ? formatBytes(usedBytes)  : "—",  sub: "currently used"    },
    { label: "Tracked Apps",    value: trackedApps.length > 0 ? String(trackedApps.length) : "—", sub: "monitored apps" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
          <p className="text-zinc-400 mt-1 text-sm">Overview of your drives, files and creative work</p>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={loadingFiles}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
        >
          {loadingFiles ? "Refreshing..." : "⟳ Refresh"}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white mb-1">{s.value}</p>
            <p className="text-xs text-zinc-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Currently Open */}
      {runningApps.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
            <h3 className="text-sm font-semibold text-white">Currently Open</h3>
          </div>
          <div className="flex flex-col">
            {runningApps.map((r) => {
              return (
                <div key={`${r.app}::${r.project_path ?? ""}`} className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800/50 last:border-0">
                  <span className="text-xl shrink-0">{iconFor(r.app)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{r.app}</p>
                    {r.project ? (
                      <p className="text-xs text-zinc-400 font-mono truncate mt-0.5" title={r.project_path ?? ""}>
                        {r.project}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-600 mt-0.5">project not detected</p>
                    )}
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-green-400 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    Running
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently Worked On — from the persistent activity log */}
      {activityLog.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Recently Worked On</h3>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View log →
            </button>
          </div>
          <div className="flex flex-col">
            {activityLog.slice(0, 5).map((e, i) => {
              const running = runningApps.some((r) => r.app === e.app && r.project_path === e.project_path);
              return (
                <div
                  key={i}
                  onClick={() => onNavigate("activity")}
                  onContextMenu={(ev) => e.project_path && open(ev, [
                    { label: "Open project folder", icon: "📂", onClick: () => openInExplorer(e.project_path!) },
                  ])}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/50 last:border-0"
                >
                  <span className="text-lg shrink-0">{iconFor(e.app)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{e.project ?? e.app}</p>
                    <p className="text-xs text-zinc-600 truncate">{e.project ? e.app : `${e.sessions} session${e.sessions !== 1 ? "s" : ""}`}</p>
                  </div>
                  {running ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-400 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Open
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600 shrink-0">{formatRelativeTime(e.last_seen)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Middle row */}
      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Recent Files */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Recent Files</h3>
            <button
              onClick={() => onNavigate("recent")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </button>
          </div>
          <div className="flex flex-col">
            {loadingFiles && (
              <div className="px-5 py-8 text-center text-xs text-zinc-500">Loading files...</div>
            )}
            {!loadingFiles && watchedPaths.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-zinc-600">
                Add watched paths in{" "}
                <button onClick={() => onNavigate("applications")} className="text-blue-400 hover:underline">
                  Applications
                </button>{" "}
                to see recent files
              </div>
            )}
            {!loadingFiles && recentFiles.map((f, i) => (
              <div
                key={i}
                onClick={() => onNavigate("recent")}
                onContextMenu={(e) => open(e, [
                  { label: "Open file location", icon: "📂", onClick: () => openInExplorer(f.path) },
                ])}
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/50 last:border-0"
              >
                <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${EXT_COLOR[f.ext] ?? "bg-zinc-800 text-zinc-400"}`}>
                  .{f.ext}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{f.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{extToApp(f.ext) || "File"}</p>
                </div>
                <span className="text-xs text-zinc-600 shrink-0">{formatRelativeTime(f.last_modified)}</span>
              </div>
            ))}
            {!loadingFiles && watchedPaths.length > 0 && recentFiles.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-zinc-600">No recent files found</div>
            )}
          </div>
        </div>

        {/* Tracked Apps */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Tracked Apps</h3>
            <button
              onClick={() => onNavigate("creative")}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </button>
          </div>
          <div className="flex flex-col">
            {trackedApps.length === 0 && (
              <div className="px-5 py-8 text-center text-xs text-zinc-600">
                No apps tracked — configure in{" "}
                <button onClick={() => onNavigate("applications")} className="text-blue-400 hover:underline">
                  Applications
                </button>
              </div>
            )}
            {trackedApps.map((appName, i) => {
              const secs = activeByApp[appName] ?? 0;
              const pct  = Math.round((secs / maxActive) * 100);
              return (
                <div
                  key={i}
                  onClick={() => onNavigate("creative")}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/50 last:border-0"
                >
                  <span className="text-lg shrink-0">{iconFor(appName)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-white">{appName}</p>
                      <p className="text-xs text-zinc-500">{formatDuration(secs)}</p>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1">
                      <div className={`${barFor(appName)} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drive overview */}
      {drives.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Drives</h3>
          <div className="grid grid-cols-3 gap-3">
            {drives.map((d) => {
              const used = d.total_bytes - d.free_bytes;
              const pct  = d.total_bytes > 0 ? Math.round((used / d.total_bytes) * 100) : 0;
              return (
                <div key={d.letter} className="bg-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-mono font-semibold text-white">{d.letter}</p>
                    <span className="text-xs text-zinc-500">{pct}%</span>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-1 mb-1.5">
                    <div
                      className="bg-blue-500 h-1 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">{formatBytes(used)} / {formatBytes(d.total_bytes)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate("scanner")}
            className="flex items-center gap-3 p-3.5 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-left"
          >
            <span className="text-xl">⟳</span>
            <div>
              <p className="font-medium text-white text-xs">Scan Drives</p>
              <p className="text-xs text-blue-200 mt-0.5">Analyse files</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate("duplicates")}
            className="flex items-center gap-3 p-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-left"
          >
            <span className="text-xl">⊕</span>
            <div>
              <p className="font-medium text-white text-xs">Duplicates</p>
              <p className="text-xs text-zinc-400 mt-0.5">Free up space</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate("organise")}
            className="flex items-center gap-3 p-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors text-left"
          >
            <span className="text-xl">≡</span>
            <div>
              <p className="font-medium text-white text-xs">Organise</p>
              <p className="text-xs text-zinc-400 mt-0.5">Approve moves</p>
            </div>
          </button>
        </div>
      </div>

      <ContextMenu menu={menu} onClose={close} />
    </div>
  );
}
