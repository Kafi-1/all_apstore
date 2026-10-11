/**
 * Lightweight client-side router (fixed + base-path aware)
 * Supports GitHub Pages / subfolder / custom domain deploys.
 */

const routes = [];
let currentCleanup = null;
let basePath = "";

/**
 * Detect base path from <base href> or current script location.
 * Falls back to "" for root deploys.
 */
function detectBasePath() {
  const baseEl = document.querySelector("base[href]");
  if (baseEl) {
    try {
      const u = new URL(baseEl.href, window.location.origin);
      return (u.pathname || "/").replace(/\/+$/, "") || "";
    } catch (_) {}
  }
  // If site is served from a subfolder (e.g. /playstore/), detect it
  const path = window.location.pathname;
  // Don't treat app routes as base
  return "";
}

basePath = detectBasePath();

/**
 * Normalize path: strip base, trailing slashes, ensure leading /
 */
function normalizePath(raw) {
  let p = raw || "/";
  if (basePath && p.startsWith(basePath)) {
    p = p.slice(basePath.length) || "/";
  }
  p = p.replace(/\/+$/, "") || "/";
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

/**
 * Build full path including base for history API
 */
function fullPath(path) {
  const p = path.startsWith("/") ? path : "/" + path;
  return (basePath || "") + p;
}

/**
 * Register a route
 * pattern: string like "/", "/app/:id", "/search"
 */
export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\//g, "\\/")
        .replace(/:([a-zA-Z]+)/g, (_, key) => {
          keys.push(key);
          return "([^/]+)";
        }) +
      "$"
  );
  routes.push({ regex, keys, handler, pattern });
}

/**
 * Navigate to a path (SPA)
 */
export function navigate(path, replace = false) {
  const target = fullPath(path);
  const current = window.location.pathname + window.location.search;

  // Avoid redundant push that would break back button
  if (!replace && current === target) {
    handleRoute();
    return;
  }

  if (replace) {
    history.replaceState({ path }, "", target);
  } else {
    history.pushState({ path }, "", target);
  }
  handleRoute();
}

export function startRouter() {
  window.addEventListener("popstate", handleRoute);

  // Intercept internal links with data-link
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-link]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
    e.preventDefault();
    navigate(href);
  });

  handleRoute();
}

async function handleRoute() {
  const path = normalizePath(window.location.pathname);
  const search = window.location.search;

  // Cleanup previous route (e.g. close listeners)
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch (_) {}
    currentCleanup = null;
  }

  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      const query = Object.fromEntries(new URLSearchParams(search));

      try {
        const result = await r.handler({ path, params, query });
        if (typeof result === "function") currentCleanup = result;
      } catch (err) {
        console.error("[router] handler error:", err);
      }
      return;
    }
  }

  // No match → soft fallback to home (replace so back button still works)
  if (path !== "/") {
    console.warn("[router] no match for", path, "→ /");
    navigate("/", true);
  }
}

/** Helper: close any open overlays */
export function closeOverlays() {
  document.querySelectorAll(".overlay.show").forEach((el) => {
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  });
}

export function getBasePath() {
  return basePath;
}
