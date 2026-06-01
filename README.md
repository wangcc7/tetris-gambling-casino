# 俄罗斯方块 · 极乐赌场

融合俄罗斯方块、模拟股票/期货、NPC 聊天和后台调参的网页游戏原型。金币只是游戏内虚拟货币，无真实价值。

## 线上地址

- 玩家端：http://150.158.10.10:8080
- 后台：http://150.158.10.10:18052/admin
- 后台账号：`root`
- 后台密码：`gambleMaster666`

## 当前功能

- 标准 10x20 俄罗斯方块棋盘
- 键盘控制：左/右移动，上旋转，下软降，空格硬降
- 7 种属性方块：暴击、铁壁、混乱、贪财、冻结、毒雾、自爆
- 金币浮窗：贪财方块消除时拾取
- 每 30 秒全服随机事件
- 模拟 A 股股票行情和期货行情
- 庄家控盘、NPC 自动聊天、全服公告
- 后台控制台：股票/期货操控、胜率参数、通胀参数、玩家金币、危险事件
- Docker 容器化部署，玩家端监听 `8080`，后台监听 `18052`

## 项目结构

```text
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── public
│   ├── admin.html
│   ├── admin.js
│   ├── app.js
│   ├── index.html
│   └── styles.css
└── server
    └── index.js
```

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
