const boardCanvas = document.querySelector("#board");
const boardCtx = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next");
const nextCtx = nextCanvas.getContext("2d");
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
  I: { tag: "crit", label: "暴", color: "#35d7e8" },
  O: { tag: "shield", label: "盾", color: "#f2c14e" },
  T: { tag: "chaos", label: "乱", color: "#b879ff" },
  L: { tag: "greed", label: "财", color: "#ff9f43" },
  J: { tag: "freeze", label: "冻", color: "#4d8dff" },
  S: { tag: "poison", label: "毒", color: "#45d483" },
  Z: { tag: "bomb", label: "爆", color: "#ff5c6c" }
};

const specialModifiers = {
  rewind: { name: "时间倒流", label: "时", color: "#d6f7ff", desc: "消行后棋盘回退到数步前，但奖励保留" },
  pendulum: { name: "钟摆", label: "摆", color: "#ffe08a", desc: "落地前会左右摆动 1 秒" },
  curse: { name: "诅咒", label: "咒", color: "#f06aff", desc: "所在满行必须一次消除 2 行以上才会真正清掉" }
};

const modeNames = {
  standard: "昼夜标准",
  timed: "60秒限时",
  precision: "精准刻度",
  survival: "倒计时生存",
  rhythm: "节拍坠落"
};

let grid = emptyGrid();
let current = makePiece();
let next = makePiece();
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
const controlKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"]);

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

function makePiece(forceType) {
  const keys = Object.keys(shapes);
  const type = forceType || keys[Math.floor(Math.random() * keys.length)];
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
  goldFloat = snapshot.goldFloat ? { ...snapshot.goldFloat } : null;
  dying = snapshot.dying;
  dyingLocks = snapshot.dyingLocks;
  precisionMarker = { ...snapshot.precisionMarker };
  precisionBonus = snapshot.precisionBonus;
  if (keepReward) localPlayer = playerNow;
  drawNext();
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
    const age = now - mark.bornAt;
    const fade = age <= 5000 ? 1 : Math.max(0, 1 - (age - 5000) / 1500);
    const alpha = (mark.level > 1 ? 0.82 : 0.42) * fade;
    const x = mark.x * cell;
    const y = mark.y * cell;
    boardCtx.globalAlpha = alpha;
    boardCtx.fillStyle = mark.level > 1 ? "#ffd45f" : "#f2c14e";
    boardCtx.font = mark.level > 1 ? "bold 17px serif" : "14px serif";
    boardCtx.textAlign = "center";
    boardCtx.textBaseline = "middle";
    boardCtx.shadowColor = "rgba(242, 193, 78, .75)";
    boardCtx.shadowBlur = mark.level > 1 ? 14 : 7;
    boardCtx.fillText(mark.rune, x + cell / 2, y + cell / 2);
    boardCtx.strokeStyle = mark.level > 1 ? "#ffd45f" : "#f2c14e";
    boardCtx.lineWidth = mark.level > 1 ? 1.6 : 1;
    boardCtx.beginPath();
    boardCtx.arc(x + cell / 2, y + cell / 2, mark.level > 1 ? 11 : 8, 0, Math.PI * 2);
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
  showNextWhisper();
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
  markEngravings(fullRows);
  const clearSet = new Set(fullRows);
  grid = grid.filter((_, index) => !clearSet.has(index));
  while (grid.length < rows) grid.unshift(Array(cols).fill(null));
  if (cleared > 0) {
    const tags = [tag];
    let bonusThisClear = 0;
    runLines += cleared;
    addRunScore(cleared * 100);
    advanceFinale(cleared);
    if (tag === "greed" && goldFloat) {
      localPlayer.coins += goldFloat.value;
      toast(`贪财拾取 +${goldFloat.value} 金币`);
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
        bonusThisClear = 260;
        localPlayer.score += bonusThisClear;
        addRunScore(bonusThisClear);
        toast("精准刻度命中：额外分数 +260");
        precisionMarker = makePrecisionMarker();
      }
    }
    post("/api/line-clear", { playerId, lines: cleared, tags }).then((data) => {
      localPlayer = data.player;
      localPlayer.score += bonusThisClear;
      toast(`消除 ${cleared} 行，钟渊 +${cleared}，金币 +${data.reward.total}`);
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
  if (collide(current)) {
    if (localPlayer.shields > 0) {
      localPlayer.shields -= 1;
      grid.splice(rows - 1, 1);
      grid.unshift(Array(cols).fill(null));
      toast("铁壁护盾抵挡了一次死亡");
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
  merge(current);
  if (current.tag === "shield") {
    localPlayer.shields += 1;
    toast("铁壁生成 1 个护盾");
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
  playBell("gameover");
  toast(`钟渊沉寂… ${reason}`);
  const overlay = document.querySelector("#endOverlay");
  const reasonEl = document.querySelector("#endReason");
  if (reasonEl) reasonEl.textContent = reason;
  if (overlay) overlay.classList.remove("hidden");
}

function hardDrop() {
  rememberStep("硬降前");
  while (!collide(current, 0, 1)) current.y++;
  drop();
  draw();
}

function addGarbageLine() {
  const hole = Math.floor(Math.random() * cols);
  grid.shift();
  grid.push(Array.from({ length: cols }, (_, index) => index === hole ? null : { color: "#5f2633", label: "罚", tag: "garbage" }));
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
  ctx.beginPath();
  ctx.moveTo(left + size * 0.2, top + size * 0.5);
  ctx.lineTo(left + size * 0.8, top + size * 0.5);
  ctx.moveTo(left + size * 0.5, top + size * 0.2);
  ctx.lineTo(left + size * 0.5, top + size * 0.8);
  ctx.stroke();
  ctx.fillStyle = "#071017";
  ctx.font = `${Math.floor(size * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.rune || block.label, left + size / 2, top + size / 2);
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
  current.matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value) drawCell(boardCtx, current.x + x, current.y + y, current);
  }));
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
  if (!collide(current, dir, 0)) current.x += dir;
}

function rotateCurrent() {
  rememberStep("旋转");
  const rotated = rotate(current.matrix);
  if (!collide(current, 0, 0, rotated)) {
    current.matrix = rotated;
  } else if (!collide(current, 1, 0, rotated)) {
    current.x++;
    current.matrix = rotated;
  } else if (!collide(current, -1, 0, rotated)) {
    current.x--;
    current.matrix = rotated;
  }
}

function resetGame(startNow = false, forceType = null) {
  const modeSelect = document.querySelector("#modeSelect");
  if (modeSelect) gameMode = modeSelect.value;
  document.querySelector("#endOverlay")?.classList.add("hidden");
  document.body.classList.remove("finale-awake");
  window.speechSynthesis?.cancel();
  grid = emptyGrid();
  current = makePiece(forceType);
  next = makePiece();
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
  finaleProgress = 0;
  finaleAwake = false;
  engravingMarks = new Map();
  lastEngravings = new Map();
  triggeredWhispers = new Set();
  whisperQueue = [];
  whisperShowing = false;
  document.querySelector("#whisperOverlay")?.classList.remove("show");
  survivalStep = 0;
  modeRemaining = 60;
  modeStartedAt = startNow ? Date.now() : 0;
  dropCounter = 0;
  drawNext();
  renderHistory();
  syncHud();
  toast(startNow ? "方块战场已开局" : "点击开始，进入方块战场");
}

async function startGame() {
  if (!getSessionToken()) {
    toast("请先在右上角进入身份中心登录或注册");
    return;
  }
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
  toast(forceType ? "暴击幸运块生效：长条进场" : `${modeNames[gameMode]} 已开局`);
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

function ring(ctx, freq, when, duration, gainValue) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
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
getState();
requestAnimationFrame(update);
