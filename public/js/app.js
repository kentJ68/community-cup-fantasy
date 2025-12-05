// public/js/app.js - tiny helpers and socket init
window.api = {
  get: async (url) => { const r = await fetch(url); if(!r.ok) throw new Error(r.statusText); return r.json(); },
  post: async (url, body, opts = {}) => {
    const headers = opts.headers || { 'Content-Type':'application/json' };
    const r = await fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return r.json();
  }
};

// optional socket for pages that use live updates
if (typeof io !== 'undefined') {
  window.socket = io();
  window.socket.on('connect', () => console.debug('socket connected', window.socket.id));
}
// Quick-links fetch handler — safe (no navigation)
(function(){
  document.addEventListener('click', async function(e){
    const btn = e.target.closest && e.target.closest('.quick-btn');
    if (!btn) return;
    const endpoint = btn.getAttribute('data-endpoint');
    const out = document.getElementById('quickResult');
    if (!endpoint || !out) return;
    out.textContent = 'Loading ' + endpoint + ' ...';
    try {
      const r = await fetch(endpoint);
      const txt = await r.text();
      // attempt to pretty-print JSON if JSON
      try {
        const j = JSON.parse(txt);
        out.textContent = JSON.stringify(j, null, 2);
      } catch {
        out.textContent = txt;
      }
    } catch (err) {
      out.textContent = 'Request failed: ' + (err.message || err);
    }
  });
})();
