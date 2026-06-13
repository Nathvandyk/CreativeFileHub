import { useAppContext } from "../context/AppContext";
import { formatRelativeTime } from "../utils";

const APP_META: Record<string, { icon: string; color: string }> = {
  "Blender":       { icon: "🟠", color: "border-orange-800" },
  "Unreal Engine": { icon: "🎮", color: "border-purple-800" },
  "VS Code":       { icon: "💙", color: "border-blue-800"   },
  "Visual Studio": { icon: "🔵", color: "border-blue-800"   },
  "Python":        { icon: "🐍", color: "border-yellow-800" },
  "Photoshop":     { icon: "🖼️", color: "border-sky-800"    },
  "Premiere Pro":  { icon: "🎬", color: "border-pink-800"   },
  "After Effects": { icon: "🎞️", color: "border-violet-800" },
  "Godot":         { icon: "🎯", color: "border-teal-800"   },
  "Unity":         { icon: "⬛", color: "border-zinc-700"   },
};

function fullDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export default function Activity() {
  const { activityLog, runningApps, clearActivityLog } = useAppContext();

  const isRunning = (app: string, projectPath: string | null) =>
    runningApps.some((r) => r.app === app && r.project_path === projectPath);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-white">Activity Log</h2>
          <p className="text-zinc-400 mt-1 text-sm">A history of the apps and projects you've worked on</p>
        </div>
        {activityLog.length > 0 && (
          <button
            onClick={clearActivityLog}
            className="px-4 py-2 bg-zinc-800 hover:bg-red-900/40 hover:text-red-300 border border-zinc-700 rounded-lg text-xs text-zinc-400 transition-colors"
          >
            Clear log
          </button>
        )}
      </div>

      {activityLog.length === 0 ? (
        <div className="text-center py-20 text-zinc-600 text-sm">
          No activity recorded yet.<br />
          Open a tracked app (Unreal, Blender, Visual Studio…) and it'll appear here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activityLog.map((e, i) => {
            const meta    = APP_META[e.app] ?? { icon: "📦", color: "border-zinc-700" };
            const running = isRunning(e.app, e.project_path);
            return (
              <div
                key={i}
                className={`flex items-center gap-4 bg-zinc-900 border rounded-xl px-5 py-4 transition-colors ${
                  running ? "border-green-800" : "border-zinc-800"
                }`}
              >
                <span className="text-2xl shrink-0">{meta.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white">
                      {e.project ?? e.app}
                    </p>
                    {e.project && (
                      <span className="text-xs text-zinc-500">{e.app}</span>
                    )}
                    {running && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-900/30 text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Open now
                      </span>
                    )}
                  </div>
                  {e.project_path && (
                    <p className="text-xs text-zinc-600 font-mono truncate">{e.project_path}</p>
                  )}
                  <p className="text-xs text-zinc-600 mt-1">
                    {e.sessions} session{e.sessions !== 1 ? "s" : ""} · first seen {fullDate(e.first_seen)}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-400">{running ? "Active" : formatRelativeTime(e.last_seen)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5" title={fullDate(e.last_seen)}>
                    last worked
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
