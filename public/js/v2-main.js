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

const modeNames = {
  standard: "昼夜标准",
  timed: "60秒限时",
  precision: "精准刻度",
  survival: "倒计时生存",
  rhythm: "节拍坠落"
};

const specialModifiers = {
  rewind: { name: "时间倒流", glyph: "返", color: "#d6f7ff", desc: "消行后回退到数步前，奖励保留" },
  pendulum: { name: "钟摆", glyph: "摆", color: "#ffe08a", desc: "落地前可左右摆动 1 秒" },
  curse: { name: "诅咒", glyph: "禁", color: "#f06aff", desc: "满行必须一次消 2 行以上才能解除" },
  nirvana: { name: "朱雀涅槃", glyph: "凰", color: "#ff7b45", desc: "朱雀日出现，清理棋盘底部 3 行" },
  dragon: { name: "青龙裁决", glyph: "龙", color: "#57d7b7", desc: "青龙日稀有方块，全属性强化" }
};

const pathKey = "zhongyuanPathV1";
const pathRealms = [
  { id: "wenzhong", name: "闻钟", desc: "首次游戏解锁", reward: "基础钟声" },
  { id: "jianhen", name: "见痕", desc: "累计消除100行", reward: "铭文印记变为亮金色" },
  { id: "zhifan", name: "知返", desc: "单局触发5次回响", reward: "回响波纹半径扩大30%" },
  { id: "tinglan", name: "听澜", desc: "单局总分达到5000分", reward: "新增低语：潮声已至" },
  { id: "pojie", name: "破界", desc: "单次消除4行", reward: "四消钟光拖尾" },
  { id: "wangshi", name: "忘时", desc: "连续3局分数超过3000", reward: "终局文字改为你已留下回响" },
  { id: "jidao", name: "极道", desc: "累计消除1000行", reward: "终焉粒子与标题后缀" }
];

const whisperThresholds = [
  [100, "时间不多了…"],
  [300, "你还记得第几天吗？"],
  [600, "钟声又响了。"],
  [1000, "别回头。"]
];

const engravingRunes = ["刻", "时", "渊", "钟", "回", "寂"];
let pathState = loadPathState();

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
  echoTriggers: 0,
  zhongyuan: 0,
  maxClear: 0,
  history: [],
  mode: localStorage.getItem("trialModeV2") || "standard",
  modeRemaining: 60,
  modeStartedAt: 0,
  survivalStep: 0,
  rhythmBeat: false,
  precisionMarker: null,
  goldFloat: null,
  lockDelay: 0,
  lockElapsed: 0,
  landingY: null,
  nirvanaLines: 0,
  touched: false,
  pendingWhispers: [],
  shownWhispers: new Set(),
  engravingMarks: new Map(),
  lastEngravings: new Map(),
  specialCounts: [],
  hardDrops: 0,
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

function loadPathState() {
  const fallback = { unlocked: {}, totalLines: 0, recentScores: [] };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(pathKey) || "{}") };
  } catch {
    return fallback;
  }
}

function savePathState() {
  localStorage.setItem(pathKey, JSON.stringify(pathState));
}

function hasRealm(id) {
  return Boolean(pathState.unlocked?.[id]);
}

function cloneGrid(source) {
  return source.map((row) => row.map((cell) => cell ? { ...cell } : null));
}

function clonePiece(piece) {
  return piece ? { ...piece, matrix: piece.matrix.map((row) => [...row]) } : null;
}

function currentCycleDay() {
  return Number(state?.v2?.cycle?.dayNumber || 0);
}

function currentZodiac() {
  return state?.v2?.cycle?.rulingZodiac || "";
}

function currentBeast() {
  return state?.v2?.cycle?.activeBeastEvent || "";
}

function showCenterLine(text, className = "whisper") {
  const overlay = $("#trialOverlay");
  if (!overlay) return;
  overlay.textContent = text;
  overlay.className = `trial-overlay show ${className}`;
  setTimeout(() => overlay.classList.remove("show"), className === "train" ? 3000 : 2200);
}

function speakLine(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.88;
    utterance.pitch = 0.72;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Voice is ornamental; the visual whisper remains the source of truth.
  }
}

function unlockRealm(id) {
  if (hasRealm(id)) return false;
  const realm = pathRealms.find((item) => item.id === id);
  if (!realm) return false;
  pathState.unlocked[id] = new Date().toISOString();
  savePathState();
  showCenterLine(`极道·${realm.name} 已悟`, "path");
  playSfx("whisper", 1.4);
  renderPathPanel();
  return true;
}

function checkPathUnlocks() {
  if (pathState.totalLines >= 100) unlockRealm("jianhen");
  if (pathState.totalLines >= 1000) unlockRealm("jidao");
  if (trial.echoTriggers >= 5) unlockRealm("zhifan");
  if (trial.score >= 5000) unlockRealm("tinglan");
}

function recordFinishedRun() {
  pathState.recentScores = [...(pathState.recentScores || []), trial.score].slice(-3);
  savePathState();
  if (pathState.recentScores.length === 3 && pathState.recentScores.every((score) => score > 3000)) unlockRealm("wangshi");
}

function renderPathPanel() {
  const list = $("#pathList");
  if (!list) return;
  list.innerHTML = pathRealms.map((realm, index) => {
    const unlocked = hasRealm(realm.id);
    return `
      <article class="${unlocked ? "unlocked" : ""}">
        <span>${index + 1}</span>
        <div><b>${realm.name}</b><small>${realm.desc}</small><em>${realm.reward}</em></div>
        <strong>${unlocked ? "已悟" : "未解"}</strong>
      </article>
    `;
  }).join("");
  document.body.classList.toggle("realm-jidao", hasRealm("jidao"));
  const brand = $(".v2-brand b");
  if (brand) brand.textContent = hasRealm("jidao") ? "终焉钟城 · 极道" : "终焉钟城";
}

function queueWhisper(text) {
  trial.pendingWhispers.push(text);
  showNextWhisper();
}

function showNextWhisper() {
  if (!trial.pendingWhispers.length || $("#trialOverlay")?.classList.contains("show")) return;
  const text = trial.pendingWhispers.shift();
  showCenterLine(text, "whisper");
  playSfx("whisper");
  if (text.length <= 10) speakLine(text);
  setTimeout(showNextWhisper, 2600);
}

function addRunScore(points) {
  const before = trial.score;
  trial.score += points;
  for (const [threshold, text] of whisperThresholds) {
    if (before < threshold && trial.score >= threshold && !trial.shownWhispers.has(threshold)) {
      trial.shownWhispers.add(threshold);
      queueWhisper(text);
    }
  }
  if (hasRealm("tinglan") && before < 1200 && trial.score >= 1200) queueWhisper("潮声已至");
  checkPathUnlocks();
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
  if (!audioState.ctx) {
    audioState.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioState.ctx.onstatechange = () => {
      if (audioState.ctx?.state === "running" && !audioState.bgmStarted && !audioState.muted) startBgm();
    };
  }
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
  if (name === "train") { tone(220, 0.55, "sawtooth", 0.035); tone(330, 0.9, "triangle", 0.028, 0.12); noise(0.32, 0.018); }
  if (name === "beast") { tone(72, 0.75, "sawtooth", 0.055); tone(144, 0.48, "triangle", 0.04, 0.06); noise(0.22, 0.04); }
  if (name === "pact") { tone(392, 0.12, "triangle", 0.034); tone(587, 0.18, "sine", 0.025, 0.08); tone(784, 0.22, "triangle", 0.02, 0.16); }
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
  audioState.bgmCtx = { ctx, step: 0, bpm: 58, tick: 0 };
  const bgm = audioState.bgmCtx;

  function playLayer(freq, dur, type, gain, delay = 0, pan = 0) {
    if (audioState.muted || !bgm.ctx) return;
    const t = bgm.ctx.currentTime + delay;
    const osc = bgm.ctx.createOscillator();
    const amp = bgm.ctx.createGain();
    const panner = bgm.ctx.createStereoPanner ? bgm.ctx.createStereoPanner() : null;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (panner) { panner.pan.setValueAtTime(pan, t); osc.connect(amp).connect(panner).connect(bgm.ctx.destination); }
    else osc.connect(amp).connect(bgm.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const tick = () => {
    if (audioState.muted) return;
    const danger = stackRatio();
    const actualBpm = 58 + danger * 38 + (currentBeast() ? 8 : 0);
    const beatLen = 60 / actualBpm;
    bgm.tick += 1;
    bgm.step += 1;

    // 钟楼低频嗡鸣（持续压迫感）
    if (bgm.tick % 16 === 0) playLayer(41, beatLen * 4.5, "sine", 0.07, 0, 0);

    // 秒针走动（白噪声滤波模拟齿轮咬合）
    if (bgm.tick % 4 === 0) {
      noise(0.04, 0.035 + danger * 0.04);
    }

    // 主旋律——钟声交响（多音色层叠）
    const bellSeq = [392, 330, 440, 294, 523, 440, 392, 330, 392, 523, 587, 440, 330, 392, 294, 262];
    const bellIndex = bgm.step % bellSeq.length;
    if (bgm.tick % 8 === 0) {
      playLayer(bellSeq[bellIndex] * (1 + danger * 0.1), beatLen * 1.2, "triangle", 0.12 + danger * 0.02, 0.03, -0.2);
      playLayer(bellSeq[(bellIndex + 4) % bellSeq.length] * 0.5, beatLen * 1.8, "sine", 0.07, beatLen * 0.2, 0.3);
    }

    // 和声层（每4小节一个变化）
    const chordRoot = [196, 220, 247, 262, 294, 330, 349, 392][bgm.step % 8];
    if (bgm.tick % 32 === 0) {
      playLayer(chordRoot, beatLen * 4, "sine", 0.05, 0, 0);
      playLayer(chordRoot * 1.5, beatLen * 3.8, "triangle", 0.038, beatLen * 0.5, -0.4);
    }

    // 神兽日变奏
    if (currentBeast() === "白虎" && bgm.tick % 24 === 0) {
      playLayer(587, beatLen * 0.8, "sawtooth", 0.08, 0, 0);
    }
    if (currentBeast() === "朱雀" && bgm.tick % 20 === 0) {
      playLayer(784, beatLen * 0.6, "triangle", 0.09, 0, 0.4);
    }

    // 堆高加速提示（方块堆到危险区加入低频心跳）
    if (danger >= 0.75 && bgm.tick % 2 === 0) {
      playLayer(55 + danger * 20, beatLen * 0.35, "sine", 0.12, 0, 0);
    }
  };

  tick();
  audioState.bgmTimer = setInterval(tick, Math.round(60000 / audioState.bgmCtx.bpm / 4));
}

function toggleAudio() {
  audioState.muted = !audioState.muted;
  localStorage.setItem("clockAudioMuted", audioState.muted ? "1" : "0");
  if (!audioState.muted) {
    ensureAudio();
    playSfx("whisper");
  } else {
    if (audioState.bgmTimer) { clearInterval(audioState.bgmTimer); audioState.bgmTimer = null; }
    if (audioState.heartbeatTimer) { clearInterval(audioState.heartbeatTimer); audioState.heartbeatTimer = null; }
    audioState.bgmStarted = false;
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
      if (message.type === "train") handleTrainEvent(message.payload);
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
    if (message.type === "fog_new_goods" && message.payload) {
      if (message.payload.goods) state.v2.fogGoods = message.payload.goods;
      if (message.payload.preview) { state.v2.fogPreview = message.payload.preview; updateRulePanel(); }
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

function handleTrainEvent(payload) {
  const title = payload.title || payload.author || "终焉列车";
  const text = payload.text || "";
  // 解析列车信息用于大字展示
  const cycleMatch = text.match(/第(\d+)天\s*·\s*(\S+)·(\S+)/);
  const dayInfo = cycleMatch ? `第${cycleMatch[1]}天 · ${cycleMatch[2]}·${cycleMatch[3]}` : "";
  showCenterLine(`${title} 到站${dayInfo ? " — " + dayInfo : ""}`, "train");
  playSfx("train");
  document.body.classList.add("train-pulse");
  setTimeout(() => document.body.classList.remove("train-pulse"), 3200);
  // 更新顶栏规则显示
  if (payload.cycle) {
    $("#cycleTitle").textContent = `第${payload.cycle.day}天 · ${payload.cycle.zodiac}·${payload.cycle.code}`;
    if (payload.cycle.beast) $("#zodiacEffect").textContent = `${payload.cycle.beast}降临 · ${payload.cycle.zodiac}日规则已激活`;
    setTimeout(updateRulePanel, 100);
  }
  if (title.includes("正午") || text.includes("雾区")) {
    $$(".fog-card").forEach((card) => {
      card.classList.remove("train-highlight");
      void card.offsetWidth;
      card.classList.add("train-highlight");
    });
  }
  if (title.includes("黄昏") || text.includes("情报")) {
    $$(".oracle-grid article").forEach((card) => {
      card.classList.remove("train-highlight");
      void card.offsetWidth;
      card.classList.add("train-highlight");
    });
  }
  if (title.includes("午夜")) {
    document.body.classList.add("night-wave");
    setTimeout(() => document.body.classList.remove("night-wave"), 5000);
  }
  if (title.includes("终焉")) {
    document.body.classList.add("finale-flash");
    setTimeout(() => document.body.classList.remove("finale-flash"), 5000);
  }
}

function renderAll() {
  if (!state) return;
  const cycle = state.v2.cycle;
  // 终焉之日视觉
  if (cycle.dayNumber >= 10 || cycle.activeBeastEvent === "青龙") {
    document.body.classList.add("finale-day");
  } else {
    document.body.classList.remove("finale-day");
  }
  $("#cycleTitle").textContent = `第${cycle.dayNumber}天 · ${cycle.rulingZodiac}·${cycle.zodiacCode} · ${cycle.title}`;
  $("#zodiacEffect").textContent = `${cycle.declaration} / ${cycle.zodiacEffect}`;
  $("#playerName").textContent = state.identity?.username ? state.player.name : "未登录试炼者";
  $("#playerMarks").textContent = money(state.player.coins);
  $("#authBtn").textContent = state.identity?.username ? `账号 · ${state.identity.username}` : "登录 / 注册";
  $("#identityNo").textContent = `试炼者编号：${escapeHtml(state.identity?.identityNo || "--")}`;
  const nextTrain = state.v2.trains.find((train) => !train.passed) || state.v2.trains[0];
  $("#trainRail").textContent = `下一班列车：${nextTrain.name} ${nextTrain.time} | ${nextTrain.effect}`;
  $("#railBroadcast").textContent = state.messages[0] ? `${state.messages[0].author}：${state.messages[0].text}` : "钟楼仍在校准。";
  const weather = state.external?.weather;
  $("#systemMeta").textContent = `版本 ${state.version || "--"} · ${weather?.city || "济南"} ${weather?.text || "--"} ${weather?.temperature || ""}`.trim();
  $("#trialModeText").textContent = modeNames[trial.mode] || modeNames.standard;
  $("#trialMode").value = trial.mode;
  renderChronicle();
  renderPathPanel();
  drawNextPiece();
  renderTab();
  updateRulePanel();
}

function updateRulePanel() {
  if (!state) return;
  const cycle = state.v2.cycle;
  const beast = state.v2.activeBeastEvent || cycle.activeBeastEvent || "无";
  const beastDesc = { "白虎": "PVP狂热·攻击翻倍", "朱雀": "规则重写·涅槃之风", "玄武": "坚不可摧·护盾无限", "青龙": "十日裁决·清算将至" }[beast] || "平静之日";
  // 雾区动向
  const preview = state.v2.fogPreview;
  const fogSummary = preview ? `T+0预测：${preview.hint}` : "市场平稳 — 等待午夜列车";
  // 试炼加成
  const boosts = [];
  if (Number(state.player.stats?.oracleBattleBoost || 0) > 0) boosts.push(`战场情报×${state.player.stats.oracleBattleBoost}`);
  if (Number(state.player.stats?.oracleZodiacBoost || 0) > 0) boosts.push(`生肖情报×${state.player.stats.oracleZodiacBoost}`);
  const holdings = (state.player.positions || []).filter(p => p.type === "fog");
  if (holdings.length > 0) boosts.push(`雾区持仓×${holdings.length}`);
  const boostText = boosts.length > 0 ? boosts.join("  ") : "无";
  const el = (id) => document.getElementById(id);
  if (el("ruleZodiac")) el("ruleZodiac").textContent = `${cycle.rulingZodiac}·${cycle.zodiacCode} — ${cycle.zodiacEffect}`;
  if (el("ruleBeast")) el("ruleBeast").textContent = `${beast} — ${beastDesc}`;
  if (el("ruleFog")) el("ruleFog").textContent = fogSummary;
  if (el("ruleBoost")) el("ruleBoost").textContent = boostText;
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
  const categoryEffect = (cat) => {
    if (cat === "神兽遗物") return "神兽祝福 +15%（当日神兽契合 +40%）";
    if (cat === "生肖符咒") return "试炼刻痕 +15%";
    if (cat === "规则碎片") return "情报效果 +8%";
    if (cat === "钟楼零件") return "下落减速 +5%";
    return "";
  };
  const fogBonusText = (goodsName) => {
    for (const g of (state.v2.fogGoods || [])) {
      if (g.id === goodsName || g.name === goodsName) return categoryEffect(g.category);
    }
    return "";
  };
  $("#chronicleContent").innerHTML = `
    <div class="chronicle-kpis">
      <div><span>当前刻痕</span><b>${money(state.player.coins)}</b></div>
      <div><span>总消行</span><b>${money(state.player.lines)}</b></div>
      <div><span>总分数</span><b>${money(state.player.score)}</b></div>
    </div>
    <h3>雾区持仓 ${holdings.length ? `<small>（${holdings.length}/5，试炼结算时生效）</small>` : ""}</h3>
    <div class="mini-list">${holdings.length ? holdings.map((item) => `<article><b>${escapeHtml(item.code)}</b><span>x${escapeHtml(item.qty)} / 成本 ${money(item.cost)}</span><em class="fog-effect">${escapeHtml(fogBonusText(item.code))}</em></article>`).join("") : "<p>暂无持仓。购买雾区商品可在试炼结算时获得额外刻痕加成。</p>"}</div>
    <h3>收集</h3>
    <div class="mark-wall"><span>生肖 ${collections.zodiacMarks.length}/12：${collections.zodiacMarks.map(escapeHtml).join(" ") || "未得印"}</span><span>神兽 ${collections.beastMarks.length}/4：${collections.beastMarks.map(escapeHtml).join(" ") || "未得印"}</span></div>
    <h3>钟渊之路</h3>
    <div class="path-bar"><i style="width:${Math.min(100, collections.pathProgress / 120 * 100)}%"></i></div>
    <small>第 ${collections.pathLevel} 层 · 下层进度 ${collections.pathProgress}/120</small>
    <h3>铭刻升级</h3>
    <div class="upgrade-list">${state.v2.upgradeTree.map((item) => `<article><b>${escapeHtml(item.name)} Lv.${item.level} <small>(${escapeHtml(item.effect)})</small></b><button data-engrave="${item.category}">${money(item.nextCost)}</button></article>`).join("")}</div>
  `;
  $$("[data-engrave]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const before = state.v2.upgradeTree.find((item) => item.category === button.dataset.engrave);
      const result = await post("/api/player/engrave", { category: button.dataset.engrave });
      const after = result.data?.upgrades?.find((item) => item.category === button.dataset.engrave);
      const beforeText = upgradeEffectText(before?.category, before?.level || 0);
      const afterText = upgradeEffectText(after?.category, after?.level || (before?.level || 0) + 1);
      toast(`铭刻升级完成：${beforeText} → ${afterText}`);
      showCenterLine(`${before?.name || "铭刻"} ${beforeText} → ${afterText}`, "path");
      playSfx("pact");
      await load();
    } catch (error) {
      toast(error.message);
    }
  }));
}

function upgradeEffectText(category, level) {
  if (category === "score") return `分数加成 ${(1 + level * 0.05).toFixed(2)}x`;
  if (category === "fee") return `雾区手续费 ${Math.max(1, 5 - level)}%`;
  if (category === "shield") return `护盾上限 ${1 + level}`;
  if (category === "oracle") return `情报折扣 ${Math.round(level * 5)}%`;
  if (category === "train") return `列车预警 Lv.${level}`;
  return `Lv.${level}`;
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
  const effectLabels = {
    market_preview: "神兽遗物价格上涨 12%",
    market_warning: "列车遗落物价格下跌 8%",
    battle_hint: "未来 3 局四消额外 +15% 刻痕",
    zodiac_hint: "未来 3 局生肖加成 +10%",
    pact_hint: "契约贡献加成 +20%",
    train_hint: "触发列车预警，雾区提前波动"
  };
  $("#tabContent").innerHTML = `<div class="oracle-grid">${state.v2.oracleCards.map((card) => `
    <article class="${card.purchased ? "sold" : ""}">
      <small>${escapeHtml(card.category)} · 准确率 ${Math.round(card.accuracy * 100)}%</small>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.description)}</p>
      <em>${escapeHtml(card.flavor)}</em>
      ${card.purchased ? `<div class="oracle-effect-badge">${effectLabels[card.effect?.type] || "效果已激活"}</div>` : ""}
      <button data-oracle="${card.id}" ${card.purchased ? "disabled" : ""}>${card.purchased ? "已出售" : `${money(card.cost)} 刻痕`}</button>
    </article>
  `).join("")}</div>`;
  $$("[data-oracle]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const card = state.v2.oracleCards.find((c) => c.id === button.dataset.oracle);
      const effectText = card ? (effectLabels[card.effect?.type] || "情报已生效") : "";
      await post("/api/oracle/buy", { cardId: button.dataset.oracle });
      toast(`情报已写入铭刻之书：${effectText}`);
      showCenterLine(`情报「${card?.title || ""}」：${effectText}`, "path");
      playSfx("pact");
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

function maybeSpecialModifier(forceType) {
  if (forceType) return null;
  if (currentBeast() === "朱雀" && trial.nirvanaLines >= 3) {
    trial.nirvanaLines = 0;
    return "nirvana";
  }
  if (currentBeast() === "青龙" && Math.random() < 0.15) return "dragon";
  if (Math.random() > 0.28) return null;
  const keys = ["rewind", "pendulum", "curse"];
  return keys[Math.floor(Math.random() * keys.length)];
}

function makePiece(type = null) {
  const shape = type || nextPieceType();
  const modifier = maybeSpecialModifier(type);
  const special = modifier ? specialModifiers[modifier] : null;
  return {
    type: shape,
    matrix: shapes[shape].map((row) => [...row]),
    x: 3,
    y: 0,
    ...blockDefs[shape],
    modifier,
    specialName: special?.name || "",
    glyph: special?.glyph || blockDefs[shape].glyph,
    color: special?.color || blockDefs[shape].color,
    landingDelayUntil: 0,
    lastSwingAt: 0,
    swingDir: 1
  };
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

function makePrecisionMarker() {
  return {
    x: 2 + Math.floor(Math.random() * Math.max(1, trial.cols - 4)),
    y: 8 + Math.floor(Math.random() * 8)
  };
}

function pieceTouchesPrecision(piece) {
  if (!trial.precisionMarker) return false;
  return piece.matrix.some((row, y) => row.some((value, x) => (
    value && piece.x + x === trial.precisionMarker.x && piece.y + y === trial.precisionMarker.y
  )));
}

function rememberStep(reason) {
  if (!trial.running || !trial.piece) return;
  trial.history.unshift({
    reason,
    at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    grid: cloneGrid(trial.grid),
    piece: clonePiece(trial.piece),
    next: clonePiece(trial.next),
    hold: trial.hold,
    canHold: trial.canHold,
    shields: trial.shields,
    goldFloat: trial.goldFloat ? { ...trial.goldFloat } : null,
    precisionMarker: trial.precisionMarker ? { ...trial.precisionMarker } : null
  });
  trial.history = trial.history.slice(0, 5);
  updateRewindPanel();
}

function restoreHistory(index = 0) {
  const snapshot = trial.history[index];
  if (!snapshot || trial.zhongyuan < 10) {
    toast(snapshot ? "钟渊能量未满，无法回溯" : "钟渊里还没有可回溯的状态");
    return false;
  }
  trial.grid = cloneGrid(snapshot.grid);
  trial.piece = clonePiece(snapshot.piece);
  trial.next = clonePiece(snapshot.next);
  trial.hold = snapshot.hold;
  trial.canHold = snapshot.canHold;
  trial.shields = snapshot.shields;
  trial.goldFloat = snapshot.goldFloat ? { ...snapshot.goldFloat } : null;
  trial.precisionMarker = snapshot.precisionMarker ? { ...snapshot.precisionMarker } : null;
  trial.zhongyuan = 0;
  addFloat("回溯完成", trial.cols * trial.cell / 2, 138, "#d6f7ff", 22);
  playSfx("whisper");
  updateRewindPanel();
  ensureRenderLoop();
  return true;
}

function markEngravings(fullRows) {
  const now = performance.now();
  fullRows.forEach((y) => {
    for (let x = 0; x < trial.cols; x += 1) {
      const key = `${x},${y}`;
      const last = trial.lastEngravings.get(key) || 0;
      trial.engravingMarks.set(key, {
        x,
        y,
        age: 0,
        life: 5000,
        level: now - last <= 10000 || hasRealm("jianhen") ? 2 : 1,
        rune: engravingRunes[(x + y + Math.floor(now / 1000)) % engravingRunes.length]
      });
      trial.lastEngravings.set(key, now);
    }
  });
}

function drawEngravings(ctx) {
  for (const [key, mark] of trial.engravingMarks) {
    const occupied = trial.grid[mark.y]?.[mark.x] || (trial.piece && trial.piece.matrix.some((row, y) => row.some((value, x) => (
      value && trial.piece.x + x === mark.x && trial.piece.y + y === mark.y
    ))));
    if (occupied || mark.age >= mark.life) {
      trial.engravingMarks.delete(key);
      continue;
    }
    const alpha = Math.max(0, 1 - mark.age / mark.life) * (mark.level > 1 ? 0.85 : 0.48);
    const left = mark.x * trial.cell;
    const top = mark.y * trial.cell;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = mark.level > 1 ? "#ffd45f" : "#f2c14e";
    ctx.font = `${mark.level > 1 ? 800 : 700} 15px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(242,193,78,.75)";
    ctx.shadowBlur = mark.level > 1 ? 12 : 7;
    ctx.fillText(mark.rune, left + trial.cell / 2, top + trial.cell / 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function maybeSpawnGoldFloat() {
  if (trial.goldFloat || !trial.running || Math.random() > 0.22) return;
  trial.goldFloat = {
    x: Math.floor(Math.random() * trial.cols),
    y: 2 + Math.floor(Math.random() * 12),
    value: [50, 100, 200][Math.floor(Math.random() * 3)],
    bornAt: performance.now(),
    life: 10000
  };
}

function updateRewindPanel() {
  const value = $("#zhongyuanValue");
  const bar = $("#zhongyuanBar");
  const select = $("#rewindSelect");
  const btn = $("#rewindBtn");
  if (value) value.textContent = `${trial.zhongyuan}/10`;
  if (bar) bar.style.width = `${trial.zhongyuan * 10}%`;
  if (select) {
    select.innerHTML = trial.history.length
      ? trial.history.map((item, index) => `<option value="${index}">${item.at} · ${escapeHtml(item.reason)}</option>`).join("")
      : '<option value="0">暂无回溯点</option>';
  }
  if (btn) btn.disabled = trial.zhongyuan < 10 || !trial.history.length;
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
  const power = currentBeast() === "青龙" || trial.piece.modifier === "dragon" ? 1.5 : 1;
  let bonus = 0;
  if (type === "I") {
    bonus += Math.round(baseScore * 0.45 * power);
    addFloat(`长鸣+${Math.round(45 * power)}%`, trial.cols * trial.cell / 2, 118, "#8eeeff", 18);
    trial.effects.flashUntil = performance.now() + 130;
  }
  if (type === "T" && Math.random() < 0.5 && removeRandomNeighbor(clearedRows)) {
    bonus += Math.round(80 * power);
    playSfx("whisper");
  }
  if (type === "S") {
    bonus += Math.round(cleared * 70 * power);
    addFloat("雾息+" + money(cleared * 70 * power), trial.cols * trial.cell / 2, 154, "#9cc7e8", 16);
  }
  if (type === "L") {
    const floatReward = trial.goldFloat ? trial.goldFloat.value : cleared * 90;
    bonus += Math.round(floatReward * power);
    trial.goldFloat = null;
    addFloat("轨钉拾取+" + money(floatReward * power), trial.cols * trial.cell / 2, 180, "#d5d5d5", 15);
  }
  if (type === "J") {
    trial.slowPieces = Math.max(trial.slowPieces, 1);
    bonus += Math.round(60 * power);
    addFloat("刻痕减速", trial.cols * trial.cell / 2, 206, "#9dbce5", 15);
  }
  if (type === "Z") {
    trial.pendingGarbageRows += 1;
    bonus += Math.round(300 * power);
    addFloat(`终焉+${money(300 * power)}`, trial.cols * trial.cell / 2, 232, "#ff9ab8", 17);
    shake(2.2, 180);
  }
  if (trial.piece.modifier === "nirvana") {
    clearBottomRows(3);
    bonus += 500;
    addFloat("朱雀涅槃", trial.cols * trial.cell / 2, 258, "#ffb36d", 22);
    playSfx("beast");
  }
  return bonus;
}

function clearBottomRows(count) {
  for (let i = 0; i < count; i += 1) {
    trial.grid.pop();
    trial.grid.unshift(Array(trial.cols).fill(null));
  }
}

function zodiacScoreBonus(cleared, baseScore, priorLines) {
  const zodiac = currentZodiac();
  let bonus = 0;
  if (zodiac === "鼠" && priorLines === 0) {
    bonus += baseScore;
    addFloat("鼠觉首消x2", trial.cols * trial.cell / 2, 330, "#fff1a8", 18);
  }
  if (zodiac === "牛" && trial.combo > 1) {
    bonus += Math.round(baseScore * 0.2 * trial.combo);
    addFloat(`牛固连击+${trial.combo * 20}%`, trial.cols * trial.cell / 2, 356, "#f6d57b", 16);
  }
  if (zodiac === "马" || currentBeast() === "玄武") {
    bonus += Math.round(cleared * Math.max(1, (Date.now() - trial.startedAt) / 1000) * 2);
  }
  if (zodiac === "鸡" || currentBeast() === "青龙") bonus += Math.round(baseScore * 0.25);
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
  const curseLocked = clearedRows.some((y) => trial.grid[y].some((cell) => cell?.modifier === "curse"));
  if (curseLocked && cleared < 2) {
    addFloat("诅咒拒绝结算", trial.cols * trial.cell / 2, 120, "#f06aff", 18);
    playSfx("whisper");
    trial.combo = 0;
    return;
  }
  if (cleared) {
    const priorLines = trial.lines;
    if (trial.piece?.modifier) trial.specialCounts.push(trial.piece.modifier);
    trial.combo += 1;
    trial.lines += cleared;
    if (cleared > trial.maxClear) trial.maxClear = cleared;
    trial.zhongyuan = Math.min(10, trial.zhongyuan + cleared);
    trial.nirvanaLines += cleared;
    pathState.totalLines = Number(pathState.totalLines || 0) + cleared;
    savePathState();
    if (cleared >= 4) unlockRealm("pojie");
    markEngravings(clearedRows);
    const baseScore = cleared * 120 * trial.combo;
    const now = Date.now();
    const echoBonus = trial.lastClearAt && now - trial.lastClearAt <= 3000 ? Math.round(baseScore * 0.2 * Math.min(5, trial.echoStacks + 1)) : 0;
    trial.echoStacks = echoBonus ? trial.echoStacks + 1 : 0;
    if (echoBonus) trial.echoTriggers += 1;
    trial.lastClearAt = now;
    const abilityBonus = applyBlockAbility(cleared, clearedRows, baseScore);
    let modeBonus = 0;
    if (trial.mode === "precision" && (clearedRows.some((y) => y === trial.precisionMarker?.y) || pieceTouchesPrecision(trial.piece))) {
      modeBonus += 260;
      trial.precisionMarker = makePrecisionMarker();
      addFloat("精准刻度+260", trial.cols * trial.cell / 2, 382, "#fff1a8", 16);
    }
    const zodiacBonus = zodiacScoreBonus(cleared, baseScore, priorLines);
    const totalScore = baseScore + echoBonus + abilityBonus + modeBonus + zodiacBonus;
    addRunScore(totalScore);
    trial.effects.clears.push(...clearedRows.map((y) => ({ y, age: 0, life: 300 })));
    spawnParticles(clearedRows, cells);
    addFloat(`+${money(totalScore)}`, trial.cols * trial.cell / 2, Math.max(56, Math.min(...clearedRows) * trial.cell), cleared >= 4 ? "#fff1a8" : "#f2c14e", cleared >= 4 ? 24 : 18);
    if (echoBonus) addFloat(`回响+${Math.min(5, trial.echoStacks) * 20}%`, trial.cols * trial.cell / 2, 272, "#f6d57b", 17);
    if (trial.combo > 1) addFloat(`COMBO x${trial.combo}`, trial.cols * trial.cell / 2, 304, comboColor(trial.combo), comboSize(trial.combo));
    playClear(cleared);
    playCombo(trial.combo);
    if (cleared >= 4) {
      playSfx("train");
      showCenterLine("四✨消✨！", "train");
      document.body.classList.add("tetris-flash");
      setTimeout(() => document.body.classList.remove("tetris-flash"), 800);
    }
    if (trial.combo >= 5) {
      queueWhisper(`🔥${trial.combo}连消！`);
      document.body.classList.add("combo-surge");
      setTimeout(() => document.body.classList.remove("combo-surge"), 600);
    }
    shake(cleared >= 4 ? 3.4 : 1 + cleared * 0.45, 110 + cleared * 45);
    trial.grid = trial.grid.filter((row) => row.some((cell) => !cell));
    while (trial.grid.length < trial.rows) trial.grid.unshift(Array(trial.cols).fill(null));
    if (trial.piece?.modifier === "rewind" && trial.history.length) {
      setTimeout(() => {
        const snapshot = trial.history[Math.min(2, trial.history.length - 1)];
        if (!snapshot) return;
        trial.grid = cloneGrid(snapshot.grid);
        trial.piece = clonePiece(snapshot.piece);
        trial.next = clonePiece(snapshot.next);
        addFloat("时间倒流", trial.cols * trial.cell / 2, 408, "#d6f7ff", 20);
        ensureRenderLoop();
      }, 260);
    }
    if ((currentBeast() === "白虎" || currentZodiac() === "虎") && priorLines >= 0) {
      addGarbageRow();
      addFloat("白虎反击", trial.cols * trial.cell / 2, 434, "#ff9ab8", 17);
    }
    while (trial.pendingGarbageRows > 0) {
      addGarbageRow();
      trial.pendingGarbageRows -= 1;
    }
    maybeSpawnGoldFloat();
    updateRewindPanel();
    checkPathUnlocks();
  } else {
    trial.combo = 0;
    trial.echoStacks = 0;
  }
}

function comboColor(combo) {
  if (combo >= 10) return "#ffffff";
  if (combo >= 6) return "#fff1a8";
  if (combo >= 3) return "#ffd45f";
  return "#f2c14e";
}

function comboSize(combo) {
  if (combo >= 10) return 40;
  if (combo >= 6) return 32;
  if (combo >= 3) return 24;
  return 18;
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
  trial.lockElapsed = 0;
  trial.landingY = null;
  trial.touched = false;
  drawNextPiece();
  if (collide(trial.piece)) {
    const saved = consumeShield();
    if (!saved || collide(trial.piece)) endTrial();
  }
}

function hardDrop() {
  if (!trial.running || !trial.piece) return;
  rememberStep("硬降前");
  let distance = 0;
  while (!collide(trial.piece, 0, 1)) {
    trial.piece.y += 1;
    distance += 1;
  }
  if (currentZodiac() === "兔") addRunScore(3 + distance * 3);
  trial.hardDrops += 1;
  trial.lockElapsed = 999;
  playSfx("hard_drop");
  shake(1.4, 90);
  drop();
}

function holdPiece() {
  if (!trial.running || !trial.canHold) return;
  rememberStep("暂存");
  const currentType = trial.piece.type;
  if (trial.hold) {
    trial.piece = makePiece(trial.hold);
    trial.hold = currentType;
  } else {
    trial.hold = currentType;
    spawn();
  }
  trial.canHold = false;
  trial.lockElapsed = 0;
  drawNextPiece();
  playSfx("rotate", 0.75);
}

function drop() {
  if (!trial.running) return;
  if (!collide(trial.piece, 0, 1)) {
    trial.piece.y += 1;
    trial.lockElapsed = 0;
    trial.landingY = null;
  } else {
    if (trial.piece.modifier === "pendulum" && !trial.piece.landingDelayUntil) {
      trial.piece.landingDelayUntil = performance.now() + 1000;
      addFloat("钟摆窗口", trial.cols * trial.cell / 2, 104, "#ffe08a", 17);
      return;
    }
    if (trial.piece.modifier === "pendulum" && performance.now() < trial.piece.landingDelayUntil) {
      swingPendulum();
      return;
    }
    if (trial.lockElapsed < lockDelayMs()) {
      trial.landingY = trial.piece.y;
      return;
    }
    rememberStep(`落定 ${trial.piece.specialName || trial.piece.name}`);
    merge();
    playSfx("land");
    clearLines();
    spawn();
  }
}

function lockDelayMs() {
  if (trial.mode === "rhythm" && trial.rhythmBeat) return 220;
  return currentBeast() === "青龙" ? 180 : 420;
}

function swingPendulum() {
  const now = performance.now();
  if (now - trial.piece.lastSwingAt < 180) return;
  trial.piece.lastSwingAt = now;
  if (!collide(trial.piece, trial.piece.swingDir, 0)) {
    trial.piece.x += trial.piece.swingDir;
  } else {
    trial.piece.swingDir *= -1;
    if (!collide(trial.piece, trial.piece.swingDir, 0)) trial.piece.x += trial.piece.swingDir;
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
    updateModeClock(now);
    if (trial.piece && collide(trial.piece, 0, 1)) trial.lockElapsed += delta;
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

function drawMiniCell(ctx, x, y, block, size = 22) {
  const left = x * size;
  const top = y * size;
  const gradient = ctx.createLinearGradient(left, top, left + size, top + size);
  gradient.addColorStop(0, "#f4e4ba");
  gradient.addColorStop(0.2, block.color);
  gradient.addColorStop(1, "#111");
  ctx.fillStyle = gradient;
  ctx.fillRect(left + 1, top + 1, size - 2, size - 2);
  ctx.strokeStyle = "rgba(242,193,78,.3)";
  ctx.strokeRect(left + 4, top + 4, size - 8, size - 8);
  ctx.fillStyle = "rgba(8,8,8,.82)";
  ctx.font = "700 11px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.glyph, left + size / 2, top + size / 2);
}

function drawNextPiece() {
  const canvas = $("#nextPiece");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!trial.next) return;
  const size = 22;
  const ox = Math.floor((5 - trial.next.matrix[0].length) / 2);
  const oy = Math.floor((5 - trial.next.matrix.length) / 2);
  trial.next.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawMiniCell(ctx, ox + x, oy + y, trial.next, size);
  }));
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
  for (const mark of trial.engravingMarks.values()) mark.age += delta;
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
  drawEngravings(ctx);
  if (trial.mode === "precision" && trial.precisionMarker) {
    ctx.fillStyle = "rgba(242,193,78,.08)";
    ctx.strokeStyle = "rgba(242,193,78,.62)";
    ctx.lineWidth = 2;
    ctx.fillRect(trial.precisionMarker.x * trial.cell + 4, trial.precisionMarker.y * trial.cell + 4, trial.cell - 8, trial.cell - 8);
    ctx.strokeRect(trial.precisionMarker.x * trial.cell + 5, trial.precisionMarker.y * trial.cell + 5, trial.cell - 10, trial.cell - 10);
  }
  trial.grid.forEach((row, y) => row.forEach((cell, x) => cell && drawCell(ctx, x, y, cell)));
  if (trial.piece) {
    const gy = ghostY(trial.piece);
    trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => value && drawCell(ctx, trial.piece.x + x, gy + y, trial.piece, { ghost: true })));
    trial.piece.matrix.forEach((row, y) => row.forEach((value, x) => value && drawCell(ctx, trial.piece.x + x, trial.piece.y + y, trial.piece)));
  }
  if (trial.goldFloat && performance.now() - trial.goldFloat.bornAt <= trial.goldFloat.life) {
    ctx.fillStyle = "#f2c14e";
    ctx.beginPath();
    ctx.arc((trial.goldFloat.x + 0.5) * trial.cell, (trial.goldFloat.y + 0.5) * trial.cell, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#241a04";
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${trial.goldFloat.value}`, (trial.goldFloat.x + 0.5) * trial.cell, (trial.goldFloat.y + 0.5) * trial.cell);
  } else if (trial.goldFloat) {
    trial.goldFloat = null;
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
  if (trial.combo >= 10) {
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }
  $("#trialScore").textContent = money(trial.score);
  $("#trialLines").textContent = money(trial.lines);
  $("#trialCombo").textContent = trial.combo;
  $("#holdPiece").textContent = trial.hold ? `${blockDefs[trial.hold].glyph}${trial.shields ? ` · 盾${trial.shields}` : ""}` : (trial.shields ? `盾${trial.shields}` : "--");
  $("#trialModeText").textContent = modeNames[trial.mode] || modeNames.standard;
  $("#trialTimer").textContent = trial.mode === "timed" ? `${Math.ceil(trial.modeRemaining)}s` : `${Math.floor((Date.now() - trial.startedAt) / 1000)}s`;
  updateRewindPanel();
  updateTrialChrome();
}

async function endTrial() {
  trial.running = false;
  recordFinishedRun();
  $("#startTrial").textContent = "再次试炼";
  playSfx("game_over");
  addFloat(hasRealm("wangshi") ? "你已留下回响" : "钟渊沉寂...", trial.cols * trial.cell / 2, trial.rows * trial.cell / 2, "#f6d57b", 24);
  if (currentBeast() === "青龙") showCenterLine("青龙裁决：十日名录已刻入钟楼", "path");
  ensureRenderLoop();
  try {
    const duration = Math.round((Date.now() - trial.startedAt) / 1000);
    const result = await post("/api/trials/report", { score: trial.score, lines: trial.lines, duration, mode: currentTrialMode(), hardDrops: trial.hardDrops, specials: trial.specialCounts, maxClear: trial.maxClear });
    const bonusText = result.data.fogBonus > 0 ? `（含雾区持仓 +${result.data.fogBonus}）` : "";
    toast(`试炼结束，获得 ${money(result.data.marksEarned)} 刻痕${bonusText}`);
    if (result.data.fogBonus > 0) {
      addFloat(`雾区+${result.data.fogBonus}`, trial.cols * trial.cell / 2, 180, "#ffd45f", 20);
      showCenterLine(`雾区持仓加成 +${result.data.fogBonus} 刻痕`, "path");
    }
    if (result.data.maxClear >= 4) {
      showCenterLine(`🏆 ${result.data.maxClear}行四消！钟声铭刻`, "path");
    }
    await load();
  } catch (error) {
    toast(error.message);
  }
}

function startTrial() {
  ensureAudio();
  playSfx("whisper");
  unlockRealm("wenzhong");
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
  trial.maxClear = 0;
  trial.echoTriggers = 0;
  trial.zhongyuan = 0;
  trial.history = [];
  trial.mode = $("#trialMode")?.value || trial.mode || "standard";
  localStorage.setItem("trialModeV2", trial.mode);
  trial.modeRemaining = 60;
  trial.modeStartedAt = Date.now();
  trial.survivalStep = 0;
  trial.rhythmBeat = false;
  trial.precisionMarker = makePrecisionMarker();
  trial.goldFloat = null;
  trial.lockDelay = 0;
  trial.lockElapsed = 0;
  trial.landingY = null;
  trial.nirvanaLines = 0;
  trial.pendingWhispers = [];
  trial.shownWhispers = new Set();
  trial.engravingMarks = new Map();
  trial.lastEngravings = new Map();
  trial.specialCounts = [];
  trial.hardDrops = 0;
  trial.effects = { particles: [], floats: [], ripples: [], clears: [], shakeUntil: 0, shakePower: 0, flashUntil: 0 };
  trial.startedAt = Date.now();
  trial.lastFrame = performance.now();
  trial.dropElapsed = 0;
  $("#startTrial").textContent = "试炼中";
  drawNextPiece();
  updateRewindPanel();
  if (currentBeast()) {
    showCenterLine(`${currentBeast()}降临`, "train");
    playSfx("beast");
  }
  ensureRenderLoop();
}

function updateModeClock(time) {
  const elapsed = Math.max(0, (Date.now() - trial.startedAt) / 1000);
  trial.modeRemaining = Math.max(0, 60 - elapsed);
  trial.survivalStep = Math.floor(elapsed / 18);
  trial.rhythmBeat = trial.mode === "rhythm" && Math.floor(time / 520) % 2 === 0;
  $("#rhythmLight")?.classList.toggle("active", trial.rhythmBeat);
  if (trial.mode === "timed" && trial.modeRemaining <= 0) endTrial();
}

function trialDropInterval() {
  const zodiac = currentZodiac();
  const beast = currentBeast();
  let interval = 760;
  if (zodiac === "鼠") interval = 920;
  if (zodiac === "兔") interval = 500;
  if (zodiac === "牛") interval = 820;
  if (zodiac === "鸡") interval = 560;
  if (beast === "玄武") interval = 620;
  if (beast === "青龙") interval = 460;
  if (trial.mode === "survival" || beast === "玄武") interval -= trial.survivalStep * 55;
  if (trial.mode === "timed") interval -= Math.floor((60 - trial.modeRemaining) / 10) * 35;
  if (trial.mode === "rhythm" && trial.rhythmBeat) interval = Math.min(interval, 360);
  if (trial.slowActive) interval *= 1.65;
  return Math.max(240, interval);
}

function currentTrialMode() {
  const beast = currentBeast();
  if (beast === "白虎") return "pvp";
  if (beast === "朱雀") return "nirvana";
  if (beast === "玄武") return "survival";
  if (beast === "青龙") return "pvp";
  return trial.mode || "standard";
}

function movePiece(dir) {
  if (!trial.running || !trial.piece) return false;
  if (!collide(trial.piece, dir, 0)) {
    rememberStep(dir < 0 ? "左移" : "右移");
    trial.piece.x += dir;
    trial.lockElapsed = 0;
    playSfx("move");
    ensureRenderLoop();
    return true;
  }
  return false;
}

function rotatePiece() {
  if (!trial.running || !trial.piece) return false;
  const rotated = rotate(trial.piece.matrix);
  for (const kick of [0, 1, -1, 2, -2]) {
    if (!collide(trial.piece, kick, 0, rotated)) {
      rememberStep("旋转");
      trial.piece.x += kick;
      trial.piece.matrix = rotated;
      trial.lockElapsed = 0;
      playSfx("rotate");
      ensureRenderLoop();
      return true;
    }
  }
  return false;
}

function softDrop() {
  if (!trial.running || !trial.piece) return;
  drop();
  addRunScore(1);
  ensureRenderLoop();
}

function bindTouchControls() {
  $$("[data-touch]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.touch;
    ensureAudio();
    if (action === "left") movePiece(-1);
    if (action === "right") movePiece(1);
    if (action === "rotate") rotatePiece();
    if (action === "drop") hardDrop();
  }));
  const board = $("#trialBoard");
  if (!board) return;
  let start = null;
  let lastTap = 0;
  board.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    start = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, { passive: true });
  board.addEventListener("touchend", (event) => {
    if (!start) return;
    event.preventDefault();
    ensureAudio();
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const now = Date.now();
    if (now - lastTap < 260 && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      holdPiece();
      lastTap = 0;
      return;
    }
    lastTap = now;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) {
      movePiece(dx < 0 ? -1 : 1);
    } else if (dy < -28) {
      rotatePiece();
    } else if (dy > 28) {
      hardDrop();
    } else {
      const rect = board.getBoundingClientRect();
      const zone = (touch.clientX - rect.left) / rect.width;
      if (zone < 0.33) movePiece(-1);
      else if (zone > 0.66) movePiece(1);
      else rotatePiece();
    }
  }, { passive: false });
}

function bindEvents() {
  $$(".plaza-tabs button").forEach((button) => button.addEventListener("click", () => {
    playSfx("move", 0.7);
    activeTab = button.dataset.tab;
    renderTab();
  }));
  $("#audioToggle")?.addEventListener("click", toggleAudio);
  $("#trialMode").value = trial.mode;
  $("#trialMode").addEventListener("change", (event) => {
    trial.mode = event.target.value;
    localStorage.setItem("trialModeV2", trial.mode);
    toast(`试炼模式切换为：${modeNames[trial.mode]}`);
  });
  $("#rewindBtn").addEventListener("click", () => restoreHistory(Number($("#rewindSelect").value || 0)));
  $("#pathToggle").addEventListener("click", () => {
    renderPathPanel();
    $("#pathPanel").classList.add("open");
  });
  $("#pathClose").addEventListener("click", () => $("#pathPanel").classList.remove("open"));
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
    if (event.key === "ArrowLeft") changed = movePiece(-1);
    if (event.key === "ArrowRight") changed = movePiece(1);
    if (event.key === "ArrowDown") { softDrop(); changed = true; }
    if (event.key === " " || event.key === "Space" || event.key === "Spacebar") hardDrop();
    if (event.key === "ArrowUp" || event.key === "z" || event.key === "Z") changed = rotatePiece();
    if (event.key === "c" || event.key === "C") holdPiece();
    if (changed) ensureRenderLoop();
  }, { passive: false });
  bindTouchControls();
  renderPathPanel();
  updateRewindPanel();
  setAudioButton();
}

bindEvents();
drawTrial();
load().catch((error) => toast(error.message));
pollTimer = setInterval(() => load().catch((error) => toast(error.message)), 30000);
setInterval(tickClock, 1000);
