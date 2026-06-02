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
const appVersion = process.env.APP_VERSION || "0.7.0-v2";
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
  name: "终焉钟城",
  tagline: "十日轮回，钟声为证",
  premise: "玩家被钟渊系统拉入一座无限轮回的时钟城市。每十日，城市重置。试炼者在方块试炼中刻下钟痕，在雾区交易所试探规则，在列车汽笛声中寻找出口。",
  factions: ["试炼者", "钟渊系统", "十二生肖裁判", "四象神兽", "终焉列车", "回响者"],
  loop: ["晨钟列车发布裁决", "方块试炼刻下钟痕", "雾区商品制造选择", "试炼契约临时结盟", "规则之眼贩卖情报", "终焉列车结算回响"]
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
  { name: "齐夏", personality: "冷静说谎者", strategy: "先拆规则，再拆人心", line: "先别相信钟声，先看它要求你付出什么。" },
  { name: "林檎", personality: "清醒心理医生", strategy: "观察情绪裂缝", line: "你以为自己在选方块，其实是在暴露恐惧。" },
  { name: "乔家劲", personality: "仗义硬拳", strategy: "用直觉撞开死局", line: "别把路想得太玄，能活一秒就往前打一秒。" },
  { name: "陈俊南", personality: "笑面担当", strategy: "用玩笑遮住压力", line: "这局要是还能回来，我请全频道喝凉茶。" },
  { name: "楚天秋", personality: "温柔疯王", strategy: "以秩序包装危险", line: "所有人都想破局，可不是所有人都配知道出口。" },
  { name: "文巧云", personality: "沉静领袖", strategy: "把牺牲算进棋盘", line: "别急着赢，先确认你愿意失去什么。" },
  { name: "章晨泽", personality: "锋利行动派", strategy: "在压迫里反击", line: "规则越冷，越要把手伸出去。" },
  { name: "甜甜", personality: "柔软幸存者", strategy: "用善意维持队伍温度", line: "如果钟声又响了，至少别让同伴一个人听。" },
  { name: "地虎", personality: "粗暴裁判", strategy: "逼玩家正面下注", line: "别磨蹭，钟城从不奖励犹豫的人。" },
  { name: "青龙", personality: "高位审判者", strategy: "以规则压迫全局", line: "回响越响，代价越重。你们最好记住。" }
];

const v2Npcs = [
  ...npcs,
  { name: "列车长", personality: "沉默神秘", strategy: "只在列车进站时透露方向", line: "下一站，不是你们的终点。" },
  { name: "钟楼守", personality: "疯狂时间信徒", strategy: "守着第十层的禁忌", line: "第十层？没有人上过第十层。" },
  { name: "白虎", personality: "锋利直白", strategy: "逼迫试炼者正面对抗", line: "胜者问规则。败者被规则问。" },
  { name: "朱雀", personality: "温柔燃烧", strategy: "让旧规则在火里重写", line: "烧掉的规则，不会再长出来。" },
  { name: "玄武", personality: "沉稳无边", strategy: "考验生存与耐心", line: "别怕。城墙比你想象的要厚。" },
  { name: "青龙幻影", personality: "威严终局", strategy: "宣布十日裁决", line: "你们的十日，到此为止。" }
];

const zodiacDays = [
  { day: 1, zodiac: "鼠", code: "觉", title: "初醒之日", declaration: "小东西，别急着跑。先看看规则。", effect: "首次消行 x2，方块速度偏慢" },
  { day: 2, zodiac: "牛", code: "固", title: "扎根之日", declaration: "稳一点。急出来的路走不远。", effect: "连续消行奖励递增，消行分数 x1.2" },
  { day: 3, zodiac: "虎", code: "争", title: "白虎试炼", declaration: "别躲。站出来，让我看看你的牙。", effect: "PVP 攻击行与对抗奖励增强" },
  { day: 4, zodiac: "兔", code: "速", title: "疾风之日", declaration: "快，不一定对。但慢，一定死。", effect: "下落速度 x1.5，硬降奖励提高" },
  { day: 5, zodiac: "龙", code: "变", title: "朱雀涅槃", declaration: "稀有？那要看你能不能接住。", effect: "稀有方块概率翻倍，涅槃方块出现" },
  { day: 6, zodiac: "蛇", code: "雾", title: "迷局之日", declaration: "雾里看花。不是看不清，是不想看。", effect: "雾区波动 x2，情报价格翻倍" },
  { day: 7, zodiac: "马", code: "守", title: "玄武守城", declaration: "别停。停下来的那一刻，规则就赢了。", effect: "无尽生存奖励增强" },
  { day: 8, zodiac: "羊", code: "契", title: "结盟之日", declaration: "一个人走不快。三个人可以。", effect: "契约奖励 x2，普通契约创建免费" },
  { day: 9, zodiac: "猴", code: "机", title: "洞察之日", declaration: "知道规则的人，才有资格打破规则。", effect: "情报半价，准确率提升" },
  { day: 10, zodiac: "鸡", code: "鸣", title: "青龙裁决", declaration: "十日已到。回响该响了。", effect: "全效果激活，最终排名结算" }
];

const trainTemplates = [
  { time: "06:00", name: "晨钟列车", effect: "发布当日试炼宣言、裁决生肖与方块属性调整" },
  { time: "12:00", name: "正午列车", effect: "雾区商品波动，并触发回响钟声事件" },
  { time: "18:00", name: "黄昏列车", effect: "规则之眼情报刷新，契约贡献进入锁定前结算" },
  { time: "23:00", name: "午夜列车", effect: "雾区新商品到站，旧商品准备下架" },
  { time: "23:55", name: "终焉列车", effect: "每日结算预告，五分钟倒计时钟鸣" }
];

const fogGoodsPool = [
  ["青龙鳞片", "神兽遗物", "稀有", "一片泛着暗绿光泽的鳞片，触感冰凉，仿佛还在呼吸。"],
  ["白虎利齿", "神兽遗物", "稀有", "齿尖有旧血的颜色，靠近时能听见低吼。"],
  ["朱雀尾羽", "神兽遗物", "史诗", "羽尖不燃却发烫，像一条被折叠的火线。"],
  ["玄武甲片", "神兽遗物", "精良", "沉得像城墙，背面刻着看不懂的水纹。"],
  ["钟摆齿轮", "钟楼零件", "普通", "黄铜齿边磨损严重，仍然按十日节律转动。"],
  ["时针碎片", "钟楼零件", "精良", "碎片上停着一个不存在的整点。"],
  ["发条残段", "钟楼零件", "普通", "拉紧时会发出细小的汽笛声。"],
  ["第三条规则", "规则碎片", "史诗", "纸面空白，只有在钟声响起时才浮现字迹。"],
  ["破格残页", "规则碎片", "稀有", "边缘被火烧过，剩下的句子像故意留给你看。"],
  ["车票残角", "列车遗落物", "普通", "没有车厢号，只有一句：不要上车。"],
  ["汽笛回音", "列车遗落物", "精良", "装在玻璃瓶里的声音，开盖会让人短暂失神。"],
  ["铁轨螺钉", "列车遗落物", "普通", "冰冷、结实，像固定了某种可能。"],
  ["鼠眼石", "生肖符咒", "普通", "在暗处会自己寻找出口。"],
  ["虎牙坠", "生肖符咒", "精良", "佩上后更容易做出不该做的决定。"],
  ["羊契绳", "生肖符咒", "精良", "三股绳拧在一起，解不开，也断不了。"],
  ["猴面铜牌", "生肖符咒", "稀有", "牌面总像在偷笑。"]
];

const oraclePool = [
  ["雾区风向", "市场", "今日「神兽遗物」品类商品将在正午列车后明显波动。", "market_preview", 80, "钟楼顶层掉下来的一张纸条，上面只有几个字。"],
  ["第七列", "战场", "今日第七列更容易成为生死线，硬降前多看一眼。", "battle_hint", 40, "纸条背面画着一条很细的竖线。"],
  ["契约裂缝", "社交", "贡献排名第一的人未必拿到最多奖励，血契例外。", "pact_hint", 50, "墨水还没干，像刚从谁手里抢来。"],
  ["午夜提前", "系统", "午夜列车有概率提前拨动雾区价格。", "train_hint", 120, "车票上的 23:00 被划了两次。"],
  ["生肖偏袒", "系统", "当日生肖更偏袒敢于承担代价的试炼者。", "zodiac_hint", 90, "落款只有一个小小的生肖印。"],
  ["低价陷阱", "市场", "灰蓝色商品的稳定，常常只是下一次坠落的前奏。", "market_warning", 60, "这不是提醒，是警告。"]
];

const guilds = [
  { id: "g-echo", name: "回响小队", level: 5, members: 37, treasury: 18888 },
  { id: "g-clock", name: "钟声同盟", level: 3, members: 24, treasury: 7600 },
  { id: "g-zodiac", name: "生肖观测所", level: 2, members: 16, treasury: 4200 }
];

const marketEvents = [
  "第十日预警：高控盘股票散户热度过高时容易触发钟声下坠",
  "生肖传闻：白酒板块出现反向诱导，跟随前先看规则",
  "交易所故障演练：后续将加入限时无法卖出事件"
];

const missionTemplates = [
  { id: "signin", title: "入城点名", desc: "完成一次每日签到", metric: "signin", target: 1, reward: 120 },
  { id: "clear_10", title: "刻下十道钟痕", desc: "在方块战场累计消除 10 行", metric: "lines", target: 10, reward: 180 },
  { id: "speak_world", title: "钟城发声", desc: "在任意频道发言 1 次", metric: "chat", target: 1, reward: 80 },
  { id: "open_trade", title: "雾区第一单", desc: "完成 1 次股票或期货交易", metric: "trades", target: 1, reward: 160 },
  { id: "guild_action", title: "结盟求生", desc: "创建或加入 1 个公会", metric: "guildActions", target: 1, reward: 220 }
];

const shopItems = [
  { id: "lucky_crit", name: "回声长条", desc: "下一局开局强制获得钟鸣长条", price: 200, type: "buff" },
  { id: "shield_pack", name: "护命钟壳", desc: "立即获得 1 个护盾", price: 300, type: "shield" },
  { id: "rumor_ticket", name: "雾区纸条", desc: "向市场事件池投放一条传闻", price: 150, type: "rumor" },
  { id: "sickle_skin", name: "生肖残印", desc: "获得称号：钟城见证者", price: 888, type: "title" }
];

const campaigns = [
  { id: "boss-night", title: "巨大化方块 BOSS", time: "每日 20:00-20:15", reward: "公会金库与成员金币", status: "预热中" },
  { id: "saturday-war", title: "周六公会战", time: "每周六 20:00", reward: "败方报名费奖池", status: "报名中" },
  { id: "end-day", title: "终焉日警报", time: "后台触发", reward: "钟渊池膨胀，排行榜洗牌", status: "危险" }
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
  },
  v2: {
    dayKey: "",
    fogGoods: [],
    pacts: [],
    oracleCards: [],
    purchasedOracle: {},
    trainLog: []
  }
};

function seeded(seed) {
  let value = crypto.createHash("sha256").update(String(seed)).digest().readUInt32LE(0);
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function cycleNow(now = new Date()) {
  const start = Date.UTC(2025, 11, 31, 16, 0, 0);
  const current = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.max(0, Math.floor((current - start) / dayMs));
  const dayNumber = (elapsedDays % 10) + 1;
  const cycleNumber = Math.floor(elapsedDays / 10) + 1;
  const zodiac = zodiacDays[dayNumber - 1];
  const dayStartedAt = start + elapsedDays * dayMs;
  const dayEndsAt = dayStartedAt + dayMs;
  const activeBeastEvent = dayNumber === 3 ? "白虎" : dayNumber === 5 ? "朱雀" : dayNumber === 7 ? "玄武" : dayNumber === 10 ? "青龙" : null;
  return {
    cycleNumber,
    dayNumber,
    rulingZodiac: zodiac.zodiac,
    zodiacCode: zodiac.code,
    title: zodiac.title,
    declaration: `${zodiac.zodiac}·${zodiac.code}：${zodiac.title}。${zodiac.declaration}`,
    zodiacEffect: zodiac.effect,
    activeBeastEvent,
    dayStartedAt: new Date(dayStartedAt).toISOString(),
    dayEndsAt: new Date(dayEndsAt).toISOString(),
    dayRemaining: Math.max(0, dayEndsAt - current)
  };
}

function trainScheduleFor(cycle = cycleNow()) {
  const start = new Date(cycle.dayStartedAt);
  return trainTemplates.map((item) => {
    const [hour, minute] = item.time.split(":").map(Number);
    const at = new Date(start.getTime() + (hour * 60 + minute) * 60 * 1000);
    return { ...item, at: at.toISOString(), passed: Date.now() > at.getTime() };
  });
}

function rarityPrice(rarity) {
  return { "普通": 180, "精良": 420, "稀有": 860, "史诗": 1680 }[rarity] || 300;
}

function generateFogGoods(cycle) {
  const random = seeded(`fog-${cycle.cycleNumber}-${cycle.dayNumber}`);
  const count = 8 + Math.floor(random() * 5);
  const selected = [...fogGoodsPool].sort(() => random() - 0.5).slice(0, count);
  return selected.map((item, index) => {
    const [name, category, rarity, flavor] = item;
    const volatility = Number((0.1 + random() * (cycle.rulingZodiac === "蛇" ? 0.48 : 0.28)).toFixed(2));
    const basePrice = Math.round(rarityPrice(rarity) * (0.85 + random() * 0.5));
    const drift = cycle.activeBeastEvent === "青龙" ? 1 + (random() > 0.5 ? 0.8 : -0.35) : 1 + (random() - 0.45) * volatility;
    const currentPrice = Math.max(20, Math.round(basePrice * drift));
    const trend = currentPrice > basePrice * 1.08 ? "rising" : currentPrice < basePrice * 0.92 ? "falling" : volatility > 0.28 ? "volatile" : "stable";
    return {
      id: `fg-${cycle.cycleNumber}-${cycle.dayNumber}-${index + 1}`,
      name,
      category,
      rarity,
      basePrice,
      currentPrice,
      volatility,
      trend,
      arrivalTime: cycle.dayStartedAt,
      departureTime: cycle.dayEndsAt,
      flavor,
      priceHistory: [
        { price: basePrice, time: cycle.dayStartedAt },
        { price: currentPrice, time: new Date().toISOString() }
      ]
    };
  });
}

function generateOracleCards(cycle) {
  const random = seeded(`oracle-${cycle.cycleNumber}-${cycle.dayNumber}`);
  return [...oraclePool].sort(() => random() - 0.5).slice(0, 6).map((item, index) => {
    const [title, category, description, effectType, cost, flavor] = item;
    const discount = cycle.rulingZodiac === "猴" ? 0.5 : 1;
    return {
      id: `oc-${cycle.cycleNumber}-${cycle.dayNumber}-${index + 1}`,
      title,
      category,
      description,
      effect: { type: effectType, data: { day: cycle.dayNumber, zodiac: cycle.rulingZodiac } },
      cost: Math.max(10, Math.round(cost * discount)),
      accuracy: Number(Math.min(1, 0.65 + random() * 0.28 + (cycle.rulingZodiac === "猴" ? 0.12 : 0)).toFixed(2)),
      availableUntil: trainScheduleFor(cycle).find((train) => train.name === "黄昏列车")?.at || cycle.dayEndsAt,
      flavor,
      purchased: false
    };
  });
}

function ensureV2State() {
  const cycle = cycleNow();
  const dayKey = `${cycle.cycleNumber}-${cycle.dayNumber}`;
  if (state.v2.dayKey !== dayKey || !state.v2.fogGoods?.length) {
    state.v2.dayKey = dayKey;
    state.v2.fogGoods = generateFogGoods(cycle);
    state.v2.oracleCards = generateOracleCards(cycle);
    state.v2.pacts = [];
    state.v2.purchasedOracle = {};
    state.v2.trainLog = [];
    pushMessage("终焉列车", `【晨钟列车进站】今日试炼宣言：「${cycle.rulingZodiac}·${cycle.zodiacCode}：${cycle.title}」${cycle.zodiacEffect}`, "train", "全城广播");
  }
  return { cycle, trains: trainScheduleFor(cycle) };
}

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
    titles: decodeJson(row.titles_json, ["钟城试炼者"]),
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
  const [rows] = await db.query("SELECT id, type, code, side, qty, cost, entry, created_at FROM user_positions WHERE user_id = ? ORDER BY id DESC LIMIT 50", [userId]);
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
      titles: ["初闻钟声"],
      inventory: { luckyBlocks: 0, skins: [] },
      stats: { chat: 0, trades: 0, guildActions: 0, signin: 0 },
      claimedMissions: {},
      account: null,
      guildId: null,
      lastSignin: null,
      banned: false,
      updatedAt: Date.now()
    };
    pushMessage("钟城广播", `${state.players[id].name} 进入终焉钟城，初始筹码 ${state.economy.initialCoins}`, "system");
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
  player.titles ||= ["初闻钟声"];
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
    for (const key of ["bankerPool", "lossTarget", "inflation", "players", "accounts", "messages", "announcements", "guilds", "marketEvents", "guildBoss", "guildWar", "economy", "flags", "v2"]) {
      if (saved[key] !== undefined) state[key] = saved[key];
    }
    if (Array.isArray(saved.stocks)) state.stocks = saved.stocks;
    if (Array.isArray(saved.futures)) state.futures = saved.futures;
    for (const player of Object.values(state.players)) normalizePlayer(player);
    for (const [username, account] of Object.entries(state.accounts)) normalizeAccount(account, username);
    const oldNpcNames = new Set(["老韭菜", "李老师", "王姐", "程序员", "神秘人", "庄家柜台", "天台保安", "量化小哥", "镰刀实习生", "韭菜导师"]);
    state.messages = state.messages.filter((message) => !oldNpcNames.has(message.author)).slice(0, 60);
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
      flags: state.flags,
      v2: state.v2
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
  if (item.type === "title" && !player.titles.includes("钟城见证者")) player.titles.push("钟城见证者");
  pushMessage("商店柜台", `${player.name} 购买了 ${item.name}`, "event", "世界");
  return { ok: true, player, item };
}

function useItem(player, itemId) {
  if (itemId === "lucky_crit" && player.inventory.luckyBlocks > 0) {
    player.inventory.luckyBlocks -= 1;
    pushMessage("战场柜台", `${player.name} 消耗回声长条，下一局钟鸣长条优先`, "event", "战场");
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
  player.titles = ["钟城试炼者", "初闻钟声"];
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
  pushMessage("户籍柜台", `${player.name} 回到钟城`, "system");
  return { ok: true, player, identity: identityFor(player), account: publicAccount(account) };
}

function snapshot(playerId) {
  const v2 = ensureV2State();
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
    cycle: v2.cycle,
    trains: v2.trains,
    v2: {
      cycle: v2.cycle,
      trains: v2.trains,
      fogGoods: state.v2.fogGoods,
      pacts: state.v2.pacts,
      oracleCards: state.v2.oracleCards,
      npcs: v2Npcs,
      channels: ["全城广播", "钟城广场", "契约频道", "生肖密语", "回响私语"],
      rankings: rankingsV2(),
      collections: collectionsFor(player),
      upgradeTree: upgradeTreeFor(player)
    },
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
    npcs: v2Npcs,
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
    v2: {
      ...base.v2,
      collections: collectionsFor(player),
      upgradeTree: upgradeTreeFor(player)
    },
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
    { name: "齐夏", value: 9066 },
    { name: "乔家劲", value: 7300 },
    { name: "林檎", value: 6666 },
    { name: "楚天秋", value: 5200 },
    { name: "章晨泽", value: 4300 }
  ];
  const fallbackProfit = [
    { name: "楚天秋", value: 12888 },
    { name: "齐夏", value: 7600 },
    { name: "林檎", value: 5200 },
    { name: "陈俊南", value: 3100 },
    { name: "甜甜", value: 666 }
  ];
  const fallbackHarvested = [
    { name: "地虎", value: 99 },
    { name: "青龙", value: 48 },
    { name: "文巧云", value: 32 },
    { name: "陈俊南", value: 21 }
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

function rankingsV2() {
  const players = Object.values(state.players);
  const rows = (mapper, fallback) => [...players.map(mapper), ...fallback]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 50)
    .map((item, index) => ({ rank: index + 1, ...item }));
  const fallback = [
    { name: "齐夏", score: 12880 },
    { name: "林檎", score: 9960 },
    { name: "乔家劲", score: 8800 },
    { name: "楚天秋", score: 7600 },
    { name: "列车长", score: 6400 }
  ];
  return {
    daily_marks: rows((p) => ({ name: p.name, score: p.lines * 100 + p.score }), fallback),
    daily_fog: rows((p) => ({ name: p.name, score: Math.max(0, p.coins - state.economy.initialCoins) }), fallback.slice().reverse()),
    daily_pact: rows((p) => ({ name: p.name, score: Number(p.stats?.guildActions || 0) * 300 + p.lines * 10 }), fallback),
    cycle_total: rows((p) => ({ name: p.name, score: p.score + p.coins }), fallback),
    beast_hall: rows((p) => ({ name: p.name, score: Number(p.stats?.beasts || 0) * 1000 + p.score }), fallback),
    zodiac_album: rows((p) => ({ name: p.name, score: Number(p.stats?.zodiacMarks || 0) * 1000 + p.lines }), fallback)
  };
}

function collectionsFor(player) {
  const lineCount = Number(player?.lines || 0);
  const zodiacMarks = zodiacDays.filter((item) => lineCount >= item.day * 30).map((item) => item.zodiac);
  const beastMarks = [
    lineCount >= 120 ? "白虎" : null,
    Number(player?.score || 0) >= 5000 ? "朱雀" : null,
    Number(player?.shields || 0) >= 3 ? "玄武" : null,
    Number(player?.score || 0) >= 20000 ? "青龙" : null
  ].filter(Boolean);
  return {
    zodiacMarks,
    beastMarks,
    titles: player?.titles || ["钟城试炼者"],
    pathLevel: Math.min(7, 1 + Math.floor(lineCount / 120)),
    pathProgress: lineCount % 120
  };
}

function upgradeTreeFor(player) {
  const stats = player?.stats || {};
  return [
    { category: "score", name: "方块分数", level: Math.min(5, Math.floor(Number(player?.score || 0) / 3000)), nextCost: 500 },
    { category: "shield", name: "护盾上限", level: Math.min(5, Number(player?.shields || 0)), nextCost: 300 },
    { category: "fee", name: "雾区手续费", level: Math.min(5, Math.floor(Number(stats.trades || 0) / 3)), nextCost: 200 },
    { category: "oracle", name: "情报折扣", level: Math.min(5, Math.floor(Number(stats.oracle || 0) / 2)), nextCost: 100 },
    { category: "pact", name: "契约贡献", level: Math.min(5, Math.floor(Number(stats.guildActions || 0) / 2)), nextCost: 500 },
    { category: "train", name: "列车优先权", level: Math.min(3, Math.floor(Number(stats.signin || 0) / 5)), nextCost: 500 }
  ];
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
  if (tags.includes("bomb")) pushMessage("战场广播", `${player.name} 触发终焉反噬，拿走 300 分但头顶开始发凉`, "danger", "战场");
  return { total, base, crit, selfBoom };
}

function moveMarket() {
  for (const stock of state.stocks) {
    const retailPressure = stock.retailHeat > 60 && Math.random() < stock.control * 0.2;
    let delta = (Math.random() - 0.48) * 0.018;
    if (retailPressure) {
      delta = -(0.07 + Math.random() * 0.03);
      pushMessage("钟渊系统", `${stock.name} 人群太挤，盘口突然被钟声压低`, "danger", "市场");
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

function moveFogMarket() {
  const { cycle } = ensureV2State();
  for (const goods of state.v2.fogGoods) {
    const zodiacMultiplier = cycle.rulingZodiac === "蛇" ? 2 : cycle.rulingZodiac === "鸡" ? 1.5 : 1;
    const swing = (Math.random() - 0.48) * goods.volatility * zodiacMultiplier;
    goods.currentPrice = Math.max(20, Math.round(goods.currentPrice * (1 + swing)));
    goods.trend = swing > 0.04 ? "rising" : swing < -0.04 ? "falling" : Math.abs(swing) > 0.02 ? "volatile" : "stable";
    goods.priceHistory = [...(goods.priceHistory || []), { price: goods.currentPrice, time: new Date().toISOString() }].slice(-24);
  }
}

function triggerWorldEvent() {
  const events = [
    ["牛市方块", "全服在线玩家 +50 金币", () => Object.values(state.players).forEach((p) => { p.coins += 50; })],
    ["熊市方块", "当前钟渊池吞入 100 金币", () => { state.bankerPool += 100; }],
    ["内幕消息方块", "内幕：TETRIS 指数即将大幅波动，准确率 70%", () => {}],
    ["试炼者祝福", "下一块更容易出现钟鸣属性", () => {}],
    ["生肖诅咒", "全场旋转手感开始变硬", () => {}]
  ];
  const event = events[Math.floor(Math.random() * events.length)];
  event[2]();
  state.announcements.unshift({ at: new Date().toISOString(), title: event[0], text: event[1] });
  state.announcements = state.announcements.slice(0, 20);
  pushMessage("钟城广播", `${event[0]}：${event[1]}`, "event", "世界");
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
        { title: "实时财经新闻正在同步，钟城先按本地行情广播运行", source: "钟城广播", time: new Date().toISOString(), url: "" }
      ];
    }
  } catch {
    externalData.news = externalData.news.length ? externalData.news : [
      { title: "新闻接口暂不可用，系统保留本地市场广播", source: "钟城广播", time: new Date().toISOString(), url: "" }
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
  if (action === "announce") pushMessage("钟城广播", String(payload.text || "国家队疑似入场"), "admin", "世界");
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
        JSON.stringify(["钟城试炼者"]),
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
    pushMessage("危险操作", "终焉日已触发：全员金币减半，钟渊池膨胀", "danger", "后台");
  }
  if (action === "rage") {
    state.flags.rageMode = Boolean(payload.enabled);
    pushMessage("危险操作", `钟渊狂暴模式：${state.flags.rageMode ? "开启" : "关闭"}`, "danger", "后台");
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
  pushMessage("雾区柜台", `${player.name} 买入 ${stock.name} ${qty} 股，钟渊已记录成本线`, "event", "市场");
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
        JSON.stringify(["钟城试炼者"]),
        JSON.stringify({ luckyBlocks: 0, skins: [] }),
        JSON.stringify({ chat: 0, trades: 0, guildActions: 0, signin: 0 })
      ]);
      const player = await getUserById(result.insertId);
      const token = makeToken();
      await db.query("INSERT INTO sessions (token, user_id) VALUES (?, ?)", [token, result.insertId]);
      pushMessage("账号中心", `${player.name} 注册成为钟城试炼者`, "system", "世界");
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
    pushMessage("账号中心", `${player.name} 登录钟城`, "system", "世界");
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
  if (url.pathname === "/api/cycle/current") {
    const { cycle } = ensureV2State();
    return sendJson(res, { success: true, data: cycle });
  }
  if (url.pathname === "/api/cycle/trains") {
    const { trains } = ensureV2State();
    return sendJson(res, { success: true, data: trains });
  }
  if (url.pathname === "/api/trials/report" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const { cycle } = ensureV2State();
    const lines = Math.max(0, Number(body.lines || 0));
    const score = Math.max(0, Number(body.score || 0));
    const duration = Math.max(0, Number(body.duration || 0));
    const mode = String(body.mode || "normal");
    const zodiacBoost = cycle.rulingZodiac === "牛" ? 1.2 : cycle.rulingZodiac === "鸡" ? 1.5 : 1;
    const beastBoost = cycle.activeBeastEvent === "朱雀" ? 2 : cycle.activeBeastEvent === "玄武" && mode === "survival" ? 1.5 : 1;
    const marks = Math.round((lines * 100 + score * 0.12 + duration * (mode === "survival" ? 10 : 1)) * zodiacBoost * beastBoost);
    player.coins += marks;
    player.score += score;
    player.lines += lines;
    player.stats.trials = Number(player.stats.trials || 0) + 1;
    await saveDbPlayer(player);
    pushMessage("方块试炼", `${player.name} 刻下 ${marks} 道钟痕（${cycle.rulingZodiac}日加成）`, "system", "全城广播");
    return sendJson(res, { success: true, data: { player, marksEarned: marks, cycle } });
  }
  if (url.pathname === "/api/trials/history") {
    const player = await currentPlayer(req);
    return sendJson(res, { success: true, data: player ? [{ score: player.score, lines: player.lines, marks: player.coins, mode: "normal", createdAt: player.lastSeenAt }] : [] });
  }
  if (url.pathname === "/api/player/profile") {
    const player = await currentPlayer(req);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    return sendJson(res, { success: true, data: { player, collections: collectionsFor(player), upgrades: upgradeTreeFor(player) } });
  }
  if (url.pathname === "/api/player/collections") {
    const player = await currentPlayer(req);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    return sendJson(res, { success: true, data: collectionsFor(player) });
  }
  if (url.pathname === "/api/player/engravings") {
    const player = await currentPlayer(req);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    return sendJson(res, { success: true, data: upgradeTreeFor(player) });
  }
  if (url.pathname === "/api/player/engrave" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const upgrade = upgradeTreeFor(player).find((item) => item.category === body.category);
    if (!upgrade) return sendJson(res, { success: false, error: "升级项不存在" }, 400);
    if (player.coins < upgrade.nextCost) return sendJson(res, { success: false, error: "刻痕不足" }, 400);
    player.coins -= upgrade.nextCost;
    player.stats[`engrave_${upgrade.category}`] = Number(player.stats[`engrave_${upgrade.category}`] || 0) + 1;
    await saveDbPlayer(player);
    pushMessage("铭刻之书", `${player.name} 升级了「${upgrade.name}」`, "system", "全城广播");
    return sendJson(res, { success: true, data: { player, upgrades: upgradeTreeFor(player) } });
  }
  if (url.pathname === "/api/fog/goods") {
    ensureV2State();
    let goods = state.v2.fogGoods;
    if (url.searchParams.get("category")) goods = goods.filter((item) => item.category === url.searchParams.get("category"));
    if (url.searchParams.get("rarity")) goods = goods.filter((item) => item.rarity === url.searchParams.get("rarity"));
    return sendJson(res, { success: true, data: goods });
  }
  if (url.pathname.startsWith("/api/fog/goods/")) {
    ensureV2State();
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const goods = state.v2.fogGoods.find((item) => item.id === id);
    return sendJson(res, { success: Boolean(goods), data: goods, error: goods ? undefined : "商品不存在" }, goods ? 200 : 404);
  }
  if (url.pathname === "/api/fog/positions") {
    const player = await currentPlayer(req);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const positions = (player.positions || []).filter((item) => item.type === "fog").map((position) => {
      const goods = state.v2.fogGoods.find((item) => item.id === position.code);
      return { ...position, goods, currentPrice: goods?.currentPrice || position.entry || position.cost };
    });
    return sendJson(res, { success: true, data: positions });
  }
  if (url.pathname === "/api/fog/buy" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    ensureV2State();
    const goods = state.v2.fogGoods.find((item) => item.id === body.goodsId);
    const quantity = Math.max(1, Math.min(99, Number(body.quantity || 1)));
    if (!goods) return sendJson(res, { success: false, error: "商品不存在" }, 404);
    const fogCount = (player.positions || []).filter((item) => item.type === "fog").length;
    if (fogCount >= 5) return sendJson(res, { success: false, error: "雾区持仓最多 5 种" }, 400);
    const cost = goods.currentPrice * quantity;
    if (player.coins < cost) return sendJson(res, { success: false, error: "刻痕不足" }, 400);
    player.coins -= cost;
    player.stats.trades = Number(player.stats.trades || 0) + 1;
    if (dbReady) await db.query("INSERT INTO user_positions (user_id, type, code, qty, cost, entry) VALUES (?, ?, ?, ?, ?, ?)", [player.userId, "fog", goods.id, String(quantity), cost, goods.currentPrice]);
    await saveDbPlayer(player);
    pushMessage("雾区交易所", `${player.name} 买入 ${goods.name} x${quantity}，列车已经记录这笔可能`, "system", "全城广播");
    const fresh = await getUserById(player.userId);
    return sendJson(res, { success: true, data: { player: fresh || player, goods } });
  }
  if (url.pathname === "/api/fog/sell" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const position = (player.positions || []).find((item) => String(item.id) === String(body.positionId));
    if (!position || position.type !== "fog") return sendJson(res, { success: false, error: "持仓不存在" }, 404);
    const goods = state.v2.fogGoods.find((item) => item.id === position.code);
    const income = Math.round((goods?.currentPrice || Number(position.entry || 0)) * Number(position.qty || 1) * 0.98);
    player.coins += income;
    if (dbReady) await db.query("DELETE FROM user_positions WHERE id = ? AND user_id = ?", [position.id, player.userId]);
    await saveDbPlayer(player);
    pushMessage("雾区交易所", `${player.name} 卖出 ${goods?.name || position.code}，收回 ${income} 刻痕`, "system", "全城广播");
    const fresh = await getUserById(player.userId);
    return sendJson(res, { success: true, data: { player: fresh || player, income } });
  }
  if (url.pathname === "/api/pact/available") {
    ensureV2State();
    return sendJson(res, { success: true, data: state.v2.pacts.filter((pact) => pact.status === "open") });
  }
  if (url.pathname === "/api/pact/mine") {
    const player = await currentPlayer(req);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const pact = state.v2.pacts.find((item) => item.members.some((member) => member.userId === player.id));
    return sendJson(res, { success: true, data: pact || null });
  }
  if (url.pathname === "/api/pact/create" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const { cycle } = ensureV2State();
    const fee = { "普通": cycle.rulingZodiac === "羊" ? 0 : 200, "生肖": 500, "神兽": 1000, "血契": 2000 }[body.type] ?? 200;
    if (player.coins < fee) return sendJson(res, { success: false, error: "刻痕不足" }, 400);
    player.coins -= fee;
    const pact = {
      id: `p-${crypto.randomUUID().slice(0, 8)}`,
      name: String(body.name || "回响三人").slice(0, 16),
      type: String(body.type || "普通"),
      openSlots: 2,
      members: [{ userId: player.id, name: player.name, contribution: 0, joinedAt: new Date().toISOString() }],
      totalContribution: 0,
      rewardPool: 0,
      zodiacBonus: cycle.rulingZodiac,
      status: "open",
      createdAt: new Date().toISOString()
    };
    state.v2.pacts.unshift(pact);
    player.stats.guildActions = Number(player.stats.guildActions || 0) + 1;
    await saveDbPlayer(player);
    pushMessage("契约广场", `${player.name} 创建试炼契约「${pact.name}」`, "system", "全城广播");
    return sendJson(res, { success: true, data: pact });
  }
  if (url.pathname === "/api/pact/join" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const pact = state.v2.pacts.find((item) => item.id === body.pactId && item.status === "open");
    if (!pact) return sendJson(res, { success: false, error: "契约不存在" }, 404);
    if (pact.members.some((member) => member.userId === player.id)) return sendJson(res, { success: false, error: "已经在契约中" }, 400);
    if (pact.members.length >= 3) return sendJson(res, { success: false, error: "契约已满" }, 400);
    pact.members.push({ userId: player.id, name: player.name, contribution: 0, joinedAt: new Date().toISOString() });
    pact.openSlots = Math.max(0, 3 - pact.members.length);
    player.stats.guildActions = Number(player.stats.guildActions || 0) + 1;
    await saveDbPlayer(player);
    pushMessage("契约广场", `${player.name} 加入试炼契约「${pact.name}」`, "system", "全城广播");
    return sendJson(res, { success: true, data: pact });
  }
  if (url.pathname === "/api/pact/leave" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const pact = state.v2.pacts.find((item) => item.id === body.pactId);
    if (!pact) return sendJson(res, { success: false, error: "契约不存在" }, 404);
    pact.members = pact.members.filter((member) => member.userId !== player.id);
    pact.openSlots = Math.max(0, 3 - pact.members.length);
    return sendJson(res, { success: true, data: pact });
  }
  if (url.pathname === "/api/oracle/cards") {
    ensureV2State();
    return sendJson(res, { success: true, data: state.v2.oracleCards.filter((card) => !card.purchased) });
  }
  if (url.pathname === "/api/oracle/buy" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const card = state.v2.oracleCards.find((item) => item.id === body.cardId && !item.purchased);
    if (!card) return sendJson(res, { success: false, error: "情报不存在或已售出" }, 404);
    if (player.coins < card.cost) return sendJson(res, { success: false, error: "刻痕不足" }, 400);
    player.coins -= card.cost;
    player.stats.oracle = Number(player.stats.oracle || 0) + 1;
    card.purchased = true;
    card.purchasedBy = player.id;
    await saveDbPlayer(player);
    pushMessage("规则之眼", `${player.name} 买走情报「${card.title}」`, "system", "全城广播");
    return sendJson(res, { success: true, data: { card, player } });
  }
  if (url.pathname.startsWith("/api/rankings/")) {
    const category = url.pathname.split("/").pop();
    const data = rankingsV2()[category] || [];
    return sendJson(res, { success: true, data: data.slice(0, Number(url.searchParams.get("limit") || 50)) });
  }
  if (url.pathname === "/api/broadcast/messages") {
    const channel = url.searchParams.get("channel");
    let messages = state.messages;
    if (channel) messages = messages.filter((item) => item.channel === channel || (channel === "全城广播" && item.kind !== "chat"));
    return sendJson(res, { success: true, data: messages.slice(0, Number(url.searchParams.get("limit") || 50)) });
  }
  if (url.pathname === "/api/broadcast/send" && req.method === "POST") {
    const body = await readBody(req);
    const player = await currentPlayer(req, body);
    if (!player) return sendJson(res, { success: false, error: "请先登录" }, 401);
    const channel = String(body.channel || "钟城广场").slice(0, 16);
    pushMessage(player.name, String(body.content || "").slice(0, 160), "player", channel);
    player.stats.chat = Number(player.stats.chat || 0) + 1;
    await saveDbPlayer(player);
    return sendJson(res, { success: true, data: state.messages.slice(0, 50) });
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
      pushMessage("钟城广播", `${player.name} 每日签到领取 500 金币`, "system", "世界");
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
setInterval(moveFogMarket, 7000);
setInterval(() => {
  const npc = v2Npcs[Math.floor(Math.random() * v2Npcs.length)];
  pushMessage(npc.name, npc.line, "npc", ["地虎", "青龙", "楚天秋", "列车长"].includes(npc.name) ? "全城广播" : "钟城广场");
}, 9000);
setInterval(() => {
  if (Date.now() >= state.flags.nextEventAt) triggerWorldEvent();
}, 1000);
setInterval(refreshExternalData, 5 * 60 * 1000);
setInterval(saveState, 5000);

if (state.messages.length === 0) {
  pushMessage("钟城广播", "终焉钟城开门：金币无真实价值，但每一道回响都会留下痕迹。", "system", "世界");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    saveState();
    process.exit(0);
  });
}
