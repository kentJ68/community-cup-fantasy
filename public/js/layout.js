// layout.js — Safe layout injector (fallback)
// - Minimal, defensive: will not throw if .app is missing
// - Injects sidebar + topbar when .app exists
// - Hides admin-only links if not admin
(function () {
  "use strict";
  const ADMIN_TOKEN_KEY = "adminToken";
  function getToken() { return localStorage.getItem("token") || ""; }
  function parseJwt(token) {
    if (!token) return null;
    try { return JSON.parse(atob(token.split(".")[1])); } catch (e) { return null; }
  }
  function elFromHTML(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function highlightActiveNav(root = document) {
    try {
      const links = root.querySelectorAll(".nav-link");
      const path = window.location.pathname;
      links.forEach((lnk) => {
        if (!lnk || !lnk.getAttribute) return;
        if (lnk.getAttribute("href") === path) lnk.classList.add("active");
        else lnk.classList.remove("active");
      });
    } catch (e) { console.error("highlightActiveNav failed", e); }
  }
  function guardAdminLinks(root = document) {
    try {
      const adminLinks = root.querySelectorAll(".admin-only");
      if (!adminLinks || adminLinks.length === 0) return;
      const token = getToken();
      const pl = parseJwt(token);
      const isAdminJwt = pl && pl.role === "admin";
      const storageAdmin = (sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY));
      const isAdminToken = !!storageAdmin;
      const show = isAdminJwt || isAdminToken;
      adminLinks.forEach((a) => { try { a.style.display = show ? "" : "none"; } catch (e) {} });
    } catch (e) { console.error("guardAdminLinks failed", e); }
  }
  async function applyUserAvatar() {
    try {
      const token = getToken();
      if (!token) return;
      const resp = await fetch("/api/me", { headers: { Authorization: "Bearer " + token }});
      if (!resp || !resp.ok) return;
      const j = await resp.json();
      if (!j || !j.ok || !j.user) return;
      const avatar = j.user.avatarUrl;
      if (!avatar) return;
      const img = document.getElementById("topAvatar") || document.querySelector(".top-avatar");
      if (img) img.src = avatar;
    } catch (e) {}
  }
  function injectLayout() {
    try {
      const app = document.querySelector(".app");
      if (!app) return;
      if (document.querySelector(".sidebar") && document.querySelector(".topbar")) {
        highlightActiveNav(); guardAdminLinks(); applyUserAvatar(); return;
      }
      const topbarHtml = `
        <div class="topbar" role="banner">
          <div class="left" style="display:flex;align-items:center;gap:12px;">
            <button class="menu-toggle" aria-label="Toggle menu" style="background:transparent;border:none;color:inherit;font-size:20px;cursor:pointer;">☰</button>
            <h2 style="margin:0;font-size:1.1rem;">Beowulf Fantasy</h2>
          </div>
          <div class="actions" style="display:flex;align-items:center;gap:12px;">
            <a class="link" href="/dashboard.html">Dashboard</a>
            <a class="link" href="/profile.html">Profile</a>
            <img id="topAvatar" src="/assets/avatars/default.png" alt="avatar" class="top-avatar" />
          </div>
        </div>`;
      const sidebarHtml = `
        <aside class="sidebar" role="navigation">
          <div class="brand" style="display:flex;align-items:center;gap:12px;">
            <img src="/assets/logo.png" class="logo" alt="logo" />
            <div><h1 style="margin:0;font-size:1rem;">Beowulf</h1><p class="sub" style="margin:0;font-size:0.85rem;color:var(--muted)">Fantasy Cup</p></div>
          </div>
          <nav class="nav" aria-label="Main navigation" style="margin-top:14px;">
            <a href="/dashboard.html" class="nav-link">Dashboard</a>
            <a href="/create-team.html" class="nav-link">Create Team</a>
            <a href="/contests.html" class="nav-link">Contests</a>
            <a href="/leaderboard.html" class="nav-link">Leaderboard</a>
            <a href="/league.html" class="nav-link">League</a>
            <a href="/season.html" class="nav-link">Season</a>
            <a href="/admin/matches.html" class="nav-link admin-only">Admin: Matches</a>
            <a href="/admin/roster.html" class="nav-link admin-only">Admin: Roster</a>
            <a href="/admin.html" class="nav-link admin-only">Admin Panel</a>
          </nav>
          <div class="sidebar-footer muted" style="margin-top:auto;">Beowulf • Viewer-Owned Fantasy</div>
        </aside>`;
      const topbar = elFromHTML(topbarHtml);
      const sidebar = elFromHTML(sidebarHtml);
      if (!app.querySelector(".topbar")) app.insertAdjacentElement("afterbegin", topbar);
      if (!app.querySelector(".sidebar")) app.insertAdjacentElement("afterbegin", sidebar);
      try {
        const menuToggle = document.querySelector(".menu-toggle");
        const side = document.querySelector(".sidebar");
        if (menuToggle && side) {
          menuToggle.addEventListener("click", (ev) => { ev.stopPropagation(); side.classList.toggle("open"); });
          document.addEventListener("click", (ev) => { if (!side.contains(ev.target) && !menuToggle.contains(ev.target)) { side.classList.remove("open"); } });
        }
      } catch (e) { console.error("menu toggle bind error", e); }
      highlightActiveNav(); guardAdminLinks(); applyUserAvatar();
    } catch (err) { console.error("layout.injectLayout failed:", err); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectLayout); else setTimeout(injectLayout,0);
  try { window.__beowulf_layout_reload = function(){ try{ injectLayout(); highlightActiveNav(); guardAdminLinks(); applyUserAvatar(); console.info("Beowulf layout reloaded"); } catch(e){ console.error("reload failed", e); } }; } catch(e){}
})();
