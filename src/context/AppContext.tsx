import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSettings, RunningApp, ActivityEntry } from "../types";

interface AppContextValue {
  trackedApps: string[];
  watchedPaths: string[];
  refreshTick: number;
  runningApps: RunningApp[];
  activityLog: ActivityEntry[];
  setTrackedApps: (apps: string[]) => void;
  setWatchedPaths: (paths: string[]) => void;
  triggerRefresh: () => void;
  clearActivityLog: () => void;
}

const AppContext = createContext<AppContextValue>({
  trackedApps: [],
  watchedPaths: [],
  refreshTick: 0,
  runningApps: [],
  activityLog: [],
  setTrackedApps: () => {},
  setWatchedPaths: () => {},
  triggerRefresh: () => {},
  clearActivityLog: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [trackedApps, setTrackedAppsState] = useState<string[]>([
    "Blender", "Unreal Engine", "VS Code", "Visual Studio",
  ]);
  const [watchedPaths, setWatchedPathsState] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    invoke<AppSettings>("load_settings")
      .then((s) => {
        setTrackedAppsState(s.tracked_apps);
        setWatchedPathsState(s.watched_paths);
      })
      .catch(() => {});
  }, []);

  // Single source of truth for running-app detection + activity logging.
  // Polls every 5s, records each open app/project to the persistent log,
  // and exposes both live running apps and the accumulated history.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const running = await invoke<RunningApp[]>("poll_activity");
        if (cancelled) return;
        setRunningApps(running);
        const log = await invoke<ActivityEntry[]>("get_activity_log");
        if (!cancelled) setActivityLog(log);
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function clearActivityLog() {
    invoke("clear_activity_log").then(() => setActivityLog([])).catch(() => {});
  }

  // Auto-refresh when the app window regains focus
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) setRefreshTick((t) => t + 1);
      })
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  function persist(apps: string[], paths: string[]) {
    invoke("save_settings", {
      settings: { tracked_apps: apps, watched_paths: paths },
    }).catch(() => {});
  }

  function setTrackedApps(apps: string[]) {
    setTrackedAppsState(apps);
    persist(apps, watchedPaths);
  }

  function setWatchedPaths(paths: string[]) {
    setWatchedPathsState(paths);
    persist(trackedApps, paths);
  }

  function triggerRefresh() {
    setRefreshTick((t) => t + 1);
  }

  return (
    <AppContext.Provider value={{
      trackedApps, watchedPaths, refreshTick, runningApps, activityLog,
      setTrackedApps, setWatchedPaths, triggerRefresh, clearActivityLog,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);
