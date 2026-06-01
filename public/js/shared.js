const playerKey = "casinoPlayerId";
let systemClockBase = null;
let systemClockSyncedAt = 0;
let lastSystemSnapshot = { version: "dev", weather: null };
let systemClockTimer = null;
let casinoAudio = null;

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

function formatSystemTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function currentSystemTime() {
  if (!systemClockBase) return null;
  return systemClockBase + Date.now() - systemClockSyncedAt;
}

function drawSystemDock() {
  const system = document.querySelector("#systemDock");
  if (!system) return;
  const weather = lastSystemSnapshot.weather;
  const time = currentSystemTime();
  system.innerHTML = `
    <span class="clock">${time ? escapeHtml(formatSystemTime(time)) : "同步时间中..."}</span>
    <b>v${escapeHtml(lastSystemSnapshot.version || "dev")}</b>
    <small>${escapeHtml(weather?.city || "济南")} · ${escapeHtml(weather?.temperature || "--")} · ${escapeHtml(weather?.text || "天气同步")}</small>
  `;
}

export function updateSystemDock(state) {
  if (state?.serverTime) {
    systemClockBase = new Date(state.serverTime).getTime();
    systemClockSyncedAt = Date.now();
  }
  lastSystemSnapshot = {
    version: state?.version || lastSystemSnapshot.version || "dev",
    weather: state?.external?.weather || lastSystemSnapshot.weather
  };
  drawSystemDock();
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
  updateSystemDock(state);
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
  dock.innerHTML = '<span class="clock">同步时间中...</span><b>vdev</b><small>济南 · -- · 天气同步</small>';
  header.appendChild(dock);
  if (!systemClockTimer) {
    systemClockTimer = setInterval(drawSystemDock, 1000);
  }
}

export function mountMusicDock() {
  const header = document.querySelector(".game-header");
  if (!header || document.querySelector("#musicToggle")) return;
  const button = document.createElement("button");
  button.id = "musicToggle";
  button.className = "music-toggle";
  button.type = "button";
  button.title = "开启钟城背景声场";
  button.textContent = "声场";
  button.addEventListener("click", () => toggleCasinoAudio(button));
  header.appendChild(button);
}

function createNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  return buffer;
}

function pulseParam(param, value, at, attack = 0.02, release = 0.28) {
  param.cancelScheduledValues(at);
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(value, at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + release);
}

function playTone(ctx, destination, freq, duration, type, gainValue, detune = 0) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  osc.connect(gain);
  gain.connect(destination);
  pulseParam(gain.gain, gainValue, ctx.currentTime, 0.018, duration);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.05);
}

function toggleCasinoAudio(button) {
  if (casinoAudio) {
    const audio = casinoAudio;
    casinoAudio.intervals.forEach((id) => clearInterval(id));
    casinoAudio.pad.forEach((node) => node.stop());
    casinoAudio.master.gain.exponentialRampToValueAtTime(0.0001, casinoAudio.ctx.currentTime + 0.6);
    setTimeout(() => audio.ctx.close(), 700);
    casinoAudio = null;
    button.classList.remove("active");
    button.textContent = "声场";
    return;
  }

  const AudioClass = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioClass();
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();
  const delay = ctx.createDelay();
  const delayGain = ctx.createGain();
  const padGain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  master.gain.value = 0.0001;
  filter.type = "lowpass";
  filter.frequency.value = 1450;
  filter.Q.value = 0.85;
  delay.delayTime.value = 0.27;
  delayGain.gain.value = 0.16;
  padGain.gain.value = 0.025;
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 260;

  master.connect(filter);
  filter.connect(compressor);
  compressor.connect(ctx.destination);
  filter.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(filter);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const pad = [55, 82.41, 110, 146.83].map((freq, index) => {
    const osc = ctx.createOscillator();
    osc.type = index % 2 ? "triangle" : "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = index * 4 - 6;
    osc.connect(padGain);
    osc.start();
    return osc;
  });
  padGain.connect(master);

  const scale = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66];
  let step = 0;
  const noise = createNoiseBuffer(ctx);
  const scheduleBeat = () => {
    const bass = [55, 55, 65.41, 49][step % 4];
    playTone(ctx, master, bass, 0.42, "sine", 0.09);
    playTone(ctx, master, scale[(step * 3) % scale.length], 0.24, "triangle", 0.025, step % 2 ? 7 : -7);
    if (step % 4 === 2) {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = noise;
      src.connect(gain);
      gain.connect(master);
      pulseParam(gain.gain, 0.018, ctx.currentTime, 0.006, 0.18);
      src.start();
      src.stop(ctx.currentTime + 0.2);
    }
    step++;
  };
  scheduleBeat();
  const intervals = [setInterval(scheduleBeat, 520)];

  master.gain.exponentialRampToValueAtTime(0.075, ctx.currentTime + 1.4);
  casinoAudio = { ctx, master, pad: [...pad, lfo], intervals };
  button.classList.add("active");
  button.textContent = "声场 ON";
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
