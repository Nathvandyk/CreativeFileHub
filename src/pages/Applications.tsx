import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppContext } from "../context/AppContext";
import type { DriveInfo, AppProfile } from "../types";
import { formatBytes } from "../utils";

type KnownApp = { name: string; icon: string; category: string };

export default function Applications() {
  const { trackedApps, setTrackedApps, watchedPaths, setWatchedPaths } = useAppContext();
  const [drives, setDrives]       = useState<DriveInfo[]>([]);
  const [knownApps, setKnownApps] = useState<KnownApp[]>([]);
  const [detected, setDetected]   = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [newPath, setNewPath]     = useState("");

  useEffect(() => {
    invoke<DriveInfo[]>("list_drives").then(setDrives).catch(() => {});
    // The app list is driven by the backend knowledge base (app_profiles.json).
    invoke<AppProfile[]>("get_app_profiles")
      .then((ps) => setKnownApps(ps.map((p) => ({ name: p.name, icon: p.icon, category: p.category }))))
      .catch(() => {});
  }, []);

  function toggleApp(name: string) {
    const next = trackedApps.includes(name)
      ? trackedApps.filter((a) => a !== name)
      : [...trackedApps, name];
    setTrackedApps(next);
  }

  async function runDetect() {
    if (watchedPaths.length === 0) return;
    setDetecting(true);
    try {
      const found = await invoke<string[]>("detect_apps", { paths: watchedPaths });
      setDetected(found);
      const merged = Array.from(new Set([...trackedApps, ...found]));
      setTrackedApps(merged);
    } finally {
      setDetecting(false);
    }
  }

  function addPath(path: string) {
    const trimmed = path.trim();
    if (trimmed && !watchedPaths.includes(trimmed)) {
      setWatchedPaths([...watchedPaths, trimmed]);
    }
    setNewPath("");
  }

  function removePath(path: string) {
    setWatchedPaths(watchedPaths.filter((p) => p !== path));
  }

  function addDrive(letter: string) {
    if (!watchedPaths.includes(letter)) {
      setWatchedPaths([...watchedPaths, letter]);
    }
  }

  const extraApps = detected
    .filter((d) => !knownApps.find((a) => a.name === d))
    .map((d) => ({ name: d, icon: "📦", category: "Detected" }));

  const displayApps = [...knownApps, ...extraApps];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white">Applications</h2>
        <p className="text-zinc-400 mt-1 text-sm">Choose which apps and paths to track across all pages</p>
      </div>

      {/* Watched paths */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Watched Paths</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Folders the app scans for recent files and app detection</p>
          </div>
          <button
            onClick={runDetect}
            disabled={detecting || watchedPaths.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {detecting ? "Detecting..." : "Detect Apps"}
          </button>
        </div>

        {/* Quick-add drives */}
        {drives.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">Quick-add a drive:</p>
            <div className="flex flex-wrap gap-2">
              {drives.map((d) => {
                const added = watchedPaths.includes(d.letter);
                return (
                  <button
                    key={d.letter}
                    onClick={() => addDrive(d.letter)}
                    disabled={added}
                    className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs transition-colors ${
                      added
                        ? "bg-blue-950/30 border-blue-800 text-blue-300 cursor-default"
                        : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
                    }`}
                  >
                    <span>💾</span>
                    <span className="font-mono">{d.letter}</span>
                    <span className="text-zinc-500">{formatBytes(d.total_bytes)}</span>
                    {added && <span className="text-green-400">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual path input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder={`Enter a folder path (e.g. F:\\Documents)`}
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPath(newPath)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-blue-600 transition-colors font-mono"
          />
          <button
            onClick={() => addPath(newPath)}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {/* Current paths */}
        {watchedPaths.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-4">
            No paths added — add a drive above or type a folder path
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {watchedPaths.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5"
              >
                <span className="text-sm font-mono text-zinc-300">{p}</span>
                <button
                  onClick={() => removePath(p)}
                  className="text-zinc-600 hover:text-red-400 transition-colors text-xs ml-4 shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* App toggles */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Tracked Applications</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Checked apps appear across Dashboard, Recent Files, and Creative Hub
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {displayApps.map((app) => {
            const checked     = trackedApps.includes(app.name);
            const wasDetected = detected.includes(app.name);
            return (
              <label
                key={app.name}
                className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                  checked
                    ? "bg-blue-950/30 border-blue-800"
                    : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleApp(app.name)}
                  className="w-4 h-4 accent-blue-500 shrink-0"
                />
                <span className="text-lg shrink-0">{app.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{app.name}</p>
                  <p className="text-xs text-zinc-500">{app.category}</p>
                </div>
                {wasDetected && (
                  <span className="text-xs text-green-400 shrink-0">Found</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
