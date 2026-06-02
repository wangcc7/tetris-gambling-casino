const boardCanvas = document.querySelector("#board");
const boardCtx = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next");
const nextCtx = nextCanvas.getContext("2d");
const holdCanvas = document.querySelector("#hold");
const holdCtx = holdCanvas?.getContext("2d");
const cell = 30;
const cols = 10;
const rows = 20;
const playerId = getStoredPlayerId();
localStorage.setItem("casinoPlayerId", playerId);
document.querySelectorAll("[data-nav]").forEach((link) => {
  link.classList.toggle("active", link.getAttribute("href") === "/game.html");
});

const shapes = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  L: [[1, 0], [1, 0], [1, 1]],
  J: [[0, 1], [0, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

const attrs = {
  I: { tag: "crit", label: "钟", color: "#35d7e8" },
  O: { tag: "shield", label: "守", color: "#f2c14e" },
  T: { tag: "chaos", label: "谜", color: "#b879ff" },
  L: { tag: "greed", label: "筹", color: "#ff9f43" },
  J: { tag: "freeze", label: "止", color: "#4d8dff" },
  S: { tag: "poison", label: "雾", color: "#45d483" },
  Z: { tag: "bomb", label: "终", color: "#ff5c6c" }
};

const specialModifiers = {
  rewind: { name: "时间倒流", label: "返", color: "#d6f7ff", desc: "消行后棋盘回退到数步前，但奖励保留" },
  pendulum: { name: "钟摆", label: "摆", color: "#ffe08a", desc: "落地前会左右摆动 1 秒" },
  curse: { name: "诅咒", label: "禁", color: "#f06aff", desc: "所在满行必须一次消除 2 行以上才会真正清掉" }
};

const modeNames = {
  standard: "昼夜标准",
  timed: "60秒限时",
  precision: "精准刻度",
  survival: "倒计时生存",
  rhythm: "节拍坠落"
};

const pathKey = "zhongyuanPathV1";
const pathRealms = [
  { id: "wenzhong", name: "闻钟", desc: "首次游戏解锁", reward: "基础钟声" },
  { id: "jianhen", name: "见痕", desc: "累计消除100行", reward: "铭文印记从淡金变为亮金色" },
  { id: "zhifan", name: "知返", desc: "单局触发5次回响", reward: "回响波纹半径扩大30%" },
  { id: "tinglan", name: "听澜", desc: "单局总分达到5000分", reward: "新增台词：潮声已至" },
  { id: "pojie", name: "破界", desc: "单次消除4行", reward: "摆锤指针增加残影拖尾" },
  { id: "wangshi", name: "忘时", desc: "连续3局分数超过3000", reward: "终局文字变为：你已留下回响" },
  { id: "jidao", name: "极道", desc: "累计消除1000行", reward: "金色钟摆粒子与标题后缀" }
];

let grid = emptyGrid();
let pieceBag = [];
let current = makePiece();
let next = makePiece();
let hold = null;
let canHold = true;
let running = false;
let paused = false;
let last = 0;
let dropCounter = 0;
let dropInterval = 820;
let goldFloat = null;
let gameOver = false;
let localPlayer = { coins: 1000, score: 0, lines: 0, shields: 0, name: "玩家" };
let history = [];
let zhongyuan = 0;
let dying = false;
let dyingLocks = 0;
let gameMode = "standard";
let modeStartedAt = 0;
let modeRemaining = 60;
let survivalStep = 0;
let rhythmBeat = false;
let precisionMarker = makePrecisionMarker();
let precisionBonus = 0;
let lastLockCleared = 0;
let fxContext = null;
let runLines = 0;
let runScore = 0;
let finaleProgress = 0;
let finaleAwake = false;
let engravingMarks = new Map();
let lastEngravings = new Map();
let triggeredWhispers = new Set();
let whisperQueue = [];
let whisperShowing = false;
let echoMemory = new Map();
let echoStacks = 0;
let echoRipples = [];
let echoFlashes = [];
let echoFloats = [];
let runEchoTriggers = 0;
let tideWhisperShown = false;
let pathState = loadPathState();
const controlKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "KeyC", "c", "C"]);

const finaleLines = [
  "你听见的不是钟声，是选择回到因果里的声音。",
  "局不是用来赢的，局是用来看清自己的。",
  "当终焉走满，真正沉下去的是侥幸。",
  "别跟时间讨价还价，先把结构摆正。"
];

const whisperThresholds = [
  [100, "时间不多了…"],
  [300, "你还记得第几天吗？"],
  [600, "钟声又响了。"],
  [1000, "别回头。"]
];

const engravingRunes = ["刻", "时", "渊", "钟", "回", "寂"];

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `p-${Date.now().toString(36)}-${random}`;
}

function getStoredPlayerId() {
  try {
    const session = JSON.parse(localStorage.getItem("casinoAccount") || "{}");
    if (session.userId) return session.userId;
  } catch {
    localStorage.removeItem("casinoAccount");
  }
  return "guest";
}

function getSessionToken() {
  try {
    return JSON.parse(localStorage.getItem("casinoAccount") || "{}").token || "";
  } catch {
    return "";
  }
}

function emptyGrid() {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
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

function unlockRealm(id) {
  if (hasRealm(id)) return false;
  const realm = pathRealms.find((item) => item.id === id);
  if (!realm) return false;
  pathState.unlocked[id] = new Date().toISOString();
  savePathState();
  applyPathEffects();
  renderPathPanel();
  if (id === "tinglan" && !tideWhisperShown) {
    tideWhisperShown = true;
    whisperQueue.push("潮声已至");
    showNextWhisper();
  }
  showPathToast(`极道·${realm.name} 已悟`);
  playBell("path");
  return true;
}

function showPathToast(text) {
  const el = document.querySelector("#pathToast");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

function checkPathUnlocks() {
  if (pathState.totalLines >= 100) unlockRealm("jianhen");
  if (pathState.totalLines >= 1000) unlockRealm("jidao");
  if (runEchoTriggers >= 5) unlockRealm("zhifan");
  if (runScore >= 5000) unlockRealm("tinglan");
}

function recordFinishedRun() {
  pathState.recentScores = [...(pathState.recentScores || []), runScore].slice(-3);
  savePathState();
  if (pathState.recentScores.length === 3 && pathState.recentScores.every((score) => score > 3000)) {
    unlockRealm("wangshi");
  }
}

function renderPathPanel() {
  const list = document.querySelector("#pathList");
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
}

function applyPathEffects() {
  document.body.classList.toggle("realm-jianhen", hasRealm("jianhen"));
  document.body.classList.toggle("realm-zhifan", hasRealm("zhifan"));
  document.body.classList.toggle("realm-pojie", hasRealm("pojie"));
  document.body.classList.toggle("realm-wangshi", hasRealm("wangshi"));
  document.body.classList.toggle("realm-jidao", hasRealm("jidao"));
  const title = document.querySelector(".topbar h1");
  if (title) title.textContent = hasRealm("jidao") ? "方块战场 · 极道" : "方块战场";
  mountJidaoParticles();
}

function mountJidaoParticles() {
  const el = document.querySelector("#jidaoParticles");
  if (!el || el.childElementCount || !hasRealm("jidao")) return;
  el.innerHTML = Array.from({ length: 28 }, (_, index) => (
    `<i style="--x:${(index * 37) % 100}%;--d:${2 + (index % 9) * .35}s;--s:${8 + (index % 5) * 3}px"></i>`
  )).join("");
}

function makePrecisionMarker() {
  return {
    x: 2 + Math.floor(Math.random() * (cols - 4)),
    y: 8 + Math.floor(Math.random() * 8)
  };
}

function maybeSpecialModifier(forceType) {
  if (forceType) return null;
  if (Math.random() > 0.28) return null;
  const keys = Object.keys(specialModifiers);
  return keys[Math.floor(Math.random() * keys.length)];
}

function refillPieceBag() {
  pieceBag = Object.keys(shapes);
  for (let i = pieceBag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieceBag[i], pieceBag[j]] = [pieceBag[j], pieceBag[i]];
  }
}

function takePieceType() {
  if (!pieceBag.length) refillPieceBag();
  return pieceBag.pop();
}

function makePiece(forceType) {
  const type = forceType || takePieceType();
  const modifier = maybeSpecialModifier(forceType);
  const special = modifier ? specialModifiers[modifier] : null;
  return {
    type,
    matrix: shapes[type].map((row) => [...row]),
    x: Math.floor(cols / 2) - 2,
    y: 0,
    ...attrs[type],
    modifier,
    specialName: special?.name || "",
    rune: special?.label || attrs[type].label,
    bornAt: performance.now(),
    landingDelayUntil: 0,
    lastSwingAt: 0,
    swingDir: 1
  };
}

function cloneGrid(source) {
  return source.map((row) => row.map((cellData) => cellData ? { ...cellData } : null));
}

function clonePiece(piece) {
  return {
    ...piece,
    matrix: piece.matrix.map((row) => [...row])
  };
}

function rememberStep(reason) {
  if (!running || gameOver) return;
  history.unshift({
    reason,
    at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    grid: cloneGrid(grid),
    current: clonePiece(current),
    next: clonePiece(next),
    hold: hold ? clonePiece(hold) : null,
    canHold,
    goldFloat: goldFloat ? { ...goldFloat } : null,
    dying,
    dyingLocks,
    precisionMarker: { ...precisionMarker },
    precisionBonus
  });
  history = history.slice(0, 5);
  renderHistory();
}

function restoreHistory(index = 0, keepReward = true) {
  const snapshot = history[index];
  if (!snapshot) {
    toast("钟渊里还没有可回溯的状态");
    return false;
  }
  const playerNow = { ...localPlayer };
  grid = cloneGrid(snapshot.grid);
  current = clonePiece(snapshot.current);
  next = clonePiece(snapshot.next);
  hold = snapshot.hold ? clonePiece(snapshot.hold) : null;
  canHold = snapshot.canHold ?? true;
  goldFloat = snapshot.goldFloat ? { ...snapshot.goldFloat } : null;
  dying = snapshot.dying;
  dyingLocks = snapshot.dyingLocks;
  precisionMarker = { ...snapshot.precisionMarker };
  precisionBonus = snapshot.precisionBonus;
  if (keepReward) localPlayer = playerNow;
  drawNext();
  drawHold();
  syncHud();
  toast(`回溯到 ${snapshot.at} · ${snapshot.reason}`);
  return true;
}

function renderHistory() {
  const select = document.querySelector("#rewindSelect");
  if (!select) return;
  select.innerHTML = history.length
    ? history.map((item, index) => `<option value="${index}">${item.at} · ${escapeHtml(item.reason)}</option>`).join("")
    : '<option value="0">暂无可回溯状态</option>';
}

function advanceFinale() {
  const nextProgress = Math.min(100, Math.floor(runLines / 4) * 25);
  if (nextProgress <= finaleProgress) return;
  finaleProgress = nextProgress;
  const line = finaleLines[Math.min(finaleLines.length - 1, Math.floor(finaleProgress / 25) - 1)];
  const finaleLine = document.querySelector("#finaleLine");
  if (finaleLine) finaleLine.textContent = line;
  if (finaleProgress >= 100 && !finaleAwake) {
    finaleAwake = true;
    document.body.classList.add("finale-awake");
    speakFinaleLine(line);
    toast(`终焉刻度满溢：${line}`);
    setTimeout(() => document.body.classList.remove("finale-awake"), 4200);
  }
}

function speakFinaleLine(line) {
  if (!("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = "zh-CN";
    utterance.rate = 0.86;
    utterance.pitch = 0.72;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis is optional; the visible line remains the source of truth.
  }
}

function markEngravings(fullRows) {
  const now = performance.now();
  fullRows.forEach((y) => {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const last = lastEngravings.get(key) || 0;
      const doubled = now - last <= 10000;
      engravingMarks.set(key, {
        x,
        y,
        bornAt: now,
        level: doubled ? 2 : 1,
        rune: engravingRunes[(x + y + Math.floor(now / 1000)) % engravingRunes.length]
      });
      lastEngravings.set(key, now);
    }
  });
}

function isPieceCoveringCell(piece, cellX, cellY) {
  return piece.matrix.some((row, y) => row.some((value, x) => (
    value && piece.x + x === cellX && piece.y + y === cellY
  )));
}

function pruneCoveredEngravings(now = performance.now()) {
  for (const [key, mark] of engravingMarks) {
    const occupied = grid[mark.y]?.[mark.x] || isPieceCoveringCell(current, mark.x, mark.y);
    if (occupied || now - mark.bornAt > 6500) engravingMarks.delete(key);
  }
}

function drawEngravings() {
  const now = performance.now();
  pruneCoveredEngravings(now);
  boardCtx.save();
  for (const mark of engravingMarks.values()) {
    const realmBright = hasRealm("jianhen");
    const level = realmBright ? Math.max(2, mark.level) : mark.level;
    const age = now - mark.bornAt;
    const fade = age <= 5000 ? 1 : Math.max(0, 1 - (age - 5000) / 1500);
    const alpha = (level > 1 ? 0.82 : 0.42) * fade;
    const x = mark.x * cell;
    const y = mark.y * cell;
    boardCtx.globalAlpha = alpha;
    boardCtx.fillStyle = level > 1 ? "#ffd45f" : "#f2c14e";
    boardCtx.font = level > 1 ? "bold 17px serif" : "14px serif";
    boardCtx.textAlign = "center";
    boardCtx.textBaseline = "middle";
    boardCtx.shadowColor = "rgba(242, 193, 78, .75)";
    boardCtx.shadowBlur = level > 1 ? 14 : 7;
    boardCtx.fillText(mark.rune, x + cell / 2, y + cell / 2);
    boardCtx.strokeStyle = level > 1 ? "#ffd45f" : "#f2c14e";
    boardCtx.lineWidth = level > 1 ? 1.6 : 1;
    boardCtx.beginPath();
    boardCtx.arc(x + cell / 2, y + cell / 2, level > 1 ? 11 : 8, 0, Math.PI * 2);
    boardCtx.stroke();
  }
  boardCtx.restore();
}

function addRunScore(points) {
  runScore += points;
  for (const [threshold, text] of whisperThresholds) {
    if (runScore >= threshold && !triggeredWhispers.has(threshold)) {
      triggeredWhispers.add(threshold);
      whisperQueue.push(text);
    }
  }
  if (hasRealm("tinglan") && runScore >= 1200 && !tideWhisperShown) {
    tideWhisperShown = true;
    whisperQueue.push("潮声已至");
  }
  showNextWhisper();
  checkPathUnlocks();
}

function showNextWhisper() {
  if (whisperShowing || !whisperQueue.length) return;
  const text = whisperQueue.shift();
  const el = document.querySelector("#whisperOverlay");
  if (!el) return;
  whisperShowing = true;
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  playBell("whisper");
  setTimeout(() => {
    el.classList.remove("show");
    whisperShowing = false;
    setTimeout(showNextWhisper, 260);
  }, 2500);
}

function triggerEcho(fullRows) {
  const now = performance.now();
  let resonantCells = 0;
  const rowCenterX = (cols * cell) / 2;
  fullRows.forEach((y) => {
    echoRipples.push({ x: rowCenterX, y: y * cell + cell / 2, bornAt: now });
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const last = echoMemory.get(key) || 0;
      if (now - last <= 3000) resonantCells++;
      echoMemory.set(key, now);
      for (const fy of [y - 1, y, y + 1]) {
        if (fy >= 0 && fy < rows) echoFlashes.push({ x, y: fy, bornAt: now });
      }
    }
  });
  for (const [key, timestamp] of echoMemory) {
    if (now - timestamp > 3000) echoMemory.delete(key);
  }
  if (!resonantCells) {
    echoStacks = 0;
    return 0;
  }
  echoStacks += 1;
  runEchoTriggers += 1;
  checkPathUnlocks();
  const bonusRate = echoStacks * 0.2;
  echoFloats.push({
    text: `回响+${Math.round(bonusRate * 100)}%`,
    x: rowCenterX,
    y: (fullRows.reduce((sum, y) => sum + y, 0) / fullRows.length) * cell + cell / 2,
    bornAt: now
  });
  playBell("echo", echoStacks);
  return bonusRate;
}

function drawEchoEffects() {
  const now = performance.now();
  echoRipples = echoRipples.filter((ripple) => now - ripple.bornAt <= 400);
  echoFlashes = echoFlashes.filter((flash) => now - flash.bornAt <= 260);
  echoFloats = echoFloats.filter((float) => now - float.bornAt <= 500);
  boardCtx.save();
  echoFlashes.forEach((flash) => {
    const age = now - flash.bornAt;
    const alpha = Math.max(0, 1 - age / 260) * 0.28;
    boardCtx.fillStyle = `rgba(242, 193, 78, ${alpha})`;
    boardCtx.fillRect(flash.x * cell + 1, flash.y * cell + 1, cell - 2, cell - 2);
  });
  echoRipples.forEach((ripple) => {
    const t = (now - ripple.bornAt) / 400;
    const radiusScale = hasRealm("zhifan") ? 1.3 : 1;
    boardCtx.globalAlpha = Math.max(0, 1 - t) * 0.7;
    boardCtx.strokeStyle = "#f2c14e";
    boardCtx.lineWidth = 2;
    boardCtx.beginPath();
    boardCtx.arc(ripple.x, ripple.y, (12 + t * 150) * radiusScale, 0, Math.PI * 2);
    boardCtx.stroke();
  });
  echoFloats.forEach((float) => {
    const t = (now - float.bornAt) / 500;
    boardCtx.globalAlpha = Math.max(0, 1 - t);
    boardCtx.fillStyle = "#ffe8ae";
    boardCtx.font = "bold 16px sans-serif";
    boardCtx.textAlign = "center";
    boardCtx.textBaseline = "middle";
    boardCtx.shadowColor = "rgba(242, 193, 78, .75)";
    boardCtx.shadowBlur = 12;
    boardCtx.fillText(float.text, float.x, float.y - t * 26);
  });
  boardCtx.restore();
}

function rotate(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function collide(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const px = piece.x + x + offsetX;
      const py = piece.y + y + offsetY;
      if (px < 0 || px >= cols || py >= rows || (py >= 0 && grid[py][px])) return true;
    }
  }
  return false;
}

function merge(piece) {
  piece.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && piece.y + y >= 0) {
      grid[piece.y + y][piece.x + x] = {
        color: piece.modifier ? specialModifiers[piece.modifier].color : piece.color,
        label: piece.label,
        tag: piece.tag,
        modifier: piece.modifier,
        rune: piece.rune,
        type: piece.type
      };
    }
  }));
}

function clearLines(tag) {
  const fullRows = [];
  for (let y = rows - 1; y >= 0; y--) {
    if (grid[y].every(Boolean)) fullRows.push(y);
  }
  if (!fullRows.length) {
    lastLockCleared = 0;
    return 0;
  }
  const curseLocked = fullRows.some((y) => grid[y].some((block) => block?.modifier === "curse"));
  if (curseLocked && fullRows.length < 2) {
    lastLockCleared = 0;
    playBell("curse");
    toast("诅咒方块拒绝结算：必须一次消除 2 行以上");
    return 0;
  }
  let cleared = fullRows.length;
  if (cleared >= 4) unlockRealm("pojie");
  markEngravings(fullRows);
  const echoBonusRate = triggerEcho(fullRows);
  const echoBonusScore = Math.round(cleared * 100 * echoBonusRate);
  const clearSet = new Set(fullRows);
  grid = grid.filter((_, index) => !clearSet.has(index));
  while (grid.length < rows) grid.unshift(Array(cols).fill(null));
  if (cleared > 0) {
    const tags = [tag];
    let bonusThisClear = echoBonusScore;
    runLines += cleared;
    pathState.totalLines = Math.max(Number(pathState.totalLines || 0), Number(localPlayer.lines || 0)) + cleared;
    savePathState();
    addRunScore(cleared * 100);
    if (echoBonusScore) addRunScore(echoBonusScore);
    advanceFinale(cleared);
    if (tag === "greed" && goldFloat) {
      localPlayer.coins += goldFloat.value;
      toast(`筹码共鸣拾取 +${goldFloat.value} 金币`);
      goldFloat = null;
    }
    if (dying && cleared >= 3) {
      dying = false;
      dyingLocks = 0;
      toast("濒死解除：三行以上续命成功");
    }
    zhongyuan = Math.min(10, zhongyuan + cleared);
    if (tag === "bomb") tags.push("bomb");
    if (current.modifier === "rewind") {
      setTimeout(() => {
        if (restoreHistory(Math.min(2, history.length - 1), true)) {
          toast("时间倒流方块触发：奖励保留，棋盘回到数步前");
        }
      }, 260);
    }
    playBell("clear", cleared);
    if (gameMode === "precision") {
      const touchedMarker = fullRows.some((y) => y === precisionMarker.y) || pieceTouchesMarker(current);
      if (touchedMarker) {
        precisionBonus += 1;
        bonusThisClear += 260;
        localPlayer.score += 260;
        addRunScore(260);
        toast("精准刻度命中：额外分数 +260");
        precisionMarker = makePrecisionMarker();
      }
    }
    post("/api/line-clear", { playerId, lines: cleared, tags }).then((data) => {
      localPlayer = data.player;
      pathState.totalLines = Math.max(Number(pathState.totalLines || 0), Number(localPlayer.lines || 0));
      savePathState();
      checkPathUnlocks();
      renderPathPanel();
      localPlayer.score += bonusThisClear;
      toast(`消除 ${cleared} 行，钟渊 +${cleared}${echoBonusScore ? `，回响分 +${echoBonusScore}` : ""}，金币 +${data.reward.total}`);
      syncHud();
    }).catch(() => {
      toast("服务器结算暂时失败，本局仍可继续");
    });
  }
  lastLockCleared = cleared;
  return cleared;
}

function nextPiece() {
  current = next;
  next = makePiece();
  canHold = true;
  if (collide(current)) {
    if (localPlayer.shields > 0) {
      localPlayer.shields -= 1;
      grid.splice(rows - 1, 1);
      grid.unshift(Array(cols).fill(null));
      toast("守命护盾抵挡了一次死亡");
    } else if (!dying) {
      dying = true;
      dyingLocks = 3;
      grid[0] = Array(cols).fill(null);
      grid[1] = Array(cols).fill(null);
      grid[2] = Array(cols).fill(null);
      toast("进入濒死状态：3 次落块内一次消 3 行以上才能续命");
    } else {
      endGame("顶部刻度被压满，时间拒绝继续流动。");
    }
  }
  drawNext();
  drawHold();
}

function drop() {
  if (!running || paused) return;
  if (!collide(current, 0, 1)) {
    current.y++;
    return;
  }
  if (current.modifier === "pendulum") {
    const now = performance.now();
    if (!current.landingDelayUntil) {
      current.landingDelayUntil = now + 1000;
      current.lastSwingAt = 0;
      toast("钟摆方块进入 1 秒摆动窗口");
      return;
    }
    if (now < current.landingDelayUntil) {
      swingPendulum(now);
      return;
    }
  }
  rememberStep(`落定 ${current.specialName || attrs[current.type].label}`);
  playBell("land");
  merge(current);
  if (current.tag === "shield") {
    localPlayer.shields += 1;
    toast("守命生成 1 个护盾");
  }
  if (current.tag === "bomb") {
    addGarbageLine();
  }
  const cleared = clearLines(current.tag);
  if (dying && cleared < 3) {
    dyingLocks -= 1;
    if (dyingLocks <= 0) {
      endGame("濒死倒计时耗尽，低沉钟鸣响起。");
      syncHud();
      return;
    }
  }
  nextPiece();
}

function swingPendulum(now) {
  if (now - current.lastSwingAt < 180) return;
  current.lastSwingAt = now;
  if (!collide(current, current.swingDir, 0)) {
    current.x += current.swingDir;
  } else {
    current.swingDir *= -1;
    if (!collide(current, current.swingDir, 0)) current.x += current.swingDir;
  }
}

function endGame(reason) {
  if (gameOver) return;
  running = false;
  gameOver = true;
  recordFinishedRun();
  playBell("gameover");
  const title = hasRealm("wangshi") ? "你已留下回响" : "钟渊沉寂…";
  toast(`${title} ${reason}`);
  const overlay = document.querySelector("#endOverlay");
  const titleEl = document.querySelector("#endTitle");
  const reasonEl = document.querySelector("#endReason");
  if (titleEl) titleEl.textContent = title;
  if (reasonEl) reasonEl.textContent = reason;
  if (overlay) overlay.classList.remove("hidden");
}

function hardDrop() {
  rememberStep("硬降前");
  while (!collide(current, 0, 1)) current.y++;
  playBell("hard");
  drop();
  draw();
}

function holdCurrentPiece() {
  if (!running || paused || !canHold) return;
  rememberStep("暂存");
  const currentType = current.type;
  if (hold) {
    current = makePiece(hold.type);
    hold = makePiece(currentType);
  } else {
    hold = makePiece(currentType);
    current = next;
    next = makePiece();
  }
  current.x = Math.floor(cols / 2) - 2;
  current.y = 0;
  canHold = false;
  playBell("hold");
  drawNext();
  drawHold();
  syncHud();
}

function addGarbageLine() {
  const hole = Math.floor(Math.random() * cols);
  grid.shift();
  grid.push(Array.from({ length: cols }, (_, index) => index === hole ? null : { color: "#5f2633", label: "尘", tag: "garbage" }));
}

function ghostY(piece) {
  const ghost = clonePiece(piece);
  while (!collide(ghost, 0, 1)) ghost.y++;
  return ghost.y;
}

function drawGhostCell(ctx, x, y, block, size = cell) {
  const left = x * size;
  const top = y * size;
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = block.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 4, top + 4, size - 8, size - 8);
  ctx.beginPath();
  ctx.arc(left + size / 2, top + size / 2, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCell(ctx, x, y, block, size = cell) {
  const left = x * size;
  const top = y * size;
  const gradient = ctx.createLinearGradient(left, top, left + size, top + size);
  gradient.addColorStop(0, block.color);
  gradient.addColorStop(1, "#11151d");
  ctx.fillStyle = gradient;
  ctx.fillRect(left + 1, top + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(left + 1, top + 1, size - 2, 5);
  ctx.strokeStyle = "rgba(255, 232, 174, .38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(left + size / 2, top + size / 2, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const inner = size * 0.31;
    const outer = size * 0.39;
    ctx.beginPath();
    ctx.moveTo(left + size / 2 + Math.cos(angle) * inner, top + size / 2 + Math.sin(angle) * inner);
    ctx.lineTo(left + size / 2 + Math.cos(angle) * outer, top + size / 2 + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(53, 215, 232, .24)";
  ctx.beginPath();
  ctx.moveTo(left + size * 0.27, top + size * 0.72);
  ctx.lineTo(left + size * 0.72, top + size * 0.27);
  ctx.stroke();
  ctx.fillStyle = "#061016";
  ctx.shadowColor = "rgba(242, 193, 78, .58)";
  ctx.shadowBlur = size * 0.16;
  ctx.font = `700 ${Math.floor(size * 0.48)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.rune || block.label, left + size / 2, top + size / 2);
  ctx.shadowBlur = 0;
}

function draw() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = "#090b10";
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.strokeStyle = "#171b24";
  for (let x = 1; x < cols; x++) {
    boardCtx.beginPath();
    boardCtx.moveTo(x * cell, 0);
    boardCtx.lineTo(x * cell, rows * cell);
    boardCtx.stroke();
  }
  for (let y = 1; y < rows; y++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, y * cell);
    boardCtx.lineTo(cols * cell, y * cell);
    boardCtx.stroke();
  }
  drawEngravings();
  grid.forEach((row, y) => row.forEach((block, x) => block && drawCell(boardCtx, x, y, block)));
  if (gameMode === "precision") drawPrecisionMarker();
  const landingY = ghostY(current);
  current.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawGhostCell(boardCtx, current.x + x, landingY + y, current);
  }));
  current.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(boardCtx, current.x + x, current.y + y, current);
  }));
  drawEchoEffects();
  if (goldFloat) {
    boardCtx.fillStyle = "#f2c14e";
    boardCtx.beginPath();
    boardCtx.arc(goldFloat.x * cell + 15, goldFloat.y * cell + 15, 13, 0, Math.PI * 2);
    boardCtx.fill();
    boardCtx.fillStyle = "#2c2104";
    boardCtx.font = "12px sans-serif";
    boardCtx.textAlign = "center";
    boardCtx.textBaseline = "middle";
    boardCtx.fillText(`+${goldFloat.value}`, goldFloat.x * cell + 15, goldFloat.y * cell + 15);
  }
}

function drawPrecisionMarker() {
  boardCtx.save();
  boardCtx.strokeStyle = "rgba(242, 193, 78, .52)";
  boardCtx.fillStyle = "rgba(242, 193, 78, .08)";
  boardCtx.lineWidth = 2;
  const x = precisionMarker.x * cell;
  const y = precisionMarker.y * cell;
  boardCtx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
  boardCtx.strokeRect(x + 5, y + 5, cell - 10, cell - 10);
  boardCtx.beginPath();
  boardCtx.arc(x + cell / 2, y + cell / 2, 8, 0, Math.PI * 2);
  boardCtx.stroke();
  boardCtx.restore();
}

function pieceTouchesMarker(piece) {
  return piece.matrix.some((row, y) => row.some((value, x) => (
    value && piece.x + x === precisionMarker.x && piece.y + y === precisionMarker.y
  )));
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const size = 24;
  const ox = Math.floor((5 - next.matrix[0].length) / 2);
  const oy = Math.floor((5 - next.matrix.length) / 2);
  next.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(nextCtx, ox + x, oy + y, next, size);
  }));
}

function drawHold() {
  if (!holdCtx || !holdCanvas) return;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!hold) return;
  const size = 24;
  const ox = Math.floor((5 - hold.matrix[0].length) / 2);
  const oy = Math.floor((5 - hold.matrix.length) / 2);
  hold.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(holdCtx, ox + x, oy + y, hold, size);
  }));
}

function update(time = 0) {
  const delta = time - last;
  last = time;
  updateModeClock(time);
  dropCounter += delta;
  if (dropCounter > currentDropInterval()) {
    drop();
    dropCounter = 0;
  }
  draw();
  requestAnimationFrame(update);
}

function updateModeClock(time) {
  if (!running || !modeStartedAt) {
    rhythmBeat = false;
    return;
  }
  const elapsed = Math.max(0, (Date.now() - modeStartedAt) / 1000);
  modeRemaining = Math.max(0, 60 - elapsed);
  survivalStep = Math.floor(elapsed / 18);
  rhythmBeat = gameMode === "rhythm" && Math.floor(time / 520) % 2 === 0;
  if (gameMode === "timed" && modeRemaining <= 0) {
    endGame(`60秒限时结束，最终分数 ${Math.floor(localPlayer.score)}。`);
  }
  syncClockHud();
}

function currentDropInterval() {
  const elapsed = modeStartedAt ? Math.max(0, (Date.now() - modeStartedAt) / 1000) : 0;
  const dayCycle = Math.floor(elapsed / 14) % 2;
  const dayNightBase = dayCycle === 0 ? 860 : 620;
  let interval = Math.min(dropInterval, dayNightBase);
  if (gameMode === "survival") interval -= survivalStep * 55;
  if (gameMode === "timed") interval -= Math.floor((60 - modeRemaining) / 10) * 35;
  if (gameMode === "rhythm" && rhythmBeat) interval = Math.min(interval, 360);
  return Math.max(260, interval);
}

function move(dir) {
  rememberStep(dir < 0 ? "左移" : "右移");
  if (!collide(current, dir, 0)) {
    current.x += dir;
    playBell("move");
  }
}

function rotateCurrent() {
  rememberStep("旋转");
  const rotated = rotate(current.matrix);
  if (!collide(current, 0, 0, rotated)) {
    current.matrix = rotated;
    playBell("rotate");
  } else if (!collide(current, 1, 0, rotated)) {
    current.x++;
    current.matrix = rotated;
    playBell("rotate");
  } else if (!collide(current, -1, 0, rotated)) {
    current.x--;
    current.matrix = rotated;
    playBell("rotate");
  }
}

function resetGame(startNow = false, forceType = null) {
  const modeSelect = document.querySelector("#modeSelect");
  if (modeSelect) gameMode = modeSelect.value;
  document.querySelector("#endOverlay")?.classList.add("hidden");
  document.body.classList.remove("finale-awake");
  window.speechSynthesis?.cancel();
  pieceBag = [];
  grid = emptyGrid();
  current = makePiece(forceType);
  next = makePiece();
  hold = null;
  canHold = true;
  running = startNow;
  paused = false;
  gameOver = false;
  history = [];
  zhongyuan = 0;
  dying = false;
  dyingLocks = 0;
  precisionMarker = makePrecisionMarker();
  precisionBonus = 0;
  runLines = 0;
  runScore = 0;
  runEchoTriggers = 0;
  tideWhisperShown = false;
  finaleProgress = 0;
  finaleAwake = false;
  engravingMarks = new Map();
  lastEngravings = new Map();
  triggeredWhispers = new Set();
  whisperQueue = [];
  whisperShowing = false;
  echoMemory = new Map();
  echoStacks = 0;
  echoRipples = [];
  echoFlashes = [];
  echoFloats = [];
  document.querySelector("#whisperOverlay")?.classList.remove("show");
  survivalStep = 0;
  modeRemaining = 60;
  modeStartedAt = startNow ? Date.now() : 0;
  dropCounter = 0;
  drawNext();
  drawHold();
  renderHistory();
  syncHud();
  toast(startNow ? "方块战场已开局" : "点击开始，进入钟渊试炼");
}

async function startGame() {
  if (!getSessionToken()) {
    toast("请先在右上角进入身份中心登录或注册");
    return;
  }
  unlockRealm("wenzhong");
  let forceType = null;
  if (!running && localPlayer.inventory && localPlayer.inventory.luckyBlocks > 0) {
    try {
      const data = await post("/api/item/use", { itemId: "lucky_crit" });
      localPlayer = data.player;
      forceType = data.effect.forcePiece;
    } catch {
      forceType = null;
    }
  }
  if (gameOver || forceType) resetGame(false, forceType);
  const modeSelect = document.querySelector("#modeSelect");
  gameMode = modeSelect?.value || gameMode || "standard";
  running = true;
  paused = false;
  if (!modeStartedAt) modeStartedAt = Date.now();
  syncHud();
  toast(forceType ? "回声长条生效：钟鸣进场" : `${modeNames[gameMode]} 已开局`);
}

function syncHud() {
  document.querySelector("#coins").textContent = Math.floor(localPlayer.coins);
  document.querySelector("#score").textContent = Math.floor(localPlayer.score);
  document.querySelector("#lines").textContent = localPlayer.lines;
  document.querySelector("#shields").textContent = localPlayer.shields;
  document.querySelector("#playerName").value = localPlayer.name || "";
  document.querySelector("#pauseBtn").textContent = paused ? "继续" : "暂停";
  document.querySelector("[data-player-name]").textContent = localPlayer.name || "玩家";
  document.querySelector("[data-player-coins]").textContent = Math.floor(localPlayer.coins).toLocaleString("zh-CN");
  const zhongyuanValue = document.querySelector("#zhongyuanValue");
  const zhongyuanBar = document.querySelector("#zhongyuanBar");
  const dangerState = document.querySelector("#dangerState");
  const modeText = document.querySelector("#modeText");
  const speedText = document.querySelector("#speedText");
  const specialText = document.querySelector("#specialText");
  const rewindBtn = document.querySelector("#rewindBtn");
  if (zhongyuanValue) zhongyuanValue.textContent = `${zhongyuan}/10`;
  if (zhongyuanBar) zhongyuanBar.style.width = `${zhongyuan * 10}%`;
  if (dangerState) dangerState.textContent = dying ? `濒死 ${dyingLocks}` : "稳定";
  if (modeText) modeText.textContent = modeNames[gameMode] || "昼夜标准";
  if (speedText) speedText.textContent = `${currentDropInterval()}ms`;
  if (specialText) specialText.textContent = current.specialName ? `${current.specialName} · ${current.type}` : `${current.type} · ${attrs[current.type].label}`;
  if (rewindBtn) rewindBtn.disabled = zhongyuan < 10 || !history.length;
  syncClockHud();
  syncTimeOverlay();
}

function syncClockHud() {
  const clockState = document.querySelector("#clockState");
  const modeTimer = document.querySelector("#modeTimer");
  const rhythmLight = document.querySelector("#rhythmLight");
  if (clockState) {
    const elapsed = modeStartedAt ? Math.max(0, (Date.now() - modeStartedAt) / 1000) : 0;
    clockState.textContent = Math.floor(elapsed / 14) % 2 === 0 ? "白昼慢落" : "夜幕急坠";
  }
  if (modeTimer) {
    modeTimer.textContent = gameMode === "timed"
      ? `${Math.ceil(modeRemaining)}s`
      : `阶梯 ${survivalStep}`;
  }
  if (rhythmLight) rhythmLight.classList.toggle("active", rhythmBeat);
  syncTimeOverlay();
}

function syncTimeOverlay() {
  const overlayLines = document.querySelector("#timeOverlayLines");
  const overlayRemaining = document.querySelector("#timeOverlayRemaining");
  const finaleValue = document.querySelector("#finaleValue");
  const finaleBar = document.querySelector("#finaleBar");
  if (overlayLines) overlayLines.textContent = runLines;
  if (overlayRemaining) overlayRemaining.textContent = gameMode === "timed" ? `${Math.ceil(modeRemaining)}s` : "--";
  if (finaleValue) finaleValue.textContent = `${finaleProgress}%`;
  if (finaleBar) finaleBar.style.width = `${finaleProgress}%`;
}

function renderMarket(data) {
  if (!document.querySelector("#stocks") || !document.querySelector("#futures")) return;
  document.querySelector("#stocks").innerHTML = data.stocks.map((s) => `
    <div class="market-row">
      <small>${s.code}</small>
      <div><b>${s.name}</b><br><small>${s.sector} 热度 ${s.retailHeat}%</small></div>
      <b class="${s.change >= 0 ? "up" : "down"}">${s.price.toFixed(2)} ${s.change}%</b>
    </div>
  `).join("");
  document.querySelector("#futures").innerHTML = data.futures.map((f) => `
    <div class="market-row">
      <small>${f.code}</small>
      <div><b>${f.name}</b><br><small>杠杆 ${f.leverage.join("x / ")}x</small></div>
      <b>${f.price}</b>
    </div>
  `).join("");
  document.querySelector("#eventTicker").textContent = data.announcements[0]
    ? `${data.announcements[0].title}：${data.announcements[0].text}`
    : `下个全服事件 ${Math.ceil(data.nextEventIn / 1000)} 秒`;
}

function renderChat(messages) {
  if (!document.querySelector("#chat")) return;
  document.querySelector("#chat").innerHTML = messages.map((m) => `
    <div class="message ${m.kind}">
      <strong>${escapeHtml(m.author)}</strong>
      <span>${escapeHtml(m.text)}</span>
    </div>
  `).join("");
}

function toast(text) {
  document.querySelector("#eventTicker").textContent = text;
}

function ensureFx() {
  const AudioClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioClass) return null;
  if (!fxContext) fxContext = new AudioClass();
  if (fxContext.state === "suspended") fxContext.resume();
  return fxContext;
}

function ring(ctx, freq, when, duration, gainValue, type = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.04);
}

function playBell(kind, cleared = 1) {
  const ctx = ensureFx();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "clear") {
    ring(ctx, 880 + cleared * 80, now, 0.42, 0.08);
    ring(ctx, 1320 + cleared * 40, now + 0.04, 0.32, 0.035);
  } else if (kind === "gameover") {
    ring(ctx, 146.83, now, 1.8, 0.12);
    ring(ctx, 73.42, now + 0.08, 2.2, 0.09);
  } else if (kind === "curse") {
    ring(ctx, 261.63, now, 0.5, 0.06);
    ring(ctx, 246.94, now + 0.06, 0.7, 0.045);
  } else if (kind === "whisper") {
    ring(ctx, 1046.5, now, 0.34, 0.028);
    ring(ctx, 1568, now + 0.025, 0.28, 0.018);
  } else if (kind === "echo") {
    ring(ctx, 196, now, 0.95 + Math.min(3, cleared) * 0.16, 0.055);
    ring(ctx, 392, now + 0.04, 0.78, 0.032);
  } else if (kind === "path") {
    ring(ctx, 523.25, now, 0.8, 0.06);
    ring(ctx, 1046.5, now + 0.08, 0.7, 0.035);
  } else if (kind === "move") {
    ring(ctx, 176, now, 0.045, 0.015, "square");
  } else if (kind === "rotate") {
    ring(ctx, 277, now, 0.055, 0.022, "triangle");
    ring(ctx, 370, now + 0.025, 0.055, 0.015, "triangle");
  } else if (kind === "hard") {
    ring(ctx, 82, now, 0.18, 0.07, "sawtooth");
    ring(ctx, 55, now + 0.04, 0.18, 0.045, "triangle");
  } else if (kind === "land") {
    ring(ctx, 110, now, 0.13, 0.035);
  } else if (kind === "hold") {
    ring(ctx, 392, now, 0.1, 0.03, "triangle");
    ring(ctx, 523.25, now + 0.05, 0.12, 0.022, "triangle");
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

async function getState() {
  try {
    const token = getSessionToken();
    const res = await fetch(`/api/state${token ? `?sessionToken=${encodeURIComponent(token)}` : ""}`);
    if (!res.ok) throw new Error(`state ${res.status}`);
    const data = await res.json();
    localPlayer = data.player;
    pathState.totalLines = Math.max(Number(pathState.totalLines || 0), Number(localPlayer.lines || 0));
    savePathState();
    checkPathUnlocks();
    applyPathEffects();
    renderPathPanel();
    syncHud();
    renderMarket(data);
    renderChat(data.messages);
    const online = document.querySelector("[data-online]");
    if (online) online.textContent = data.onlinePlayers;
    const system = document.querySelector("#systemDock");
    if (system) {
      const weather = data.external?.weather;
      system.innerHTML = `<span class="clock">${new Date(data.serverTime).toLocaleString("zh-CN", { hour12: false })}</span><b>v${data.version || "dev"}</b><small>${weather?.city || "济南"} · ${weather?.temperature || "--"} · ${weather?.text || ""}</small>`;
    }
    const feed = document.querySelector("#battleFeed");
    if (feed) {
      feed.innerHTML = data.announcements.map((item) => `<div><b>${item.title}</b><span>${item.text}</span></div>`).join("");
    }
  } catch (error) {
    toast("连接服务器失败，正在重试...");
  }
}

async function post(url, body) {
  const token = getSessionToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`request ${res.status}`);
  return res.json();
}

document.addEventListener("keydown", (event) => {
  if (!controlKeys.has(event.code) && !controlKeys.has(event.key)) return;
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  event.preventDefault();
  if (!running) startGame();
  if (paused) return;
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
  if (event.key === "ArrowDown") drop();
  if (event.key === "ArrowUp") rotateCurrent();
  if (event.key === "c" || event.key === "C" || event.code === "KeyC") holdCurrentPiece();
  if (event.code === "Space") {
    hardDrop();
  }
});

document.querySelector("#startBtn").addEventListener("click", () => {
  startGame();
});
document.querySelector("#pauseBtn").addEventListener("click", () => {
  paused = !paused;
  syncHud();
});
document.querySelector("#restartBtn").addEventListener("click", () => resetGame(true));
document.querySelector("#cycleRestartBtn").addEventListener("click", () => resetGame(true));
document.querySelector("#pathToggle").addEventListener("click", () => {
  renderPathPanel();
  document.querySelector("#pathPanel").classList.add("open");
});
document.querySelector("#pathClose").addEventListener("click", () => {
  document.querySelector("#pathPanel").classList.remove("open");
});
document.querySelector("#modeSelect").addEventListener("change", (event) => {
  gameMode = event.target.value;
  if (!running) {
    modeRemaining = 60;
    survivalStep = 0;
    syncHud();
    toast(`战场模式切换为：${modeNames[gameMode]}`);
  } else {
    toast("当前局结束或重开后生效");
  }
});
document.querySelector("#rewindBtn").addEventListener("click", () => {
  if (zhongyuan < 10) {
    toast("钟渊能量未满，无法回溯");
    return;
  }
  const index = Number(document.querySelector("#rewindSelect").value || 0);
  if (restoreHistory(index, true)) {
    zhongyuan = 0;
    syncHud();
  }
});
document.querySelector("#saveName").addEventListener("click", async () => {
  try {
    const data = await post("/api/player", { name: document.querySelector("#playerName").value });
    localPlayer = data.player;
    syncHud();
  } catch {
    toast("昵称保存失败，稍后再试");
  }
});
const chatForm = document.querySelector("#chatForm");
if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#chatInput");
    if (!input.value.trim()) return;
    try {
      const data = await post("/api/chat", { text: input.value.trim() });
      input.value = "";
      if (data.messages) renderChat(data.messages);
    } catch {
      toast("聊天发送失败");
    }
  });
}
document.querySelectorAll(".touch-controls button").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (!running) startGame();
    const action = button.dataset.action;
    if (action === "left") move(-1);
    if (action === "right") move(1);
    if (action === "rotate") rotateCurrent();
    if (action === "drop") hardDrop();
  });
});

setInterval(() => {
  if (!goldFloat && Math.random() < 0.25) {
    goldFloat = {
      x: Math.floor(Math.random() * cols),
      y: Math.floor(Math.random() * 12) + 2,
      value: [50, 100, 200][Math.floor(Math.random() * 3)]
    };
    setTimeout(() => {
      goldFloat = null;
    }, 10000);
  }
}, 3000);

setInterval(getState, 2500);
resetGame(false);
applyPathEffects();
renderPathPanel();
getState();
requestAnimationFrame(update);
