import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Overlay from "./Overlay";
import { AppProvider } from "./context/AppContext";
import { applyTheme, getStoredTheme } from "./utils";

// Apply the saved light/dark theme before first paint.
applyTheme(getStoredTheme());

// The overlay window loads the same bundle at `index.html#overlay`; render the
// lightweight widget there instead of the full app (avoids double scanning).
const isOverlay = window.location.hash.replace(/^#/, "") === "overlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isOverlay ? (
      <Overlay />
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}
  </React.StrictMode>,
);
