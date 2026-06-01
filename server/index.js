const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const playerPort = Number(process.env.PLAYER_PORT || 8080);
const adminPort = Number(process.env.ADMIN_PORT || 18052);
const adminUser = process.env.ADMIN_USER || "root";
const adminPassword = process.env.ADMIN_PASSWORD || "gambleMaster666";

const stocks = [
  ["000001", "平安银行", "银行", 10.5, 0.25, 0.1],
  ["600519", "贵州茅台", "白酒", 1680, 0.45, 0.1],
  ["002475", "立讯精密", "科技", 32.3, 0.7, 0.1],
  ["300750", "宁德时代", "新能源", 180.5, 0.9, 0.2],
  ["000858", "五粮液", "白酒", 145, 0.45, 0.1],
  ["601318", "中国平安", "保险", 42.8, 0.25, 0.1],
  ["688981", "中芯国际", "半导体", 48.6, 0.7, 0.2],
  ["000002", "万科A", "地产", 11.2, 0.95, 0.1]
].map(([code, name, sector, price, control, limit]) => ({
  code,
  name,
  sector,
  price,
  open: price,
  change: 0,
  control,
  limit,
  retailHeat: Math.round(25 + Math.random() * 65)
}));

const futures = [
  { code: "BTC", name: "比特币仿盘", price: 68240, leverage: [1, 2, 5, 10] },
  { code: "GOLD", name: "黄金眼泪", price: 2360, leverage: [1, 2, 5] },
  { code: "TETRIS", name: "俄罗斯方块指数", price: 666, leverage: [1, 2, 5, 10, 20] }
];

const npcs = [
  ["老韭菜", "要崩了要崩了，我先跑一步。"],
  ["李老师", "内幕票已经放出来了，懂的都懂。"],
  ["王姐", "刚又赚了一波，收益图就不发了怕你们眼红。"],
  ["程序员", "庄家代码绝对有后门，这走势不像随机数。"],
  ["神秘人", "内幕：新能源尾盘可能有动作，准确率五五开。"],
  ["庄家", "你们的止损线，我看得很清楚。"],
  ["天台保安", "今天预约人数略多，请大家排队。"],
  ["量化小哥", "模型显示，情绪越亢奋，回撤越礼貌。"],
  ["镰刀实习生", "刚入职，先从收割模拟盘开始。"],
  ["韭菜导师", "别怕，越跌越买，直到没有金币。"]
];

const state = {
  startedAt: Date.now(),
  bankerPool: 0,
  lossTarget: 95,
  inflation: 1,
  onlinePlayers: 0,
  players: {},
  messages: [],
  announcements: [],
  stocks,
  futures,
  economy: {
    initialCoins: 1000,
    lineReward: 10,
    critBonusPerLine: 20,
    luckyBlockCost: 200,
    stockFee: 0.001
  },
  flags: {
    globalMuted: false,
    rageMode: false,
    nextEventAt: Date.now() + 30000
  }
};

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((pair) => {
    const index = pair.indexOf("=");
    return [pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1))];
  }));
}

function isAdmin(req) {
  return parseCookies(req).casino_admin === "ok";
}

function serveFile(req, res, fallback = "index.html") {
  const clean = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || fallback;
  const target = path.normalize(path.join(publicDir, clean));
  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(publicDir, fallback);
  const ext = path.extname(file);
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store"
  });
  fs.createReadStream(file).pipe(res);
}

function pushMessage(author, text, kind = "chat") {
  state.messages.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    author,
    text,
    kind
  });
  state.messages = state.messages.slice(0, 80);
}

function ensurePlayer(id) {
  if (!id) id = crypto.randomUUID();
  if (!state.players[id]) {
    state.players[id] = {
      id,
      name: `玩家${id.slice(0, 4)}`,
      coins: state.economy.initialCoins,
      score: 0,
      lines: 0,
      shields: 0,
      harvested: 0,
      banned: false,
      updatedAt: Date.now()
    };
    pushMessage("系统", `${state.players[id].name} 进入极乐赌场，初始金币 ${state.economy.initialCoins}`, "system");
  }
  return state.players[id];
}

function snapshot(playerId) {
  const player = ensurePlayer(playerId);
  player.updatedAt = Date.now();
  state.onlinePlayers = Object.values(state.players).filter((p) => Date.now() - p.updatedAt < 45000).length;
  return {
    serverTime: new Date().toISOString(),
    player,
    stocks: state.stocks,
    futures: state.futures,
    bankerPool: Math.round(state.bankerPool),
    lossTarget: state.lossTarget,
    inflation: state.inflation,
    messages: state.messages,
    announcements: state.announcements.slice(0, 12),
    economy: state.economy,
    nextEventIn: Math.max(0, state.flags.nextEventAt - Date.now()),
    onlinePlayers: state.onlinePlayers
  };
}

function settleLines(player, lines, tags = []) {
  const base = lines * state.economy.lineReward * state.inflation;
  const crit = tags.includes("crit") ? lines * state.economy.critBonusPerLine * state.inflation : 0;
  const selfBoom = tags.includes("bomb") ? 300 : 0;
  const total = Math.round(base + crit + selfBoom);
  player.coins += total;
  player.score += lines * 100 + total;
  player.lines += lines;
  if (tags.includes("shield")) player.shields += 1;
  if (tags.includes("bomb")) pushMessage("全服广播", `${player.name} 自爆了，拿走 300 分但头顶开始发凉`, "danger");
  return { total, base, crit, selfBoom };
}

function moveMarket() {
  for (const stock of state.stocks) {
    const retailPressure = stock.retailHeat > 60 && Math.random() < stock.control * 0.2;
    let delta = (Math.random() - 0.48) * 0.018;
    if (retailPressure) {
      delta = -(0.07 + Math.random() * 0.03);
      pushMessage("庄家", `${stock.name} 散户太挤，盘口突然被砸`, "danger");
    } else if (stock.retailHeat < 25 && Math.random() < stock.control * 0.15) {
      delta = 0.05 + Math.random() * 0.03;
    }
    const limit = state.flags.rageMode ? 0.2 : stock.limit;
    delta = Math.max(-limit, Math.min(limit, delta));
    stock.price = Math.max(0.01, Number((stock.price * (1 + delta)).toFixed(2)));
    stock.change = Number(((stock.price / stock.open - 1) * 100).toFixed(2));
    stock.retailHeat = Math.max(0, Math.min(100, Math.round(stock.retailHeat + (Math.random() - 0.5) * 18)));
  }
  for (const item of state.futures) {
    const swing = item.code === "TETRIS" ? 0.035 : 0.012;
    item.price = Number((item.price * (1 + (Math.random() - 0.5) * swing)).toFixed(item.code === "GOLD" ? 1 : 2));
  }
}

function triggerWorldEvent() {
  const events = [
    ["牛市方块", "全服在线玩家 +50 金币", () => Object.values(state.players).forEach((p) => { p.coins += 50; })],
    ["熊市方块", "当前赌场池笑纳 100 金币", () => { state.bankerPool += 100; }],
    ["内幕消息方块", "内幕：TETRIS 指数即将大幅波动，准确率 70%", () => {}],
    ["韭菜祝福", "下一块更容易出现暴击属性", () => {}],
    ["镰刀诅咒", "全场旋转手感开始变硬", () => {}]
  ];
  const event = events[Math.floor(Math.random() * events.length)];
  event[2]();
  state.announcements.unshift({ at: new Date().toISOString(), title: event[0], text: event[1] });
  state.announcements = state.announcements.slice(0, 20);
  pushMessage("系统事件", `${event[0]}：${event[1]}`, "event");
  state.flags.nextEventAt = Date.now() + 30000;
}

function adminAction(action, payload) {
  if (action === "stock") {
    const stock = state.stocks.find((item) => item.code === payload.code);
    if (stock) {
      const pct = Number(payload.percent || 0);
      stock.price = Number((stock.price * (1 + pct / 100)).toFixed(2));
      stock.change = Number(((stock.price / stock.open - 1) * 100).toFixed(2));
      pushMessage("后台公告", `${stock.name} 被手动调整 ${pct}%`, "admin");
    }
  }
  if (action === "future") {
    const future = state.futures.find((item) => item.code === payload.code);
    if (future) future.price = Number(payload.price || future.price);
  }
  if (action === "lossTarget") state.lossTarget = Math.max(0, Math.min(100, Number(payload.value || 95)));
  if (action === "inflation") state.inflation = Math.max(0.1, Math.min(10, Number(payload.value || 1)));
  if (action === "announce") pushMessage("全服公告", String(payload.text || "国家队疑似入场"), "admin");
  if (action === "coins") {
    const player = ensurePlayer(payload.playerId);
    player.coins += Number(payload.amount || 0);
  }
  if (action === "leekDay") {
    for (const player of Object.values(state.players)) {
      player.coins = Math.floor(player.coins / 2);
      player.harvested += 1;
    }
    state.bankerPool += 1000;
    pushMessage("危险操作", "韭菜日已触发：全员金币减半，庄家池膨胀", "danger");
  }
  if (action === "rage") {
    state.flags.rageMode = Boolean(payload.enabled);
    pushMessage("危险操作", `庄家狂暴模式：${state.flags.rageMode ? "开启" : "关闭"}`, "danger");
  }
}

async function api(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/state") return sendJson(res, snapshot(url.searchParams.get("playerId")));
  if (url.pathname === "/api/line-clear" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    return sendJson(res, { player, reward: settleLines(player, Number(body.lines || 0), body.tags || []) });
  }
  if (url.pathname === "/api/player" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    if (body.name) player.name = String(body.name).slice(0, 16);
    return sendJson(res, { player });
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    if (state.flags.globalMuted) return sendJson(res, { ok: false, error: "全局禁言中" }, 403);
    pushMessage(player.name, String(body.text || "").slice(0, 120), "chat");
    return sendJson(res, { ok: true, messages: state.messages });
  }
  res.writeHead(404);
  res.end("Not found");
}

async function admin(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    if (body.user === adminUser && body.password === adminPassword) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": "casino_admin=ok; Path=/; SameSite=Lax"
      });
      res.end(JSON.stringify({ ok: true }));
    } else {
      sendJson(res, { ok: false }, 401);
    }
    return;
  }
  if (url.pathname === "/admin/api/state") {
    if (!isAdmin(req)) return sendJson(res, { ok: false }, 401);
    return sendJson(res, { ...snapshot(url.searchParams.get("playerId")), players: Object.values(state.players) });
  }
  if (url.pathname === "/admin/api/action" && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, { ok: false }, 401);
    const body = await readBody(req);
    adminAction(body.action, body.payload || {});
    return sendJson(res, { ok: true, state: snapshot() });
  }
  serveFile(req, res, "admin.html");
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return api(req, res);
  serveFile(req, res, "index.html");
}).listen(playerPort, () => {
  console.log(`Player app listening on ${playerPort}`);
});

http.createServer((req, res) => {
  admin(req, res);
}).listen(adminPort, () => {
  console.log(`Admin app listening on ${adminPort}`);
});

setInterval(moveMarket, 4000);
setInterval(() => {
  const [author, text] = npcs[Math.floor(Math.random() * npcs.length)];
  pushMessage(author, text);
}, 9000);
setInterval(() => {
  if (Date.now() >= state.flags.nextEventAt) triggerWorldEvent();
}, 1000);

pushMessage("系统", "极乐赌场开盘，金币无真实价值，但情绪很真实。", "system");
