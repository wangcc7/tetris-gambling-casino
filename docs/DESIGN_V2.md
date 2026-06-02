# 终焉钟城 V2.0 — 完整设计文档

> **阅读对象**：AI 编码助手。本文档是 V2.0 从零重写的唯一权威规格书。
> **核心命令**：彻底重构为"十日终焉"主题的沉浸式单页应用，融合列车、生肖、神兽等终焉特色玩法。

---

## 目录

1. [世界观与叙事](#一世界观与叙事)
2. [核心玩法系统](#二核心玩法系统)
3. [前端架构](#三前端架构spa)
4. [后端架构](#四后端架构)
5. [数据库设计](#五数据库设计mysql)
6. [API 设计](#六api-设计)
7. [WebSocket 协议](#七websocket-协议)
8. [视觉设计规范](#八视觉设计规范)
9. [实施路线图](#九实施路线图)

---

## 一、世界观与叙事

### 1.1 一句话

玩家被"钟渊系统"拉入一座无限轮回的时钟城市。每十日，城市重置。试炼者们在方块战场中刻下钟痕，在雾区交易所试探规则，在列车汽笛声中寻找出口。金币是虚拟的，但代价是真实的。

### 1.2 城市架构：终焉钟城

```
终焉钟城是一座被巨大钟楼统治的环形都市。
城市由五个区域组成，各自对应一个游戏系统：

┌─────────────────────────────────────────────┐
│            【钟楼】城市中心，掌管时间            │
│      十层钟塔，每层对应一天，第十层为终焉层        │
└──────────┬──────────┬──────────┬────────────┘
           │          │          │
    ┌──────┴──┐  ┌───┴───┐  ┌──┴──────┐
    │  东区   │  │  南区  │  │  西区   │
    │ 方块试炼 │  │ 雾区   │  │ 钟城广场 │
    │  (战场)  │  │ (交易) │  │ (社交)  │
    └─────────┘  └───────┘  └─────────┘
                         │
                    ┌────┴────┐
                    │   北区   │
                    │ 规则之眼  │
                    │  (情报)   │
                    └─────────┘
```

### 1.3 势力与阵营

| 势力 | 定位 | 叙事角色 |
|------|------|---------|
| **试炼者** | 玩家群体 | 被困在城市中的觉醒者，寻找规则漏洞 |
| **钟渊系统** | 城市管理者 | 不可见的造物主，通过规则和事件操控一切 |
| **十二生肖裁判** | 每日审判官 | 钟楼每一层的守护灵，当日当值者决定规则偏向 |
| **四象神兽** | 终极考验 | 第三、五、七、十日降临的巨型试炼 |
| **终焉列车** | 秩序载体 | 连接城市各区的神秘列车，不载人，只运"可能" |
| **回响者** | 前代幸存者 | 上一轮留下的NPC，保留部分记忆，给试炼者模糊提示 |

### 1.4 十日轮回结构

每一天都有独特的主题、裁决生肖和规则。列车在固定时刻进站/出站。

```
第01天【鼠·觉】：初醒之日 — 方块速度偏慢，适合新手
第02天【牛·固】：扎根之日 — 方块重量加重，消行分数x1.2
第03天【虎·争】：白虎试炼 — PVP淘汰赛，攻击道具解锁
第04天【兔·速】：疾风之日 — 方块下落速度x1.5，旋转加速
第05天【龙·变】：朱雀涅槃 — 稀有方块概率翻倍，涅槃方块出现
第06天【蛇·雾】：迷局之日 — 雾区波动x2，情报价格翻倍
第07天【马·守】：玄武守城 — 无尽生存模式，难度递增
第08天【羊·契】：结盟之日 — 契约奖励x2，契约创建免费
第09天【猴·机】：洞察之日 — 情报半价，情报效果x1.5
第10天【鸡·鸣】：青龙裁决 — 全效果激活，最终排名结算
```

罅隙生肖（不占天数，特殊事件触发）：
- **狗·忠**：在契约中自动生效，忠诚度加成
- **猪·运**：在雾区随机触发，幸运加成

### 1.5 列车时刻表

终焉列车是城市中最显眼的移动奇观。它出现在铁轨高架上，汽笛声是所有人最熟悉的信号。

| 时刻 | 列车名称 | 游戏影响 |
|------|---------|---------|
| 06:00 | 晨钟列车 | 发布当日试炼宣言 + 裁决生肖 + 方块属性调整 |
| 12:00 | 正午列车 | 雾区商品波动 + "回响钟声"事件 |
| 18:00 | 黄昏列车 | 规则之眼情报刷新 + 契约结算 |
| 23:00 | 午夜列车 | 雾区新商品到站 + 旧商品下架 |
| 23:55 | 终焉列车 | 每日结算预告 + 五分钟倒计时钟鸣 |

列车进站时：全屏汽笛特效 → 广播频道推送列车信息 → 相关面板高亮闪烁。

### 1.6 十二生肖裁判

每个生肖是一个可视化的精神体，在当日出现在钟城广场。它有独特的性格、台词和裁判标准。

| 生肖 | 性格 | 标志台词 | 当日试炼加成 |
|------|------|---------|------------|
| 鼠 | 敏锐的观察者 | "小东西，别急着跑。先看看规则。" | 首次消行x2 |
| 牛 | 沉默的耕耘者 | "稳一点。急出来的路走不远。" | 连续消行奖励递增 |
| 虎 | 好斗的武者 | "别躲。站出来，让我看看你的牙。" | PVP伤害x1.5 |
| 兔 | 敏捷的逃逸者 | "快，不一定对。但慢，一定死。" | 下落加速但分数x1.3 |
| 龙 | 傲慢的审判长 | "稀有？那要看你能不能接住。" | 稀有方块出现率x2 |
| 蛇 | 狡黠的操盘手 | "雾里看花。不是看不清，是不想看。" | 雾区波动x2 |
| 马 | 奔放的守城人 | "别停。停下来的那一刻，规则就赢了。" | 生存时间换算x1.5 |
| 羊 | 温和的结盟者 | "一个人走不快。三个人可以。" | 契约奖励x2 |
| 猴 | 机敏的情报贩 | "知道规则的人，才有资格打破规则。" | 情报半价 |
| 鸡 | 庄严的宣告者 | "十日已到。回响该响了。" | 全效果x1.5 |
| 狗 | 忠诚的守护者 | "说好的契约，不许违约。" | 契约忠诚加成 |
| 猪 | 随性的幸运儿 | "运气这东西，有时候比规则管用。" | 随机幸运事件 |

### 1.7 四象神兽降临事件

四大神兽是周期性的全服事件，不可跳过，全城玩家共同参与。

#### 白虎试炼（第3天）— PVP淘汰赛

```
触发：第3天 12:00 正午列车进站后
形式：16人锦标赛淘汰制
玩法：两人同屏方块对战，消行向对方发送"攻击行"
奖励：
  - 冠军：白虎印记 + 3000刻痕 + 称号「白虎猎手」
  - 四强：白虎印记 + 1500刻痕
  - 八强：800刻痕
  - 参与奖：200刻痕
```

#### 朱雀涅槃（第5天）— 涅槃分数赛

```
触发：第5天 06:00 晨钟列车进站后，持续全天
形式：全城分数赛，所有方块试炼分数x2
特殊机制：
  - "涅槃方块"：消除时引爆周围3x3区域
  - 每局结算时，分数达到阈值获得"朱雀余烬"
  - 10个余烬兑换「朱雀印记」
奖励：
  - 日榜前10：朱雀印记 + 2000刻痕
  - 日榜前50：1000刻痕
  - 所有参与者获得涅槃BUFF（次日方块分数+10%）
```

#### 玄武守城（第7天）— 无尽生存

```
触发：第7天 06:00 开始，持续全天
形式：生存模式——方块下落速度随时间递增
  - 0-60秒：速度1x
  - 61-120秒：速度1.5x
  - 121-180秒：速度2x
  - 181-240秒：速度3x
  - 240秒+：速度随机波动（地狱模式）
特殊物品：
  - 护城钟壳：每60秒自动获得1个，抵消一次死亡
  - 玄武残片：每坚持120秒获得1个，10个兑换玄武印记
奖励：
  - 生存排行前3：玄武印记 + 5000刻痕 + 称号「不灭」
  - 生存排行前10：玄武印记 + 2000刻痕
  - 所有坚持超过60秒者：500刻痕
```

#### 青龙裁决（第10天）— 终焉之日

```
触发：第10天 06:00 开始，23:55 最终裁决
形式：全天全系统激活：
  - 所有生肖效果同时生效
  - 所有神兽印记持有者获得分数加成
  - 方块战场同时出PVP和无尽双模式
  - 雾区波动x3
  - 最终5分钟：全城倒计时，钟声逐级加速
23:55 终焉列车进站 → 十日排行榜最终发布 → 城市重置

奖励（十日周期总榜）：
  - 第1名：青龙印记 + 四象归一称号 + 10000刻痕
  - 第2-3名：青龙印记 + 5000刻痕
  - 第4-10名：3000刻痕
  - 全部试炼者根据总参与度获得"新周期初始刻痕"
```

---

## 二、核心玩法系统

### 2.1 整体循环图

```
          ┌──────────────────────────────────┐
          │        晨钟列车 (06:00)             │
          │  发布当日宣言 + 生肖裁判 + 规则       │
          └──────────┬───────────────────────┘
                     │
          ┌──────────▼───────────────────────┐
          │        方块试炼 (全天开放)          │
          │  消行 → 获得刻痕                    │
          │  触发铭刻效果 + 钟渊低语              │
          └──────────┬───────────────────────┘
                     │
          ┌──────────▼───────────────────────┐
          │      刻痕使用 (多路径消费)           │
          │  ┌────┬────┬────┬────┐           │
          │  │雾区│情报│契约│铭刻│            │
          │  │交易│购买│押金│升级│            │
          │  └────┴────┴────┴────┘           │
          └──────────┬───────────────────────┘
                     │
          ┌──────────▼───────────────────────┐
          │      午夜列车 (23:00)               │
          │   雾区结算 + 排行榜更新               │
          └──────────┬───────────────────────┘
                     │
          ┌──────────▼───────────────────────┐
          │      终焉列车 (23:55)               │
          │   每日结算 + 排名发布 + 生肖印章       │
          │   第10天：青龙裁决 + 周期重置          │
          └──────────────────────────────────┘
```

### 2.2 十日轮回系统（核心时间引擎）

**数据模型：**

```javascript
cycle = {
  cycleNumber: 1,          // 第几个十日周期（永久递增）
  dayNumber: 1,            // 当前是周期第几天 (1-10)
  rulingZodiac: '鼠',      // 当日裁决生肖
  declaration: '初醒之日...', // 当日宣言文案
  activeBeastEvent: null,  // 当前激活的神兽事件 (null / '白虎' / '朱雀' / '玄武' / '青龙')
  dayStartedAt: timestamp, // 当日开始时间
  trainSchedule: [...]     // 下一班列车时间
}
```

**十日间隔规则：**
- 每天真实时间 = 现实24小时（可配置：开发环境可缩到24分钟便于调试）
- 第10天23:55后自动进入第1天（新周期），cycleNumber+1
- 跨天瞬间：钟声大作 + 全屏动画 + 生肖精神体更换

**后台可调参数：**
- 每天时长（分钟）
- 列车时刻偏移
- 生肖效果倍率
- 四象事件开关

### 2.3 方块试炼（核心玩法）

继承当前俄罗斯方块引擎，但主题化为"终焉试炼"。

**基础参数：**
- 棋盘：10列 x 20行
- 7种标准方块 + 特殊终焉方块
- 键盘操作：← → ↓ 旋转（↑/Z） 硬降（空格） 暂存（C）

**终焉属性方块（替代原7种属性块）：**

| 方块类型 | 终焉名称 | 颜色 | 特殊效果 |
|---------|---------|------|---------|
| I 型 | 钟鸣长条 | 铜绿 #8B7355 | 消行时触发钟声低语 |
| O 型 | 规则方块 | 暗金 #B8860B | 放置时短暂揭示临近列属性 |
| T 型 | 回响碎片 | 暗紫 #6B3FA0 | 消行后在原位留下残影，1秒后二次消行 |
| S 型 | 迷雾曲线 | 灰蓝 #5B7B9A | 相邻方块不可见（雾化效果） |
| Z 型 | 生肖残印 | 暗红 #8B2252 | 消行时刻痕+50% |
| L 型 | 列车道钉 | 铁灰 #6B6B6B | 硬降时破坏下方一行 |
| J 型 | 铭刻之笔 | 墨蓝 #2F4F6F | 消行时记录入铭刻之书 |

**特殊技巧（保留并增强当前机制）：**

| 技巧 | 触发条件 | 效果 |
|------|---------|------|
| 钟声铭刻 | 连续3次消行 | 视觉残留 + 分数x1.5 |
| 双重铭刻 | 一次消4行 | 全屏闪光 + 分数x4 |
| 钟渊回溯 | 满钟渊能量条 | 回退3步棋盘状态 |
| 昼夜切换 | 手动触发（每局限1次） | 5秒下落速度减半 |
| 濒死续命 | 顶格时自动 | 消耗1个护城钟壳，清空底部3行 |
| 节拍坠落 | 消行后0.5秒内再次消行 | 连击计数器不重置 |

**每局结算：**
- 基础刻痕 = 消行数 x 行分基值（当日生肖可能加成）
- 特殊方块加成
- 技巧连击加成
- 生存时间加成
- 玄武守城模式：生存时间权重 x10

### 2.4 雾区交易所（替代股票期货）

不再是真实A股行情。改为系统每日生成的"雾区商品"。

**商品生成规则：**
- 每日午夜列车进站时，生成 8-12 种雾区商品
- 商品有"品类"和"稀有度"两个维度
- 旧商品在次日午夜列车进站时下架（未售出者按"到站价"强制平仓）

**商品模型：**

```javascript
fogGoods = {
  id: 'fg_001',
  name: '青龙鳞片',
  category: '神兽遗物',      // 品类：神兽遗物 / 钟楼零件 / 规则碎片 / 列车遗落物 / 生肖符咒
  rarity: '稀有',           // 普通 / 精良 / 稀有 / 史诗
  basePrice: 500,           // 到站价（初始价）
  currentPrice: 520,        // 当前价（波动）
  priceHistory: [{price:500,time:...}, ...], // 当日价格走势
  volatility: 0.15,         // 波动率（0.1-0.5，由当日生肖/列车事件决定）
  trend: 'rising',          // 当前趋势：rising / falling / volatile / stable
  arrivalTime: timestamp,   // 到站时间
  departureTime: timestamp, // 离站时间（次日午夜）
  flavor: '一片泛着暗绿光泽的鳞片，触感冰凉，仿佛还在呼吸。' // 风味文本
}
```

**商品品类与风味：**

| 品类 | 示例商品 | 风味方向 |
|------|---------|---------|
| 神兽遗物 | 青龙鳞片、白虎利齿、朱雀尾羽、玄武甲片 | 神秘、威严 |
| 钟楼零件 | 钟摆齿轮、时针碎片、发条残段、铜钟余响 | 机械、时间 |
| 规则碎片 | 第三条规则、破格残页、篡改之墨 | 规则、秘密 |
| 列车遗落物 | 车票残角、汽笛回音、铁轨螺钉、信号灯焰 | 旅途、过客 |
| 生肖符咒 | 鼠眼石、牛角钉、虎牙坠、兔足银 | 灵性、契约 |

**交易规则：**
- 只能用刻痕购买和出售
- T+1：买入后次日午夜列车前才能卖出（当日不能卖出）
- 持仓上限：最多同时持有5种商品
- 每种商品最多买入99份
- 每日午夜列车到达时：
  - 未卖出的商品按"到站价"的80%强制结算
  - 所有持仓清空
  - 新一批商品生成

**价格波动算法：**

```
价格波动受以下因素影响（优先级递减）：
1. 当日生肖效果（蛇日波动x2）
2. 列车事件（事故→全商品随机跳价；到站→新品低价）
3. 玩家人气（买入量越大，价格上涨越快）
4. 随机噪声（±volatility范围内的正态分布）
5. 青龙裁决日：所有商品最终价翻倍或减半（随机）
```

### 2.5 试炼契约（替代公会）

不再是永久公会。改为每日可结成的临时三人小队。

**契约机制：**

```
每日 06:00 晨钟列车后 → 契约广场开放
玩家可以：
  - 创建契约：支付200刻痕押金，成为"契约主"
  - 加入契约：选择已有的契约加入（最多3人）
  - 退出契约：在正午列车前可免费退出，之后退出失去押金

契约生命周期：
  06:00 创建/加入开放
  18:00 黄昏列车 → 契约锁定，结算贡献
  23:55 终焉列车 → 契约解散，发放奖励
```

**契约数据模型：**

```javascript
pact = {
  id: 'p_001',
  name: '回响三人',
  openSlots: 1,            // 剩余空位
  members: [
    { userId: 'u1', contribution: 240, joinedAt: ... },
    { userId: 'u2', contribution: 180, joinedAt: ... }
  ],
  totalContribution: 420,  // 全队当日刻痕收入总和
  rewardPool: 0,           // 系统奖励池
  zodiacBonus: '羊',       // 羊日加成
  createdAt: timestamp,
  lockedAt: null,          // 锁定时间
  dissolvedAt: null        // 解散时间
}
```

**契约类型：**

| 类型 | 创建费 | 效果 |
|------|--------|------|
| 普通契约 | 200刻痕 | 无加成，基础奖励分配 |
| 生肖契约 | 500刻痕 | 当日生肖额外加成+10%，仅限当日 |
| 神兽契约 | 1000刻痕 | 神兽降临时创建，奖励池翻倍 |
| 血契 | 2000刻痕 | 不能中途退出，但奖励x3 |

**契约奖励分配：**
- 契约总奖励 = 全体成员当日刻痕收入总和 x 10%（系统额外奖励）
- 分配方式：按贡献比例分配
- 羊日：奖励x2
- 持有狗生肖印记的成员：获得额外忠诚奖励

### 2.6 规则之眼（情报系统）

替代"活动中心"和"商店"。以情报卡片形式提供。

**情报卡片模型：**

```javascript
oracleCard = {
  id: 'oc_001',
  title: '雾区风向',
  category: '市场',         // 市场 / 战场 / 社交 / 系统
  description: '今日「神兽遗物」品类商品将在正午列车后暴涨。',
  effect: {
    type: 'market_preview',  // 效果类型
    data: { category: '神兽遗物', direction: 'up', probability: 0.8 }
  },
  cost: 50,                 // 刻痕价格
  accuracy: 0.8,            // 准确率（0.5-1.0，0.5=纯随机）
  availableUntil: timestamp, // 黄昏列车时间
  flavor: '钟楼顶层掉下来的一张纸条，上面只有几个字。谁写的，不知道。'
}
```

**情报卡片类别：**

| 类别 | 示例情报 | 价格范围 |
|------|---------|---------|
| 市场 | "龙鳞将在黄昏前跌到地板价" / "白虎利齿的真实价值被低估了" | 30-200 |
| 战场 | "今日消行奖励中隐藏了回响残片" / "第7列更容易出现铭刻之笔" | 20-150 |
| 社交 | "契约广场东侧那个叫XX的人，他的贡献很可疑" | 10-80 |
| 系统 | "今日的生肖裁判在偏袒敢于押注的人" / "午夜列车可能提前到站" | 50-300 |

**使用规则：**
- 每日黄昏列车刷新6张情报卡片
- 每张只能被购买一次（购买后从列表中移除）
- 猴日：价格半价，准确率+20%
- 情报效果即时生效或当日有效

### 2.7 钟城广播（聊天+NPC）

保留聊天功能，改造为"钟城广播台"。

**频道体系：**

| 频道 | 可见范围 | 用途 |
|------|---------|------|
| 全城广播 | 所有人 | 系统公告、列车到站、神兽降临 |
| 钟城广场 | 所有人 | 玩家自由聊天 |
| 契约频道 | 契约成员 | 小队内部沟通 |
| 生肖密语 | 持有同生肖印记者 | 跨契约情报共享 |
| 回响私语 | 仅自己 | NPC对你的个人化低语 |

**NPC阵容（扩展至12+4）：**

保留现有10个NPC，新增：

| NPC | 身份 | 性格 | 标志台词 |
|-----|------|------|---------|
| 列车长 | 终焉列车驾驶者 | 沉默、神秘 | "下一站，不是你们的终点。" |
| 钟楼守 | 钟楼最顶层的守卫 | 疯狂的时间信徒 | "第十层？没有人上过第十层。" |
| 朱雀 | 涅槃神兽（人形幻影） | 温柔、燃烧 | "烧掉的规则，不会再长出来。" |
| 玄武 | 守城神兽（人形幻影） | 沉稳、无边 | "别怕。城墙比你想象的要厚。" |
| 白虎 | 战神（人形幻影） | 锋利、直白 | "胜者问规则。败者被规则问。" |
| 青龙 | 裁决者（人形幻影） | 威严、终局 | "你们的十日，到此为止。" |

**NPC发言规则：**
- 每个NPC有独立的发言行为池（每天约10-20条预设台词）
- 发言时机：列车到站 / 玩家达成里程碑 / 随机间隔(5-15分钟) / 神兽降临 / 终焉倒数
- 部分NPC发言带"回响效果"——发言后对特定玩家产生数值影响（buff/debuff/情报）

**列车广播（系统消息自动模板）：**

```
"呜——呜——" (汽笛声)
【晨钟列车进站】今日试炼宣言：「牛·固：扎根之日」
判决生肖：牛。稳一点。急出来的路走不远。
全体试炼者，方块重量+20%，消行分数x1.2。
```

### 2.8 铭刻之书（个人档案）

替代"个人资产"页面。整合所有个人信息的终端。

**铭刻之书内容分区：**

```
┌──────────────────────────────────────────┐
│              铭刻之书 — [玩家名]            │
├──────────────────────────────────────────┤
│  【基本】                                 │
│   试炼者编号 / 入城日期 / 经历的周期数 /     │
│   当前刻痕余额 / 总刻痕收入                  │
├──────────────────────────────────────────┤
│  【雾区持仓】(当前持有的雾区商品列表)          │
│   商品名 x 数量 / 买入价 vs 现价 / 盈亏      │
├──────────────────────────────────────────┤
│  【收集】                                 │
│   生肖印记：🐭🐮🐯🐰🐲🐍🐴🐏🐵🐔🐶🐷      │
│   神兽印记：🐅🐦🐢🐉                        │
│   称号墙：展示已获得的称号                    │
├──────────────────────────────────────────┤
│  【钟渊之路】                              │
│   七层境界进度条 + 当前阶层解锁效果           │
│   最近试炼记录（最近10局方块战绩）             │
├──────────────────────────────────────────┤
│  【铭刻升级】                              │
│   方块属性 / 分数加成 / 护盾上限 /            │
│   交易手续费减免 / 列车优先权                │
│   永久升级，用刻痕购买                        │
└──────────────────────────────────────────┘
```

**铭刻升级树（永久属性升级）：**

| 升级项 | 等级1 | 等级2 | 等级3 | 等级4 | 等级5 |
|--------|-------|-------|-------|-------|-------|
| 方块分数 | +5% / 500 | +10% / 1500 | +15% / 3000 | +20% / 6000 | +30% / 12000 |
| 护盾上限 | 2个 / 300 | 3个 / 800 | 4个 / 2000 | 5个 / 5000 | 6个 / 10000 |
| 雾区手续费 | 5% / 200 | 4% / 600 | 3% / 1500 | 2% / 4000 | 1% / 8000 |
| 情报折扣 | 5% / 100 | 10% / 300 | 15% / 800 | 20% / 2000 | 30% / 5000 |
| 契约贡献加成 | +5% / 500 | +10% / 1500 | +15% / 3000 | +20% / 6000 | +30% / 12000 |
| 列车优先权 | 提前1分钟 / 500 | 提前2分钟 / 1500 | 提前3分钟 / 3000 | — | — |

### 2.9 试炼者名录（排行榜）

**榜单类别：**

| 榜单 | 结算周期 | 计分方式 |
|------|---------|---------|
| 当日刻痕榜 | 每日23:55 | 当日方块试炼刻痕收入 |
| 当日雾区榜 | 每日23:55 | 当日雾区交易盈利 |
| 当日契约榜 | 每日23:55 | 契约总贡献排名 |
| 十日总榜 | 第10天23:55 | 全周期刻痕总收入（含奖励） |
| 神兽殿堂 | 永久 | 持有四象印记数量 + 神兽事件排名积分 |
| 生肖全图鉴 | 永久 | 收集生肖印记数量排序（同数按时间） |

**榜单展示规则：**
- 每个榜单显示前50名 + 当前玩家排名
- 神兽殿堂和生肖全图鉴显示前100名
- 每日结算后前3名获得广播提名

### 2.10 钟渊之路（七层境界）

保留当前七层境界体系，与十日周期和生肖印记深度关联。

**七层境界（与当前一致，微调）：**

| 层数 | 名称 | 解锁条件 | 奖励 |
|------|------|---------|------|
| 1 | 钟声回响 | 累计消行100行 | 解锁生肖印记收集 |
| 2 | 规则目击者 | 购买3张情报卡片 | 情报准确率+10% |
| 3 | 雾区行者 | 完成10次雾区交易 | 雾区手续费减半 |
| 4 | 契约守望者 | 在契约中获得总贡献1000 | 契约奖励+20% |
| 5 | 钟楼攀登者 | 经历完整5个周期 | 所有方块分数+15% |
| 6 | 生肖亲密者 | 收集6种生肖印记 | 每日免费情报1张 |
| 7 | 终焉觉悟者 | 收集全部12生肖+4神兽印记 | 称号「终焉觉醒」+ 所有属性+25% |

### 2.11 生肖试炼（每日特殊挑战）

每个裁决生肖发布一项当日特殊挑战，完成可获得该生肖印记。

| 生肖 | 挑战 | 条件 |
|------|------|------|
| 鼠 | 偷天换日 | 单局消行超过50行 |
| 牛 | 千钧不破 | 连续3局不使用护盾通关 |
| 虎 | 尖牙利爪 | 白虎试炼中进入八强 |
| 兔 | 疾风同步 | 单局硬降落超过30次 |
| 龙 | 龙鳞收集 | 收集5块龙鳞（稀有方块额外掉落） |
| 蛇 | 雾中淘金 | 当日雾区交易盈利超过2000刻痕 |
| 马 | 奔行千里 | 玄武守城中坚持超过180秒 |
| 羊 | 三心一意 | 完成当日契约且贡献排名第一 |
| 猴 | 火眼金睛 | 购买并用对一张情报（情报验证后触发） |
| 鸡 | 钟声嘹亮 | 当日方块分数进入前10 |
| 狗 | 忠守契约 | 连续3天完成契约（自动累积） |
| 猪 | 幸运骰子 | 在雾区交易中随机触发（5%概率） |

### 2.12 四象印记系统

| 印记 | 获得方式 | 永久效果 |
|------|---------|---------|
| 白虎印记 | 白虎试炼四强以上 | 所有PVP伤害+10% |
| 朱雀印记 | 朱雀涅槃日榜前10或集齐10余烬 | 方块分数永久+10% |
| 玄武印记 | 玄武守城生存排行前10或集齐10残片 | 护盾恢复速度+50% |
| 青龙印记 | 十日总榜前3 | 全属性+15%，称号「四象归一」 |

---

## 三、前端架构（SPA）

### 3.1 唯一页面：`index.html`

不再有多个HTML文件。一个SPA承载全部内容。

**三面板布局（响应固定宽度）：**

```
┌─────────────────────────────────────────────────────────┐
│                    顶栏：钟楼横梁                          │
│  [≡] 终焉钟城   第X天·牛·固   剩余 12:34:56   [铭刻之书]   │
│      钟声   刻痕:12,340    生肖印记:3/12  神兽:1/4         │
├──────────────┬───────────────────────┬───────────────────┤
│              │                       │                   │
│   方块试炼    │      钟城广场          │    身份铭刻        │
│   (左面板)    │      (中面板)          │    (右面板)        │
│              │                       │                   │
│   10×20     │  [广播|名录|雾区|      │  铭刻之书          │
│   棋盘区域    │   契约|情报]          │  (个人信息)         │
│              │  (标签页切换)          │                   │
│   操作控制    │                       │  (始终可见或        │
│   分数/连击   │  选中标签页内容         │   可折叠)           │
│              │                       │                   │
├──────────────┴───────────────────────┴───────────────────┤
│                    底栏：列车轨道                          │
│  下一班列车: 正午列车 12:00 | 广播: "龙鳞正在暴涨!"        │
└─────────────────────────────────────────────────────────┘
```

**面板折叠规则：**
- 左面板（方块试炼）：始终展开，不可折叠
- 中面板（钟城广场）：可折叠，折叠后右侧面板扩展
- 右面板（身份铭刻）：可折叠，折叠后中部面板扩展
- 在移动端/小屏：中部和右部都折叠，单面板模式

### 3.2 中面板标签页

钟城广场是一个标签页容器，5个标签：

| 标签 | 内容 | 图标 |
|------|------|------|
| 广播 | 聊天界面，包含频道切换 | 📻 |
| 名录 | 排行榜（6个榜单可切换） | 📜 |
| 雾区 | 雾区交易所（商品列表+持仓） | 🌫 |
| 契约 | 契约广场（创建/加入/状态） | 🤝 |
| 情报 | 规则之眼（6张情报卡片） | 🔮 |

### 3.3 前端目录结构

```
public/
├── index.html              # 唯一入口，SPA容器
│
├── css/
│   ├── variables.css       # CSS变量（色彩/字体/间距/阴影）
│   ├── reset.css           # 全局reset
│   ├── layout.css          # 三面板网格布局
│   ├── components/
│   │   ├── header.css      # 顶栏
│   │   ├── footer.css      # 底栏（列车轨道）
│   │   ├── battlefield.css # 方块试炼面板
│   │   ├── plaza.css       # 钟城广场面板
│   │   ├── chronicle.css   # 身份铭刻面板
│   │   ├── tabs.css        # 标签页组件
│   │   ├── chat.css        # 聊天/广播
│   │   ├── rankings.css    # 排行榜
│   │   ├── fog-market.css  # 雾区交易
│   │   ├── pact.css        # 契约界面
│   │   ├── oracle.css      # 情报卡片
│   │   ├── modal.css       # 弹窗（登录/注册/确认/结算）
│   │   ├── train.css       # 列车进站动画
│   │   └── beast.css       # 神兽降临特效
│   └── animations.css      # 全局动画（钟声/铭刻/闪光/淡入）
│
├── js/
│   ├── main.js             # SPA入口：初始化、路由、面板管理
│   ├── ws.js               # WebSocket连接管理器
│   ├── state.js            # 全局状态管理 (EventEmitter模式)
│   ├── auth.js             # 登录/注册/会话管理
│   ├── utils.js            # 公共工具 (toast/modal/fetch/formatter)
│   │
│   ├── tetris/
│   │   ├── engine.js       # 纯俄罗斯方块引擎（棋盘/碰撞/消行/计分）
│   │   ├── renderer.js     # Canvas渲染器（绘制棋盘/方块/特效）
│   │   ├── input.js        # 键盘输入处理
│   │   ├── blocks.js       # 方块定义（7标准+特殊）
│   │   ├── effects.js      # 特效（钟声铭刻/回响/节拍坠落/濒死）
│   │   └── modes.js        # 模式管理（普通/PVP/生存/涅槃）
│   │
│   ├── plaza/
│   │   ├── broadcast.js    # 广播台（聊天+频道）
│   │   ├── rankings.js     # 试炼者名录
│   │   ├── fog-market.js   # 雾区交易所
│   │   ├── pact.js         # 试炼契约
│   │   └── oracle.js       # 规则之眼
│   │
│   ├── chronicle/
│   │   ├── profile.js      # 个人基本资料
│   │   ├── holdings.js     # 持仓展示
│   │   ├── collections.js  # 收集品（印记+称号）
│   │   ├── path.js         # 钟渊之路进度
│   │   └── upgrades.js     # 铭刻升级树
│   │
│   ├── train.js            # 列车时刻管理+进站动画
│   ├── beasts.js           # 四象神兽事件管理
│   ├── zodiac.js           # 生肖裁判管理+每日效果
│   └── cycle.js            # 十日周期管理（天切换/结算倒计时）
│
├── assets/
│   ├── fonts/              # 中文字体文件
│   ├── images/             # 静态资源
│   └── audio/              # 音效（汽笛/钟声/消行/刻痕/低语/神兽吼）
│
└── admin/
    ├── index.html          # 钟渊控制台（独立路径，不嵌入SPA）
    ├── admin.css
    └── admin.js
```

### 3.4 全局状态管理 (`state.js`)

使用轻量 EventEmitter 模式，不引入外部框架。

```javascript
// 状态结构
store = {
  // 会话
  session: { token, user },        // null = 未登录

  // 周期
  cycle: { cycleNumber, dayNumber, rulingZodiac, declaration,
           beastEvent, dayStartedAt, dayRemaining },

  // 玩家个人
  player: { nickname, marks, holdings, upgrades,
            zodiacMarks: [], beastMarks: [], titles: [],
            pathLevel: 1, pathProgress: 0 },

  // 排行榜
  rankings: { daily:[], cycle:[], beast:[], zodiac:[] },

  // 雾区
  fogMarket: { goods:[], myHoldings:[] },

  // 契约
  pact: { current:null, available:[] },

  // 情报
  oracle: { cards:[], purchased:[] },

  // 广播
  broadcast: { messages:[], onlineCount:0 },

  // 方块
  tetris: { isPlaying:false, sessionScore:0, sessionLines:0 },
}
```

### 3.5 关键交互流程

**首次访问 → 登录：**
1. 连接WebSocket → 获取周期信息
2. 显示登录/注册弹窗
3. 登录成功 → 加载个人数据 → 进入三面板主界面

**方块试炼 → 消行 → 刻痕入账：**
1. 本地计算分数
2. 每局结束 → POST /api/trials/report
3. 服务端验证 + 发放刻痕
4. WebSocket推送 → 排行榜更新 + 契约贡献更新 + 广播事件

**雾区交易 → 买入：**
1. 点击商品 → 显示详情弹窗
2. 输入购买数量
3. POST /api/fog/buy → 返回成交确认
4. 持仓面板即时更新
5. WebSocket推送 → "XX在雾区买入了龙鳞"
6. （可选）触发广播NPC评价："有人开始押注龙鳞了。聪明？还是蠢？"

---

## 四、后端架构

### 4.1 目录结构

```
server/
├── index.js                # 启动入口：创建HTTP+WS服务器，挂载路由
├── config.js               # 所有配置集中管理
├── db/
│   ├── pool.js             # MySQL连接池
│   ├── schema.js           # 建表语句（所有表）
│   └── migrate.js          # 数据库迁移脚本
├── models/                 # 数据访问层（每个文件一个表领域）
│   ├── user.js
│   ├── cycle.js
│   ├── trial.js
│   ├── fogGoods.js
│   ├── fogPosition.js
│   ├── pact.js
│   ├── oracleCard.js
│   ├── message.js
│   ├── zodiacMark.js
│   ├── beastMark.js
│   ├── ranking.js
│   └── engraving.js
├── controllers/            # 路由处理（每个文件一个业务领域）
│   ├── auth.js
│   ├── trial.js
│   ├── fog.js
│   ├── pact.js
│   ├── oracle.js
│   ├── broadcast.js
│   ├── ranking.js
│   ├── player.js
│   └── admin.js
├── services/               # 核心业务逻辑（定时任务/算法）
│   ├── cycle.js            # 十日轮回：日切换、宣言生成、周期结算
│   ├── train.js            # 列车时刻：调度、进站事件触发
│   ├── fog.js              # 雾区：商品生成、价格波动、结算
│   ├── zodiac.js           # 生肖：每日效果计算、试炼判定
│   ├── beast.js            # 神兽：降临事件触发、结算
│   ├── npc.js              # NPC：发言池、时机决策
│   ├── settlement.js       # 结算：每日/周期/神兽事件结算
│   └── oracle.js           # 情报：卡片生成、准确率校验
├── ws/
│   ├── index.js            # WebSocket管理器（连接/认证/分发）
│   ├── handlers.js         # WS消息处理器
│   └── rooms.js            # 频道/房间管理
├── middleware/
│   ├── auth.js             # Token验证中间件
│   ├── rateLimit.js        # 请求频率限制
│   └── errorHandler.js     # 全局错误处理
└── utils/
    ├── token.js            # JWT工具
    └── random.js           # 加权随机/正态分布随机
```

### 4.2 服务端入口 (`index.js`)

```javascript
// 伪代码结构
const http = require('http');
const { initDB } = require('./db/pool');
const { initSchemas } = require('./db/schema');
const { createApp } = require('./app');           // Express应用
const { createWSServer } = require('./ws');       // WebSocket服务器
const { startCycle } = require('./services/cycle');
const { startTrainScheduler } = require('./services/train');
const { startNPC } = require('./services/npc');

async function main() {
  await initDB();
  await initSchemas();

  const app = createApp();                        // 挂载所有路由
  const server = http.createServer(app);
  const wss = createWSServer(server);             // WS挂在同一端口

  server.listen(8080);
  startCycle();                                   // 十日轮回定时器
  startTrainScheduler();                          // 列车时刻调度
  startNPC();                                     // NPC自动发言
}
```

---

## 五、数据库设计（MySQL）

### 5.1 全部表结构

```sql
-- ============================================
-- 用户与认证
-- ============================================
CREATE TABLE users (
  id          VARCHAR(36)  PRIMARY KEY,       -- UUID
  username    VARCHAR(32)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname    VARCHAR(32)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login  DATETIME,
  is_banned   TINYINT(1)   NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token       VARCHAR(255) PRIMARY KEY,        -- JWT
  user_id     VARCHAR(36)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME     NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 周期与天数
-- ============================================
CREATE TABLE cycles (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  cycle_number    INT NOT NULL,                -- 第几个十日周期
  day_number      TINYINT NOT NULL DEFAULT 1,  -- 1-10
  ruling_zodiac   VARCHAR(8) NOT NULL,          -- 当日生肖
  declaration     TEXT NOT NULL,                -- 当日宣言
  beast_event     VARCHAR(8),                   -- 激活的神兽事件（null=无）
  day_started_at  DATETIME NOT NULL,
  day_ends_at     DATETIME NOT NULL,
  status          ENUM('active','settled') DEFAULT 'active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 方块试炼记录
-- ============================================
CREATE TABLE trials (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  cycle_id      INT NOT NULL,
  day_number    TINYINT NOT NULL,
  score         INT NOT NULL DEFAULT 0,
  lines_cleared INT NOT NULL DEFAULT 0,
  duration_sec  INT NOT NULL DEFAULT 0,
  marks_earned  INT NOT NULL DEFAULT 0,        -- 本局获得刻痕
  mode          ENUM('normal','pvp','survival','nirvana') DEFAULT 'normal',
  pvp_result    VARCHAR(16),                    -- win / lose / draw
  survival_sec  INT DEFAULT 0,                  -- 生存模式忍耐秒数
  special_used  JSON,                           -- 使用的特殊技巧列表
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id)
);

-- ============================================
-- 玩家资产
-- ============================================
CREATE TABLE players (
  user_id         VARCHAR(36) PRIMARY KEY,
  marks           INT NOT NULL DEFAULT 0,       -- 刻痕（主货币）
  total_marks_earned BIGINT NOT NULL DEFAULT 0, -- 历史总收入
  path_level      TINYINT NOT NULL DEFAULT 1,   -- 钟渊之路境界(1-7)
  path_progress   INT NOT NULL DEFAULT 0,       -- 当前境界进度
  shield_count    TINYINT NOT NULL DEFAULT 1,   -- 护城钟壳数量
  shield_max      TINYINT NOT NULL DEFAULT 1,
  score_boost     DECIMAL(3,2) NOT NULL DEFAULT 0.00,  -- 永久分数加成
  fee_discount    DECIMAL(3,2) NOT NULL DEFAULT 0.00,  -- 雾区手续费折扣
  oracle_discount DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  pact_boost      DECIMAL(3,2) NOT NULL DEFAULT 0.00,  -- 契约贡献加成
  train_priority  TINYINT NOT NULL DEFAULT 0,   -- 列车优先权(分钟)
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 铭刻升级记录
-- ============================================
CREATE TABLE engravings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  category      ENUM('score','shield','fee','oracle','pact','train') NOT NULL,
  level         TINYINT NOT NULL DEFAULT 1,
  purchased_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_user_category (user_id, category)
);

-- ============================================
-- 雾区商品
-- ============================================
CREATE TABLE fog_goods (
  id            VARCHAR(36) PRIMARY KEY,
  cycle_id      INT NOT NULL,
  day_number    TINYINT NOT NULL,
  name          VARCHAR(64) NOT NULL,
  category      ENUM('神兽遗物','钟楼零件','规则碎片','列车遗落物','生肖符咒') NOT NULL,
  rarity        ENUM('普通','精良','稀有','史诗') NOT NULL,
  base_price    INT NOT NULL,
  current_price INT NOT NULL,
  volatility    DECIMAL(3,2) NOT NULL DEFAULT 0.15,
  trend         ENUM('rising','falling','volatile','stable') DEFAULT 'stable',
  flavor        TEXT,
  arrival_at    DATETIME NOT NULL,
  departure_at  DATETIME NOT NULL,
  is_active     TINYINT(1) DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id)
);

-- ============================================
-- 雾区持仓
-- ============================================
CREATE TABLE fog_positions (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  goods_id      VARCHAR(36) NOT NULL,
  quantity      INT NOT NULL,
  buy_price     INT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (goods_id) REFERENCES fog_goods(id)
);

-- ============================================
-- 试炼契约
-- ============================================
CREATE TABLE pacts (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(32) NOT NULL,
  type          ENUM('普通','生肖','神兽','血契') DEFAULT '普通',
  cycle_id      INT NOT NULL,
  day_number    TINYINT NOT NULL,
  creator_id    VARCHAR(36) NOT NULL,
  status        ENUM('open','locked','dissolved') DEFAULT 'open',
  reward_pool   INT NOT NULL DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  locked_at     DATETIME,
  dissolved_at  DATETIME,
  FOREIGN KEY (creator_id) REFERENCES users(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id)
);

CREATE TABLE pact_members (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  pact_id       VARCHAR(36) NOT NULL,
  user_id       VARCHAR(36) NOT NULL,
  contribution  INT NOT NULL DEFAULT 0,          -- 当日贡献刻痕
  joined_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pact_id) REFERENCES pacts(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_pact_user_day (pact_id, user_id)
);

-- ============================================
-- 规则之眼（情报卡片）
-- ============================================
CREATE TABLE oracle_cards (
  id              VARCHAR(36) PRIMARY KEY,
  cycle_id        INT NOT NULL,
  day_number      TINYINT NOT NULL,
  title           VARCHAR(64) NOT NULL,
  category        ENUM('市场','战场','社交','系统') NOT NULL,
  description     TEXT NOT NULL,
  effect_type     VARCHAR(32) NOT NULL,
  effect_data     JSON,
  cost            INT NOT NULL,
  accuracy        DECIMAL(3,2) NOT NULL DEFAULT 0.8,
  flavor          TEXT,
  is_purchased    TINYINT(1) DEFAULT 0,
  purchased_by    VARCHAR(36),
  available_until DATETIME NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cycle_id) REFERENCES cycles(id),
  FOREIGN KEY (purchased_by) REFERENCES users(id)
);

-- ============================================
-- 广播消息
-- ============================================
CREATE TABLE messages (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36),                       -- null = 系统消息
  sender_name VARCHAR(32),                       -- 发送者显示名
  channel     ENUM('全城广播','钟城广场','契约频道','生肖密语','回响私语') NOT NULL,
  type        ENUM('player','npc','system','train','beast','settlement') NOT NULL,
  content     TEXT NOT NULL,
  target_user VARCHAR(36),                       -- 回响私语的目标玩家
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 生肖印记
-- ============================================
CREATE TABLE zodiac_marks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  zodiac      VARCHAR(8) NOT NULL,               -- 鼠牛虎兔龙蛇马羊猴鸡狗猪
  earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  cycle_id    INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id),
  UNIQUE KEY uk_user_zodiac (user_id, zodiac)
);

-- ============================================
-- 神兽印记
-- ============================================
CREATE TABLE beast_marks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  beast       VARCHAR(8) NOT NULL,               -- 白虎朱雀玄武青龙
  earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  cycle_id    INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id),
  UNIQUE KEY uk_user_beast (user_id, beast)
);

-- ============================================
-- 排行榜快照
-- ============================================
CREATE TABLE rankings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id    INT NOT NULL,
  day_number  TINYINT NOT NULL,
  category    ENUM('daily_marks','daily_fog','daily_pact','cycle_total','beast_hall','zodiac_album') NOT NULL,
  rank        INT NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  score       BIGINT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cycle_id) REFERENCES cycles(id)
);

-- ============================================
-- 称号
-- ============================================
CREATE TABLE titles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  title_name  VARCHAR(64) NOT NULL,
  source      VARCHAR(64),                       -- 获得来源
  earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_user_title (user_id, title_name)
);
```

### 5.2 数据库索引补充

```sql
-- 高频查询索引
CREATE INDEX idx_trials_user_day ON trials(user_id, day_number);
CREATE INDEX idx_trials_cycle_day ON trials(cycle_id, day_number);
CREATE INDEX idx_fog_goods_active ON fog_goods(is_active, arrival_at);
CREATE INDEX idx_fog_positions_user ON fog_positions(user_id);
CREATE INDEX idx_pacts_status ON pacts(status, day_number);
CREATE INDEX idx_messages_channel ON messages(channel, created_at);
CREATE INDEX idx_rankings_category ON rankings(category, cycle_id, day_number);
CREATE INDEX idx_zodiac_marks_user ON zodiac_marks(user_id);
CREATE INDEX idx_beast_marks_user ON beast_marks(user_id);
```

---

## 六、API 设计

所有 API 返回 JSON。格式：`{ success: true/false, data: ..., error: "..." }`

### 6.1 认证

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/auth/register` | 注册 | `{ username, password, nickname }` |
| POST | `/api/auth/login` | 登录 | `{ username, password }` |
| POST | `/api/auth/logout` | 登出 | — |
| GET | `/api/auth/me` | 获取当前用户信息 | — |

### 6.2 周期

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cycle/current` | 获取当前周期信息（天数、生肖、宣言、倒计时） |
| GET | `/api/cycle/trains` | 获取当日列车时刻表 |

### 6.3 方块试炼

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| POST | `/api/trials/report` | 上报一局结果 | `{ score, lines, duration, mode, specials[], ... }` |
| GET | `/api/trials/history` | 查询历史试炼记录 | `?day=1&limit=10` |

### 6.4 玩家

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/player/profile` | 获取个人全部资料 |
| GET | `/api/player/engravings` | 获取铭刻升级状态 |
| POST | `/api/player/engrave` | 购买铭刻升级 | `{ category }` |
| GET | `/api/player/collections` | 获取收集品（印记+称号） |

### 6.5 雾区

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/fog/goods` | 当日雾区商品列表 | `?category=&rarity=&sort=` |
| GET | `/api/fog/goods/:id` | 单个商品详情（含价格走势） | — |
| POST | `/api/fog/buy` | 买入 | `{ goodsId, quantity }` |
| POST | `/api/fog/sell` | 卖出（T+1后才能卖） | `{ positionId, quantity }` |
| GET | `/api/fog/positions` | 我的持仓 | — |

### 6.6 契约

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/pact/available` | 可加入的契约列表 | — |
| POST | `/api/pact/create` | 创建契约 | `{ name, type }` |
| POST | `/api/pact/join` | 加入契约 | `{ pactId }` |
| POST | `/api/pact/leave` | 退出契约 | `{ pactId }` |
| GET | `/api/pact/mine` | 我的当前契约 | — |

### 6.7 情报

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/oracle/cards` | 当日情报卡片列表 | — |
| POST | `/api/oracle/buy` | 购买情报 | `{ cardId }` |

### 6.8 排行榜

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rankings/:category` | 获取排行榜 | `?limit=50` |

category: `daily_marks` / `daily_fog` / `daily_pact` / `cycle_total` / `beast_hall` / `zodiac_album`

### 6.9 广播

| 方法 | 路径 | 说明 | 请求体 |
|------|------|------|--------|
| GET | `/api/broadcast/messages` | 获取历史消息 | `?channel=&limit=50&before=` |
| POST | `/api/broadcast/send` | 发送消息 | `{ channel, content }` |

### 6.10 后台（钟渊控制台）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/stats` | 全服统计数据 |
| POST | `/api/admin/cycle/advance` | 强制推进一天 |
| POST | `/api/admin/cycle/speed` | 设置周期速度（分钟/天） |
| POST | `/api/admin/fog/seed` | 手动注入雾区商品 |
| POST | `/api/admin/fog/nudge` | 手动拨动某商品价格 |
| POST | `/api/admin/beast/trigger` | 手动触发神兽事件 |
| POST | `/api/admin/player/adjust` | 调整玩家刻痕/属性 |
| POST | `/api/admin/broadcast` | 发送系统广播 |

---

## 七、WebSocket 协议

### 7.1 连接

```
ws://150.158.10.10:8080/ws?token=<JWT>
```

连接时携带JWT进行认证。认证失败返回 `{ type: "error", data: "auth_failed" }` 并断开。

### 7.2 上行消息（客户端 → 服务器）

| type | 说明 | payload |
|------|------|---------|
| `chat` | 发送聊天消息 | `{ channel, content }` |
| `subscribe` | 订阅频道 | `{ channel }` |
| `unsubscribe` | 取消订阅 | `{ channel }` |
| `ping` | 心跳 | `{}` |

### 7.3 下行消息（服务器 → 客户端）

| type | 说明 | payload |
|------|------|---------|
| `init` | 连接成功后的初始化数据 | `{ cycle, player, fogGoods, rankings, ... }` |
| `pong` | 心跳响应 | `{}` |
| `chat` | 新消息 | `{ id, sender, channel, content, timestamp }` |
| `train` | 列车事件 | `{ trainName, action, timestamp, effects }` |
| `cycle_tick` | 周期倒计时更新 | `{ dayRemaining }` |
| `cycle_change` | 新的一天开始 | `{ rulingZodiac, declaration, beastEvent }` |
| `fog_price` | 雾区商品价格变动 | `{ goodsId, newPrice, direction }` |
| `fog_new_goods` | 新商品到站 | `{ goods: [...] }` |
| `beast_event` | 神兽降临/进行中/结算 | `{ beast, phase, data }` |
| `settlement` | 每日/周期结算 | `{ type, rewards, ranking }` |
| `ranking_update` | 排行榜变动 | `{ category, entries: [...] }` |
| `pact_update` | 契约状态变动 | `{ pact }` |
| `oracle_new` | 新情报卡片 | `{ cards: [...] }` |
| `npc_speak` | NPC发言 | `{ npc, content, target? }` |
| `zodiac_trial` | 生肖试炼进度 | `{ zodiac, progress, completed }` |
| `notification` | 通用通知 | `{ title, message, icon }` |

### 7.4 频道订阅

客户端连接后默认订阅：`全城广播`

可额外订阅：
- `钟城广场` — 玩家聊天
- `契约频道:<pactId>` — 当前契约内部
- `生肖密语:<zodiac>` — 持有该生肖印记者的秘密频道
- `回响私语:<userId>` — NPC对你个人的低语

---

## 八、视觉设计规范

### 8.1 设计主题：钟表行 × 终焉 × 上海1930

**核心意象**：一座1930年代上海外滩钟表行，被卷入终焉轮回。黄铜齿轮、墨绿珐琅、象牙白刻度、暗影回廊。

### 8.2 CSS 变量 (`variables.css`)

```css
:root {
  /* ====== 主色调 ====== */
  --color-bg-primary:    #0D0D0D;      /* 墨黑底（主背景） */
  --color-bg-secondary:  #1A1A1C;      /* 深灰卡片 */
  --color-bg-tertiary:   #242427;      /* 面板背景 */
  --color-bg-hover:      #2E2E32;      /* 悬停态 */
  --color-bg-active:     #3A3A3E;      /* 激活态 */

  /* ====== 文字 ====== */
  --color-text-primary:  #E8DDD0;      /* 象牙白（主文字） */
  --color-text-secondary:#9B9388;      /* 暗象牙（次要文字） */
  --color-text-muted:    #5E5A55;      /* 灰铜（弱化文字） */

  /* ====== 强调色 ====== */
  --color-accent-gold:   #B8860B;      /* 暗金（主强调） */
  --color-accent-copper: #8B7355;      /* 铜绿（次级强调） */
  --color-accent-brass:  #C5A55A;      /* 黄铜（高亮） */
  --color-accent-verdigris: #4A7C6F;   /* 铜锈绿（特殊标记） */

  /* ====== 功能色 ====== */
  --color-danger:        #8B2252;      /* 暗红（危险/敌意） */
  --color-warning:       #B8860B;      /* 暗金（警告） */
  --color-success:       #4A7C6F;      /* 铜绿（成功/安全） */
  --color-info:          #5B7B9A;      /* 灰蓝（信息） */
  --color-mystic:        #6B3FA0;      /* 暗紫（神秘/回响） */

  /* ====== 方块试炼专属 ====== */
  --block-bell:          #8B7355;      /* 钟鸣长条 - 铜绿 */
  --block-rule:          #B8860B;      /* 规则方块 - 暗金 */
  --block-echo:          #6B3FA0;      /* 回响碎片 - 暗紫 */
  --block-fog:           #5B7B9A;      /* 迷雾曲线 - 灰蓝 */
  --block-zodiac:        #8B2252;      /* 生肖残印 - 暗红 */
  --block-spike:         #6B6B6B;      /* 列车道钉 - 铁灰 */
  --block-engrave:       #2F4F6F;      /* 铭刻之笔 - 墨蓝 */

  /* ====== 字体 ====== */
  --font-display:        'Noto Serif SC', 'STSong', serif;    /* 标题 */
  --font-body:           -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono:           'SF Mono', 'Cascadia Code', 'Fira Code', monospace;

  /* ====== 字号 ====== */
  --text-xs:             11px;
  --text-sm:             13px;
  --text-base:           15px;
  --text-lg:             18px;
  --text-xl:             22px;
  --text-2xl:            28px;
  --text-3xl:            36px;

  /* ====== 间距 ====== */
  --space-1:             4px;
  --space-2:             8px;
  --space-3:             12px;
  --space-4:             16px;
  --space-5:             24px;
  --space-6:             32px;
  --space-8:             48px;

  /* ====== 圆角 ====== */
  --radius-sm:           2px;
  --radius-md:           4px;
  --radius-lg:           8px;
  --radius-round:        50%;

  /* ====== 阴影 ====== */
  --shadow-sm:           0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:           0 4px 12px rgba(0,0,0,0.5);
  --shadow-lg:           0 8px 24px rgba(0,0,0,0.6);
  --shadow-glow-gold:    0 0 12px rgba(184,134,11,0.3);
  --shadow-glow-copper:  0 0 12px rgba(139,115,85,0.3);
  --shadow-glow-mystic:  0 0 12px rgba(107,63,160,0.3);

  /* ====== 边框 ====== */
  --border-thin:         1px solid #2E2E32;
  --border-accent:       1px solid #8B7355;
  --border-gold:         1px solid #B8860B;

  /* ====== 动画 ====== */
  --ease-out:            cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:         cubic-bezier(0.65, 0, 0.35, 1);
  --duration-fast:       150ms;
  --duration-normal:     300ms;
  --duration-slow:       600ms;

  /* ====== 面板尺寸 ====== */
  --header-height:       56px;
  --footer-height:       40px;
  --panel-left-width:    360px;          /* 方块试炼面板宽 */
  --panel-right-width:   320px;          /* 身份铭刻面板宽 */
  --panel-min-width:     260px;          /* 最小面板宽度 */
}
```

### 8.3 布局CSS (`layout.css`)

```css
/* 全屏三面板网格 */
.app-container {
  display: grid;
  grid-template-rows: var(--header-height) 1fr var(--footer-height);
  grid-template-columns: var(--panel-left-width) 1fr var(--panel-right-width);
  grid-template-areas:
    "header header header"
    "left   center right"
    "footer footer footer";
  height: 100vh;
  overflow: hidden;
}

/* 面板折叠状态 */
.app-container.left-collapsed  { grid-template-columns: 0 1fr var(--panel-right-width); }
.app-container.right-collapsed { grid-template-columns: var(--panel-left-width) 1fr 0; }
.app-container.both-collapsed  { grid-template-columns: var(--panel-left-width) 1fr 0; }
```

### 8.4 关键动画

**钟声铭刻（消行闪光）：**
- 消行时：该行从暗金(#B8860B)渐变到透明，持续300ms
- 双重铭刻：全屏从暗金闪烁到透明，持续500ms

**列车进站：**
- 屏幕右侧 → 左侧滑入烟雾效果（灰白渐变）
- 汽笛声波形从顶栏扩散
- 相关面板边框闪烁铜绿光

**神兽降临：**
- 全屏暗角加深
- 神兽剪影从面板中心放大淡入
- 对应颜色辉光（白虎=银白/朱雀=橙红/玄武=深蓝/青龙=翡翠绿）

**生肖裁判更替（跨天）：**
- 旧生肖精神体淡出
- 钟楼剪影出现裂缝
- 新生肖精神体从裂缝中显现
- 持续2秒

### 8.5 响应式断点

| 断点 | 布局 |
|------|------|
| ≥1280px | 完整三面板 |
| 1024-1279px | 左+中面板，右面板折叠（可展开覆盖） |
| 768-1023px | 仅左面板（方块试炼），中右都是触发展开的浮动面板 |
| <768px | 移动端：全屏方块试炼，其他功能通过底栏按钮切换 |

---

## 九、实施路线图

### 迭代一：骨架搭建（第1阶段）

**目标**：SQL建表 + 服务端三层框架 + SPA基础容器

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 1.1 编写DB schema | `server/db/schema.js` | P0 |
| 1.2 实现MySQL连接池 + 自动化建表 | `server/db/pool.js` | P0 |
| 1.3 编写config.js | `server/config.js` | P0 |
| 1.4 实现认证（JWT + register/login/me） | `server/controllers/auth.js` + `server/models/user.js` | P0 |
| 1.5 实现auth中间件 | `server/middleware/auth.js` | P0 |
| 1.6 搭建Express应用骨架 | `server/app.js`（挂载路由，静态文件服务） | P0 |
| 1.7 编写index.html SPA容器 | `public/index.html`（三面板HTML骨架） | P0 |
| 1.8 编写variables.css + reset.css + layout.css | `public/css/` | P0 |
| 1.9 实现state.js + main.js | `public/js/state.js` + `public/js/main.js` | P0 |
| 1.10 实现WebSocket连接管理器 | `public/js/ws.js` + `server/ws/index.js` | P0 |

**验证标准**：能启动服务器，能注册/登录，能看到三面板空白布局，WebSocket能连上。

### 迭代二：核心玩法（第2阶段）

**目标**：方块试炼可玩 + 刻痕经济运转

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 2.1 实现方块引擎（纯逻辑） | `public/js/tetris/engine.js` | P0 |
| 2.2 实现Canvas渲染器 | `public/js/tetris/renderer.js` | P0 |
| 2.3 实现键盘输入处理 | `public/js/tetris/input.js` | P0 |
| 2.4 实现方块定义（7种+特殊） | `public/js/tetris/blocks.js` | P0 |
| 2.5 实现特效系统 | `public/js/tetris/effects.js` | P1 |
| 2.6 实现方块面板UI | `public/css/components/battlefield.css` | P0 |
| 2.7 实现试炼上报API | `server/controllers/trial.js` + `server/models/trial.js` | P0 |
| 2.8 实现玩家资产模型 | `server/models/player.js` | P0 |
| 2.9 实现十日轮回cycle服务 | `server/services/cycle.js` | P0 |
| 2.10 实现钟渊之路（path_level计算） | UI：`public/js/chronicle/path.js` | P1 |
| 2.11 实现身份铭刻面板 | `public/js/chronicle/profile.js` + CSS | P1 |

**验证标准**：能打方块，能得分，得分后刻痕入账且持久化，能看到钟渊之路进度。

### 迭代三：社交与经济（第3阶段）

**目标**：雾区交易 + 契约 + 广播 + 排行榜上线

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 3.1 实现雾区商品生成服务 | `server/services/fog.js` | P0 |
| 3.2 实现雾区交易API | `server/controllers/fog.js` + models | P0 |
| 3.3 实现雾区交易UI | `public/js/plaza/fog-market.js` + CSS | P0 |
| 3.4 实现契约API | `server/controllers/pact.js` + models | P0 |
| 3.5 实现契约UI | `public/js/plaza/pact.js` + CSS | P0 |
| 3.6 实现广播API + WS推送 | `server/controllers/broadcast.js` + WS handler | P0 |
| 3.7 实现广播UI | `public/js/plaza/broadcast.js` + CSS | P0 |
| 3.8 实现排行榜API | `server/controllers/ranking.js` + models | P1 |
| 3.9 实现排行榜UI | `public/js/plaza/rankings.js` + CSS | P1 |
| 3.10 实现情报卡片系统 | `server/controllers/oracle.js` + services + UI | P1 |
| 3.11 实现铭刻升级树 | UI：`public/js/chronicle/upgrades.js` | P2 |
| 3.12 实现收集品展示 | UI：`public/js/chronicle/collections.js` | P2 |

**验证标准**：全部中央面板标签可用，能交易、组队、聊天、查看排行。

### 迭代四：终焉叙事（第4阶段）

**目标**：生肖裁判 + 四象神兽 + 列车系统 + NPC全部上线

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 4.1 实现生肖系统 | `server/services/zodiac.js` | P0 |
| 4.2 实现生肖UI（精神体+试炼追踪） | `public/js/zodiac.js` + CSS | P0 |
| 4.3 实现四象神兽事件 | `server/services/beast.js` | P0 |
| 4.4 实现四象UI（降临特效+对战/涅槃/生存界面） | `public/js/beasts.js` + CSS | P0 |
| 4.5 实现列车调度器 | `server/services/train.js` | P0 |
| 4.6 实现列车UI（汽笛/进站动画/时刻表） | `public/js/train.js` + CSS | P0 |
| 4.7 实现NPC发言池 | `server/services/npc.js` | P1 |
| 4.8 扩展NPC阵容至18个+四象人形 | 更新npc.js数据 | P1 |
| 4.9 实现每日/周期结算 | `server/services/settlement.js` | P0 |
| 4.10 实现结算UI（弹窗+动画） | CSS + JS | P1 |
| 4.11 实现PVP模式 | `public/js/tetris/modes.js`（pvp模式） | P1 |
| 4.12 实现生存模式 | `public/js/tetris/modes.js`（survival模式） | P1 |
| 4.13 实现涅槃模式 | `public/js/tetris/modes.js`（nirvana模式） | P2 |
| 4.14 实现后台钟渊控制台 | `public/admin/index.html` + CSS + JS | P2 |

**验证标准**：完整十日轮回可运转，生肖每日更替，神兽事件按时触发，列车时刻精准。

### 迭代五：打磨（第5阶段）

| 任务 | 产出 | 优先级 |
|------|------|--------|
| 5.1 CSS全面调优 | 暗色铜绿主题全覆盖 | P1 |
| 5.2 动画完成 | 所有面板过渡、消行特效、列车进站、神兽降临 | P1 |
| 5.3 音效集成 | 汽笛/钟声/消行/刻痕/低语/神兽吼 | P2 |
| 5.4 移动端适配 | 响应式断点 + 触屏操作 | P2 |
| 5.5 性能优化 | WebSocket消息合并、Canvas渲染优化 | P2 |
| 5.6 文档 | 更新README + WORLDVIEW + 玩家手册 | P2 |

---

## 附录A：与当前代码的关系

**保留的：**
- 俄罗斯方块核心引擎算法（重写但逻辑可参考 `public/app.js`）
- Canvas渲染方案
- 钟渊之路七层境界概念
- NPC阵容（当前10个 + 扩展至18个）
- Docker部署方案（`docker-compose.yml` 结构保持不变）
- 世界观测文案方向（`docs/WORLDVIEW.md` 作为世界观基础）

**完全废弃的：**
- `public/app.js`（拆分为 `js/tetris/*` 模块）
- `public/js/market.js`（改为 `plaza/fog-market.js`）
- `public/js/guilds.js`（改为 `plaza/pact.js`）
- `public/js/activities.js`（改为 `plaza/oracle.js`）
- `public/js/chat.js`（改为 `plaza/broadcast.js`）
- `public/js/lobby.js`（废弃，SPA无大厅）
- `public/js/shared.js`（拆分为 `utils.js` + `state.js`）
- 所有独立HTML页面（`game.html`, `market.html`, `guilds.html` 等9个）
- `server/index.js`（拆分为 `controllers/` + `services/` + `models/`）
- `data/state.json`（全部走MySQL）
- 真实股票行情代码（替换为雾区商品生成器）
- 金币/赌场术语（统一为刻痕/终焉/钟城术语）

**新增的（本版本独有）：**
- 十日轮回周期系统
- 列车时刻调度
- 十二生肖裁判 + 试炼
- 四象神兽降临事件
- 雾区商品生成与波动算法
- 试炼契约（临时三人组队）
- 规则之眼情报卡片
- 生肖密语频道
- 神兽殿堂 + 生肖全图鉴排行榜
- WebSocket实时推送
- 全SPA单页架构

---

## 附录B：配置常量

### 默认配置 (`config.js`)

```javascript
module.exports = {
  // 服务器
  PORT: 8080,
  ADMIN_PORT: 18052,

  // 数据库
  DB: {
    host: '127.0.0.1',
    port: 3306,
    user: 'zhongyan',
    password: 'zhongyan666',
    database: 'zhongyan_clock_city',
    connectionLimit: 20
  },

  // 周期
  CYCLE: {
    daysPerCycle: 10,           // 每周期天数
    minutesPerDay: 1440,        // 每天真实分钟数（1440=24h，24=开发调试）
    settlementLeadMinutes: 5    // 结算前提前广播的分钟数
  },

  // 列车
  TRAIN_SCHEDULE: [
    { name: '晨钟列车', hour: 6, minute: 0,  effects: ['daily_declaration', 'zodiac_activate'] },
    { name: '正午列车', hour: 12, minute: 0, effects: ['fog_fluctuation', 'echo_bell'] },
    { name: '黄昏列车', hour: 18, minute: 0, effects: ['oracle_refresh', 'pact_lock'] },
    { name: '午夜列车', hour: 23, minute: 0, effects: ['fog_settlement', 'goods_arrival'] },
    { name: '终焉列车', hour: 23, minute: 55, effects: ['daily_settlement', 'cycle_check'] }
  ],

  // 雾区
  FOG: {
    goodsPerDay: { min: 8, max: 12 },
    baseVolatilityRange: [0.1, 0.3],
    forceSettleRatio: 0.8,      // 强制平仓比例
    t1LockDays: 1,              // T+1锁定天数
    maxHoldings: 5,
    maxQuantity: 99
  },

  // 生肖
  ZODIAC_CYCLE: [
    '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡'
  ],
  HIDDEN_ZODIAC: ['狗', '猪'],

  // 神兽
  BEAST_SCHEDULE: {
    3:  { beast: '白虎', type: 'pvp',     triggerDay: 3,  triggerTime: '12:00' },
    5:  { beast: '朱雀', type: 'nirvana', triggerDay: 5,  triggerTime: '06:00' },
    7:  { beast: '玄武', type: 'survival',triggerDay: 7,  triggerTime: '06:00' },
    10: { beast: '青龙', type: 'final',   triggerDay: 10, triggerTime: '06:00' }
  },

  // 铭刻升级费用（按category和level）
  ENGRAVE_COSTS: {
    score:  [500, 1500, 3000, 6000, 12000],
    shield: [300, 800,  2000, 5000, 10000],
    fee:    [200, 600,  1500, 4000, 8000],
    oracle: [100, 300,  800,  2000, 5000],
    pact:   [500, 1500, 3000, 6000, 12000],
    train:  [500, 1500, 3000]  // 只有3级
  },

  // 铭刻升级效果（按category和level，百分比）
  ENGRAVE_EFFECTS: {
    score:  [0.05, 0.10, 0.15, 0.20, 0.30],
    shield: [2, 3, 4, 5, 6],              // 绝对值（护盾数量）
    fee:    [0.05, 0.04, 0.03, 0.02, 0.01], // 手续费率
    oracle: [0.05, 0.10, 0.15, 0.20, 0.30],
    pact:   [0.05, 0.10, 0.15, 0.20, 0.30],
    train:  [1, 2, 3]                     // 绝对值（提前分钟数）
  }
};
```

---

**文档版本**：V2.0 — 2026-06-02
**适用范围**：终焉钟城完全重写
**维护者**：wangcc (AI-assisted design)
**下一份文档**：实现时请严格对照此文档的数据库 Schema、API 签名和 CSS 变量。
