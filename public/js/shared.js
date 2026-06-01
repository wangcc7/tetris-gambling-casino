const playerKey = "casinoPlayerId";

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPlayerId() {
  const session = getSession();
  return session.userId || session.playerId || "guest";
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("casinoAccount") || "{}");
  } catch {
    localStorage.removeItem("casinoAccount");
    return {};
  }
}

export function setSession(session) {
  localStorage.setItem("casinoAccount", JSON.stringify(session));
  if (session.userId) localStorage.setItem(playerKey, session.userId);
}

export async function api(path, options = {}) {
  const session = getSession();
  const res = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  return res.json();
}

export function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

export async function loadState() {
  const session = getSession();
  return api(`/api/state${session.token ? `?sessionToken=${encodeURIComponent(session.token)}` : ""}`);
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
  const authButton = document.querySelector("#authToggle");
  if (authButton) authButton.textContent = state.identity?.username ? `账号 · ${state.identity.username}` : "登录 / 注册";
  const system = document.querySelector("#systemDock");
  if (system) {
    const weather = state.external?.weather;
    system.innerHTML = `
      <span>${escapeHtml(new Date(state.serverTime).toLocaleString("zh-CN", { hour12: false }))}</span>
      <b>${escapeHtml(state.version || "dev")}</b>
      <small>${escapeHtml(weather?.city || "济南")} ${escapeHtml(weather?.temperature || "--")} ${escapeHtml(weather?.text || "")}</small>
    `;
  }
}

export function renderChat(messages, target = "#chat") {
  const el = document.querySelector(target);
  if (!el) return;
  el.innerHTML = messages.map((m) => `
    <div class="message ${escapeHtml(m.kind)}">
      <small>${escapeHtml(m.channel || "世界")}</small>
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
  mountAuthDock();
  mountSystemDock();
  mountMusicDock();
  fn();
  return setInterval(fn, interval);
}

export function mountSystemDock() {
  const header = document.querySelector(".game-header");
  if (!header || document.querySelector("#systemDock")) return;
  const dock = document.createElement("div");
  dock.id = "systemDock";
  dock.className = "system-dock";
  dock.innerHTML = "<span>同步时间中...</span>";
  header.appendChild(dock);
}

export function mountMusicDock() {
  const header = document.querySelector(".game-header");
  if (!header || document.querySelector("#musicToggle")) return;
  const button = document.createElement("button");
  button.id = "musicToggle";
  button.className = "music-toggle";
  button.textContent = "音乐";
  let ctx = null;
  let nodes = [];
  button.addEventListener("click", () => {
    if (ctx) {
      nodes.forEach((node) => node.stop && node.stop());
      nodes = [];
      ctx.close();
      ctx = null;
      button.classList.remove("active");
      return;
    }
    ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    gain.connect(ctx.destination);
    [110, 164.81, 220].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      nodes.push(osc);
    });
    button.classList.add("active");
  });
  header.appendChild(button);
}

export function mountAuthDock() {
  const header = document.querySelector(".game-header");
  if (!header || document.querySelector("#authDock")) return;
  const session = getSession();
  const dock = document.createElement("div");
  dock.id = "authDock";
  dock.className = "auth-dock";
  dock.innerHTML = `
    <button id="authToggle">${session.username ? `账号 · ${escapeHtml(session.username)}` : "登录 / 注册"}</button>
  `;
  header.appendChild(dock);
  document.querySelector("#authToggle").addEventListener("click", () => {
    location.href = "/profile.html";
  });
}

export function clearSession() {
  localStorage.removeItem("casinoAccount");
}
