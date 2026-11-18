// Paste into the DevTools Console on https://allmanga.to/manga, then click around
// WITHOUT reloading: search, open a manga, open a chapter. It prints API calls
// (hashes + variables only; no cookies or tokens).
if (!window.__log) {
  window.__log = [];
  const f = window.fetch;
  window.fetch = function (...a) {
    try {
      const u = String(a[0].url || a[0]);
      if (u.includes("/api?")) { window.__log.push(decodeURIComponent(u)); console.log(decodeURIComponent(u)); }
    } catch (e) {}
    return f.apply(this, a);
  };
}
