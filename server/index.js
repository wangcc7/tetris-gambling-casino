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
const world = {
  name: "极乐交易城",
  tagline: "用方块铸币，用行情下注，用公会翻盘",
  premise: "玩家是被庄家 AI 拉进交易城的方块矿工。消除方块会铸造金币，金币进入股票、期货、公会和聊天室情绪战，所有荣耀都来自一次次对抗庄家的波动。",
  factions: ["方块矿工", "庄家柜台", "韭菜公会", "内幕广播台"],
  loop: ["方块战场铸币", "市场下注放大情绪", "公会抱团反杀", "排行榜制造名声", "聊天室扩散故事"]
};

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
  { name: "老韭菜", personality: "悲观矿工", strategy: "经常喊崩盘，偶尔蒙对", line: "柜台灯变红了，我闻到砸盘味。" },
  { name: "李老师", personality: "喊单讲师", strategy: "喊单后反向操作", line: "今晚的方块指数有剧本，懂的进场。" },
  { name: "王姐", personality: "收益晒图党", strategy: "晒收益图吸引跟买", line: "我在酒水板块捡了三轮金币，截图先不发。" },
  { name: "程序员", personality: "漏洞猎人", strategy: "质疑庄家代码", line: "庄家柜台的随机数不干净，这个我很熟。" },
  { name: "神秘人", personality: "内幕广播员", strategy: "50% 准确率内幕", line: "广播台消息：新能源仓门可能要关。" },
  { name: "庄家柜台", personality: "镰刀 AI", strategy: "嘲讽亏损玩家", line: "你的成本线已经进入我的视野。" },
  { name: "天台保安", personality: "冷幽默", strategy: "亏损事件刷存在感", line: "天台不是出口，排行榜才是。" },
  { name: "量化小哥", personality: "理性疯", strategy: "解释一切波动", line: "情绪热度超过 70，柜台通常会反手。" },
  { name: "镰刀实习生", personality: "柜台新人", strategy: "庄家跟班", line: "我刚学会定向收割按钮，手有点痒。" },
  { name: "韭菜导师", personality: "反向导师", strategy: "鼓励越跌越买", line: "别急着跑，亏损也是交易城履历。" }
];

const guilds = [
  { id: "g-sickle", name: "镰刀研究院", level: 5, members: 37, treasury: 18888 },
  { id: "g-leek", name: "天选韭菜团", level: 3, members: 24, treasury: 7600 },
  { id: "g-tetris", name: "长条信仰会", level: 2, members: 16, treasury: 4200 }
];

const marketEvents = [
  "黑色星期一预警：高控盘股票散户热度过高时容易跳水",
  "政策利好传闻：白酒板块有 NPC 正在喊单",
  "交易所故障演练：后续将加入限时无法卖出事件"
];

const state = {
  startedAt: Date.now(),
  bankerPool: 0,
  lossTarget: 95,
  inflation: 1,
  onlinePlayers: 0,
  players: {},
  accounts: {},
  messages: [],
  announcements: [],
  stocks,
  futures,
  guilds,
  marketEvents,
  guildBoss: {
    name: "巨大化方块 BOSS",
    window: "20:00-20:15",
    hpPercent: 83
  },
  guildWar: {
    status: "周六 20:00 开赛",
    rule: "10v10 俄罗斯方块对决，总胜场更多的一方获得报名费奖池。"
  },
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

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
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

function pushMessage(author, text, kind = "chat", channel = "世界") {
  state.messages.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    author,
    text,
    kind,
    channel
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
      positions: [],
      titles: ["新晋韭菜"],
      account: null,
      guildId: null,
      lastSignin: null,
      banned: false,
      updatedAt: Date.now()
    };
    pushMessage("极乐广播台", `${state.players[id].name} 进入交易城，初始铸币额度 ${state.economy.initialCoins}`, "system");
  }
  return state.players[id];
}

function registerAccount(username, password, displayName) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9_\u4e00-\u9fa5]{2,16}$/i.test(normalized)) return { ok: false, error: "账号需 2-16 位中文、字母、数字或下划线" };
  if (String(password || "").length < 4) return { ok: false, error: "密码至少 4 位" };
  if (state.accounts[normalized]) return { ok: false, error: "账号已存在" };
  const playerId = crypto.randomUUID();
  const player = ensurePlayer(playerId);
  player.name = String(displayName || username).slice(0, 16);
  player.account = normalized;
  player.titles = ["交易城居民", "新晋韭菜"];
  state.accounts[normalized] = { username: normalized, passwordHash: hashPassword(password), playerId };
  pushMessage("户籍柜台", `${player.name} 完成注册，获得交易城居民身份`, "system");
  return { ok: true, player, account: { username: normalized } };
}

function loginAccount(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  const account = state.accounts[normalized];
  if (!account || account.passwordHash !== hashPassword(password)) return { ok: false, error: "账号或密码错误" };
  const player = ensurePlayer(account.playerId);
  pushMessage("户籍柜台", `${player.name} 回到交易城`, "system");
  return { ok: true, player, account: { username: normalized } };
}

function snapshot(playerId) {
  const player = playerId ? ensurePlayer(playerId) : {
    id: "admin-view",
    name: "后台观察者",
    coins: 0,
    score: 0,
    lines: 0,
    shields: 0,
    harvested: 0,
    positions: [],
    titles: []
  };
  if (playerId) player.updatedAt = Date.now();
  state.onlinePlayers = Object.values(state.players).filter((p) => Date.now() - p.updatedAt < 45000).length;
  return {
    serverTime: new Date().toISOString(),
    world,
    player,
    stocks: state.stocks,
    futures: state.futures,
    bankerPool: Math.round(state.bankerPool),
    lossTarget: state.lossTarget,
    inflation: state.inflation,
    messages: state.messages,
    announcements: state.announcements.slice(0, 12),
    guilds: state.guilds,
    guildBoss: state.guildBoss,
    guildWar: state.guildWar,
    marketEvents: state.marketEvents,
    npcs,
    leaderboards: leaderboards(),
    economy: state.economy,
    nextEventIn: Math.max(0, state.flags.nextEventAt - Date.now()),
    onlinePlayers: state.onlinePlayers
  };
}

function leaderboards() {
  const players = Object.values(state.players);
  const fallbackLines = [
    { name: "老韭菜", value: 9066 },
    { name: "王姐", value: 7300 },
    { name: "量化小哥", value: 6666 },
    { name: "神秘人", value: 5200 },
    { name: "镰刀实习生", value: 4300 }
  ];
  const fallbackProfit = [
    { name: "王姐", value: 12888 },
    { name: "李老师", value: 7600 },
    { name: "神秘人", value: 5200 },
    { name: "程序员", value: 3100 },
    { name: "老韭菜", value: 666 }
  ];
  const fallbackHarvested = [
    { name: "天台保安", value: 99 },
    { name: "韭菜导师", value: 48 },
    { name: "镰刀实习生", value: 32 },
    { name: "老韭菜", value: 21 }
  ];
  const top = (rows, fallback) => [...rows, ...fallback]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 10);
  const byLines = players.map((p) => ({ name: p.name, value: p.lines }));
  const byScore = players.map((p) => ({ name: p.name, value: p.score }));
  const byCoins = players.map((p) => ({ name: p.name, value: Math.max(0, p.coins - state.economy.initialCoins) }));
  const byHarvested = players.map((p) => ({ name: p.name, value: p.harvested }));
  return {
    daily: top(byLines, fallbackLines),
    profit: top(byCoins, fallbackProfit),
    jackpot: top(byScore, fallbackLines),
    harvested: top(byHarvested, fallbackHarvested)
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
  if (tags.includes("bomb")) pushMessage("战场广播", `${player.name} 自爆了，拿走 300 分但头顶开始发凉`, "danger", "战场");
  return { total, base, crit, selfBoom };
}

function moveMarket() {
  for (const stock of state.stocks) {
    const retailPressure = stock.retailHeat > 60 && Math.random() < stock.control * 0.2;
    let delta = (Math.random() - 0.48) * 0.018;
    if (retailPressure) {
      delta = -(0.07 + Math.random() * 0.03);
      pushMessage("庄家柜台", `${stock.name} 散户太挤，盘口突然被砸`, "danger", "市场");
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
  pushMessage("极乐广播台", `${event[0]}：${event[1]}`, "event", "世界");
  state.flags.nextEventAt = Date.now() + 30000;
}

function adminAction(action, payload) {
  if (action === "stock") {
    const stock = state.stocks.find((item) => item.code === payload.code);
    if (stock) {
      const pct = Number(payload.percent || 0);
      stock.price = Number((stock.price * (1 + pct / 100)).toFixed(2));
      stock.change = Number(((stock.price / stock.open - 1) * 100).toFixed(2));
      pushMessage("后台柜台", `${stock.name} 被手动调整 ${pct}%`, "admin", "后台");
    }
  }
  if (action === "future") {
    const future = state.futures.find((item) => item.code === payload.code);
    if (future) future.price = Number(payload.price || future.price);
  }
  if (action === "lossTarget") state.lossTarget = Math.max(0, Math.min(100, Number(payload.value || 95)));
  if (action === "inflation") state.inflation = Math.max(0.1, Math.min(10, Number(payload.value || 1)));
  if (action === "announce") pushMessage("极乐广播台", String(payload.text || "国家队疑似入场"), "admin", "世界");
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
    pushMessage("危险操作", "韭菜日已触发：全员金币减半，庄家池膨胀", "danger", "后台");
  }
  if (action === "rage") {
    state.flags.rageMode = Boolean(payload.enabled);
    pushMessage("危险操作", `庄家狂暴模式：${state.flags.rageMode ? "开启" : "关闭"}`, "danger", "后台");
  }
}

function tradeStock(player, code, lots) {
  const stock = state.stocks.find((item) => item.code === code);
  if (!stock) return { ok: false, error: "stock not found" };
  const qty = Math.max(1, Number(lots || 1)) * 100;
  const cost = Math.round(stock.price * qty * (1 + state.economy.stockFee));
  if (player.coins < cost) return { ok: false, error: "金币不足" };
  player.coins -= cost;
  player.positions.push({ type: "stock", code, qty, cost, day: new Date().toISOString().slice(0, 10) });
  stock.retailHeat = Math.min(100, stock.retailHeat + 8);
  pushMessage("交易所柜台", `${player.name} 买入 ${stock.name} ${qty} 股，庄家已记录成本线`, "event", "市场");
  return { ok: true, player };
}

function openFuture(player, code, side, leverage) {
  const future = state.futures.find((item) => item.code === code);
  if (!future) return { ok: false, error: "future not found" };
  const lev = Math.max(1, Math.min(20, Number(leverage || 1)));
  const margin = 100 * lev;
  if (player.coins < margin) return { ok: false, error: "金币不足" };
  player.coins -= margin;
  player.positions.push({ type: "future", code, side, qty: `${lev}x`, cost: margin, entry: future.price });
  pushMessage("期货柜台", `${player.name} ${side === "short" ? "做空" : "做多"} ${code} ${lev}x，爆仓线已点亮`, "danger", "市场");
  return { ok: true, player };
}

async function api(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/auth/register" && req.method === "POST") {
    const body = await readBody(req);
    const result = registerAccount(body.username, body.password, body.displayName);
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    const result = loginAccount(body.username, body.password);
    return sendJson(res, result, result.ok ? 200 : 401);
  }
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
  if (url.pathname === "/api/player/signin" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    const today = new Date().toISOString().slice(0, 10);
    if (player.lastSignin !== today) {
      player.coins += 500;
      player.lastSignin = today;
      pushMessage("极乐广播台", `${player.name} 每日签到领取 500 金币`, "system", "世界");
    }
    return sendJson(res, { player });
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    if (state.flags.globalMuted) return sendJson(res, { ok: false, error: "全局禁言中" }, 403);
    pushMessage(player.name, String(body.text || "").slice(0, 120), "chat", String(body.channel || "世界").slice(0, 12));
    return sendJson(res, { ok: true, messages: state.messages });
  }
  if (url.pathname === "/api/chat/red-packet" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    const amount = Math.max(100, Number(body.amount || 100));
    if (player.coins >= amount) {
      player.coins -= amount;
      pushMessage("红包雨", `${player.name} 发出 ${amount} 金币红包，手慢无`, "event", "世界");
    }
    return sendJson(res, { ok: true, player, messages: state.messages });
  }
  if (url.pathname === "/api/trade/stock" && req.method === "POST") {
    const body = await readBody(req);
    const result = tradeStock(ensurePlayer(body.playerId), body.code, body.lots);
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/trade/future" && req.method === "POST") {
    const body = await readBody(req);
    const result = openFuture(ensurePlayer(body.playerId), body.code, body.side, body.leverage);
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/guild/create" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    if (player.coins >= 1000) {
      player.coins -= 1000;
      const guild = { id: `g-${crypto.randomUUID().slice(0, 8)}`, name: String(body.name || "新公会").slice(0, 16), level: 1, members: 1, treasury: 1000 };
      state.guilds.unshift(guild);
      player.guildId = guild.id;
      pushMessage("公会柜台", `${player.name} 创建了公会 ${guild.name}`, "event", "公会");
      return sendJson(res, { ok: true, guild, player });
    }
    return sendJson(res, { ok: false, error: "金币不足" }, 400);
  }
  if (url.pathname === "/api/guild/join" && req.method === "POST") {
    const body = await readBody(req);
    const player = ensurePlayer(body.playerId);
    const guild = state.guilds.find((item) => item.id === body.guildId);
    if (guild) {
      guild.members = Math.min(50, guild.members + 1);
      player.guildId = guild.id;
      pushMessage("公会柜台", `${player.name} 加入了 ${guild.name}`, "event", "公会");
    }
    return sendJson(res, { ok: Boolean(guild), guild, player });
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
  const npc = npcs[Math.floor(Math.random() * npcs.length)];
  pushMessage(npc.name, npc.line, "chat", npc.name === "庄家柜台" ? "市场" : "世界");
}, 9000);
setInterval(() => {
  if (Date.now() >= state.flags.nextEventAt) triggerWorldEvent();
}, 1000);

pushMessage("极乐广播台", "极乐交易城开盘：金币无真实价值，但每一次翻盘都算数。", "system", "世界");
