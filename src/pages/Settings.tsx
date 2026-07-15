import { useEffect, useState } from "react";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";

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

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-white">Settings</h2>
        <p className="text-zinc-400 mt-1 text-sm">Preferences for CreativeHub</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
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
