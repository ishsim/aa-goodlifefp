// GoodLife FHR — offline shell.
//
// The app's data has lived offline for a while (IndexedDB + an outbox), but none of that
// could be reached without a connection, because the page itself had to be fetched before
// any of it ran. This worker caches the shell so a cold start works on a plane, in a
// basement, or on an iPad that has lost signal in a client's living room.
//
// The rule it follows: the network is always asked first for the page, so a deployed
// change is picked up the moment there is signal. The cache only answers when the network
// does not. Nothing from Supabase is ever cached — stale client data would be worse than
// no data.

const VERSION = "v1";
const SHELL_CACHE = "goodlife-shell-" + VERSION;
const ASSET_CACHE = "goodlife-assets-" + VERSION;
const SHELL_KEY = "/__app-shell";
const NAV_TIMEOUT_MS = 4000;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
text-align:center;padding:24px;background:linear-gradient(120deg,#3a1955,#51037c 55%,#66229d);
color:#fff;font-family:system-ui,sans-serif}p{color:#e9d5ff;font-size:14px;max-width:34em;line-height:1.6}</style>
</head><body><div><h1 style="font-size:20px;margin:0 0 8px">No connection, and nothing saved yet</h1>
<p>This device has not loaded the app while online, so there is no copy to open. Connect once and it
will work offline from then on.</p></div></body></html>`;

self.addEventListener("install", (event) => {
  // Warm the shell straight away so the very first offline launch works, rather than
  // only after the user has navigated once.
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/", { cache: "reload" });
        if (res && res.ok) await (await caches.open(SHELL_CACHE)).put(SHELL_KEY, res.clone());
      } catch { /* no connection during install — the first online navigation fills it */ }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, ASSET_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("goodlife-") && !keep.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// The page asks for this when the user accepts a waiting update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Static files only, identified by what the browser is asking for rather than by path:
// build output is hashed, so a cached copy can never be the wrong version of itself.
// Server functions and data requests have a destination of "empty" and so never match.
const isAsset = (url, request) =>
  url.origin === self.location.origin &&
  ["script", "style", "font", "image", "worker"].includes(request.destination);

const isFont = (url) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow network")), NAV_TIMEOUT_MS)),
    ]);
    if (res && res.ok) cache.put(SHELL_KEY, res.clone());
    return res;
  } catch {
    // Every route renders on the client, so one cached shell serves any URL.
    const cached = (await cache.match(SHELL_KEY)) || (await cache.match("/"));
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // refresh in the background so the next load is current, without delaying this one
    fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); }).catch(() => {});
    return cached;
  }
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Supabase (data, auth, storage) and anything else third-party is never cached: the app
  // has its own offline copy of the data, and a stale answer here would undermine it.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate") { event.respondWith(networkFirstShell(request)); return; }
  if (isAsset(url, request) || isFont(url)) { event.respondWith(cacheFirst(request)); return; }
});
