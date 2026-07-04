import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Checks GitHub Releases once on startup. When a newer version exists, shows a
 * slim banner; "Install & restart" downloads the signed installer, applies it,
 * and relaunches the app on the new version.
 */
export default function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No update server reachable / offline is normal — stay silent.
    check().then((u) => { if (u) setUpdate(u); }).catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  async function install() {
    if (!update) return;
    setInstalling(true);
    setError(null);
    try {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((received / total) * 100));
        }
      });
      await relaunch();
    } catch (e) {
      setError(String(e));
      setInstalling(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex items-center gap-3 bg-blue-950/80 border-b border-blue-800 px-4 py-2 text-sm">
      <span className="text-blue-200">
        Update <span className="font-semibold text-white">v{update.version}</span> is available.
      </span>
      {error && <span className="text-red-400 truncate">{error}</span>}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={install}
          disabled={installing}
          className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium"
        >
          {installing ? (progress !== null ? `Downloading ${progress}%` : "Installing…") : "Install & restart"}
        </button>
        {!installing && (
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1 rounded-md text-blue-300 hover:bg-blue-900"
          >
            Later
          </button>
        )}
      </div>
    </div>
  );
}
