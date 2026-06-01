const playerKey = "casinoPlayerId";

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPlayerId() {
  const session = getSession();
  const id = session.playerId || localStorage.getItem(playerKey) || createId();
  localStorage.setItem(playerKey, id);
  return id;
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("casinoSession") || "{}");
  } catch {
    localStorage.removeItem("casinoSession");
    return {};
  }
}

export function setSession(session) {
  localStorage.setItem("casinoSession", JSON.stringify(session));
  if (session.playerId) localStorage.setItem(playerKey, session.playerId);
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
  const authName = document.querySelector("[data-auth-name]");
  if (authName) authName.textContent = getSession().accountName || "游客身份";
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
  fn();
  return setInterval(fn, interval);
}

export function mountAuthDock() {
  const header = document.querySelector(".game-header");
  if (!header || document.querySelector("#authDock")) return;
  const session = getSession();
  const dock = document.createElement("div");
  dock.id = "authDock";
  dock.className = "auth-dock";
  dock.innerHTML = `
    <button id="authToggle">${session.accountName ? escapeHtml(session.accountName) : "登录 / 注册"}</button>
    <div id="authPanel" class="auth-panel hidden">
      <b>户籍柜台</b>
      <input id="authUser" placeholder="账号">
      <input id="authPass" type="password" placeholder="密码">
      <input id="authName" placeholder="角色名">
      <div class="auth-actions">
        <button id="loginBtn">登录</button>
        <button id="registerBtn">注册</button>
      </div>
      <small>注册后会绑定你的方块矿工身份。</small>
    </div>
  `;
  header.appendChild(dock);
  document.querySelector("#authToggle").addEventListener("click", () => {
    if (getSession().accountName) {
      if (confirm("退出当前账号？")) {
        localStorage.removeItem("casinoSession");
        location.reload();
      }
      return;
    }
    document.querySelector("#authPanel").classList.toggle("hidden");
  });
  document.querySelector("#loginBtn").addEventListener("click", () => authAction("login"));
  document.querySelector("#registerBtn").addEventListener("click", () => authAction("register"));
}

async function authAction(mode) {
  const username = document.querySelector("#authUser").value.trim();
  const password = document.querySelector("#authPass").value;
  const displayName = document.querySelector("#authName").value.trim();
  try {
    const data = await post(`/api/auth/${mode}`, { username, password, displayName });
    setSession({ playerId: data.player.id, accountName: data.account.username });
    location.reload();
  } catch {
    alert(mode === "login" ? "登录失败，请检查账号密码" : "注册失败，请换一个账号或检查密码");
  }
}
