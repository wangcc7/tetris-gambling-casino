const playerKey = "casinoPlayerId";

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPlayerId() {
  const id = localStorage.getItem(playerKey) || createId();
  localStorage.setItem(playerKey, id);
  return id;
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  return res.json();
}

export function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

export async function loadState() {
  return api(`/api/state?playerId=${encodeURIComponent(getPlayerId())}`);
}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

export function money(value) {
  return Math.round(Number(value || 0)).toLocaleString("zh-CN");
}

export function pct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function setActiveNav() {
  const file = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const href = link.getAttribute("href").replace("/", "");
    link.classList.toggle("active", href === file || (file === "" && href === "index.html"));
  });
}

export function renderShellStatus(state) {
  const coin = document.querySelector("[data-player-coins]");
  const name = document.querySelector("[data-player-name]");
  const online = document.querySelector("[data-online]");
  if (coin) coin.textContent = money(state.player.coins);
  if (name) name.textContent = state.player.name;
  if (online) online.textContent = state.onlinePlayers;
}

export function renderChat(messages, target = "#chat") {
  const el = document.querySelector(target);
  if (!el) return;
  el.innerHTML = messages.map((m) => `
    <div class="message ${escapeHtml(m.kind)}">
      <strong>${escapeHtml(m.author)}</strong>
      <span>${escapeHtml(m.text)}</span>
    </div>
  `).join("");
}

export function renderStocks(stocks, target = "#stocks") {
  const el = document.querySelector(target);
  if (!el) return;
  el.innerHTML = stocks.map((s) => `
    <article class="market-row">
      <small>${escapeHtml(s.code)}</small>
      <div><b>${escapeHtml(s.name)}</b><br><small>${escapeHtml(s.sector)} · 散户热度 ${s.retailHeat}%</small></div>
      <b class="${s.change >= 0 ? "up" : "down"}">${s.price.toFixed(2)} ${pct(s.change)}</b>
    </article>
  `).join("");
}

export function renderFutures(futures, target = "#futures") {
  const el = document.querySelector(target);
  if (!el) return;
  el.innerHTML = futures.map((f) => `
    <article class="market-row">
      <small>${escapeHtml(f.code)}</small>
      <div><b>${escapeHtml(f.name)}</b><br><small>杠杆 ${f.leverage.join("x / ")}x · 爆仓线 80%</small></div>
      <b>${f.price}</b>
    </article>
  `).join("");
}

export function toast(text) {
  const el = document.querySelector("#eventTicker") || document.querySelector("[data-toast]");
  if (el) el.textContent = text;
}

export function startPage(fn, interval = 2500) {
  setActiveNav();
  fn();
  return setInterval(fn, interval);
}
