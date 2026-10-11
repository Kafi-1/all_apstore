/**
 * App details view
 */

import {
  fetchAppById,
  fetchApps,
  recordDownloadAndGetUrl,
  isFavorite,
  toggleFavorite,
  addToHistory,
} from "./firestore.js";
import { getCurrentUser } from "./auth.js";
import {
  escapeHtml,
  formatCount,
  renderIcon,
  emptyState,
  errorState,
  setPageMeta,
  triggerDownload,
  toast,
} from "./utils.js";
import { navigate } from "./router.js";

export async function showAppDetails(appId) {
  const overlay = document.getElementById("detailOverlay");
  if (!overlay) return;

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  overlay.innerHTML = `
    <div class="ov-header">
      <button type="button" class="icon-btn" id="detailBack" aria-label="Back">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <span style="font-weight:500">Loading…</span>
    </div>
    <div class="detail-scroll">
      <div class="state-box"><p>Loading app…</p></div>
    </div>`;

  document.getElementById("detailBack").onclick = () => closeDetails();

  try {
    const app = await fetchAppById(appId);
    if (!app) {
      overlay.querySelector(".detail-scroll").innerHTML = emptyState(
        "block",
        "App not found",
        "This app may be unpublished or removed."
      );
      return;
    }

    setPageMeta({
      title: app.name,
      description: app.description?.slice(0, 160) || `${app.name} by ${app.developer}`,
      image: app.iconUrl || app.bannerUrl,
      url: window.location.origin + "/app/" + app.id,
    });

    const user = getCurrentUser();
    if (user) {
      addToHistory(user.uid, app.id).catch(() => {});
    }

    let fav = false;
    if (user) {
      try {
        fav = await isFavorite(user.uid, app.id);
      } catch (_) {}
    }

    const shots =
      app.screenshots && app.screenshots.length
        ? app.screenshots
            .map(
              (src) =>
                `<img src="${escapeHtml(src)}" alt="Screenshot" loading="lazy" width="140" height="248" />`
            )
            .join("")
        : `<div class="shot-ph"></div><div class="shot-ph"></div><div class="shot-ph"></div>`;

    overlay.innerHTML = `
      <div class="detail-scroll" id="detailScroll">
        <div class="detail-hero" style="${
          app.bannerUrl ? "" : "background:linear-gradient(145deg,#0d1b4a,#1a237e 40%,#3949ab)"
        }">
          ${
            app.bannerUrl
              ? `<img class="banner" src="${escapeHtml(app.bannerUrl)}" alt="" />`
              : ""
          }
          <button type="button" class="icon-btn back-btn" id="detailBack" aria-label="Back">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="dh">
            ${renderIcon(app, "d-icon")}
            <div class="d-title">
              <h1>${escapeHtml(app.name)}</h1>
              <p class="dev">${escapeHtml(app.developer)}</p>
            </div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat">
            <div class="val">${app.rating ? app.rating.toFixed(1) + " ★" : "—"}</div>
            <div class="lbl">${formatCount(app.reviewCount)} reviews</div>
          </div>
          <div class="stat">
            <div class="val">${escapeHtml(app.size || "—")}</div>
            <div class="lbl">Size</div>
          </div>
          <div class="stat">
            <div class="val">${escapeHtml(app.ageRating || "—")}</div>
            <div class="lbl">Rated</div>
          </div>
        </div>

        <div class="cta-row">
          <button type="button" class="btn-download" id="btnDownload">Install</button>
          <button type="button" class="btn-fav ${fav ? "on" : ""}" id="btnFav" aria-label="Favorite">
            <span class="material-symbols-outlined">favorite</span>
          </button>
        </div>

        <div class="shots">${shots}</div>

        <div class="about">
          <h3>About this app</h3>
          <p>${escapeHtml(app.description || "No description provided.")}</p>
          ${
            app.whatsNew
              ? `<div class="whats-new"><h3>What's new</h3><p>${escapeHtml(app.whatsNew)}</p></div>`
              : ""
          }
          <p style="margin-top:16px;font-size:13px;color:var(--muted)">
            ${escapeHtml(app.category || app.type)} · Version ${escapeHtml(app.version || "—")} ·
            ${formatCount(app.downloadCount)} downloads
            ${app.packageName ? " · " + escapeHtml(app.packageName) : ""}
          </p>
        </div>

        <div class="sec" id="similarSec" style="display:none">
          <div class="sec-h"><h3>Similar apps</h3></div>
          <div class="row" id="similarRow"></div>
        </div>
      </div>`;

    document.getElementById("detailBack").onclick = () => closeDetails();

    const dlBtn = document.getElementById("btnDownload");
    dlBtn.onclick = async () => {
      dlBtn.disabled = true;
      dlBtn.textContent = "Starting…";
      try {
        const url = await recordDownloadAndGetUrl(app.id);
        triggerDownload(url, app.packageName || app.name);
        toast("Download started");
      } catch (e) {
        console.error(e);
        toast(e.message || "Download unavailable");
      } finally {
        dlBtn.disabled = false;
        dlBtn.textContent = "Install";
      }
    };

    const favBtn = document.getElementById("btnFav");
    favBtn.onclick = async () => {
      const u = getCurrentUser();
      if (!u) {
        toast("Sign in to save favorites");
        navigate("/profile");
        return;
      }
      try {
        const nowFav = await toggleFavorite(u.uid, app.id, fav);
        fav = nowFav;
        favBtn.classList.toggle("on", fav);
        toast(fav ? "Added to favorites" : "Removed from favorites");
      } catch (e) {
        toast(e.message || "Could not update favorites");
      }
    };

    // Similar apps
    try {
      const { items } = await fetchApps({
        type: app.type,
        category: app.category || undefined,
        pageSize: 10,
      });
      const similar = items.filter((a) => a.id !== app.id).slice(0, 8);
      if (similar.length) {
        const sec = document.getElementById("similarSec");
        const row = document.getElementById("similarRow");
        sec.style.display = "";
        row.innerHTML = similar
          .map(
            (a) => `<div class="app-card" data-app-id="${escapeHtml(a.id)}">
              ${renderIcon(a)}
              <div class="app-name">${escapeHtml(a.name)}</div>
              <div class="app-meta"><span class="material-symbols-outlined">star</span> ${
                a.rating ? a.rating.toFixed(1) : "—"
              }</div>
            </div>`
          )
          .join("");
        row.onclick = (e) => {
          const card = e.target.closest("[data-app-id]");
          if (card) {
            closeDetails();
            navigate("/app/" + card.dataset.appId);
          }
        };
      }
    } catch (_) {}
  } catch (err) {
    console.error(err);
    overlay.querySelector(".detail-scroll").innerHTML = errorState(err.message);
    document.getElementById("retryBtn")?.addEventListener("click", () => showAppDetails(appId));
  }
}

export function closeDetails() {
  const overlay = document.getElementById("detailOverlay");
  if (overlay) {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    // Delay clear so exit animation can run if present
    setTimeout(() => {
      if (!overlay.classList.contains("show")) overlay.innerHTML = "";
    }, 280);
  }
  // Prefer going back in history if we navigated to /app/...
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.includes("/app/")) {
    if (window.history.length > 1) {
      history.back();
    } else {
      navigate("/", true);
    }
  }
}
