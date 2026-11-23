import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Register offline PWA Service Worker when running as hosted HTTPS/localhost PWA (FR-101)
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.protocol !== "chrome-extension:"
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service worker registration skipped if unsupported
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
