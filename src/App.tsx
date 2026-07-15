import { useState } from "react";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Duplicates from "./pages/Duplicates";
import Organise from "./pages/Organise";
import Recent from "./pages/Recent";
import Creative from "./pages/Creative";
import Activity from "./pages/Activity";
import Applications from "./pages/Applications";
import AiSearch from "./pages/AiSearch";
import Settings from "./pages/Settings";
import UpdateBanner from "./components/UpdateBanner";

type Page = "dashboard" | "scanner" | "duplicates" | "organise" | "recent" | "creative" | "activity" | "applications" | "aiSearch" | "settings";

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard",    label: "Dashboard",    icon: "⊞" },
  { id: "recent",       label: "Recent Files", icon: "🕐" },
  { id: "activity",     label: "Activity Log", icon: "📊" },
  { id: "creative",     label: "Creative",     icon: "🎨" },
  { id: "scanner",      label: "Scan Drives",  icon: "⟳" },
  { id: "duplicates",   label: "Duplicates",   icon: "⊕" },
  { id: "organise",     label: "Organise",     icon: "≡" },
  { id: "applications", label: "Applications", icon: "⚙" },
  { id: "aiSearch",     label: "AI Search",    icon: "AI" },
  { id: "settings",     label: "Settings",     icon: "🛠" },
];

function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans">

      {/* Sidebar */}
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col py-6 px-3 gap-1">
        <div className="px-3 mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-white">CreativeHub</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Drive organiser</p>
        </div>

        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${page === item.id
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto p-8">
          {page === "dashboard"    && <Dashboard    onNavigate={setPage} />}
          {page === "recent"       && <Recent />}
          {page === "activity"     && <Activity />}
          {page === "creative"     && <Creative />}
          {page === "scanner"      && <Scanner />}
          {page === "duplicates"   && <Duplicates />}
          {page === "organise"     && <Organise />}
          {page === "applications" && <Applications />}
          {page === "aiSearch"     && <AiSearch />}
          {page === "settings"     && <Settings />}
        </main>
      </div>

    </div>
  );
}

export default App;
