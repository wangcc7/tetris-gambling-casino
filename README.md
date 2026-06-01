# 俄罗斯方块 · 极乐赌场

融合俄罗斯方块、模拟股票/期货、NPC 聊天和后台调参的网页游戏原型。金币只是游戏内虚拟货币，无真实价值。

## 线上地址

- 玩家端：http://150.158.10.10:8080
- 后台：http://150.158.10.10:18052/admin
- 后台账号：`root`
- 后台密码：`gambleMaster666`

## 当前功能

- 游戏大厅：全服事件、庄家池、行情热榜、公会战、排行榜和聊天摘要
- 方块战场：标准 10x20 俄罗斯方块、7 种属性方块、金币浮窗、战场事件
- 交易市场：模拟 A 股、期货开仓、玩家持仓、市场事件
- 公会系统：公会广场、创建/加入公会、公会 BOSS、公会战入口
- 排行榜：韭菜王者、赌神榜、暴发户榜、黑奴榜
- 聊天室：全局聊天、红包、AI NPC 阵容
- 玩家资产：昵称、签到、金币、称号、股票/期货持仓
- 后台控制台：股票/期货操控、胜率参数、通胀参数、玩家金币、危险事件
- Docker 容器化部署：玩家端监听 `8080`，后台监听 `18052`

## 项目结构

```text
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── public
│   ├── admin.html
│   ├── admin.js
│   ├── app.js              # 方块战场引擎
│   ├── chat.html
│   ├── game.html
│   ├── guilds.html
│   ├── index.html
│   ├── js                  # 各功能页脚本
│   ├── market.html
│   ├── profile.html
│   ├── rankings.html
│   └── styles.css
└── server
    └── index.js
```

## 功能架构

当前采用轻量多页面架构，先把产品边界拆清楚，避免所有功能塞在一个页面里。

世界观与文案约束见：[docs/WORLDVIEW.md](docs/WORLDVIEW.md)

```text
玩家端 8080
├── 大厅 /index.html
├── 方块战场 /game.html
├── 交易市场 /market.html
├── 公会 /guilds.html
├── 排行 /rankings.html
├── 聊天 /chat.html
└── 资产 /profile.html

后台端 18052
└── 管理后台 /admin

服务端领域
├── player：金币、分数、签到、称号、持仓
├── tetris：消行结算、属性奖励、战场事件
├── market：股票、期货、庄家控盘、市场事件
├── guild：公会、公会 BOSS、公会战
├── chat：全局消息、红包、NPC 自动发言
├── ranking：每日/每周排行榜
└── admin：庄家控制台、危险操作、经济调控
```

## 下一阶段建议

1. 接入持久化数据库，把当前内存状态迁移到 SQLite/PostgreSQL。
2. 加 WebSocket，让行情、聊天、PVP 干扰和全服事件实时推送。
3. 把俄罗斯方块战场拆成单人、PVP、公会 BOSS 三种模式。
4. 后台细化权限和操作日志，危险操作做二次确认与回滚记录。
5. 完成股票 T+1 卖出、期货强平、排行榜每日结算定时任务。

## 本地开发说明

本地只做代码编辑和版本管理，不在本地启动调试服务。调试统一部署到服务器 `150.158.10.10` 后进行。

## 服务器部署

项目部署目录：

```bash
/opt/tetris-gambling-casino
```

部署命令：

```bash
docker-compose up -d --build
```

查看容器：

```bash
docker ps --filter name=tetris-gambling-casino
```

查看日志：

```bash
docker logs --tail=100 tetris-gambling-casino
```

## 注意事项

- 服务器 Docker Compose 版本较旧，`docker-compose.yml` 使用 `version: "2.2"`。
- Docker 基础镜像使用华为云镜像源，避免服务器直连 Docker Hub 超时。
- 前端已兼容普通 HTTP 环境，避免 `crypto.randomUUID()` 在非安全上下文不可用导致页面脚本中断。
