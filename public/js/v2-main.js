const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const sessionKey = "casinoAccount";
let state = null;
let activeTab = "broadcast";
let clockBase = 0;
let clockSyncedAt = 0;
let ws = null;
let pollTimer = null;

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
  startedAt: 0,
  timer: null
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

function makePiece(type = null) {
  const keys = Object.keys(shapes);
  const shape = type || keys[Math.floor(Math.random() * keys.length)];
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
}

function clearLines() {
  const before = trial.grid.length;
  trial.grid = trial.grid.filter((row) => row.some((cell) => !cell));
  const cleared = before - trial.grid.length;
  while (trial.grid.length < trial.rows) trial.grid.unshift(Array(trial.cols).fill(null));
  if (cleared) {
    trial.combo += 1;
    trial.lines += cleared;
    trial.score += cleared * 120 * trial.combo;
  } else {
    trial.combo = 0;
  }
}

function spawn() {
  trial.piece = trial.next || makePiece();
  trial.next = makePiece();
  trial.canHold = true;
  if (collide(trial.piece)) endTrial();
}

function hardDrop() {
  while (!collide(trial.piece, 0, 1)) trial.piece.y += 1;
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
}

function drop() {
  if (!trial.running) return;
  if (!collide(trial.piece, 0, 1)) {
    trial.piece.y += 1;
  } else {
    merge();
    clearLines();
    spawn();
  }
  drawTrial();
}

function drawCell(ctx, x, y, block) {
  const left = x * trial.cell;
  const top = y * trial.cell;
  ctx.fillStyle = block.color;
  ctx.fillRect(left + 1, top + 1, trial.cell - 2, trial.cell - 2);
  ctx.strokeStyle = "rgba(232,221,208,.35)";
  ctx.strokeRect(left + 5, top + 5, trial.cell - 10, trial.cell - 10);
  ctx.fillStyle = "#0D0D0D";
  ctx.font = "700 14px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.glyph, left + trial.cell / 2, top + trial.cell / 2);
}

function drawTrial() {
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
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "rgba(139,115,85,.22)";
  for (let x = 1; x < trial.cols; x++) {
    ctx.beginPath(); ctx.moveTo(x * trial.cell, 0); ctx.lineTo(x * trial.cell, cssHeight); ctx.stroke();
  }
  for (let y = 1; y < trial.rows; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * trial.cell); ctx.lineTo(cssWidth, y * trial.cell); ctx.stroke();
  }
  trial.grid.forEach((row, y) => row.forEach((cell, x) => cell && drawCell(ctx, x, y, cell)));
  if (trial.piece) trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => value && drawCell(ctx, trial.piece.x + x, trial.piece.y + y, trial.piece)));
  $("#trialScore").textContent = money(trial.score);
  $("#trialLines").textContent = money(trial.lines);
  $("#trialCombo").textContent = trial.combo;
  $("#holdPiece").textContent = trial.hold ? blockDefs[trial.hold].glyph : "--";
}

async function endTrial() {
  trial.running = false;
  clearInterval(trial.timer);
  $("#startTrial").textContent = "再次试炼";
  drawTrial();
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
  trial.grid = emptyGrid();
  trial.piece = makePiece();
  trial.next = makePiece();
  trial.hold = null;
  trial.canHold = true;
  trial.running = true;
  trial.score = 0;
  trial.lines = 0;
  trial.combo = 0;
  trial.startedAt = Date.now();
  clearInterval(trial.timer);
  trial.timer = setInterval(drop, trialDropInterval());
  $("#startTrial").textContent = "试炼中";
  drawTrial();
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
    activeTab = button.dataset.tab;
    renderTab();
  }));
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
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Space", "z", "Z", "c", "C"].includes(event.key)) event.preventDefault();
    if (!trial.running || !trial.piece) return;
    if (event.key === "ArrowLeft" && !collide(trial.piece, -1, 0)) trial.piece.x -= 1;
    if (event.key === "ArrowRight" && !collide(trial.piece, 1, 0)) trial.piece.x += 1;
    if (event.key === "ArrowDown") drop();
    if (event.key === " " || event.key === "Space") hardDrop();
    if (event.key === "ArrowUp" || event.key === "z" || event.key === "Z") {
      const rotated = rotate(trial.piece.matrix);
      if (!collide(trial.piece, 0, 0, rotated)) trial.piece.matrix = rotated;
    }
    if (event.key === "c" || event.key === "C") holdPiece();
    drawTrial();
  });
}

bindEvents();
drawTrial();
load().catch((error) => toast(error.message));
pollTimer = setInterval(() => load().catch((error) => toast(error.message)), 30000);
setInterval(tickClock, 1000);
