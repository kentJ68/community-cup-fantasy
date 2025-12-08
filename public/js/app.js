/* ====================================================
   public/js/app.js
   Central API + UI helpers for Beowulf Fantasy (Red Inferno)
   - Auto-attaches Authorization header for same-origin requests
   - Auto-attaches X-Admin-Token when present in storage
   - Lightweight toast + confirm helpers
   - Exposes App.api / App.get / App.post / App.put / App.delete
   - Usage: App.api('/api/matches') or App.get('/api/me')
   ==================================================== */

(function (window) {
  const STORAGE_TOKEN_KEY = "token";
  const STORAGE_ADMIN_KEY = "adminToken";

  // ---------------------------
  // Small Toast / Notification
  // ---------------------------
  function createToastContainer() {
    if (document.getElementById("appToastContainer")) return;
    const c = document.createElement("div");
    c.id = "appToastContainer";
    c.style.position = "fixed";
    c.style.right = "18px";
    c.style.bottom = "18px";
    c.style.zIndex = 9999;
    c.style.display = "flex";
    c.style.flexDirection = "column";
    c.style.gap = "8px";
    document.body.appendChild(c);
  }

  function toast(message, { duration = 3500, type = "info" } = {}) {
    createToastContainer();
    const el = document.createElement("div");
    el.className = "app-toast";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "10px";
    el.style.minWidth = "180px";
    el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.45)";
    el.style.color = "#fff";
    el.style.fontWeight = 600;
    el.style.fontSize = "14px";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "all 220ms ease";
    if (type === "error") {
      el.style.background = "#4a0f18";
      el.style.border = "1px solid rgba(255,40,60,0.2)";
    } else if (type === "success") {
      el.style.background = "linear-gradient(90deg,#2f7a3a,#1fb97a)";
    } else {
      el.style.background = "linear-gradient(90deg, rgba(224,33,63,0.95), rgba(224,33,63,0.85))";
    }
    el.textContent = message;
    document.getElementById("appToastContainer").appendChild(el);

    // animate in
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 240);
    }, duration);
  }

  // ---------------------------
  // Simple confirm wrapper (returns Promise)
  // ---------------------------
  function confirmDialog(message) {
    return new Promise((resolve) => {
      const r = window.confirm(message);
      resolve(r);
    });
  }

  // ---------------------------
  // Token helpers
  // ---------------------------
  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN_KEY) || "";
  }
  function setToken(t) {
    if (!t) localStorage.removeItem(STORAGE_TOKEN_KEY);
    else localStorage.setItem(STORAGE_TOKEN_KEY, t);
  }
  function getAdminToken() {
    // support both sessionStorage and localStorage patterns used in pages
    return sessionStorage.getItem(STORAGE_ADMIN_KEY) || localStorage.getItem(STORAGE_ADMIN_KEY) || "";
  }

  // ---------------------------
  // Determine if URL is same-origin
  // ---------------------------
  function isSameOrigin(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  // ---------------------------
  // Monkey-patch fetch for same-origin auth auto-attach
  // Note: We keep original fetch for cross-origin untouched except adding headers when safe.
  // ---------------------------
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    try {
      let url = (typeof input === "string") ? input : input.url;
      const sameOrigin = isSameOrigin(url);

      // clone init to avoid mutating caller object
      init = Object.assign({}, init);

      init.headers = new Headers(init.headers || {});

      if (sameOrigin) {
        const token = getToken();
        if (token && !init.headers.has("Authorization")) {
          init.headers.set("Authorization", `Bearer ${token}`);
        }
        const adminToken = getAdminToken();
        if (adminToken && !init.headers.has("X-Admin-Token")) {
          init.headers.set("X-Admin-Token", adminToken);
        }
      }

      const res = await _fetch(input, init);

      // Global 401 handling: if token invalid, clear and redirect to login
      if ((res.status === 401 || res.status === 403) && isSameOrigin(url)) {
        // try to parse response for specific message
        try {
          const txt = await res.clone().text();
          // If it's JSON with an "error" field we show it
          let errMsg = "";
          try {
            const j = JSON.parse(txt);
            errMsg = j.error || j.message || "";
          } catch (e) { errMsg = txt || ""; }
          // Remove token
          setToken("");
          // Inform user gently
          if (errMsg) toast("Session: " + errMsg, { type: "error" });
          else toast("Session expired. Please login again.", { type: "error" });
        } catch (_) {
          // ignore
          toast("Session expired. Please login again.", { type: "error" });
        }
        // redirect to login after a brief moment (but only when user is on same-origin UI)
        setTimeout(() => {
          if (!window.location.pathname.startsWith("/login")) {
            window.location = "/login.html";
          }
        }, 900);
      }

      return res;
    } catch (err) {
      // Network or other failure
      toast("Network error", { type: "error" });
      throw err;
    }
  };

  // ---------------------------
  // Small JSON helper that returns { ok, status, json }
  // ---------------------------
  async function safeJson(res) {
    const out = { ok: false, status: res.status, data: null };
    try {
      const j = await res.json();
      out.data = j;
      out.ok = !!j?.ok || res.status >= 200 && res.status < 300;
    } catch (e) {
      out.data = null;
    }
    return out;
  }

  // ---------------------------
  // API wrapper (convenience)
  // ---------------------------
  async function apiFetch(path, { method = "GET", body = null, headers = {}, asJson = true } = {}) {
    const opts = { method, headers: Object.assign({}, headers) };

    if (body != null) {
      if (body instanceof FormData) {
        opts.body = body;
        // let browser set Content-Type for FormData
      } else {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
    }

    const res = await fetch(path, opts);
    if (!asJson) return res;
    const parsed = await safeJson(res);
    return parsed;
  }

  // Convenience methods
  function get(path) { return apiFetch(path, { method: "GET" }); }
  function post(path, body) { return apiFetch(path, { method: "POST", body }); }
  function put(path, body) { return apiFetch(path, { method: "PUT", body }); }
  function del(path, body) { return apiFetch(path, { method: "DELETE", body }); }

  // ---------------------------
  // Small utilities
  // ---------------------------
  function formatDateISO(dStr) {
    if (!dStr) return "";
    const d = new Date(dStr);
    return d.toLocaleString();
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function logout() {
    setToken("");
    toast("Logged out", { type: "info" });
    setTimeout(() => window.location = "/login.html", 400);
  }

  // ---------------------------
  // App.init: wire up global UI items (logout button, auto avatar, etc.)
  // - Call App.init() from pages that load after DOM ready if needed.
  // ---------------------------
  async function init({ autoAttachLayout = true } = {}) {
    // wire up global logout links (elements with data-action="logout")
    document.querySelectorAll("[data-action='logout']").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault(); logout();
      });
    });

    // wire up simple "login redirect" if not logged in and page requires auth
    document.querySelectorAll("[data-require-login='true']").forEach(el => {
      if (!isLoggedIn()) {
        // if element is a form or button, disable it gracefully
        el.setAttribute("disabled", "disabled");
        el.style.opacity = 0.6;
      }
    });

    // optional: attach admin-only UI hide/show
    const isAdmin = !!(sessionStorage.getItem(STORAGE_ADMIN_KEY) || localStorage.getItem(STORAGE_ADMIN_KEY));
    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });

    // wire up elements that want server health ping
    document.querySelectorAll("[data-health-dot]").forEach(async el => {
      try {
        const r = await get("/api/health");
        if (r.ok && r.data && r.data.ok) {
          el.textContent = "Server OK";
          el.classList.add("status-pill", "ok");
        } else {
          el.textContent = "Server Down";
        }
      } catch {
        el.textContent = "Offline";
      }
    });

    // If autoAttachLayout is true, try to set topbar avatar src where available
    try {
      const token = getToken();
      if (token) {
        const me = await get("/api/me");
        if (me.ok && me.data && me.data.user) {
          const avatar = me.data.user.avatarUrl;
          const avatarImg = document.getElementById("topAvatar") || document.querySelector(".top-avatar");
          if (avatar && avatarImg) avatarImg.src = avatar;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // ---------------------------
  // Expose App public API
  // ---------------------------
  const App = {
    api: apiFetch,
    get,
    post,
    put,
    delete: del,
    toast,
    confirm: confirmDialog,
    formatDate: formatDateISO,
    getToken,
    setToken,
    getAdminToken,
    isLoggedIn,
    logout,
    init,
  };

  window.App = App;

  // Auto-init on DOMContentLoaded
  window.addEventListener("DOMContentLoaded", () => {
    try { App.init(); } catch (e) { /* ignore */ }
  });

})(window);
