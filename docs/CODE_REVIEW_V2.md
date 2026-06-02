# 终焉钟城 V2 代码审查报告

> 审查对象：提交 `89dd63a` — "Implement Zhongyan V2 SPA framework"
> 对照基准：`docs/DESIGN_V2.md`（V2.0 权威设计文档）
> 审查日期：2026-06-02

---

## 总评

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | ⭐⭐ | 3 个文件承载了 DESIGN_V2 规划的 70+ 文件架构，全部逻辑堆在 1 个 JS 里 |
| 设计文档符合度 | ⭐⭐ | 12 大系统中 2 个完全缺失，6 个实现严重残缺 |
| 代码质量 | ⭐⭐⭐ | 功能基本能跑，但上帝对象、内存-数据库双写、全局状态污染严重 |
| 可维护性 | ⭐ | 服务器重启后 V2 核心数据全部丢失，无法迭代 |
| 视觉效果 | ⭐⭐⭐ | 三面板布局可用，暗色铜绿调基本到位 |

**核心问题**：AI 把 DESIGN_V2 当成了"灵感参考"而不是"施工蓝图"。只实现了骨架，填了极少的内容，大量核心系统被跳过。

---

## 一、致命缺陷（阻塞上线）

### B1. V2 数据无持久化 — 服务器重启 = 玩家数据清空

**严重程度**：🔴 P0

DESIGN_V2 要求 15 张 MySQL 表，当前仍然只用 V1 的 4 张旧表（`users`、`sessions`、`chat_messages`、`user_positions`）。

**以下 V2 核心数据全部存储在内存 `state.v2` 中，重启即丢失：**

```javascript
// server/index.js 第 241-247 行 — 全部在内存中
state.v2 = {
  dayKey: "",
  fogGoods: [],      // 雾区商品 → 丢
  pacts: [],          // 试炼契约 → 丢
  oracleCards: [],    // 规则之眼 → 丢
  purchasedOracle: {}, // 购买记录 → 丢
  trainLog: []        // 列车日志 → 丢
};
```

**后果**：
- 玩家在雾区买的商品、创建的契约、购买的情报，服务器一重启全没
- `state.json` 持久化虽然5秒执行一次，但 V2 的 `fogGoods`/`pacts`/`oracleCards` 根本没持久化到底层存储
- 玩家收集的生肖印记、神兽印记、钟渊之路进度——全部基于 `collectionsFor()` 动态计算（依赖 `player.lines` 和 `player.score`），不独立存储

**需要**：按 DESIGN_V2 §5 建 15 张表，把 `state.v2` 里的每项数据都落到对应 MySQL 表。

---

### B2. 双身份体系仍然并存

**严重程度**：🔴 P0

DESIGN_V2 要求"砍掉 state.json 和内存 state.players，全部走 MySQL"。

但代码中同时存在：
1. **MySQL 用户**（`users` 表）— 通过 `currentPlayer()` → `getUserByToken()` 获取
2. **内存玩家**（`state.players`）— 通过 `ensurePlayer()` 创建

```javascript
// server/index.js 第 623 行
function ensurePlayer(id) {
  if (!id) id = crypto.randomUUID();
  if (!state.players[id]) {
    state.players[id] = { /* 创建一个完整的内存玩家 */ };
  }
  return normalizePlayer(state.players[id]);
}
```

**问题**：
- `currentPlayer()` 返回的 `player.id` 格式是 `"u-123"`（MySQL），但 `ensurePlayer("u-123")` 会把它当内存 key
- 如果用户通过内存玩家登录过，`snapshot()` 返回的是内存数据而非数据库数据
- `ensureV2State()` 不依赖数据库用户，游客也能玩方块试炼但上报时才会校验登录

**需要**：彻底删除 `ensurePlayer()` 和 `state.players`，所有用户操作统一从 MySQL 读/写。

---

### B3. WebSocket 完全缺失

**严重程度**：🔴 P0

DESIGN_V2 §7 定义了 18 种 WebSocket 消息类型（实时广播、列车进站、雾区价格推送、生肖更替通知等）。

**当前实现用 3.5 秒轮询替代**：

```javascript
// public/js/v2-main.js 第 491 行
setInterval(load, 3500);   // 每 3.5 秒全量拉取
setInterval(tickClock, 1000); // 时钟独立每秒更新
```

**后果**：
- 广播消息延迟 0-3.5 秒，方块试炼结束 3.5 秒后才看到排行榜更新
- 雾区价格变动、契约有人加入、情报被买走——都不是实时的
- 无法实现 DESIGN_V2 中的"钟声倒计时""四象降临即时通知"等实时事件
- 每个客户端每 3.5 秒拉一次全量 `/api/state`，10 个人在线 = 每分钟 170 次请求

**需要**：按 DESIGN_V2 §7 实现 WebSocket 服务。

---

## 二、设计文档缺失项（严重不符合 DESIGN_V2）

### M1. 生肖试炼系统 — 完全缺失

DESIGN_V2 §2.9 定义了 12 种每日生肖特殊试炼：
- 鼠：小块模式（5×5棋盘，速度2x）
- 牛：重型模式（方块变重，硬降伤害加倍）
- 虎：PVP模式（攻击行x2）
- …等 12 种

**当前实现**：`zodiacDays` 数组只有文字描述（第 86-97 行），没有任何游戏机制。

```javascript
// 只有 flavor text，零游戏逻辑
{ day: 1, zodiac: "鼠", code: "觉", title: "初醒之日", 
  declaration: "小东西，别急着跑。先看看规则。", 
  effect: "首次消行 x2，方块速度偏慢" }
// "方块速度偏慢" 这行字在代码里没有任何地方被引用，trial.timer 始终是 760ms
```

**需要**：每种生肖写实际的 `modifyTrialRules()` 函数，改变棋盘大小、速度、方块池、分数计算。

---

### M2. 四象神兽事件 — 完全缺失

DESIGN_V2 §2.10 定义了 4 种全局事件：
- **白虎试炼**（第3天）：全服 PVP 对决，攻击行系统
- **朱雀涅槃**（第5天）：死后重生一次，稀有方块概率翻倍
- **玄武守城**（第7天）：无尽生存模式，按存活时间排名
- **青龙裁决**（第10天）：全服结算，大排行榜发布

**当前实现**：只有一行字符串：

```javascript
// server/index.js 第 268 行
const activeBeastEvent = dayNumber === 3 ? "白虎" : dayNumber === 5 ? "朱雀" : dayNumber === 7 ? "玄武" : dayNumber === 10 ? "青龙" : null;
// 这行代码的结果只用于雾区商品价格计算（第 307 行）和试炼上报（第 1367 行），没有实际的游戏机制
```

**需要**：每种神兽写独立的游戏模式逻辑。

---

### M3. 终焉列车交互 — 仅显示时刻表

DESIGN_V2 §2.3 要求列车进站时触发交互事件：
- 晨钟列车 → 发布今日宣言 + 方块属性调整
- 正午列车 → 全服广播 + 雾区价格剧烈波动
- 黄昏列车 → 情报刷新 + 契约贡献结算
- 午夜列车 → 新商品上架 + 旧商品打折/下架
- 终焉列车 → 5分钟倒计时 + 全屏钟鸣

**当前实现**：`trainScheduleFor()` 只是算了一个时间数组（第 284-293 行），前端只显示"下一班列车：XXX HH:MM"。

没有任何定时器去触发列车事件的游戏逻辑。

**需要**：为每班列车写 `setTimeout` / `setInterval` 触发器，在到站时刻执行对应的 `onTrainArrive()` 回调。

---

### M4. 雾区交易缺少 T+1 规则

DESIGN_V2 §2.2 明确规定：**今天买入的商品必须等到次日才能卖出**。

**当前实现**：买入后立即可以卖出，没有任何时间限制。

```javascript
// server/index.js 第 1451-1465 行
// /api/fog/sell 没有检查买入日期，直接允许卖出
```

**需要**：在 `user_positions` 表（或新表）中记录 `bought_at`，卖出时校验是否跨天。

---

### M5. 试炼契约缺少贡献追踪

DESIGN_V2 §2.4 要求：契约成员贡献追踪、奖励分配（按贡献比例）。

**当前实现**：

```javascript
// 加入契约时 contribution 为 0
{ userId: player.id, name: player.name, contribution: 0, joinedAt: ... }
// 但没有任何地方更新 contribution
```

**需要**：消行时给当前契约成员加贡献，每日结算时按贡献分配奖励。

---

### M6. 规则之眼情报效果未执行

DESIGN_V2 §2.5：购买情报后应有实际效果（如"正午列车后神兽遗物波动"→ 触发实际价格变化）。

**当前实现**：购买后只是标记 `card.purchased = true`，发送一条广播，无任何游戏效果。

```javascript
// server/index.js 第 1531-1544 行
// /api/oracle/buy — 只改了 purchased 标志，发了一条广播
card.purchased = true;
card.purchasedBy = player.id;
pushMessage("规则之眼", `${player.name} 买走情报「${card.title}」`, "system", "全城广播");
// ← 情报的 effect 数据从未被使用
```

**需要**：购买情报后，按 `card.effect.type` 触发对应游戏机制。

---

### M7. 铭刻升级树与实际属性无关联

DESIGN_V2 §2.7 要求升级树的每级对应实际属性提升（如"方块分数 Lv.2 → 消行分数 x1.2"）。

**当前实现**：`upgradeTreeFor()` 返回升级列表，前端渲染升级按钮，购买后只是扣钱 + 记录 `stats.engrave_XXX` 计数，**没有实际效果**。

```javascript
// server/index.js 第 1396-1407 行
// /api/player/engrave — 只是扣钱 + 记录计数
player.coins -= upgrade.nextCost;
player.stats[`engrave_${upgrade.category}`] = Number(player.stats[`engrave_${upgrade.category}`] || 0) + 1;
// ← 升级后消除分数、手续费等没有任何变化
```

**需要**：每个升级类别绑定实际属性，如 `upgrade.score.level` 影响 `settleLines()` 的计算。

---

## 三、架构问题

### A1. God Object — 单文件 1792 行

DESIGN_V2 §4 要求 `server/` 目录下至少 14 个文件（config, db/, models/, controllers/, services/, ws/, middleware/）。

**当前**：全部在 `server/index.js` 一个文件里。

**问题**：任何修改都要在 1792 行中找到正确位置，函数间隐式依赖 `state` 全局变量，无法单元测试。

---

### A2. CSS 混合 V1 和 V2 样式

`styles.css` 共 1888 行，其中：
- **第 1-544 行**：V2 三面板 SPA 样式（`.v2-*`）
- **第 546-1888 行**：V1 遗留样式（`.game-header`、`.market-zone`、`.rank-grid` 等）

V1 的全局 `button` 样式（第 1025-1036 行，蓝色 `#2f7df6`）会覆盖 V2 面板中的按钮样式。旧 CSS 变量（`:root` 的 `--gold: #f2c14e`）和新变量（`.v2-body` 的 `--color-accent-brass: #c5a55a`）共存但语义不同。

---

### A3. 旧代码仍在运行

```
server/index.js 第 1770-1779 行：
setInterval(moveMarket, 4000);          // V1 股票行情 — SPA 不用但还在跑
setInterval(refreshExternalData, 5*60*1000);  // V1 真实股票API — 还在调东方财富
setInterval(moveFogMarket, 7000);       // V2 雾区 — 正常用
```

`refreshRealStocks()` 每 5 分钟调东方财富 API 拉 8 只真实股票价格，但 SPA 根本不显示这些数据。`moveMarket()` 每 4 秒模拟 8 只 V1 股票波动。

---

## 四、代码质量问题

### Q1. 前端轮询导致数据不一致

```javascript
// v2-main.js 第 490 行
load().catch((error) => toast(error.message));   // 首屏加载
setInterval(load, 3500);                          // 每 3.5 秒覆盖全部 state
```

每次 `load()` 全量覆盖全局 `state`，但用户可能正在看雾区某个商品详情——3.5 秒后页面内容被整个替换。`renderTab()` 和 `renderChronicle()` 都是全量 innerHTML 重绘，用户在输入框的内容、展开的详情都会丢失。

---

### Q2. innerHTML 重绘丢失交互状态

```javascript
// v2-main.js 第 142 行
$("#chronicleContent").innerHTML = `...大段HTML...`;
// 第 180 行
$("#tabContent").innerHTML = `...大段HTML...`;
```

每次 `renderAll()` → `renderTab()` 都全量 innerHTML 替换。如果用户正在广播输入框里打字，3.5 秒后输入框被替换为新 DOM，内容丢失。

---

### Q3. money() 函数处理 NaN

```javascript
// v2-main.js 第 56-58 行
function money(value) {
  return Math.round(Number(value || 0)).toLocaleString("zh-CN");
}
```

正常情况能工作，但如果后端返回 `state.player.coins = undefined`，会显示 `"0"`——这没问题。但如果后端返回空对象，`Number({})` = NaN，`Math.round(NaN)` = NaN，`NaN.toLocaleString(...)` 会显示 `"NaN"`。

**修复**：`return (Number(value) || 0).toLocaleString("zh-CN")`；

注意：不能改成 `Number.isFinite(value) ? ... : "0"` 因为 `Number("123")` 也是 finite。

---

### Q4. shapes 引用共享可能导致方块突变

```javascript
// v2-main.js 第 305-308 行
function makePiece(type = null) {
  const shape = type || keys[Math.floor(Math.random() * keys.length)];
  return { type: shape, matrix: shapes[shape].map((row) => [...row]), x: 3, y: 0, ...blockDefs[shape] };
}
```

`shapes[shape].map((row) => [...row])` 正确做了浅拷贝，这个问题实际上避免了。✅

但 `merge()` 函数第 325 行把整个 piece 对象塞进 grid：

```javascript
trial.grid[trial.piece.y + y][trial.piece.x + x] = { ...trial.piece };
```

这里的展开运算符会复制 `name`、`glyph`、`color`、`matrix` 等所有属性。`matrix` 是二维数组引用，后续如果 piece 被回收重用（虽然 makePiece 每次都新建），可能有问题。当前 makepiece 每次 new，所以影响不大。但如果后续加了对象池优化，这里会出 bug。

---

### Q5. 客户端时钟漂移

```javascript
// v2-main.js 第 106-108 行
function currentServerTime() {
  return clockBase ? clockBase + Date.now() - clockSyncedAt : Date.now();
}
```

每次 `load()` 同步一次，但两次 load 之间间隔 3.5 秒，加上网络延迟，时钟可能与服务器偏差 1-3 秒。对于"终焉列车 5 分钟倒计时"这种精确计时场景不够。

---

### Q6. 前端 Canvas 尺寸硬编码

```javascript
// v2-main.js 第 32 行
cell: 30,           // 每个格子 30px
// index.html 第 37 行
<canvas id="trialBoard" width="300" height="600"></canvas>
```

`10 × 30 = 300` 和 `20 × 30 = 600` 是匹配的。但在高清屏上（如 MacBook Retina），Canvas 会模糊。没有做 `devicePixelRatio` 适配。

---

## 五、安全问题

### S1. Token 存储不安全

```javascript
// v2-main.js 第 68-70 行
function setSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}
```

Token 存在 `localStorage`，任意注入的 XSS 脚本都能读取。Web 应用应当使用 `httpOnly` cookie。

---

### S2. 广播输入未做频率限制

```javascript
// server/index.js 第 1557-1565 行
// /api/broadcast/send — 无频率限制
```

用户可以无限发送广播消息，没有 1 秒/条的限制。

---

### S3. 管理员密码明文

```javascript
// docker-compose.yml 第 31 行
ADMIN_PASSWORD: gambleMaster666
// server/index.js 第 14 行
const adminPassword = process.env.ADMIN_PASSWORD || "gambleMaster666";
```

密码以明文存在 `docker-compose.yml` 和环境变量中。

---

## 六、V1 遗留死代码

以下 V1 代码在 SPA 中不再使用，但仍然存在并运行：

| 文件 | 行数 | 说明 |
|------|------|------|
| `public/game.html` | — | V1 游戏页面 |
| `public/market.html` | — | V1 交易市场 |
| `public/guilds.html` | — | V1 公会 |
| `public/rankings.html` | — | V1 排行榜 |
| `public/chat.html` | — | V1 聊天室 |
| `public/profile.html` | — | V1 个人页 |
| `public/activities.html` | — | V1 活动中心 |
| `public/admin.html` | — | V1 后台（仍在用） |
| `public/js/lobby.js` | — | V1 大厅逻辑 |
| `public/js/auth.js` | — | V1 认证逻辑 |
| `public/js/chat.js` | — | V1 聊天 |
| `public/js/market.js` | — | V1 市场 |
| `public/js/profile.js` | — | V1 个人页 |
| `public/js/rankings.js` | — | V1 排行榜 |
| `public/js/activities.js` | — | V1 活动 |
| `public/js/guilds.js` | — | V1 公会 |
| `public/js/shared.js` | — | V1 公共函数 |
| `public/app.js` | — | V1 方块引擎 |

服务端仍在运行的 V1 代码：
- `state.stocks` 数组 + `moveMarket()`（每 4 秒）
- `state.futures` 数组
- `refreshRealStocks()` + `refreshNews()`（每 5 分钟调东方财富 API）
- `state.guilds` + `/api/guild/*` 路由
- `/api/trade/stock` 和 `/api/trade/future` 路由
- `/api/chat/red-packet` 红包路由
- `/api/shop/buy` 商店路由
- `/api/missions/claim` 任务路由

---

## 七、修复优先级

### P0 — 必须立即修复

| 编号 | 问题 | 位置 |
|------|------|------|
| B1 | V2 数据无持久化 | server/index.js |
| B2 | 双身份体系 | server/index.js ensurePlayer() |
| B3 | 无 WebSocket | 全局 |
| M1 | 生肖试炼无游戏逻辑 | server/index.js + v2-main.js |
| M2 | 四象神兽事件缺失 | server/index.js + v2-main.js |
| M3 | 终焉列车仅显示无交互 | server/index.js |
| A1 | 单文件 God Object | server/index.js → 拆分 |

### P1 — 迭代二修复

| 编号 | 问题 | 位置 |
|------|------|------|
| M4 | 雾区无 T+1 规则 | server/index.js /api/fog/sell |
| M5 | 契约无贡献追踪 | server/index.js /api/pact/* |
| M6 | 情报效果未执行 | server/index.js /api/oracle/buy |
| M7 | 铭刻升级无实际效果 | server/index.js /api/player/engrave |
| Q1 | 轮询全量覆盖 | v2-main.js renderAll() |
| Q2 | innerHTML 丢失交互状态 | v2-main.js renderTab() |
| A3 | 旧代码仍在运行 | server/index.js 定时器 |

### P2 — 迭代三修复

| 编号 | 问题 | 位置 |
|------|------|------|
| A2 | CSS 混合 V1/V2 | styles.css → 拆分 |
| Q3 | money() NaN 处理 | v2-main.js |
| Q5 | 时钟漂移 | v2-main.js currentServerTime() |
| Q6 | Canvas 未适配 Retina | v2-main.js drawTrial() |
| S1 | Token 存储不安全 | v2-main.js + server/index.js |
| S2 | 广播无频率限制 | server/index.js |
| S3 | 管理员密码明文 | docker-compose.yml |
| — | V1 死代码清理 | 所有 V1 文件 |

---

## 八、修复建议汇总（可直接给 AI 的 prompt）

以下是一份简洁的修复任务指令，可以直接发给 AI 编码助手：

```
请按以下要求修复终焉钟城 V2 代码：

1. **拆分 server/index.js**：按 docs/DESIGN_V2.md §4 的要求，拆成 config.js、db/pool.js、
   models/、controllers/、services/、ws/、middleware/ 目录结构。

2. **建 MySQL 表**：按 docs/DESIGN_V2.md §5 建 15 张新表（fog_goods、pacts、pact_members、
   oracle_cards、player_collections、player_upgrades、trial_records 等），
   把所有 state.v2 中的数据迁移到数据库。

3. **删除 state.players**：彻底删除 ensurePlayer() 和 state.players 对象，
   所有玩家操作统一走 MySQL。把 currentPlayer() 作为唯一的玩家获取入口。

4. **实现 WebSocket**：用 ws 库实现 WebSocket 服务（端口 8080 同端口），
   按 docs/DESIGN_V2.md §7 定义 18 种消息类型。前端用 WebSocket 替代 setInterval(load, 3500)。

5. **实现生肖试炼**：每个生肖日写实际的游戏规则函数（改棋盘、速度、分数、方块类型概率），
   不只是显示文字。

6. **实现四象事件**：白虎 PVP、朱雀涅槃、玄武守城、青龙裁决四种游戏模式，
   每种有独立的 game mode 逻辑和 UI。

7. **实现列车事件触发器**：为 5 班列车设置定时器，到站触发对应的游戏事件。

8. **雾区加 T+1**：在 user_positions 或新表记录买入日期，卖出时校验跨日。

9. **契约加贡献**：消行时更新当前契约成员的 contribution，每日结算时按比例分配奖励。

10. **情报加效果**：购买情报后，根据 card.effect 类型执行对应的游戏机制。

11. **铭刻升级加效果**：每个升级类别的 level 绑定实际的属性加成。

12. **清理 V1 死代码**：删除所有 V1 的 HTML/JS 文件，停止 moveMarket()、
    refreshRealStocks() 等 V1 定时器。

13. **拆分 styles.css**：把 V2 样式拆成 variables.css、layout.css、components/ 目录，
    删除所有 V1 样式和 V1 CSS 变量。

14. **修复前端性能**：用 DOM diff 或局部更新替代全量 innerHTML 替换，
    避免每 3.5 秒覆盖用户输入。

15. **Canvas Retina 适配**：用 devicePixelRatio 缩放 Canvas 绘制。
```

---

*文档生成：WorkBuddy 代码审查*
