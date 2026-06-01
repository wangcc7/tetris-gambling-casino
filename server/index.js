const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "state.json");
const playerPort = Number(process.env.PLAYER_PORT || 8080);
const adminPort = Number(process.env.ADMIN_PORT || 18052);
const adminUser = process.env.ADMIN_USER || "root";
const adminPassword = process.env.ADMIN_PASSWORD || "gambleMaster666";
const appVersion = process.env.APP_VERSION || "0.5.0-timefield";
const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "casino",
  password: process.env.DB_PASSWORD || "casinoPass666",
  database: process.env.DB_NAME || "tetris_casino",
  waitForConnections: true,
  connectionLimit: 10
};
let db = null;
let dbReady = false;
let mysqlStatus = "connecting";
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

const missionTemplates = [
  { id: "signin", title: "户籍柜台签到", desc: "完成一次每日签到", metric: "signin", target: 1, reward: 120 },
  { id: "clear_10", title: "清理十行矿渣", desc: "在方块战场累计消除 10 行", metric: "lines", target: 10, reward: 180 },
  { id: "speak_world", title: "广播台露脸", desc: "在任意频道发言 1 次", metric: "chat", target: 1, reward: 80 },
  { id: "open_trade", title: "柜台第一单", desc: "完成 1 次股票或期货交易", metric: "trades", target: 1, reward: 160 },
  { id: "guild_action", title: "抱团取暖", desc: "创建或加入 1 个公会", metric: "guildActions", target: 1, reward: 220 }
];

const shopItems = [
  { id: "lucky_crit", name: "暴击幸运块", desc: "下一局开局强制获得暴击长条", price: 200, type: "buff" },
  { id: "shield_pack", name: "铁壁护盾包", desc: "立即获得 1 个护盾", price: 300, type: "shield" },
  { id: "rumor_ticket", name: "内幕小纸条", desc: "向市场事件池投放一条传闻", price: 150, type: "rumor" },
  { id: "sickle_skin", name: "镰刀皮肤券", desc: "获得称号：镰刀试用员", price: 888, type: "title" }
];

const campaigns = [
  { id: "boss-night", title: "巨大化方块 BOSS", time: "每日 20:00-20:15", reward: "公会金库与成员金币", status: "预热中" },
  { id: "saturday-war", title: "周六公会战", time: "每周六 20:00", reward: "败方报名费奖池", status: "报名中" },
  { id: "leek-day", title: "韭菜日警报", time: "后台触发", reward: "庄家池膨胀，排行榜洗牌", status: "危险" }
];

const externalData = {
  weather: {
    city: "济南",
    text: "天气同步中",
    temperature: "--",
    wind: "--",
    updatedAt: null
  },
  realStocks: [],
  news: [],
  insight: {
    title: "规则之眼",
    text: "别急着证明自己，先看清系统如何运转。",
    attribute: "识局"
  },
  updatedAt: null
};

const stockSecIds = [
  "1.000001",
  "1.600519",
  "0.002475",
  "0.300750",
  "0.000858",
  "1.601318",
  "1.688981",
  "0.000002"
];

const dingInsights = [
  { title: "强者不争情绪", text: "市场不是用来安慰人的，先承认规律，再谈选择。", attribute: "识局" },
  { title: "先胜而后求战", text: "一局方块和一笔交易一样，真正的胜负在下手之前。", attribute: "预判" },
  { title: "别把愿望当判断", text: "你想涨，不代表它该涨；你怕输，也不代表你该逃。", attribute: "自省" },
  { title: "可依赖的是系统", text: "好运会来，也会走。能留下来的，是你搭出的结构。", attribute: "秩序" },
  { title: "看见因果", text: "每一次爆仓都不是突然发生，它只是之前选择的结算。", attribute: "因果" }
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

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function connectMysql(retries = 30) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      db = mysql.createPool(dbConfig);
      await db.query("SELECT 1");
      await initMysqlSchema();
      dbReady = true;
      mysqlStatus = "ready";
      console.log(`MySQL connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      return;
    } catch (error) {
      mysqlStatus = `retry ${attempt}/${retries}`;
      console.error(`MySQL connection failed (${attempt}/${retries})`, error.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  mysqlStatus = "unavailable";
}

async function initMysqlSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NOT NULL,
      nickname VARCHAR(32) NOT NULL,
      coins INT NOT NULL DEFAULT 1000,
      score INT NOT NULL DEFAULT 0,
      line_count INT NOT NULL DEFAULT 0,
      shields INT NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      role VARCHAR(16) NOT NULL DEFAULT 'player',
      titles_json JSON NULL,
      inventory_json JSON NULL,
      stats_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(96) NOT NULL PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      INDEX(user_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      author VARCHAR(64) NOT NULL,
      channel VARCHAR(24) NOT NULL,
      kind VARCHAR(24) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX(channel),
      INDEX(created_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_positions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(16) NOT NULL,
      code VARCHAR(16) NOT NULL,
      side VARCHAR(16) NULL,
      qty VARCHAR(32) NOT NULL,
      cost DECIMAL(14,2) NOT NULL,
      entry DECIMAL(14,2) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX(user_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

function decodeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function dbUserToPlayer(row, positions = []) {
  if (!row) return null;
  return normalizePlayer({
    id: `u-${row.id}`,
    userId: row.id,
    username: row.username,
    name: row.nickname,
    identityNo: `USER-${String(row.id).padStart(6, "0")}`,
    account: row.username,
    status: row.status,
    role: row.role,
    createdAt: row.created_at,
    lastSeenAt: row.last_login_at || row.updated_at,
    coins: row.coins,
    score: row.score,
    lines: row.line_count,
    shields: row.shields,
    harvested: 0,
    positions,
    titles: decodeJson(row.titles_json, ["交易城居民"]),
    inventory: decodeJson(row.inventory_json, { luckyBlocks: 0, skins: [] }),
    stats: decodeJson(row.stats_json, { chat: 0, trades: 0, guildActions: 0, signin: 0 }),
    claimedMissions: {},
    guildId: null,
    lastSignin: null,
    banned: row.status === "banned",
    updatedAt: Date.now()
  });
}

async function getPositions(userId) {
  if (!dbReady || !userId) return [];
  const [rows] = await db.query("SELECT type, code, side, qty, cost, entry, created_at FROM user_positions WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
  return rows.map((row) => ({ ...row, cost: Number(row.cost), entry: row.entry == null ? null : Number(row.entry) }));
}

async function getUserByToken(token) {
  if (!dbReady || !token) return null;
  const [rows] = await db.query(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > NOW())
    LIMIT 1
  `, [token]);
  if (!rows[0]) return null;
  return dbUserToPlayer(rows[0], await getPositions(rows[0].id));
}

async function getUserById(userId) {
  if (!dbReady || !userId) return null;
  const cleanId = String(userId).replace(/^u-/, "");
  const [rows] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [cleanId]);
  if (!rows[0]) return null;
  return dbUserToPlayer(rows[0], await getPositions(rows[0].id));
}

async function saveDbPlayer(player) {
  if (!dbReady || !player?.userId) return;
  await db.query(`
    UPDATE users SET nickname=?, coins=?, score=?, line_count=?, shields=?, status=?, titles_json=?, inventory_json=?, stats_json=?
    WHERE id=?
  `, [
    player.name,
    Math.round(player.coins),
    Math.round(player.score),
    Math.round(player.lines),
    Math.round(player.shields),
    player.status || "active",
    JSON.stringify(player.titles || []),
    JSON.stringify(player.inventory || {}),
    JSON.stringify(player.stats || {}),
    player.userId
  ]);
}

function authFromReq(req, body = {}) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return body.sessionToken || bearer || parseCookies(req).casino_session || "";
}

async function currentPlayer(req, body = {}) {
  return await getUserByToken(authFromReq(req, body));
}

function publicSession(token, player) {
  return { token, userId: player.id, username: player.username, nickname: player.name };
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
      identityNo: `GC-${id.slice(0, 8).toUpperCase()}`,
      status: "active",
      role: "player",
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      coins: state.economy.initialCoins,
      score: 0,
      lines: 0,
      shields: 0,
      harvested: 0,
      positions: [],
      titles: ["新晋韭菜"],
      inventory: { luckyBlocks: 0, skins: [] },
      stats: { chat: 0, trades: 0, guildActions: 0, signin: 0 },
      claimedMissions: {},
      account: null,
      guildId: null,
      lastSignin: null,
      banned: false,
      updatedAt: Date.now()
    };
    pushMessage("极乐广播台", `${state.players[id].name} 进入交易城，初始铸币额度 ${state.economy.initialCoins}`, "system");
  }
  return normalizePlayer(state.players[id]);
}

function normalizePlayer(player) {
  player.identityNo ||= `GC-${String(player.id || crypto.randomUUID()).slice(0, 8).toUpperCase()}`;
  player.status ||= player.banned ? "banned" : "active";
  player.role ||= "player";
  player.createdAt ||= new Date().toISOString();
  player.lastSeenAt ||= player.updatedAt ? new Date(player.updatedAt).toISOString() : new Date().toISOString();
  player.positions ||= [];
  player.titles ||= ["新晋韭菜"];
  player.inventory ||= { luckyBlocks: 0, skins: [] };
  player.inventory.skins ||= [];
  player.stats ||= { chat: 0, trades: 0, guildActions: 0, signin: 0 };
  player.stats.chat ||= 0;
  player.stats.trades ||= 0;
  player.stats.guildActions ||= 0;
  player.stats.signin ||= 0;
  player.claimedMissions ||= {};
  player.shields ||= 0;
  player.harvested ||= 0;
  player.banned = player.status === "banned" || Boolean(player.banned);
  return player;
}

function normalizeAccount(account, username) {
  account.id ||= `acct-${crypto.randomUUID().slice(0, 8)}`;
  account.username ||= username;
  account.status ||= "active";
  account.role ||= "resident";
  account.createdAt ||= new Date().toISOString();
  account.lastLoginAt ||= null;
  return account;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadPersistedState() {
  try {
    if (!fs.existsSync(stateFile)) return;
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    for (const key of ["bankerPool", "lossTarget", "inflation", "players", "accounts", "messages", "announcements", "guilds", "marketEvents", "guildBoss", "guildWar", "economy", "flags"]) {
      if (saved[key] !== undefined) state[key] = saved[key];
    }
    if (Array.isArray(saved.stocks)) state.stocks = saved.stocks;
    if (Array.isArray(saved.futures)) state.futures = saved.futures;
    for (const player of Object.values(state.players)) normalizePlayer(player);
    for (const [username, account] of Object.entries(state.accounts)) normalizeAccount(account, username);
    state.flags.nextEventAt = Date.now() + 30000;
    console.log(`Loaded persisted state from ${stateFile}`);
  } catch (error) {
    console.error("Failed to load persisted state", error);
  }
}

function saveState() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      savedAt: new Date().toISOString(),
      bankerPool: state.bankerPool,
      lossTarget: state.lossTarget,
      inflation: state.inflation,
      players: state.players,
      accounts: state.accounts,
      messages: state.messages,
      announcements: state.announcements,
      stocks: state.stocks,
      futures: state.futures,
      guilds: state.guilds,
      marketEvents: state.marketEvents,
      guildBoss: state.guildBoss,
      guildWar: state.guildWar,
      economy: state.economy,
      flags: state.flags
    }, null, 2));
  } catch (error) {
    console.error("Failed to save state", error);
  }
}

function missionsFor(player) {
  const claimed = new Set(player.claimedMissions[todayKey()] || []);
  return missionTemplates.map((mission) => {
    const value = mission.metric === "lines" ? player.lines : Number(player.stats[mission.metric] || 0);
    const done = value >= mission.target;
    return { ...mission, value, done, claimed: claimed.has(mission.id) };
  });
}

function claimMission(player, missionId) {
  const mission = missionsFor(player).find((item) => item.id === missionId);
  if (!mission) return { ok: false, error: "任务不存在" };
  if (!mission.done) return { ok: false, error: "任务未完成" };
  const day = todayKey();
  player.claimedMissions[day] ||= [];
  if (player.claimedMissions[day].includes(mission.id)) return { ok: false, error: "奖励已领取" };
  player.claimedMissions[day].push(mission.id);
  player.coins += mission.reward;
  pushMessage("任务柜台", `${player.name} 领取任务奖励 ${mission.reward} 金币：${mission.title}`, "event", "世界");
  return { ok: true, player, mission };
}

function buyShopItem(player, itemId) {
  const item = shopItems.find((entry) => entry.id === itemId);
  if (!item) return { ok: false, error: "商品不存在" };
  if (player.coins < item.price) return { ok: false, error: "金币不足" };
  player.coins -= item.price;
  if (item.type === "shield") player.shields += 1;
  if (item.type === "buff") player.inventory.luckyBlocks += 1;
  if (item.type === "rumor") state.marketEvents.unshift(`${player.name} 投放传闻：TETRIS 指数将有异动`);
  if (item.type === "title" && !player.titles.includes("镰刀试用员")) player.titles.push("镰刀试用员");
  pushMessage("商店柜台", `${player.name} 购买了 ${item.name}`, "event", "世界");
  return { ok: true, player, item };
}

function useItem(player, itemId) {
  if (itemId === "lucky_crit" && player.inventory.luckyBlocks > 0) {
    player.inventory.luckyBlocks -= 1;
    pushMessage("战场柜台", `${player.name} 消耗暴击幸运块，下一局长条优先`, "event", "战场");
    return { ok: true, player, effect: { forcePiece: "I" } };
  }
  return { ok: false, error: "道具不可用" };
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    status: account.status,
    role: account.role,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt
  };
}

function identityFor(player) {
  const account = player.account ? state.accounts[player.account] : null;
  return {
    mode: account ? "resident" : "guest",
    label: account ? "正式居民" : "游客通行证",
    identityNo: player.identityNo,
    username: account?.username || null,
    account: publicAccount(account),
    status: player.status,
    canBind: !account
  };
}

function registerAccount(username, password, displayName, boundPlayerId) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9_\u4e00-\u9fa5]{2,16}$/i.test(normalized)) return { ok: false, error: "账号需 2-16 位中文、字母、数字或下划线" };
  if (String(password || "").length < 4) return { ok: false, error: "密码至少 4 位" };
  if (state.accounts[normalized]) return { ok: false, error: "账号已存在" };
  const player = ensurePlayer(boundPlayerId || crypto.randomUUID());
  if (player.account && player.account !== normalized) return { ok: false, error: "当前角色已绑定账号" };
  player.name = String(displayName || username).slice(0, 16);
  player.account = normalized;
  player.status = "active";
  player.banned = false;
  player.titles = ["交易城居民", "新晋韭菜"];
  state.accounts[normalized] = normalizeAccount({ username: normalized, passwordHash: hashPassword(password), playerId: player.id }, normalized);
  pushMessage("户籍柜台", `${player.name} 完成户籍绑定，游客进度已转为正式居民档案`, "system");
  return { ok: true, player, identity: identityFor(player), account: publicAccount(state.accounts[normalized]) };
}

function loginAccount(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  const account = normalizeAccount(state.accounts[normalized] || {}, normalized);
  if (!account || account.passwordHash !== hashPassword(password)) return { ok: false, error: "账号或密码错误" };
  if (account.status === "banned") return { ok: false, error: "账号已被封禁" };
  const player = ensurePlayer(account.playerId);
  if (player.status === "banned") return { ok: false, error: "角色已被封禁" };
  account.lastLoginAt = new Date().toISOString();
  pushMessage("户籍柜台", `${player.name} 回到交易城`, "system");
  return { ok: true, player, identity: identityFor(player), account: publicAccount(account) };
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
  if (playerId) {
    player.updatedAt = Date.now();
    player.lastSeenAt = new Date().toISOString();
  }
  state.onlinePlayers = Object.values(state.players).filter((p) => Date.now() - p.updatedAt < 45000).length;
  return {
    serverTime: new Date().toISOString(),
    version: appVersion,
    mysql: mysqlStatus,
    external: externalData,
    world,
    player,
    identity: playerId ? identityFor(player) : null,
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
    missions: playerId ? missionsFor(player) : missionTemplates,
    shop: shopItems,
    campaigns,
    leaderboards: leaderboards(),
    persistence: { enabled: true, stateFile: "/app/data/state.json" },
    economy: state.economy,
    nextEventIn: Math.max(0, state.flags.nextEventAt - Date.now()),
    onlinePlayers: state.onlinePlayers
  };
}

function guestSnapshot() {
  const player = normalizePlayer({
    id: "guest",
    name: "未登录玩家",
    coins: state.economy.initialCoins,
    score: 0,
    lines: 0,
    shields: 0,
    harvested: 0,
    positions: [],
    titles: ["游客"],
    inventory: { luckyBlocks: 0, skins: [] },
    stats: { chat: 0, trades: 0, guildActions: 0, signin: 0 },
    claimedMissions: {},
    status: "guest",
    updatedAt: Date.now()
  });
  return {
    ...snapshot(null),
    player,
    identity: {
      mode: "guest",
      label: "未登录",
      identityNo: "LOGIN-REQUIRED",
      username: null,
      account: null,
      status: "guest",
      canBind: false
    },
    missions: missionTemplates
  };
}

function snapshotForPlayer(player) {
  if (!player) return guestSnapshot();
  const base = snapshot(null);
  return {
    ...base,
    player,
    identity: {
      mode: "account",
      label: "正式账号",
      identityNo: player.identityNo,
      username: player.username,
      account: {
        id: player.userId,
        username: player.username,
        status: player.status,
        role: player.role,
        createdAt: player.createdAt,
        lastLoginAt: player.lastSeenAt
      },
      status: player.status,
      canBind: false
    },
    missions: missionsFor(player)
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

function weatherText(code) {
  const map = {
    0: "晴",
    1: "晴间多云",
    2: "多云",
    3: "阴",
    45: "雾",
    48: "霾雾",
    51: "小毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    80: "阵雨"
  };
  return map[code] || "天气变化中";
}

async function refreshWeather() {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=36.6683&longitude=116.9972&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FShanghai");
    const data = await res.json();
    externalData.weather = {
      city: "济南",
      text: weatherText(data.current?.weather_code),
      temperature: `${Math.round(data.current?.temperature_2m)}°C`,
      wind: `${Math.round(data.current?.wind_speed_10m || 0)} km/h`,
      updatedAt: new Date().toISOString()
    };
  } catch {
    externalData.weather = { city: "济南", text: "天气暂不可用", temperature: "--", wind: "--", updatedAt: new Date().toISOString() };
  }
}

async function refreshRealStocks() {
  try {
    const fields = "f12,f14,f2,f3,f4,f13,f20,f21,f62";
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${stockSecIds.join(",")}`;
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    const data = await res.json();
    externalData.realStocks = (data.data?.diff || []).map((item) => ({
      code: item.f12,
      name: item.f14,
      price: Number(item.f2 || 0),
      change: Number(item.f3 || 0),
      amount: Number(item.f20 || 0),
      flow: Number(item.f62 || 0)
    }));
    if (externalData.realStocks.length) {
      state.stocks = state.stocks.map((stock) => {
        const real = externalData.realStocks.find((item) => item.code === stock.code);
        return real ? { ...stock, price: real.price || stock.price, change: real.change || 0, realName: real.name } : stock;
      });
    }
  } catch {
    externalData.realStocks = externalData.realStocks.length ? externalData.realStocks : [];
  }
}

async function refreshNews() {
  try {
    const trace = `casino_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const res = await fetch(`https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=351&order=1&needInteractData=0&page_index=1&page_size=12&req_trace=${trace}`, { headers: { "user-agent": "Mozilla/5.0" } });
    const data = await res.json();
    const list = data.data?.list || data.data || [];
    externalData.news = list.slice(0, 10).map((item) => ({
      title: item.title || item.showTitle || "财经新闻",
      source: item.source || item.mediaName || "东方财富",
      time: item.showTime || item.publishTime || item.createTime || "",
      url: item.url || item.uniqueUrl || ""
    }));
    if (!externalData.news.length) {
      externalData.news = [
        { title: "实时财经新闻正在同步，交易城先按本地行情广播运行", source: "极乐广播台", time: new Date().toISOString(), url: "" }
      ];
    }
  } catch {
    externalData.news = externalData.news.length ? externalData.news : [
      { title: "新闻接口暂不可用，系统保留本地市场广播", source: "极乐广播台", time: new Date().toISOString(), url: "" }
    ];
  }
}

async function refreshExternalData() {
  await Promise.allSettled([refreshWeather(), refreshRealStocks(), refreshNews()]);
  externalData.insight = dingInsights[Math.floor(Math.random() * dingInsights.length)];
  externalData.updatedAt = new Date().toISOString();
  const headline = externalData.news[0]?.title;
  if (headline) pushMessage("新闻广播", headline.slice(0, 120), "news", "新闻");
}

async function adminAction(action, payload) {
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
    if (dbReady && payload.playerId) {
      const id = String(payload.playerId).replace(/^u-/, "");
      await db.query("UPDATE users SET coins = GREATEST(0, coins + ?) WHERE id = ?", [Number(payload.amount || 0), id]);
      pushMessage("后台柜台", `玩家 ${id} 金币调整 ${payload.amount}`, "admin", "后台");
    }
  }
  if (action === "playerStatus") {
    if (dbReady && payload.playerId) {
      const status = payload.status === "banned" ? "banned" : "active";
      const id = String(payload.playerId).replace(/^u-/, "");
      await db.query("UPDATE users SET status = ? WHERE id = ?", [status, id]);
      pushMessage("账号中心", `玩家 ${id} 状态变更为 ${status}`, "admin", "后台");
    }
  }
  if (action === "resetPlayer") {
    if (dbReady && payload.playerId) {
      const id = String(payload.playerId).replace(/^u-/, "");
      await db.query("DELETE FROM user_positions WHERE user_id = ?", [id]);
      await db.query("UPDATE users SET coins=?, score=0, line_count=0, shields=0, titles_json=?, inventory_json=?, stats_json=? WHERE id=?", [
        state.economy.initialCoins,
        JSON.stringify(["交易城居民"]),
        JSON.stringify({ luckyBlocks: 0, skins: [] }),
        JSON.stringify({ chat: 0, trades: 0, guildActions: 0, signin: 0 }),
        id
      ]);
      pushMessage("账号中心", `玩家 ${id} 的角色档案已被重置`, "admin", "后台");
    }
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
  if (action === "worldEvent") triggerWorldEvent();
  if (action === "save") saveState();
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
    if (!dbReady) return sendJson(res, { ok: false, error: "MySQL 未就绪" }, 503);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const nickname = String(body.displayName || body.nickname || username).trim().slice(0, 16);
    if (!/^[a-z0-9_\u4e00-\u9fa5]{2,16}$/i.test(username)) return sendJson(res, { ok: false, error: "账号需 2-16 位中文、字母、数字或下划线" }, 400);
    if (password.length < 4) return sendJson(res, { ok: false, error: "密码至少 4 位" }, 400);
    try {
      const [result] = await db.query(`
        INSERT INTO users (username, password_hash, nickname, titles_json, inventory_json, stats_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        username,
        hashPassword(password),
        nickname,
        JSON.stringify(["交易城居民"]),
        JSON.stringify({ luckyBlocks: 0, skins: [] }),
        JSON.stringify({ chat: 0, trades: 0, guildActions: 0, signin: 0 })
      ]);
      const player = await getUserById(result.insertId);
      const token = makeToken();
      await db.query("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, result.insertId]);
      pushMessage("账号中心", `${player.name} 注册成为交易城玩家`, "system", "世界");
      return sendJson(res, { ok: true, player, session: publicSession(token, player), state: snapshotForPlayer(player) });
    } catch (error) {
      return sendJson(res, { ok: false, error: "账号已存在或数据库写入失败" }, 400);
    }
  }
  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    if (!dbReady) return sendJson(res, { ok: false, error: "MySQL 未就绪" }, 503);
    const username = String(body.username || "").trim().toLowerCase();
    const [rows] = await db.query("SELECT * FROM users WHERE username = ? LIMIT 1", [username]);
    const row = rows[0];
    if (!row || row.password_hash !== hashPassword(body.password)) return sendJson(res, { ok: false, error: "账号或密码错误" }, 401);
    if (row.status === "banned") return sendJson(res, { ok: false, error: "账号已被封禁" }, 403);
    const token = makeToken();
    await db.query("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, row.id]);
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [row.id]);
    const player = await getUserById(row.id);
    pushMessage("账号中心", `${player.name} 登录交易城`, "system", "世界");
    return sendJson(res, { ok: true, player, session: publicSession(token, player), state: snapshotForPlayer(player) });
  }
  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const body = await readBody(req);
    const token = authFromReq(req, body);
    if (dbReady && token) await db.query("DELETE FROM sessions WHERE token = ?", [token]);
    return sendJson(res, { ok: true });
  }
  if (url.pathname === "/api/state" || url.pathname === "/api/auth/status") {
    const player = await getUserByToken(url.searchParams.get("sessionToken") || authFromReq(req));
    return sendJson(res, snapshotForPlayer(player));
  }
  if (url.pathname === "/api/line-clear" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const reward = settleLines(player, Number(body.lines || 0), body.tags || []);
    await saveDbPlayer(player);
    return sendJson(res, { player, reward });
  }
  if (url.pathname === "/api/player" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    if (body.name) player.name = String(body.name).slice(0, 16);
    await saveDbPlayer(player);
    return sendJson(res, { player });
  }
  if (url.pathname === "/api/player/signin" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const today = new Date().toISOString().slice(0, 10);
    if (player.lastSignin !== today) {
      player.coins += 500;
      player.lastSignin = today;
      player.stats.signin += 1;
      pushMessage("极乐广播台", `${player.name} 每日签到领取 500 金币`, "system", "世界");
    }
    await saveDbPlayer(player);
    return sendJson(res, { player });
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    if (state.flags.globalMuted) return sendJson(res, { ok: false, error: "全局禁言中" }, 403);
    player.stats.chat += 1;
    pushMessage(player.name, String(body.text || "").slice(0, 120), "chat", String(body.channel || "世界").slice(0, 12));
    if (dbReady) await db.query("INSERT INTO chat_messages (user_id, author, channel, kind, text) VALUES (?, ?, ?, ?, ?)", [player.userId, player.name, String(body.channel || "世界").slice(0, 12), "chat", String(body.text || "").slice(0, 120)]);
    await saveDbPlayer(player);
    return sendJson(res, { ok: true, messages: state.messages });
  }
  if (url.pathname === "/api/chat/red-packet" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const amount = Math.max(100, Number(body.amount || 100));
    if (player.coins >= amount) {
      player.coins -= amount;
      pushMessage("红包雨", `${player.name} 发出 ${amount} 金币红包，手慢无`, "event", "世界");
    }
    await saveDbPlayer(player);
    return sendJson(res, { ok: true, player, messages: state.messages });
  }
  if (url.pathname === "/api/trade/stock" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const result = tradeStock(player, body.code, body.lots);
    if (result.ok) player.stats.trades += 1;
    if (result.ok && dbReady) {
      const last = player.positions[player.positions.length - 1];
      await db.query("INSERT INTO user_positions (user_id, type, code, qty, cost) VALUES (?, ?, ?, ?, ?)", [player.userId, "stock", body.code, String(last.qty), last.cost]);
      await saveDbPlayer(player);
    }
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/trade/future" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const result = openFuture(player, body.code, body.side, body.leverage);
    if (result.ok) player.stats.trades += 1;
    if (result.ok && dbReady) {
      const last = player.positions[player.positions.length - 1];
      await db.query("INSERT INTO user_positions (user_id, type, code, side, qty, cost, entry) VALUES (?, ?, ?, ?, ?, ?, ?)", [player.userId, "future", body.code, body.side, String(last.qty), last.cost, last.entry]);
      await saveDbPlayer(player);
    }
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/guild/create" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    if (player.coins >= 1000) {
      player.coins -= 1000;
      const guild = { id: `g-${crypto.randomUUID().slice(0, 8)}`, name: String(body.name || "新公会").slice(0, 16), level: 1, members: 1, treasury: 1000 };
      state.guilds.unshift(guild);
      player.guildId = guild.id;
      player.stats.guildActions += 1;
      await saveDbPlayer(player);
      pushMessage("公会柜台", `${player.name} 创建了公会 ${guild.name}`, "event", "公会");
      return sendJson(res, { ok: true, guild, player });
    }
    return sendJson(res, { ok: false, error: "金币不足" }, 400);
  }
  if (url.pathname === "/api/guild/join" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const guild = state.guilds.find((item) => item.id === body.guildId);
    if (guild) {
      guild.members = Math.min(50, guild.members + 1);
      player.guildId = guild.id;
      player.stats.guildActions += 1;
      await saveDbPlayer(player);
      pushMessage("公会柜台", `${player.name} 加入了 ${guild.name}`, "event", "公会");
    }
    return sendJson(res, { ok: Boolean(guild), guild, player });
  }
  if (url.pathname === "/api/missions/claim" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const result = claimMission(player, body.missionId);
    if (result.ok) await saveDbPlayer(player);
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/shop/buy" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const result = buyShopItem(player, body.itemId);
    if (result.ok) await saveDbPlayer(player);
    return sendJson(res, result, result.ok ? 200 : 400);
  }
  if (url.pathname === "/api/item/use" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { ok: false, error: "请先登录" }, 401);
    const result = useItem(player, body.itemId);
    if (result.ok) await saveDbPlayer(player);
    return sendJson(res, result, result.ok ? 200 : 400);
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
    let dbPlayers = [];
    if (dbReady) {
      const [rows] = await db.query("SELECT * FROM users ORDER BY id DESC LIMIT 200");
      dbPlayers = rows.map((row) => {
        const player = dbUserToPlayer(row, []);
        return {
          ...player,
          identity: {
            mode: "account",
            label: "正式账号",
            identityNo: player.identityNo,
            username: player.username,
            status: player.status
          }
        };
      });
    }
    return sendJson(res, {
      ...snapshot(url.searchParams.get("playerId")),
      players: dbPlayers,
      accounts: Object.fromEntries(dbPlayers.map((player) => [player.username, { username: player.username, status: player.status, role: player.role }]))
    });
  }
  if (url.pathname === "/admin/api/action" && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, { ok: false }, 401);
    const body = await readBody(req);
    await adminAction(body.action, body.payload || {});
    return sendJson(res, { ok: true, state: snapshot() });
  }
  serveFile(req, res, "admin.html");
}

loadPersistedState();
connectMysql();
refreshExternalData();

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
setInterval(refreshExternalData, 5 * 60 * 1000);
setInterval(saveState, 5000);

if (state.messages.length === 0) {
  pushMessage("极乐广播台", "极乐交易城开盘：金币无真实价值，但每一次翻盘都算数。", "system", "世界");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    saveState();
    process.exit(0);
  });
}
