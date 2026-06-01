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
const controlKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"]);

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

function makePiece(forceType) {
  const keys = Object.keys(shapes);
  const type = forceType || keys[Math.floor(Math.random() * keys.length)];
  return {
    type,
    matrix: shapes[type].map((row) => [...row]),
    x: Math.floor(cols / 2) - 2,
    y: 0,
    ...attrs[type]
  };
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
      grid[piece.y + y][piece.x + x] = { color: piece.color, label: piece.label, tag: piece.tag };
    }
  }));
}

function clearLines(tag) {
  let cleared = 0;
  outer: for (let y = rows - 1; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y][x]) continue outer;
    }
    grid.splice(y, 1);
    grid.unshift(Array(cols).fill(null));
    cleared++;
    y++;
  }
  if (cleared > 0) {
    const tags = [tag];
    if (tag === "greed" && goldFloat) {
      localPlayer.coins += goldFloat.value;
      toast(`贪财拾取 +${goldFloat.value} 金币`);
      goldFloat = null;
    }
    post("/api/line-clear", { playerId, lines: cleared, tags }).then((data) => {
      localPlayer = data.player;
      toast(`消除 ${cleared} 行，金币 +${data.reward.total}`);
      syncHud();
    }).catch(() => {
      toast("服务器结算暂时失败，本局仍可继续");
    });
  }
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
    } else {
      running = false;
      gameOver = true;
      toast("爆仓式失败，点击重开");
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
  merge(current);
  if (current.tag === "shield") {
    localPlayer.shields += 1;
    toast("铁壁生成 1 个护盾");
  }
  if (current.tag === "bomb") {
    addGarbageLine();
  }
  clearLines(current.tag);
  nextPiece();
}

function hardDrop() {
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
  ctx.fillStyle = block.color;
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, 5);
  ctx.fillStyle = "#071017";
  ctx.font = `${Math.floor(size * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.label, x * size + size / 2, y * size + size / 2);
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
  grid.forEach((row, y) => row.forEach((block, x) => block && drawCell(boardCtx, x, y, block)));
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
  dropCounter += delta;
  if (dropCounter > dropInterval) {
    drop();
    dropCounter = 0;
  }
  draw();
  requestAnimationFrame(update);
}

function move(dir) {
  if (!collide(current, dir, 0)) current.x += dir;
}

function rotateCurrent() {
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
  grid = emptyGrid();
  current = makePiece(forceType);
  next = makePiece();
  running = startNow;
  paused = false;
  gameOver = false;
  dropCounter = 0;
  drawNext();
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
  running = true;
  paused = false;
  syncHud();
  toast(forceType ? "暴击幸运块生效：长条进场" : "方块战场已开局");
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
      system.innerHTML = `<span>${new Date(data.serverTime).toLocaleString("zh-CN", { hour12: false })}</span><b>${data.version || "dev"}</b><small>${weather?.city || "济南"} ${weather?.temperature || "--"} ${weather?.text || ""}</small>`;
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
