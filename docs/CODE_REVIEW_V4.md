# 终焉钟城 V4 代码审查报告

> **审查时间**：2026-06-02 15:42
> **审查范围**：提交 `7c464b4 Improve trial game feel`（8 文件 / +1215 -74 行）
> **审查者**：WorkBuddy（自动代码审查）
> **审查目标**：生成结构化问题清单，供其他 AI 直接按清单逐一修复

---

## 总体评估

### 📊 改善情况

| 维度 | V3 审查时 | 当前状态 | 变化 |
|------|----------|----------|------|
| 音效系统 | ❌ V2 完全静音 | ✅ 8种 SFX + BGM + 心跳警告 | **大幅改善** |
| 方块特殊能力 | ❌ 4/7 无效果 | ✅ 7/7 有实际效果 | **已修复** |
| 幽灵方块 | ❌ 缺失 | ✅ 已实现 | **已修复** |
| 屏幕震动 | ❌ 缺失 | ✅ 消行 + 硬降震动 | **已修复** |
| 消行粒子 | ❌ 缺失 | ✅ 粒子 + 波纹 + 浮字 | **已修复** |
| WebSocket | ❌ 只有轮询 | ✅ WebSocket 已实现 | **已修复** |
| 生肖试炼 | ❌ 缺失 | ❌ 仍缺失 | 无变化 |
| 四象神兽事件 | ❌ 缺失 | ❌ 仍缺失 | 无变化 |

### 🔴 核心问题：V1/V2 双引擎分裂

**这是当前最严重的问题。项目里实际存在两套完全独立的俄罗斯方块引擎：**

| 引擎 | 文件 | 行数 | 运行页面 | 功能特点 |
|------|------|------|----------|----------|
| V1 旧引擎 | `public/app.js` | 1383行 | `game.html` | 5种游戏模式、特殊修饰符(回溯/钟摆/诅咒)、七层境界、低语系统、回响记忆、铭刻标记、金币浮窗、Web Speech |
| V2 新引擎 | `public/js/v2-main.js` | 1062行 | `index.html`(SPA) | 7种方块能力、生肖/神兽影响速度、雾区交易、试炼契约、规则之眼、WebSocket、广播/名录面板 |

**两个引擎各有一套独立实现：**
- 两套音效系统（`tone()`/`playSfx()` vs `ring()`/`playBell()`）
- 两套方块绘制（带铭文标签 vs 带铭文标签 + 齿轮放射线）
- 两套消行逻辑（带方块能力 vs 带特殊修饰符）
- 两套幽灵方块算法
- 两套游戏循环（requestAnimationFrame 各自独立）

**部署现状**：`150.158.10.10:8080` 提供的是 `index.html`（V2 SPA），`game.html`（V1）隐藏但可访问。玩家只能玩到 V2 引擎，错失了 V1 独有的全部内容。

---

## 🔴 P0 · 致命缺陷（3个）

### P0-1：两套引擎功能互不兼容，玩家体验残缺

**V1 有但 V2 没有的功能**（玩家访问 V2 SPA 时玩不到）：
- 特殊修饰符：时间倒流(rewind)、钟摆(pendulum)、诅咒(curse)——28%概率出现
- 5 种游戏模式：昼夜标准、60秒限时、精准刻度、倒计时生存、节拍坠落
- 七层极道境界（闻钟→见痕→知返→听澜→破界→忘时→极道）
- 终焉低语（4 句触发台词 + Web Speech 朗读）
- 历史回溯（5 步快照 + 钟渊能量兑换回退）
- 铭刻系统（消行留下钟声符文，双重铭刻变亮金）
- 金币浮窗（棋盘上随机拾取）
- 终焉刻度 + 终焉觉醒

**V2 有但 V1 没有的功能**（玩家访问 game.html 时玩不到）：
- 7 种方块主动能力（钟鸣长条 45% 加分、回响碎片随机碎块、迷雾曲线毒息加分、列车道钉拾取、铭刻之笔减速、生肖残印垃圾行+高奖励、规则方块护盾）
- 生肖/神兽影响下落速度
- 护盾系统（规则方块积攒 + 濒死消耗 3 行）
- 雾区交易、试炼契约、规则之眼
- WebSocket 实时推送
- 广播频道 / 排行榜 / 铭刻之书面板

**修复方案**：**二选一，合并引擎**

**方案A（推荐）**：以 V2 引擎为底盘，把 V1 的所有独特功能移植进去：
1. 把 5 种游戏模式代码从 app.js 搬到 v2-main.js
2. 把特殊修饰符（rewind/pendulum/curse）逻辑搬过去
3. 把七层境界 + 低语系统搬过去
4. 保留 V2 的 7 种方块能力（比 V1 的标签系统强）
5. 合并历史回溯系统（V1 的 5 步快照 + 回溯）
6. 删除 app.js，删除 game.html
7. 把钟声铭刻视觉效果加到 V2 棋盘

**方案B**：以 V1 引擎为底盘，把 V2 的社交面板加上去。工作量更大，不推荐。

> ⚠️ 无论选哪个方案，完成后都必须删除另一个引擎文件，避免后续再分裂。

### P0-2：V2 引擎缺失 12 生肖试炼

设计文档（`docs/DESIGN_V2.md`）规划了 12 种每日特殊挑战，但 V2 引擎只实现了**生肖影响下落速度**这一条：

```javascript
// v2-main.js:972-983 现状 —— 只改了 interval
function trialDropInterval() {
  if (zodiac === "鼠") interval = 920;   // 慢一点
  if (zodiac === "兔") interval = 500;   // 快
  // ...其余生肖没有逻辑
}
```

设计文档要求的特殊规则全部缺失：
- **鼠·觉**：首次消行 x2 —— 未实现
- **牛·固**：连续消行奖励递增 —— 未实现
- **虎·争**：PVP 攻击行（白虎日）—— 未实现
- **兔·速**：硬降奖励提高 —— 未实现
- **龙·变**：稀有方块概率翻倍（朱雀日）—— 未实现
- **蛇·雾**：雾区波动 x2 —— 未实现
- **马·守**：无尽生存奖励增强（玄武日）—— 未实现
- **羊·契**：契约奖励 x2 —— 未实现
- **猴·机**：情报半价 —— 未实现
- **鸡·鸣**：全效果激活（青龙日）—— 未实现
- **狗/猪**：设计文档也未定义，需要补充

### P0-3：四象神兽事件只有速度调整，无实际玩法

```javascript
// v2-main.js:986-992 —— 四象只影响 drop interval
if (beast === "玄武") interval = 620;  // 稍快
if (beast === "青龙") interval = 460;  // 很快
// 没有：白虎PVP、朱雀涅槃、玄武守城、青龙裁决
```

设计文档要求的神兽事件全部缺失：
- **白虎试炼（第3天）**：PVP 对战，向对手发送攻击行 —— 完全未实现
- **朱雀涅槃（第5天）**：特殊涅槃方块，消行后刷新棋盘 —— 完全未实现
- **玄武守城（第7天）**：无尽生存模式，看谁坚持最久 —— 完全未实现
- **青龙裁决（第10天）**：终局结算，强制排名，特殊方块全开 —— 完全未实现

---

## 🟠 P1 · 严重缺失（5个）

### P1-1：无音频文件，全部靠 Web Audio 合成

项目目录中仍无任何 `.mp3`/`.wav`/`.ogg` 文件。设计文档规划的 `public/audio/` 目录（含 BGM 循环、列车汽笛、钟声、生肖吼叫等 20+ 文件）从未创建。

当前状态：
- V2 的 BGM 是每 1.8 秒一个贝斯音 + 三角波铃音，单调重复
- 8 种 SFX（move/rotate/land/hard_drop/game_over/shield/whisper/clear）虽然比 V3 审查时增加了 4 种，但仍是基础的 oscillator 合成
- **缺少**：列车汽笛声、生肖出场音效、神兽咆哮、钟楼报时、契约成立音效

### P1-2：列车系统只是文字展示

设计文档要求列车到站时触发实际游戏事件（雾区商品波动、情报刷新、结算），但前端只展示了时刻表文字：

```javascript
// v2-main.js:303 —— 只是把列车名字贴在 footer
$("#trainRail").textContent = `下一班列车：${nextTrain.name} ${nextTrain.time} | ${nextTrain.effect}`;
```

后端 `onTrainArrive()` 函数存在，但前端收到 `train` WebSocket 消息后只更新了广播栏文字，没有触发对应的游戏逻辑（如强制雾区商品波动动画、情报卡片刷新通知、结算弹窗）。

### P1-3：V2 引擎缺失游戏模式选择

V1 有 `<select id="modeSelect">` 提供 5 种模式，V2 SPA 完全没有模式选择。所有试炼都是同一种节奏（750ms 基础间隔），没有限时、精准、生存、节拍模式的紧张感。

### P1-4：铭刻升级扣除刻痕但效果感知弱

V2 的铭刻升级系统功能正常（扣钱 + 属性递增），但升级后的效果差异对玩家几乎不可见：
- `upgradeLevel(player, "score")` 给试炼额外 +5% 刻痕——但玩家看不到这个数值
- `upgradeLevel(player, "fee")` 降低雾区手续费——但没有对比提示
- `upgradeLevel(player, "shield")` 增加护盾上限——但 UI 不显示上限

**修复**：每次升级后在 UI 明确展示「原 → 新」对比，如「分数加成 1.00x → 1.05x」

### P1-5：服务端 `settleLines` 返回值仍用"金币"术语

```javascript
// server/index.js:1326 —— V1 残留术语
const reward = { total: baseReward + extraReward, gold: baseReward, bonus: extraReward };
```

在 V2 世界观中，货币应为"刻痕"而非"金币"。前端展示虽然用了"刻痕"，但服务端返回的字段名还是 `gold`。

---

## 🟡 P2 · 架构债务（5个）

### P2-1：服务端 2198 行 God Object 未拆分

设计文档要求 `server/` 目录至少 14 个文件（models/controllers/services/middleware 分层），但当前仍只有 `server/index.js` 一个 2198 行的文件，包含所有路由、业务逻辑、数据库操作、外部 API 调用。

**必须拆分的维度**：
- `server/routes/`：auth.js、trials.js、fog.js、pact.js、oracle.js、broadcast.js、rankings.js
- `server/models/`：user.js、trial.js、fog.js、pact.js、oracle.js
- `server/services/`：cycle.js（十日周期）、train.js（列车调度）、settlement.js（结算）、npc.js
- `server/ws/`：WebSocket 消息路由

### P2-2：V1 后台任务仍在运行

```javascript
// server/index.js — V1 定时任务仍占资源
setInterval(refreshWeather, 900000);      // 每15分钟查济南天气
setInterval(refreshRealStocks, 300000);   // 每5分钟查真实A股
setInterval(refreshNews, 3600000);        // 每小时查财经新闻
setInterval(moveMarket, 30000);           // 每30秒变动模拟股价
```

V2 SPA 根本不展示这些 V1 数据（真实股票行情、期货、天气），但定时任务占用 CPU 和网络。

**修复**：通过 `ENABLE_V1_JOBS` 环境变量控制（server/index.js 第17行已经定义了但未使用），默认关闭 V1 定时任务。

### P2-3：V1 旧文件冗余

16 个 V1 文件依然保留在目录中，SPA 完全不调用它们：

```
public/game.html          (V1 旧方块战场)
public/admin.html         (V1 旧后台)
public/admin.js
public/activities.html    (V1 活动中心)
public/chat.html          (V1 聊天室)
public/guilds.html        (V1 公会)
public/market.html        (V1 交易市场)
public/profile.html       (V1 个人资产)
public/rankings.html      (V1 排行榜)
public/js/shared.js       (V1 共享函数)
public/js/auth.js         (V1 认证)
public/js/chat.js         (V1 聊天)
public/js/lobby.js        (V1 大厅)
public/js/market.js       (V1 市场)
public/js/profile.js      (V1 个人页)
public/js/activities.js   (V1 活动)
```

这些文件总计约 8000+ 行代码，增加维护成本和阅读负担。

### P2-4：styles.css 仍然 V1+V2 混杂

`public/styles.css` 1937 行，前 13 行是 V1 的 CSS 变量（`:root`），后面才是 V2 的暗色铜绿主题变量（`.v2-body`）。两者在同一个文件中可被覆盖，维护时容易互相污染。

设计文档要求 CSS 拆分为 `variables.css` + `layout.css` + `components/*.css`，但未执行。

### P2-5：state.json 持久化与 MySQL 双写并存

```javascript
// server/index.js —— 两套持久化同时运行
state.players = {};           // 内存 state（V1 遗留）
loadPersistedState();         // 从 state.json 加载
saveState();                  // 定期写回 state.json
// 同时：
db.query("UPDATE users...");  // MySQL 持久化（V2）
```

两套系统会导致：服务器重启时 state.json 覆盖 MySQL 数据，或反之。必须统一为 MySQL 唯一数据源。

---

## 🟢 P3 · 体验打磨（7个）

### P3-1：消行动画缺少过渡帧

V2 消行时行直接消失，虽然加了闪烁效果（`effects.clears` + `rgba(255,242,170)` 半透明叠加），但没有逐帧淡出或碎片坠落动画。

### P3-2：连击视觉递增不可见

Combo 2 和 Combo 8 的浮字大小相同（都是 22px），只是文字变化。应该让连击数字随 combo 增大（字体、颜色、光晕递增）。

### P3-3：方块落地检测过于狭窄

V2 引擎中，方块一旦到底就立即 merge，没有 "lock delay"（锁定延迟）。玩家在方块触底后无法微调位置，体验偏硬。

### P3-4：下一块预览只在 holdPiece 区

V2 SPA 的 Canvas 棋盘只画了当前方块和幽灵，没有 "NEXT" 预览区域。玩家不知道下一个方块是什么。V1 引擎有独立的 `#next` Canvas。

### P3-5：TSpin / 特殊旋转 未实现

两个引擎都只支持标准 SRS 旋转，没有 T-Spin 检测、没有 wall kick 表、没有 180° 旋转。俄罗斯方块的高级技巧完全缺失。

### P3-6：排行榜数据全为占位

```javascript
// server/index.js:1194 —— rankingsV2 返回的是即时计算值而非持久数据
function rankingsV2() {
  return {
    daily_marks: [],
    daily_fog: [],
    // ...全部空数组或占位
  };
}
```

所有 6 类排行榜返回空数组，前端排名面板永远是空白。

### P3-7：移动端触摸体验未考虑

V2 SPA 代码中没有触摸事件绑定（V1 的 app.js 有 `document.querySelectorAll(".touch-controls button")` 绑定，但 V2 SPA 没有）。移动端浏览器打开完全无法操作俄罗斯方块。

---

## 📋 汇总表

| 编号 | 级别 | 问题 | 文件 | 修复工作量 |
|------|------|------|------|-----------|
| P0-1 | 🔴致命 | V1/V2 双引擎分裂，功能互不兼容 | app.js + v2-main.js | 3人天 |
| P0-2 | 🔴致命 | 12 生肖试炼未实现（只有速度调整） | v2-main.js | 2人天 |
| P0-3 | 🔴致命 | 四象神兽事件未实现（只有速度调整） | v2-main.js + index.js | 2人天 |
| P1-1 | 🟠严重 | 无音频文件，只有单调合成音 | v2-main.js | 1.5人天 |
| P1-2 | 🟠严重 | 列车系统只展示文字，无游戏触发 | v2-main.js + index.js | 1人天 |
| P1-3 | 🟠严重 | V2 缺失游戏模式选择 | v2-main.js | 1人天 |
| P1-4 | 🟠严重 | 铭刻升级效果不可见 | v2-main.js | 0.5人天 |
| P1-5 | 🟠严重 | 服务端 settleLines 残留"金币"术语 | index.js | 0.2人天 |
| P2-1 | 🟡架构 | 服务端 2198 行未拆分 | index.js | 2人天 |
| P2-2 | 🟡架构 | V1 后台任务仍在运行 | index.js | 0.3人天 |
| P2-3 | 🟡架构 | 16 个 V1 旧文件未清理 | public/ | 0.3人天 |
| P2-4 | 🟡架构 | styles.css V1+V2 混杂 | styles.css | 1人天 |
| P2-5 | 🟡架构 | state.json + MySQL 双写 | index.js | 1人天 |
| P3-1 | 🟢打磨 | 消行缺少过渡动画 | v2-main.js | 0.5人天 |
| P3-2 | 🟢打磨 | 连击视觉无递进 | v2-main.js | 0.3人天 |
| P3-3 | 🟢打磨 | 缺少 lock delay | v2-main.js | 0.5人天 |
| P3-4 | 🟢打磨 | 无 NEXT 预览 | v2-main.js + index.html | 0.5人天 |
| P3-5 | 🟢打磨 | 无 T-Spin/高级旋转 | v2-main.js | 1人天 |
| P3-6 | 🟢打磨 | 排行榜全空 | index.js | 1人天 |
| P3-7 | 🟢打磨 | 移动端无法操作 | v2-main.js | 0.5人天 |

**总估算**：约 **19.6 人天**

---

## 📝 可直接发给 AI 的修复指令

以下是按优先级排列的 18 条指令，逐条修复即可。**建议按顺序执行，每完成一条验证后再做下一条。**

### 🔴 第一批：引擎合并（P0-1）—— 最优先

```
指令1：以 V2 引擎（public/js/v2-main.js）为底盘，把 V1 引擎（public/app.js）的以下功能移植到 V2：
  a) 5种游戏模式（standard/timed/precision/survival/rhythm），在 trial 对象中加入 mode/remaining/clock 状态
  b) 3种特殊修饰符（rewind回溯/pendulum钟摆/curse诅咒），28%概率生成，逻辑直接复制
  c) 七层极道境界（pathRealms），用现有的 localStorage 键 "zhongyuanPathV1"，状态管理复制
  d) 终焉低语 4 句 + Web Speech 朗读（speakFinaleLine 函数复制到 v2-main.js）
  e) 历史回溯（恢复 5 步快照 + 钟渊能量消耗）
  f) 金币浮窗（随机 timer，10秒有效期）
  g) 铭刻标记（消行留下钟声符文视觉）
  完成后删除 public/app.js 和 public/game.html。

指令2：删除 V1 的 16 个旧文件（game.html、admin.html、admin.js、activities.html、chat.html、guilds.html、market.html、profile.html、rankings.html 以及 public/js/ 下的 shared.js、auth.js、chat.js、lobby.js、market.js、profile.js、activities.js）

指令3：V2 SPA 的 index.html 中增加 game mode 选择器（参照 game.html 的 #modeSelect），放在方块试炼面板的 panel-head 区域，选项：昼夜标准/60秒限时/精准刻度/倒计时生存/节拍坠落
```

### 🔴 第二批：终焉核心玩法（P0-2/P0-3）

```
指令4：在 v2-main.js 的 trialDropInterval() 中为每种生肖添加完整的特殊效果：
  - 鼠 day1：首次消行分数 x2（在 clearLines 中判断 trial.lines === 0 时加倍）
  - 牛 day2：连续消行奖励递增（combo > 1 时 bonus *= 1.2 * combo）
  - 虎 day3：白虎 PVP 模式激活（见指令6）
  - 兔 day4：硬降奖励 +3 刻痕每次（在 hardDrop 中加分）
  - 龙 day5：朱雀涅槃模式激活（见指令6）
  - 蛇 day6：雾区购买/卖出价格波动 ±40%（在 fog buy/sell 接口中判断）
  - 马 day7：玄武守城模式激活（见指令6）
  - 羊 day8：契约创建免费 + 贡献 x2（在 addPactContribution 中判断）
  - 猴 day9：情报卡片半价（在 oracle cost 计算中判断）
  - 鸡 day10：青龙裁决模式激活（见指令6）

指令5：在 v2-main.js 中为每个神兽事件日实现特殊游戏模式：
  - 白虎日（day3）：方块消行时向"对手"发送垃圾行（单机模式：消行后棋盘底部自动添加1行垃圾行作为"反击"）
  - 朱雀日（day5）：每消 3 行出现一个特殊"涅槃方块"（type=Z标记），触碰后清空棋盘底部 3 行
  - 玄武日（day7）：启动无尽生存模式——无顶触结束，改为累计消行数 + 每15秒下落速度+10%，计分方式改为消行数 x 生存秒数
  - 青龙日（day10）：全属性激活——所有7种方块能力效果 x1.5、稀有方块(龙)概率 15%、终局自动弹窗展示本十日周期排名
```

### 🟠 第三批：音效与反馈（P1-1/P1-2/P1-3/P1-4/P1-5）

```
指令6：创建 public/audio/ 目录，添加音频文件（使用 Web Audio 预合成或静态 .mp3）：
  - bgm_loop.mp3：循环 BGM（替代当前 1.8s 单调脉冲）
  - train_arrive.mp3：列车到站汽笛（2秒）
  - zodiac_{name}.mp3：12种生肖出场音效（各1秒）
  - beast_{name}.mp3：4种神兽咆哮（各2秒）
  - bell_tower.mp3：钟楼报时（1.5秒）
  - pact_seal.mp3：契约成立（1秒）
  前端使用 HTMLAudioElement 或 Howler.js 加载播放

指令7：列车到站时触发游戏UI动画而非仅文字：
  - 晨钟列车(06:00)：全屏淡入金色宣言文字，持续 3 秒
  - 正午列车(12:00)：雾区商品卡片集体闪烁 + 价格变动动画
  - 黄昏列车(18:00)：规则之眼情报卡片刷新 + 旧卡 fadeout
  - 午夜列车(23:00)：雾区新商品从右滑入，旧商品变灰
  - 终焉列车(23:55)：5分钟倒计时条 + 全屏脉动红色光晕

指令8：V2 SPA 游戏面板添加 NEXT 预览区（在棋盘右侧或下方），显示下一个方块的 4x4 迷你画布

指令9：铭刻升级后显示"原值→新值"对比浮窗，如「分数加成 1.00x → 1.05x」，停留 2 秒

指令10：服务端 settleLines 函数中，将返回值字段名 gold 改为 marks，bonus 改为 echoBonus
```

### 🟡 第四批：架构清理（P2-1/P2-2/P2-3/P2-4/P2-5）

```
指令11：拆分 server/index.js 为目录结构：
  server/routes/{auth,trials,fog,pact,oracle,broadcast,rankings,line}.js
  server/models/{user,trial,fog,pact}.js
  server/services/{cycle,train,settlement,npc}.js
  server/ws/index.js
  每个文件按设计文档的 API 规格实现，入口 server/index.js 只负责创建 HTTP 服务、挂载路由、启动定时器

指令12：在 server/index.js 启动时检查 ENABLE_V1_JOBS 环境变量：
  - 若 ENABLE_V1_JOBS !== "1"，跳过 refreshWeather/refreshRealStocks/refreshNews/moveMarket 定时器注册
  - 保留 moveFogMarket 和 checkTrainArrivals（V2 核心定时器）

指令13：移除 state.json 持久化逻辑（loadPersistedState/saveState），所有数据只走 MySQL。在初始化时检查 MySQL 连接，若未连接则报错退出而非回退到 state.json

指令14：拆分 public/styles.css：
  - 删除 V1 :root 变量块（前13行）
  - 创建 public/css/variables.css（暗色铜绿主题变量）
  - 创建 public/css/layout.css（三面板 grid 布局）
  - 创建 public/css/components/{trial,plaza,chronicle,fog,pact,oracle,auth,toast}.css
  - index.html 中按顺序引用：variables → layout → components/*
```

### 🟢 第五批：体验打磨（P3-1~P3-7）

```
指令15：消行添加逐行动画——已消除的行先整体变亮金色 80ms，然后从中间向两侧逐格消失（每格延迟 15ms），消失过程中粒子效果持续

指令16：连击浮字根据 combo 级别递增：
  - combo 1-2：fontSize 18px，颜色 #f2c14e（默认金）
  - combo 3-5：fontSize 24px，颜色 #ffd45f（亮金）+ text-shadow glow
  - combo 6-9：fontSize 32px，颜色 #fff1a8 + 0.3s 脉冲缩放动画
  - combo 10+：fontSize 40px，颜色 #ffffff + 屏幕四角暗角效果 + "钟渊沸腾" 全屏浮字

指令17：实现排行榜数据持久化：
  - 每次试炼结束后，写入 v2_ranking_snapshots 表（day_key/user_id/score/lines/marks/mode/created_at）
  - rankingsV2() 从数据库实时查询当日/本周期的 TOP 20，而非返回空数组
  - 如果 dbReady === false，返回占位提示「钟楼校准中，名录暂不可用」

指令18：为 v2-main.js 绑定移动端触摸事件：
  - 左侧 1/3 区域 = 左移
  - 右侧 1/3 区域 = 右移
  - 上滑 = 旋转
  - 下滑 = 硬降
  - 双击 = 暂存(hold)
  - 在棋盘下方添加 4 个触摸按钮（← → ↻ ↓）兜底
```

---

## ✅ 验证清单

修复完成后，逐项检查：

- [ ] 只有一个引擎文件（v2-main.js），app.js 已删除
- [ ] 访问 index.html 可以选择 5 种游戏模式
- [ ] 不同生肖日方块行为有明显差异（不只是速度）
- [ ] 白虎/朱雀/玄武/青龙日有特殊游戏模式
- [ ] 有 BGM 循环播放（不是单调脉冲）
- [ ] 列车到站有视觉动画效果
- [ ] 棋盘旁边能看到 NEXT 预览
- [ ] 铭刻升级后显示效果对比
- [ ] 服务端不再输出 "gold" 字段
- [ ] server/ 目录有 routes/models/services/ws 子目录
- [ ] V1 定时任务默认关闭
- [ ] 16 个 V1 旧文件已删除
- [ ] styles.css 已拆分
- [ ] 不再读写 state.json
- [ ] 排行榜有真实数据
- [ ] 手机浏览器可以触摸操作俄罗斯方块
- [ ] 4连消以上有明显视觉爆炸效果
- [ ] Combo 10 以上屏幕有特殊效果

---

*本报告由 WorkBuddy 自动生成，每条指令均可独立执行和验证。修复完成后，请将本文件标记为已关闭。*
