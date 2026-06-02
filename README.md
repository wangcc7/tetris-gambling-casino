# 终焉钟城 V2

十日轮回主题的沉浸式网页游戏原型。玩家作为试炼者进入钟渊系统统治的时钟城市，在方块试炼中获得刻痕，在雾区交易所买卖终焉商品，在试炼契约中临时结盟，并通过规则之眼购买情报。

金币、股票、期货、公会等 V1 术语已废弃。V2 统一使用：刻痕、雾区商品、试炼契约、规则之眼、铭刻之书、终焉列车、生肖裁判、四象神兽。

## 线上地址

- 玩家端：[http://150.158.10.10:8080](http://150.158.10.10:8080)
- 后台：[http://150.158.10.10:18052/admin](http://150.158.10.10:18052/admin)
- 后台账号：`root`
- 后台密码：`gambleMaster666`

## V2 当前实现

- 唯一入口 SPA：`public/index.html`
- 三面板布局：左侧方块试炼，中部钟城广场，右侧铭刻之书，底部列车轨道
- 方块试炼：10x20 棋盘，7 种终焉属性方块，支持方向键、旋转、硬降、暂存
- 十日轮回：服务端动态计算周期、当日生肖、宣言、剩余时间和四象事件
- 终焉列车：晨钟、正午、黄昏、午夜、终焉五班列车时刻表
- 雾区交易所：每日生成 8-12 种商品，价格持续波动，可买入/卖出
- 试炼契约：每日临时三人小队，可创建、加入、退出
- 规则之眼：每日 6 张情报卡片，可购买并写入广播事件
- 钟城广播：全城广播、钟城广场、契约频道等频道入口
- 试炼者名录：当日刻痕、雾区、契约、十日总榜、神兽殿堂、生肖全图鉴
- 铭刻之书：个人刻痕、消行、分数、雾区持仓、生肖/神兽印记、钟渊之路、铭刻升级
- 后端 V2 API：周期、列车、试炼上报、雾区、契约、情报、广播、排行榜
- Docker 部署：玩家端 `8080`，后台 `18052`

## 项目结构

```text
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── public
│   ├── index.html          # V2 SPA 主入口
│   ├── js
│   │   └── v2-main.js      # V2 SPA 状态、UI、方块试炼
│   ├── styles.css          # 旧样式 + V2 三面板样式
│   └── *.html              # V1 兼容页面，入口已不再使用
├── server
│   └── index.js            # HTTP、MySQL、V2 API、定时事件
└── docs
    ├── DESIGN_V2.md        # V2 权威设计文档
    └── WORLDVIEW.md        # V2 世界观与文案约束
```

## V2 API 摘要

```text
GET  /api/cycle/current
GET  /api/cycle/trains
POST /api/trials/report
GET  /api/player/profile
POST /api/player/engrave
GET  /api/fog/goods
POST /api/fog/buy
POST /api/fog/sell
GET  /api/pact/available
POST /api/pact/create
POST /api/pact/join
GET  /api/oracle/cards
POST /api/oracle/buy
GET  /api/rankings/:category
GET  /api/broadcast/messages
POST /api/broadcast/send
```

## 本地说明

本地只做代码编辑和 Git 版本管理，不在本地调试。调试统一部署到 `150.158.10.10` 后进行。

## 服务器部署

项目部署目录：

```bash
/opt/tetris-gambling-casino
```

部署命令：

```bash
docker-compose up -d --build
```

查看日志：

```bash
docker logs --tail=100 tetris-gambling-casino
```

## 后续路线

1. 将 V2 雾区、契约、情报、铭刻升级从内存/兼容表迁移到独立 MySQL 表。
2. 加 WebSocket，把广播、列车、雾区价格、排行榜实时推送到 SPA。
3. 按 `docs/DESIGN_V2.md` 拆分 `server/index.js` 为 controllers/services/models。
4. 把方块试炼拆成 `js/tetris/*` 模块，并补 PVP、玄武生存、朱雀涅槃模式。
5. 为列车进站、生肖更替、四象神兽降临加入音效和全屏动画。
