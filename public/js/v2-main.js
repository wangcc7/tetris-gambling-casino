const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sessionKey = "casinoAccount";
let state = null;
let activeTab = "broadcast";
let clockBase = 0;
let clockSyncedAt = 0;
let ws = null;
let pollTimer = null;
let pieceBag = [];
let renderFrame = 0;

const shapes = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  L: [[1, 0], [1, 0], [1, 1]],
  J: [[0, 1], [0, 1], [1, 1]]
};

const blockDefs = {
  I: { name: "钟鸣长条", glyph: "钟", color: "#8B7355" },
  O: { name: "规则方块", glyph: "规", color: "#B8860B" },
  T: { name: "回响碎片", glyph: "响", color: "#6B3FA0" },
  S: { name: "迷雾曲线", glyph: "雾", color: "#5B7B9A" },
  Z: { name: "生肖残印", glyph: "印", color: "#8B2252" },
  L: { name: "列车道钉", glyph: "轨", color: "#6B6B6B" },
  J: { name: "铭刻之笔", glyph: "刻", color: "#2F4F6F" }
};

const trial = {
  cols: 10,
  rows: 20,
  cell: 30,
  grid: [],
  piece: null,
  next: null,
  hold: null,
  canHold: true,
  running: false,
  score: 0,
  lines: 0,
  combo: 0,
  shields: 0,
  slowPieces: 0,
  slowActive: false,
  pendingGarbageRows: 0,
  lastClearAt: 0,
  echoStacks: 0,
  startedAt: 0,
  lastFrame: 0,
  dropElapsed: 0,
  effects: {
    particles: [],
    floats: [],
    ripples: [],
    clears: [],
    shakeUntil: 0,
    shakePower: 0,
    flashUntil: 0
  }
};

const audioState = {
  ctx: null,
  muted: localStorage.getItem("clockAudioMuted") === "1",
  bgmTimer: null,
  bgmStarted: false,
  heartbeatTimer: null
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function money(value) {
  return Math.round(Number(value) || 0).toLocaleString("zh-CN");
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "{}");
  } catch {
    return {};
  }
}

function setSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

async function api(path, options = {}) {
  const session = getSession();
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
  return data;
}

function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body) });
}

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function ensureAudio(startAmbience = true) {
  if (audioState.muted) return null;
  if (!audioState.ctx) audioState.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioState.ctx.state === "suspended") audioState.ctx.resume();
  if (startAmbience && !audioState.bgmStarted) startBgm();
  return audioState.ctx;
}

function setAudioButton() {
  const button = $("#audioToggle");
  if (!button) return;
  button.classList.toggle("active", !audioState.muted);
  button.textContent = audioState.muted ? "静音" : "声场";
  button.title = audioState.muted ? "开启钟城声场" : "关闭钟城声场";
}

function tone(freq, duration = 0.08, type = "sine", gain = 0.045, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noise(duration = 0.08, gain = 0.035) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  amp.gain.value = gain;
  source.buffer = buffer;
  source.connect(amp).connect(ctx.destination);
  source.start();
}

function playSfx(name, intensity = 1) {
  if (audioState.muted) return;
  const lift = Math.min(2.2, Math.max(0.5, intensity));
  if (name === "move") tone(180, 0.035, "square", 0.012 * lift);
  if (name === "rotate") { tone(260, 0.045, "triangle", 0.018 * lift); tone(360, 0.05, "triangle", 0.014 * lift, 0.025); }
  if (name === "land") { tone(110, 0.07, "sine", 0.03 * lift); noise(0.045, 0.012 * lift); }
  if (name === "hard_drop") { tone(82, 0.13, "sawtooth", 0.045 * lift); noise(0.09, 0.035 * lift); }
  if (name === "game_over") { tone(98, 0.55, "sine", 0.055); tone(49, 0.75, "triangle", 0.035, 0.08); }
  if (name === "shield") { tone(392, 0.08, "triangle", 0.035); tone(784, 0.11, "sine", 0.024, 0.055); }
  if (name === "whisper") { tone(740, 0.08, "sine", 0.018); tone(932, 0.11, "triangle", 0.014, 0.05); }
}

function playClear(cleared) {
  const notes = [523, 659, 784, 1046];
  notes.slice(0, Math.max(1, Math.min(4, cleared))).forEach((freq, index) => tone(freq, 0.12 + index * 0.02, "triangle", 0.038, index * 0.045));
  if (cleared >= 4) {
    tone(196, 0.42, "sine", 0.05, 0.02);
    noise(0.16, 0.025);
  }
}

function playCombo(combo) {
  if (combo <= 1) return;
  tone(420 + combo * 38, 0.08, "square", 0.018);
  tone(620 + combo * 44, 0.11, "triangle", 0.018, 0.05);
}

function startBgm() {
  const ctx = ensureAudio(false);
  if (!ctx || audioState.bgmStarted) return;
  audioState.bgmStarted = true;
  let step = 0;
  const pulse = () => {
    if (audioState.muted) return;
    const bass = [65, 73, 82, 98][step % 4];
    const bell = [392, 330, 440, 294, 523, 440, 392, 330][step % 8];
    tone(bass, 1.8, "sine", 0.012);
    tone(bell, 0.22, "triangle", 0.012, 0.12);
    step += 1;
  };
  pulse();
  audioState.bgmTimer = setInterval(pulse, 1800);
}

function toggleAudio() {
  audioState.muted = !audioState.muted;
  localStorage.setItem("clockAudioMuted", audioState.muted ? "1" : "0");
  if (!audioState.muted) {
    ensureAudio();
    playSfx("whisper");
  }
  setAudioButton();
}

function currentServerTime() {
  return clockBase ? clockBase + Date.now() - clockSyncedAt : Date.now();
}

async function load() {
  if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  const session = getSession();
  state = await api(`/api/state${session.token ? `?sessionToken=${encodeURIComponent(session.token)}` : ""}`);
  clockBase = new Date(state.serverTime).getTime();
  clockSyncedAt = Date.now();
  renderAll();
  connectWS();
}

function connectWS() {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) return;
  const session = getSession();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${location.host}/ws${session.token ? `?token=${encodeURIComponent(session.token)}` : ""}`);
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "init" && message.payload?.state) {
      state = message.payload.state;
      clockBase = new Date(state.serverTime).getTime();
      clockSyncedAt = Date.now();
      renderAll();
    }
    if (!state) return;
    if (["chat", "npc_speak", "train"].includes(message.type) && message.payload) {
      state.messages.unshift(message.payload);
      state.messages = state.messages.slice(0, 80);
      $("#railBroadcast").textContent = `${message.payload.author}：${message.payload.text}`;
      if (activeTab === "broadcast") renderBroadcast();
    }
    if (message.type === "fog_price" && Array.isArray(message.payload)) {
      message.payload.forEach((item) => {
        const goods = state.v2.fogGoods.find((entry) => entry.id === item.goodsId);
        if (goods) {
          goods.currentPrice = item.newPrice;
          goods.trend = item.trend;
        }
      });
      if (activeTab === "fog") renderFog();
    }
    if (message.type === "pact_update" && message.payload?.pact) {
      const index = state.v2.pacts.findIndex((item) => item.id === message.payload.pact.id);
      if (index >= 0) state.v2.pacts[index] = message.payload.pact;
      else state.v2.pacts.unshift(message.payload.pact);
      if (activeTab === "pact") renderPact();
    }
    if (message.type === "oracle_new" && message.payload?.cards) {
      state.v2.oracleCards = message.payload.cards;
      if (activeTab === "oracle") renderOracle();
    }
    if (message.type === "settlement") toast("终焉列车结算预告已发布");
  });
  ws.addEventListener("close", () => setTimeout(connectWS, 2000));
}

function renderAll() {
  if (!state) return;
  const cycle = state.v2.cycle;
  $("#cycleTitle").textContent = `第${cycle.dayNumber}天 · ${cycle.rulingZodiac}·${cycle.zodiacCode} · ${cycle.title}`;
  $("#zodiacEffect").textContent = `${cycle.declaration} / ${cycle.zodiacEffect}`;
  $("#playerName").textContent = state.identity?.username ? state.player.name : "未登录试炼者";
  $("#playerMarks").textContent = money(state.player.coins);
  $("#authBtn").textContent = state.identity?.username ? `账号 · ${state.identity.username}` : "登录 / 注册";
  $("#identityNo").textContent = `试炼者编号：${escapeHtml(state.identity?.identityNo || "--")}`;
  const nextTrain = state.v2.trains.find((train) => !train.passed) || state.v2.trains[0];
  $("#trainRail").textContent = `下一班列车：${nextTrain.name} ${nextTrain.time} | ${nextTrain.effect}`;
  $("#railBroadcast").textContent = state.messages[0] ? `${state.messages[0].author}：${state.messages[0].text}` : "钟楼仍在校准。";
  renderChronicle();
  renderTab();
}

function tickClock() {
  if (!state) return;
  const time = currentServerTime();
  $("#serverClock").textContent = new Date(time).toLocaleString("zh-CN", { hour12: false });
  $("#dayRemain").textContent = `剩余 ${formatTime(new Date(state.v2.cycle.dayEndsAt).getTime() - time)}`;
}

function renderChronicle() {
  const collections = state.v2.collections;
  const holdings = (state.player.positions || []).filter((item) => item.type === "fog");
  $("#chronicleContent").innerHTML = `
    <div class="chronicle-kpis">
      <div><span>当前刻痕</span><b>${money(state.player.coins)}</b></div>
      <div><span>总消行</span><b>${money(state.player.lines)}</b></div>
      <div><span>总分数</span><b>${money(state.player.score)}</b></div>
    </div>
    <h3>雾区持仓</h3>
    <div class="mini-list">${holdings.length ? holdings.map((item) => `<article><b>${escapeHtml(item.code)}</b><span>x${escapeHtml(item.qty)} / 成本 ${money(item.cost)}</span></article>`).join("") : "<p>暂无持仓。</p>"}</div>
    <h3>收集</h3>
    <div class="mark-wall"><span>生肖 ${collections.zodiacMarks.length}/12：${collections.zodiacMarks.map(escapeHtml).join(" ") || "未得印"}</span><span>神兽 ${collections.beastMarks.length}/4：${collections.beastMarks.map(escapeHtml).join(" ") || "未得印"}</span></div>
    <h3>钟渊之路</h3>
    <div class="path-bar"><i style="width:${Math.min(100, collections.pathProgress / 120 * 100)}%"></i></div>
    <small>第 ${collections.pathLevel} 层 · 下层进度 ${collections.pathProgress}/120</small>
    <h3>铭刻升级</h3>
    <div class="upgrade-list">${state.v2.upgradeTree.map((item) => `<article><b>${escapeHtml(item.name)} Lv.${item.level}</b><button data-engrave="${item.category}">${money(item.nextCost)}</button></article>`).join("")}</div>
  `;
  $$("[data-engrave]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await post("/api/player/engrave", { category: button.dataset.engrave });
      toast("铭刻升级完成");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }));
}

function renderTab() {
  $$(".plaza-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  if (activeTab === "broadcast") renderBroadcast();
  if (activeTab === "rankings") renderRankings();
  if (activeTab === "fog") renderFog();
  if (activeTab === "pact") renderPact();
  if (activeTab === "oracle") renderOracle();
}

function renderBroadcast() {
  $("#tabContent").innerHTML = `
    <div class="broadcast-layout">
      <div id="broadcastLog" class="broadcast-log"></div>
      <form id="broadcastForm" class="broadcast-form">
        <select id="broadcastChannel">${state.v2.channels.slice(0, 3).map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select>
        <input id="broadcastInput" maxlength="160" placeholder="向钟城留下一句话">
        <button>发送</button>
      </form>
    </div>
  `;
  $("#broadcastLog").innerHTML = state.messages.slice(0, 45).map((msg) => `
    <article class="${escapeHtml(msg.kind)}"><small>${escapeHtml(msg.channel || "全城广播")}</small><b>${escapeHtml(msg.author)}</b><span>${escapeHtml(msg.text)}</span></article>
  `).join("");
  $("#broadcastForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await post("/api/broadcast/send", { channel: $("#broadcastChannel").value, content: $("#broadcastInput").value });
      $("#broadcastInput").value = "";
      await load();
    } catch (error) {
      toast(error.message);
    }
  });
}

function renderRankings() {
  const labels = {
    daily_marks: "当日刻痕榜",
    daily_fog: "当日雾区榜",
    daily_pact: "当日契约榜",
    cycle_total: "十日总榜",
    beast_hall: "神兽殿堂",
    zodiac_album: "生肖全图鉴"
  };
  $("#tabContent").innerHTML = `<div class="ranking-grid">${Object.entries(labels).map(([key, label]) => `
    <section><h3>${label}</h3><ol>${(state.v2.rankings[key] || []).slice(0, 6).map((row) => `<li><b>${row.rank}</b><span>${escapeHtml(row.name)}</span><em>${money(row.score)}</em></li>`).join("")}</ol></section>
  `).join("")}</div>`;
}

function renderFog() {
  $("#tabContent").innerHTML = `
    <div class="fog-grid">${state.v2.fogGoods.map((goods) => `
      <article class="fog-card ${goods.trend}">
        <small>${escapeHtml(goods.category)} · ${escapeHtml(goods.rarity)}</small>
        <h3>${escapeHtml(goods.name)}</h3>
        <p>${escapeHtml(goods.flavor)}</p>
        <div><b>${money(goods.currentPrice)}</b><span>到站价 ${money(goods.basePrice)} · ${escapeHtml(goods.trend)}</span></div>
        <button data-buy="${goods.id}">买入 1 份</button>
      </article>
    `).join("")}</div>
  `;
  $$("[data-buy]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await post("/api/fog/buy", { goodsId: button.dataset.buy, quantity: 1 });
      toast("雾区成交，列车已经记录这笔可能");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }));
}

function renderPact() {
  const mine = state.v2.pacts.find((pact) => pact.members.some((member) => member.userId === state.player.id));
  $("#tabContent").innerHTML = `
    <form id="pactCreate" class="pact-create">
      <input id="pactName" maxlength="16" placeholder="契约名称">
      <select id="pactType"><option>普通</option><option>生肖</option><option>神兽</option><option>血契</option></select>
      <button>创建契约</button>
    </form>
    ${mine ? `<section class="mine-pact"><h3>我的契约：${escapeHtml(mine.name)}</h3><p>${mine.members.map((m) => escapeHtml(m.name)).join(" / ")}</p></section>` : ""}
    <div class="pact-list">${state.v2.pacts.map((pact) => `
      <article>
        <b>${escapeHtml(pact.name)}</b><span>${escapeHtml(pact.type)} · ${pact.members.length}/3 · ${escapeHtml(pact.zodiacBonus)}日</span>
        <button data-join="${pact.id}" ${pact.members.length >= 3 ? "disabled" : ""}>加入</button>
      </article>
    `).join("") || "<p>今日还没有契约。</p>"}</div>
  `;
  $("#pactCreate").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await post("/api/pact/create", { name: $("#pactName").value || "回响三人", type: $("#pactType").value });
      toast("契约已创建");
      await load();
    } catch (error) {
      toast(error.message);
    }
  });
  $$("[data-join]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await post("/api/pact/join", { pactId: button.dataset.join });
      toast("已加入契约");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }));
}

function renderOracle() {
  $("#tabContent").innerHTML = `<div class="oracle-grid">${state.v2.oracleCards.map((card) => `
    <article class="${card.purchased ? "sold" : ""}">
      <small>${escapeHtml(card.category)} · 准确率 ${Math.round(card.accuracy * 100)}%</small>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.description)}</p>
      <em>${escapeHtml(card.flavor)}</em>
      <button data-oracle="${card.id}" ${card.purchased ? "disabled" : ""}>${card.purchased ? "已售出" : `${money(card.cost)} 刻痕`}</button>
    </article>
  `).join("")}</div>`;
  $$("[data-oracle]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await post("/api/oracle/buy", { cardId: button.dataset.oracle });
      toast("情报已写入铭刻之书");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }));
}

function emptyGrid() {
  return Array.from({ length: trial.rows }, () => Array(trial.cols).fill(null));
}

function refillBag() {
  pieceBag = Object.keys(shapes);
  for (let i = pieceBag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieceBag[i], pieceBag[j]] = [pieceBag[j], pieceBag[i]];
  }
}

function nextPieceType() {
  if (!pieceBag.length) refillBag();
  return pieceBag.pop();
}

function makePiece(type = null) {
  const shape = type || nextPieceType();
  return { type: shape, matrix: shapes[shape].map((row) => [...row]), x: 3, y: 0, ...blockDefs[shape] };
}

function rotate(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function collide(piece, dx = 0, dy = 0, matrix = piece.matrix) {
  return matrix.some((row, y) => row.some((value, x) => {
    if (!value) return false;
    const px = piece.x + x + dx;
    const py = piece.y + y + dy;
    return px < 0 || px >= trial.cols || py >= trial.rows || (py >= 0 && trial.grid[py][px]);
  }));
}

function merge() {
  trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && trial.piece.y + y >= 0) trial.grid[trial.piece.y + y][trial.piece.x + x] = { ...trial.piece };
  }));
  if (trial.piece.type === "O") {
    trial.shields += 1;
    playSfx("shield");
    addFloat("规盾 +1", trial.cols * trial.cell / 2, 82, "#f6d57b", 18);
  }
}

function ghostY(piece) {
  const ghost = { ...piece, matrix: piece.matrix };
  while (!collide(ghost, 0, 1)) ghost.y += 1;
  return ghost.y;
}

function shake(power = 1, duration = 120) {
  trial.effects.shakePower = Math.max(trial.effects.shakePower, power);
  trial.effects.shakeUntil = Math.max(trial.effects.shakeUntil, performance.now() + duration);
}

function addFloat(text, x, y, color = "#f2c14e", size = 16) {
  trial.effects.floats.push({ text, x, y, color, size, age: 0, life: 720, vy: -0.055 });
}

function addRipple(x, y, radius = 90, color = "rgba(242, 193, 78, .52)") {
  trial.effects.ripples.push({ x, y, radius, color, age: 0, life: 420 });
}

function spawnParticles(rows, cells) {
  rows.forEach((rowIndex) => {
    for (let x = 0; x < trial.cols; x += 1) {
      const block = cells.get(`${rowIndex}:${x}`) || { color: "#c5a55a" };
      for (let i = 0; i < 5; i += 1) {
        trial.effects.particles.push({
          x: (x + 0.5) * trial.cell,
          y: (rowIndex + 0.5) * trial.cell,
          vx: (Math.random() - 0.5) * 0.34,
          vy: -0.16 - Math.random() * 0.18,
          size: 2 + Math.random() * 3,
          color: block.color,
          age: 0,
          life: 440 + Math.random() * 160
        });
      }
    }
    addRipple(trial.cols * trial.cell / 2, (rowIndex + 0.5) * trial.cell, 70 + rows.length * 28);
  });
}

function removeRandomNeighbor(clearedRows) {
  const candidates = [];
  const rowSet = new Set(clearedRows);
  clearedRows.forEach((row) => {
    [-1, 1].forEach((dy) => {
      const y = row + dy;
      if (y < 0 || y >= trial.rows || rowSet.has(y)) return;
      trial.grid[y].forEach((cell, x) => {
        if (cell) candidates.push({ x, y });
      });
    });
  });
  if (!candidates.length) return false;
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const block = trial.grid[target.y][target.x];
  trial.grid[target.y][target.x] = null;
  addFloat("谜碎", (target.x + 0.5) * trial.cell, (target.y + 0.5) * trial.cell, "#d9b3ff", 15);
  spawnParticles([target.y], new Map([[`${target.y}:${target.x}`, block]]));
  return true;
}

function addGarbageRow() {
  const gap = Math.floor(Math.random() * trial.cols);
  trial.grid.shift();
  trial.grid.push(Array.from({ length: trial.cols }, (_, x) => x === gap ? null : { type: "Z", glyph: "印", color: "#5a1f38" }));
}

function applyBlockAbility(cleared, clearedRows, baseScore) {
  if (!cleared || !trial.piece) return 0;
  const type = trial.piece.type;
  let bonus = 0;
  if (type === "I") {
    bonus += Math.round(baseScore * 0.45);
    addFloat("长鸣+45%", trial.cols * trial.cell / 2, 118, "#8eeeff", 18);
    trial.effects.flashUntil = performance.now() + 130;
  }
  if (type === "T" && Math.random() < 0.5 && removeRandomNeighbor(clearedRows)) {
    bonus += 80;
    playSfx("whisper");
  }
  if (type === "S") {
    bonus += cleared * 70;
    addFloat("雾息+" + money(cleared * 70), trial.cols * trial.cell / 2, 154, "#9cc7e8", 16);
  }
  if (type === "L") {
    bonus += cleared * 90;
    addFloat("轨钉拾取+" + money(cleared * 90), trial.cols * trial.cell / 2, 180, "#d5d5d5", 15);
  }
  if (type === "J") {
    trial.slowPieces = Math.max(trial.slowPieces, 1);
    bonus += 60;
    addFloat("刻痕减速", trial.cols * trial.cell / 2, 206, "#9dbce5", 15);
  }
  if (type === "Z") {
    trial.pendingGarbageRows += 1;
    bonus += 300;
    addFloat("终焉+300", trial.cols * trial.cell / 2, 232, "#ff9ab8", 17);
    shake(2.2, 180);
  }
  return bonus;
}

function clearLines() {
  const clearedRows = [];
  const cells = new Map();
  trial.grid.forEach((row, y) => {
    if (row.every(Boolean)) {
      clearedRows.push(y);
      row.forEach((cell, x) => cells.set(`${y}:${x}`, cell));
    }
  });
  const cleared = clearedRows.length;
  if (cleared) {
    trial.combo += 1;
    trial.lines += cleared;
    const baseScore = cleared * 120 * trial.combo;
    const now = Date.now();
    const echoBonus = trial.lastClearAt && now - trial.lastClearAt <= 3000 ? Math.round(baseScore * 0.2 * Math.min(5, trial.echoStacks + 1)) : 0;
    trial.echoStacks = echoBonus ? trial.echoStacks + 1 : 0;
    trial.lastClearAt = now;
    const abilityBonus = applyBlockAbility(cleared, clearedRows, baseScore);
    trial.score += baseScore + echoBonus + abilityBonus;
    trial.effects.clears.push(...clearedRows.map((y) => ({ y, age: 0, life: 300 })));
    spawnParticles(clearedRows, cells);
    addFloat(`+${money(baseScore + echoBonus + abilityBonus)}`, trial.cols * trial.cell / 2, Math.max(56, Math.min(...clearedRows) * trial.cell), cleared >= 4 ? "#fff1a8" : "#f2c14e", cleared >= 4 ? 24 : 18);
    if (echoBonus) addFloat(`回响+${Math.min(5, trial.echoStacks) * 20}%`, trial.cols * trial.cell / 2, 272, "#f6d57b", 17);
    if (trial.combo > 1) addFloat(`COMBO x${trial.combo}`, trial.cols * trial.cell / 2, 304, "#ffffff", 22);
    playClear(cleared);
    playCombo(trial.combo);
    shake(cleared >= 4 ? 3.4 : 1 + cleared * 0.45, 110 + cleared * 45);
    trial.grid = trial.grid.filter((row) => row.some((cell) => !cell));
    while (trial.grid.length < trial.rows) trial.grid.unshift(Array(trial.cols).fill(null));
    while (trial.pendingGarbageRows > 0) {
      addGarbageRow();
      trial.pendingGarbageRows -= 1;
    }
  } else {
    trial.combo = 0;
    trial.echoStacks = 0;
  }
}

function consumeShield() {
  if (trial.shields <= 0) return false;
  trial.shields -= 1;
  for (let i = 0; i < 3; i += 1) {
    const occupied = trial.grid.findIndex((row) => row.some(Boolean));
    if (occupied >= 0) {
      trial.grid.splice(occupied, 1);
      trial.grid.unshift(Array(trial.cols).fill(null));
    }
  }
  addFloat("规盾抵死", trial.cols * trial.cell / 2, 120, "#f6d57b", 22);
  playSfx("shield");
  shake(2.5, 220);
  return true;
}

function spawn() {
  trial.piece = trial.next || makePiece();
  trial.next = makePiece();
  trial.canHold = true;
  trial.slowActive = trial.slowPieces > 0;
  if (trial.slowPieces > 0) trial.slowPieces -= 1;
  trial.dropElapsed = 0;
  if (collide(trial.piece)) {
    const saved = consumeShield();
    if (!saved || collide(trial.piece)) endTrial();
  }
}

function hardDrop() {
  if (!trial.running || !trial.piece) return;
  while (!collide(trial.piece, 0, 1)) trial.piece.y += 1;
  playSfx("hard_drop");
  shake(1.4, 90);
  drop();
}

function holdPiece() {
  if (!trial.running || !trial.canHold) return;
  const currentType = trial.piece.type;
  if (trial.hold) {
    trial.piece = makePiece(trial.hold);
    trial.hold = currentType;
  } else {
    trial.hold = currentType;
    spawn();
  }
  trial.canHold = false;
  playSfx("rotate", 0.75);
}

function drop() {
  if (!trial.running) return;
  if (!collide(trial.piece, 0, 1)) {
    trial.piece.y += 1;
  } else {
    merge();
    playSfx("land");
    clearLines();
    spawn();
  }
}

function hasLiveEffects() {
  const effects = trial.effects;
  const now = performance.now();
  return effects.particles.length || effects.floats.length || effects.ripples.length || effects.clears.length || now < effects.shakeUntil || now < effects.flashUntil;
}

function ensureRenderLoop() {
  if (renderFrame) return;
  trial.lastFrame = performance.now();
  renderFrame = requestAnimationFrame(animateTrial);
}

function animateTrial(now) {
  renderFrame = 0;
  const delta = Math.min(80, now - (trial.lastFrame || now));
  trial.lastFrame = now;
  if (trial.running) {
    trial.dropElapsed += delta;
    const interval = trialDropInterval();
    while (trial.dropElapsed >= interval && trial.running) {
      trial.dropElapsed -= interval;
      drop();
    }
  }
  drawTrial(now, delta);
  if (trial.running || hasLiveEffects()) ensureRenderLoop();
}

function drawCell(ctx, x, y, block, options = {}) {
  const left = x * trial.cell;
  const top = y * trial.cell;
  if (options.ghost) {
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = block.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(left + 4, top + 4, trial.cell - 8, trial.cell - 8);
    ctx.globalAlpha = 1;
    return;
  }
  const gradient = ctx.createLinearGradient(left, top, left + trial.cell, top + trial.cell);
  gradient.addColorStop(0, "#f4e4ba");
  gradient.addColorStop(0.12, block.color);
  gradient.addColorStop(1, "#0e0e10");
  ctx.fillStyle = gradient;
  ctx.fillRect(left + 1, top + 1, trial.cell - 2, trial.cell - 2);
  ctx.strokeStyle = "rgba(232,221,208,.42)";
  ctx.strokeRect(left + 4, top + 4, trial.cell - 8, trial.cell - 8);
  ctx.strokeStyle = "rgba(242,193,78,.18)";
  ctx.beginPath();
  ctx.moveTo(left + 8, top + trial.cell - 8);
  ctx.lineTo(left + trial.cell - 8, top + 8);
  ctx.stroke();
  ctx.fillStyle = "rgba(8,8,8,.82)";
  ctx.font = "700 13px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.glyph, left + trial.cell / 2, top + trial.cell / 2);
}

function updateTrialEffects(delta) {
  const effects = trial.effects;
  effects.particles.forEach((item) => {
    item.age += delta;
    item.x += item.vx * delta;
    item.y += item.vy * delta;
    item.vy += 0.0008 * delta;
  });
  effects.floats.forEach((item) => {
    item.age += delta;
    item.y += item.vy * delta;
  });
  effects.ripples.forEach((item) => { item.age += delta; });
  effects.clears.forEach((item) => { item.age += delta; });
  effects.particles = effects.particles.filter((item) => item.age < item.life);
  effects.floats = effects.floats.filter((item) => item.age < item.life);
  effects.ripples = effects.ripples.filter((item) => item.age < item.life);
  effects.clears = effects.clears.filter((item) => item.age < item.life);
}

function drawTrialEffects(ctx) {
  const effects = trial.effects;
  effects.clears.forEach((item) => {
    const alpha = Math.max(0, 1 - item.age / item.life);
    ctx.fillStyle = `rgba(255, 242, 170, ${alpha * 0.42})`;
    ctx.fillRect(0, item.y * trial.cell, trial.cols * trial.cell, trial.cell);
  });
  effects.ripples.forEach((item) => {
    const t = item.age / item.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius * t, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
  effects.particles.forEach((item) => {
    const alpha = Math.max(0, 1 - item.age / item.life);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = item.color;
    ctx.fillRect(item.x - item.size / 2, item.y - item.size / 2, item.size, item.size);
    ctx.globalAlpha = 1;
  });
  effects.floats.forEach((item) => {
    const alpha = Math.max(0, 1 - item.age / item.life);
    ctx.globalAlpha = Math.min(1, alpha * 1.35);
    ctx.fillStyle = item.color;
    ctx.font = `800 ${item.size}px "Noto Serif SC", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.9)";
    ctx.shadowBlur = 10;
    ctx.fillText(item.text, item.x, item.y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });
}

function stackRatio() {
  const first = trial.grid.findIndex((row) => row.some(Boolean));
  return first < 0 ? 0 : (trial.rows - first) / trial.rows;
}

function updateTrialChrome() {
  const board = $("#trialBoard");
  const ratio = stackRatio();
  board.classList.toggle("trial-danger", ratio >= 0.7);
  board.classList.toggle("trial-critical", ratio >= 0.85);
  if (ratio >= 0.82 && trial.running && !audioState.heartbeatTimer && !audioState.muted) {
    audioState.heartbeatTimer = setInterval(() => {
      if (!trial.running || stackRatio() < 0.82 || audioState.muted) {
        clearInterval(audioState.heartbeatTimer);
        audioState.heartbeatTimer = null;
        return;
      }
      tone(72, 0.12, "sine", 0.035);
    }, 520);
  }
  $("#trialCombo").classList.toggle("combo-pop", trial.combo > 1);
}

function drawTrial(now = performance.now(), delta = 16) {
  updateTrialEffects(delta);
  const canvas = $("#trialBoard");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = trial.cols * trial.cell;
  const cssHeight = trial.rows * trial.cell;
  if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const shakeActive = now < trial.effects.shakeUntil;
  const shakeX = shakeActive ? (Math.random() - 0.5) * trial.effects.shakePower * 2 : 0;
  const shakeY = shakeActive ? (Math.random() - 0.5) * trial.effects.shakePower * 2 : 0;
  ctx.translate(shakeX, shakeY);
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "rgba(184, 134, 11, .05)";
  for (let r = 34; r < cssHeight; r += 68) {
    ctx.beginPath();
    ctx.arc(cssWidth / 2, cssHeight / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(184, 134, 11, .08)";
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(139,115,85,.22)";
  for (let x = 1; x < trial.cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * trial.cell, 0); ctx.lineTo(x * trial.cell, cssHeight); ctx.stroke();
  }
  for (let y = 1; y < trial.rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * trial.cell); ctx.lineTo(cssWidth, y * trial.cell); ctx.stroke();
  }
  trial.grid.forEach((row, y) => row.forEach((cell, x) => cell && drawCell(ctx, x, y, cell)));
  if (trial.piece) {
    const gy = ghostY(trial.piece);
    trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => value && drawCell(ctx, trial.piece.x + x, gy + y, trial.piece, { ghost: true })));
    trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => value && drawCell(ctx, trial.piece.x + x, trial.piece.y + y, trial.piece)));
  }
  drawTrialEffects(ctx);
  const danger = stackRatio();
  if (danger >= 0.7) {
    const alpha = danger >= 0.85 ? 0.34 + Math.sin(now / 120) * 0.08 : 0.18;
    const glow = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, 80, cssWidth / 2, cssHeight / 2, cssHeight * 0.72);
    glow.addColorStop(0, "rgba(139,34,82,0)");
    glow.addColorStop(1, `rgba(139,34,82,${alpha})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }
  if (now < trial.effects.flashUntil) {
    ctx.fillStyle = `rgba(255, 245, 194, ${Math.max(0, (trial.effects.flashUntil - now) / 130) * 0.32})`;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }
  $("#trialScore").textContent = money(trial.score);
  $("#trialLines").textContent = money(trial.lines);
  $("#trialCombo").textContent = trial.combo;
  $("#holdPiece").textContent = trial.hold ? `${blockDefs[trial.hold].glyph}${trial.shields ? ` · 盾${trial.shields}` : ""}` : (trial.shields ? `盾${trial.shields}` : "--");
  updateTrialChrome();
}

async function endTrial() {
  trial.running = false;
  $("#startTrial").textContent = "再次试炼";
  playSfx("game_over");
  addFloat("钟渊沉寂...", trial.cols * trial.cell / 2, trial.rows * trial.cell / 2, "#f6d57b", 24);
  ensureRenderLoop();
  try {
    const duration = Math.round((Date.now() - trial.startedAt) / 1000);
    const result = await post("/api/trials/report", { score: trial.score, lines: trial.lines, duration, mode: currentTrialMode(), specials: [] });
    toast(`试炼结束，获得 ${money(result.data.marksEarned)} 刻痕`);
    await load();
  } catch (error) {
    toast(error.message);
  }
}

function startTrial() {
  ensureAudio();
  playSfx("whisper");
  pieceBag = [];
  trial.grid = emptyGrid();
  trial.piece = makePiece();
  trial.next = makePiece();
  trial.hold = null;
  trial.canHold = true;
  trial.running = true;
  trial.score = 0;
  trial.lines = 0;
  trial.combo = 0;
  trial.shields = 0;
  trial.slowPieces = 0;
  trial.slowActive = false;
  trial.pendingGarbageRows = 0;
  trial.lastClearAt = 0;
  trial.echoStacks = 0;
  trial.effects = { particles: [], floats: [], ripples: [], clears: [], shakeUntil: 0, shakePower: 0, flashUntil: 0 };
  trial.startedAt = Date.now();
  trial.lastFrame = performance.now();
  trial.dropElapsed = 0;
  $("#startTrial").textContent = "试炼中";
  ensureRenderLoop();
}

function trialDropInterval() {
  const zodiac = state?.v2?.cycle?.rulingZodiac;
  const beast = state?.v2?.cycle?.activeBeastEvent;
  let interval = 760;
  if (zodiac === "鼠") interval = 920;
  if (zodiac === "兔") interval = 500;
  if (zodiac === "牛") interval = 820;
  if (beast === "玄武") interval = 620;
  if (beast === "青龙") interval = 460;
  if (trial.slowActive) interval *= 1.65;
  return interval;
}

function currentTrialMode() {
  const beast = state?.v2?.cycle?.activeBeastEvent;
  if (beast === "白虎") return "pvp";
  if (beast === "朱雀") return "nirvana";
  if (beast === "玄武") return "survival";
  if (beast === "青龙") return "pvp";
  return "normal";
}

function bindEvents() {
  $$(".plaza-tabs button").forEach((button) => button.addEventListener("click", () => {
    playSfx("move", 0.7);
    activeTab = button.dataset.tab;
    renderTab();
  }));
  $("#audioToggle")?.addEventListener("click", toggleAudio);
  $("#authBtn").addEventListener("click", () => $("#authDialog").showModal());
  $("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.value;
    if (action === "cancel") return $("#authDialog").close();
    try {
      const path = action === "register" ? "/api/auth/register" : "/api/auth/login";
      const data = await post(path, { username: $("#authUsername").value, password: $("#authPassword").value, nickname: $("#authNickname").value });
      setSession(data.session);
      $("#authDialog").close();
      toast("入城成功");
      await load();
    } catch (error) {
      $("#authError").textContent = error.message;
    }
  });
  $("#startTrial").addEventListener("click", startTrial);
  $("#centerToggle").addEventListener("click", () => $("#app").classList.toggle("center-collapsed"));
  $("#rightToggle").addEventListener("click", () => $("#app").classList.toggle("right-collapsed"));
  window.addEventListener("keydown", (event) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Space", "Spacebar", "z", "Z", "c", "C"].includes(event.key)) {
      event.preventDefault();
      ensureAudio();
    }
    if (!trial.running || !trial.piece) return;
    let changed = false;
    if (event.key === "ArrowLeft" && !collide(trial.piece, -1, 0)) {
      trial.piece.x -= 1;
      playSfx("move");
      changed = true;
    }
    if (event.key === "ArrowRight" && !collide(trial.piece, 1, 0)) {
      trial.piece.x += 1;
      playSfx("move");
      changed = true;
    }
    if (event.key === "ArrowDown") {
      drop();
      trial.score += 1;
      changed = true;
    }
    if (event.key === " " || event.key === "Space" || event.key === "Spacebar") hardDrop();
    if (event.key === "ArrowUp" || event.key === "z" || event.key === "Z") {
      const rotated = rotate(trial.piece.matrix);
      if (!collide(trial.piece, 0, 0, rotated)) {
        trial.piece.matrix = rotated;
        playSfx("rotate");
        changed = true;
      }
    }
    if (event.key === "c" || event.key === "C") holdPiece();
    if (changed) ensureRenderLoop();
  }, { passive: false });
  setAudioButton();
}

bindEvents();
drawTrial();
load().catch((error) => toast(error.message));
pollTimer = setInterval(() => load().catch((error) => toast(error.message)), 30000);
setInterval(tickClock, 1000);
