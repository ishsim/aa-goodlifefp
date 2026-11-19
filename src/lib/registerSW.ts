import { toast } from "sonner";

// Registers the offline shell worker and, when a new version is deployed, asks before
// switching to it. A silent auto-reload could drop a half-typed report, and a cache that
// never updates is worse than no cache at all — so the user decides, and is told.
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // The dev server serves modules that must not be cached between edits.
  if (import.meta.env?.DEV) return;

  let acceptedUpdate = false;

  const offerUpdate = (worker: ServiceWorker) => {
    toast("A new version of the app is ready", {
      duration: Infinity,
      description: "Reload to use it. Anything unsaved stays on this device either way.",
      action: {
        label: "Reload",
        onClick: () => { acceptedUpdate = true; worker.postMessage("SKIP_WAITING"); },
      },
    });
  };

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // No controller means this is the first install, not an update — nothing to ask.
          if (installing.state === "installed" && navigator.serviceWorker.controller) offerUpdate(installing);
        });
      });

      // Only reload for an update the user agreed to; the first install also fires this.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (acceptedUpdate) window.location.reload();
      });

      // Catch deployments made while the app is left open all day.
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    } catch (e) {
      console.warn("[sw] registration failed:", e);
    }
  });
}
