import { useEffect, useState } from "react";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getStoredTheme, setStoredTheme, type Theme } from "../utils";

async function getOverlay() {
  const wins = await getAllWebviewWindows();
  return wins.find((w) => w.label === "overlay") ?? null;
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
        checked ? "bg-blue-600" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const [overlayOn, setOverlayOn]   = useState(false);
  const [overlayReady, setReady]    = useState(false);
  const [theme, setThemeState]      = useState<Theme>(getStoredTheme());

  function chooseTheme(t: Theme) {
    setStoredTheme(t);
    setThemeState(t);
  }
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    getOverlay()
      .then(async (w) => {
        if (w) setOverlayOn(await w.isVisible());
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  async function toggleOverlay(next: boolean) {
    const w = await getOverlay();
    if (!w) return;
    try {
      if (next) {
        await w.show();
        await w.setFocus();
      } else {
        await w.hide();
      }
      setOverlayOn(next);
    } catch (e) {
      console.error("Overlay toggle failed:", e);
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    setUpdateMessage(null);
    setUpdateError(null);
    try {
      const available = await check();
      setUpdate(available ?? null);
      if (!available) setUpdateMessage("CreativeHub is up to date.");
    } catch (e) {
      setUpdateError(`Could not check for updates: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  }

  async function installUpdate() {
    if (!update) return;
    setInstalling(true);
    setUpdateError(null);
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
      setUpdateError(`Update failed: ${String(e)}`);
      setInstalling(false);
      setProgress(null);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white">Settings</h2>
        <p className="text-zinc-400 mt-1 text-sm">Preferences for CreativeHub</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {/* Application Updates */}
        <div className="flex items-center justify-between gap-6 p-5">
          <div className="pr-6 min-w-0">
            <p className="text-sm font-medium text-white">Application Updates</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Check GitHub for a newer CreativeHub release and install it automatically.
            </p>
            {updateMessage && <p className="text-xs text-emerald-400 mt-2">{updateMessage}</p>}
            {updateError && <p className="text-xs text-red-400 mt-2 break-words">{updateError}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {update && (
              <button
                onClick={installUpdate}
                disabled={installing}
                className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium"
              >
                {installing ? (progress !== null ? `Downloading ${progress}%` : "Installing...") : `Install v${update.version}`}
              </button>
            )}
            <button
              onClick={checkForUpdates}
              disabled={checking || installing}
              className="px-3 py-2 rounded-md border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60 text-zinc-200 text-sm font-medium"
            >
              {checking ? "Checking..." : "Check for updates"}
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="flex items-center justify-between p-5">
          <div className="pr-6">
            <p className="text-sm font-medium text-white">Appearance</p>
            <p className="text-xs text-zinc-500 mt-0.5">Choose a light or dark theme.</p>
          </div>
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 shrink-0">
            {(["dark", "light"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => chooseTheme(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  theme === t ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Overlay */}
        <div className="flex items-center justify-between p-5">
          <div className="pr-6">
            <p className="text-sm font-medium text-white">Desktop Overlay</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Floating always-on-top widget showing recent projects and storage.
              {!overlayReady && " (restart the app if the toggle does nothing)"}
            </p>
          </div>
          <Toggle checked={overlayOn} disabled={!overlayReady} onChange={toggleOverlay} />
        </div>
      </div>
    </div>
  );
}
