# Break Builder 3D

浏览器里的 3D 台球与乒乓球：练习、AI 对局、好友房间，以及可以自由观察的球场。

[![Build](https://github.com/liburce0412-alt/billiards/actions/workflows/main.yml/badge.svg)](https://github.com/liburce0412-alt/billiards/actions/workflows/main.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-2ea44f.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-000000.svg)](https://threejs.org/)

[进入主站](https://play.campus3ai.xyz/) · [台球](https://play.campus3ai.xyz/play) · [乒乓球](https://play.campus3ai.xyz/table-tennis) · [操作说明](https://play.campus3ai.xyz/tools) · [问题反馈](https://github.com/liburce0412-alt/billiards/issues)

## 可以玩什么

| 模式   | 玩法与对局                                                                         | 场景                           |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------ |
| 台球   | 中式八球、美式九球、四球追分、斯诺克、三库；练习、11 档本地 AI、同屏双人和在线房间 | 8 套环境，可选择球杆与球桌款式 |
| 乒乓球 | 练习、3 档 AI、好友双人；11 分制、净胜两分、三局两胜                               | 赛博竞技馆、写实体育馆         |

主站统一管理账号、头像、好友、邀请、房间入口及画质和音量。乒乓球由独立仓库
[psychic-funicular](https://github.com/zjqzdhs/psychic-funicular) 维护，以固定提交的 Git submodule 接入；两种玩法共享 Three.js，按需加载各自游戏。

## 台球

- 物理使用固定 `1/512 s` 步长，推进与画面渲染分离；包含滚动、滑动、旋转、球间碰撞和碰库处理。
- AI 使用正式物理内核试打候选，按难度调整误差、搜索预算和走位评估。9–11 档增加两层规划；档位不对应经过标定的真人竞技等级。
- 两位机械球手执行走位、俯身、瞄准、出杆和起身，携带所选球杆。击球后保持姿势约一秒，再过渡起身；对手回合使用旁观视角。
- 顶部可以直接切换 2D / 3D；支持环绕、俯仰、缩放及第一视角擦巧克动作。
- 保留球局录像、回放、声音、分档画质，以及移动横屏的瞄准和力度控制。

| 规则     | 主要目标                                       |
| -------- | ---------------------------------------------- |
| 中式八球 | 清完本组后合法打进黑八；开球后开放球组         |
| 美式九球 | 首先接触最低号球，支持 Push-out 和可选赛事规则 |
| 四球追分 | 项目的 1 / 4 / 7 / 10 得分与目标顺序规则       |
| 斯诺克   | 红彩交替、自由球、复位和争黑                   |
| 三库     | 母球碰第二目标球前至少三次碰库                 |

具体版本、犯规和项目差异以[规则页](https://play.campus3ai.xyz/rules)及
[RuleProfile](src/controller/rules/ruleprofile.ts) 为准。

### 操作

| 动作           | 操作方式                                           |
| -------------- | -------------------------------------------------- |
| 瞄准           | 在球场调整方向，或使用局内精细瞄准控制             |
| 力度与击球     | 拉动力度条蓄力，松手出杆；横屏移动端使用右侧操作区 |
| 高低杆与左右塞 | 调整母球上的击球点                                 |
| 镜头           | 顶部切换 2D / 3D，使用拖动、触控手势和滚轮调节     |
| 自由球         | 移动母球后确认摆位                                 |
| 个性化与设置   | 局内设置调整球杆、球桌、环境、画质和音量           |

台球详细键盘与手势说明见[台球操作页](https://play.campus3ai.xyz/help.html)。

### 八套环境

| 环境             | URL 标识            |
| ---------------- | ------------------- |
| SPECTRA 光谱空间 | `spectra`           |
| 深空银河         | `galaxy`            |
| 明亮星云         | `nebula`            |
| 冠军艺廊         | `club`              |
| 极光冰庭         | `aurora-hall`       |
| 浮光神殿         | `sky-temple`        |
| 深海玻璃宫       | `abyss-palace`      |
| 月海观测台       | `lunar-observatory` |

## 乒乓球

乒乓球采用辅助站位与直接挥拍操作。玩家控制落点、出拍时机、力度和旋转；过早、过晚、低球强扣或力量过大都可能失误。

| 输入                     | 操作                                         |
| ------------------------ | -------------------------------------------- |
| 鼠标左右移动             | 调整方向                                     |
| 轻点左键                 | 轻挡                                         |
| 按住左键后松开           | 短蓄力后挥拍                                 |
| 向上刷 / 向下切          | 上旋 / 下旋                                  |
| 按住并松开 Q / W / E / R | 轻挡 / 平击 / 上旋 / 扣杀，按住时长影响力度  |
| 按住 A / D               | 添加侧旋                                     |
| 空格                     | 使用当前默认球技，松键出拍                   |
| 触屏                     | 在球场内一笔滑动，松手出拍；上下动作表达旋转 |

“操作 / 精调”面板可调整默认球技。练习引导依次检查合法发球、轻重回球和上旋落台，支持跳过、重看及完成记忆。比分分别显示小分、胜局和发球方；离线菜单可重开，主站记住上次场馆、模式和难度。

![乒乓球第一视角：球桌、对手、托球手与球拍](https://raw.githubusercontent.com/zjqzdhs/psychic-funicular/ba571effedb8e82f35269006d28e13d373ab1851/docs/visual/2026-10-07-correction/game-held.png)

上图为 2026-10-07 本地浏览器小样。更多规则、独立运行和接口说明见[乒乓球 README](https://github.com/zjqzdhs/psychic-funicular#readme)。

## 3D 资产与界面

Three.js 负责网页渲染、交互、镜头与动画驱动；Blender 负责可编辑模型、材质与骨骼制作。
Blender MCP 用于开发时的场景修改和视口检查，玩家运行游戏不依赖 Blender 或 MCP。

| 内容                         | 保存位置                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| 台球可编辑源                 | `assets/blender/legacy/`                                                                              |
| 台球运行模型与清单           | `dist/models/legacy-refined/`                                                                         |
| 资产来源、精修流程           | [台球资产约定](docs/art/legacy-runtime-contract.md)、[资产清单](docs/art/legacy-asset-inventory.json) |
| Blender 检查凭据             | `docs/qa/2026-10-05-blender-mcp/`                                                                     |
| 乒乓球源文件、GLB 与制作记录 | [独立仓库资产文档](https://github.com/zjqzdhs/psychic-funicular/blob/main/docs/assets.md)             |

运行时按所选款式加载模型；星云、极光和光照等动态效果继续由着色器处理。
可编辑源文件体积较大，随仓库保存，但不包含在玩家网页下载包中。

主站提供浅 / 深主题、配色、Classic / Fluid 背景、边缘追光及减少动态效果设置。
玻璃面板采样实际场景，文字和输入保持独立；局内把折射限制在面板边缘，并提供低画质降级。

## 本地开发

建议使用 Node.js 24.x、Corepack 和支持 WebGL 2 的浏览器。主站由 `package.json` 固定使用 **Yarn 4.9.1**。

### 克隆与构建

```sh
git clone --recurse-submodules https://github.com/liburce0412-alt/billiards.git
cd billiards
corepack yarn install --immutable
corepack yarn build
```

已有克隆先运行 `git submodule update --init --recursive`。构建会从固定的乒乓球提交生成
`dist/models/table-tennis/`，该目录不重复入库。不要在生产构建中自动追踪子仓库的浮动分支。

### 本地离线演示

```sh
corepack yarn worker:dev --local --port 8787
```

打开 <http://localhost:8787/?platformDemo=1>，通过主站入口进入台球或乒乓球。
该演示开关只在 `localhost` / `127.0.0.1` 生效，使用本地示例身份，不代表已登录线上账号。
修改源码时，可另开终端运行 `corepack yarn watch` 持续构建。

`corepack yarn serve` 提供 8080 端口的静态预览；从 `/?platformDemo=1` 查看前端页面时可以使用。
它不提供账号 API、WebSocket 或深层路由回退。完整路由和联机开发请使用 Worker。

### 账号与好友联机开发

在根目录按 [`.dev.vars.example`](.dev.vars.example) 建立本地 `.dev.vars`，填写独立的开发密钥，保留已有配置。所需项目包括：

- `BETTER_AUTH_SECRET`、`RECOVERY_CODE_PEPPER`、`ADMIN_BOOTSTRAP_CODE`。
- `APP_ORIGIN=http://localhost:8787` 和 `ENVIRONMENT=development`；来源必须与浏览器地址一致。
- `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET`：仅本地开发可同时留空；启用时配置有效配对及匹配的 `TURNSTILE_HOSTNAMES`。

```sh
corepack yarn db:migrate:local
corepack yarn worker:dev --local --port 8787
```

不带 `platformDemo` 进入本地站点，使用本地账号流程。D1、KV 和 Durable Objects 由 Wrangler 本地模拟；`.dev.vars` 与 `.wrangler/` 不提交到仓库。

### 常用命令

| 命令                        | 用途                               |
| --------------------------- | ---------------------------------- |
| `corepack yarn watch`       | 准备乒乓球资产并监听主站源码       |
| `corepack yarn dev`         | 单次主站构建                       |
| `corepack yarn build`       | 生成版本、构建并准备正式站静态资源 |
| `corepack yarn lint`        | TypeScript 与 ESLint               |
| `corepack yarn prettify`    | 格式化脚本覆盖的源码与静态页面     |
| `corepack yarn test`        | 主站 Jest 测试                     |
| `corepack yarn worker:test` | Worker / Durable Object 测试       |
| `corepack yarn test:e2e`    | Playwright 浏览器测试              |
| `corepack yarn lint:css`    | 样式检查                           |

独立开发乒乓球可进入 `packages/table-tennis` 后运行 `npm ci`、`npm run dev`；其测试、资源和开发入口独立维护。

## 仓库结构与发布

```text
src/app/                 React 页面、路由与游戏挂载
src/controller/          台球流程、规则与输入
src/model/               台球物理
src/view/                Three.js 渲染、球手、镜头与 HUD
src/network/             台球网络与本地 AI
src/platform/            账号接口与共用界面
packages/table-tennis/   固定提交的乒乓球子模块
server/                  Cloudflare Worker API 与实时房间
migrations/              D1 数据库迁移
assets/blender/          可编辑台球模型源
dist/                    网页、样式与发布资源
test/、e2e/              单元、服务端与浏览器检查
scripts/art/             模型制作、导出与检查脚本
docs/                    设计、资产约定、反馈与分日期验收记录
```

正式站部署到 Cloudflare Workers，同源提供页面、模型和服务端接口。GitHub Pages 仅提供正式站跳转页。
部署命令为 `corepack yarn deploy`；自行部署须先配置自己的域名、绑定和密钥，不能直接使用仓库中维护者的生产资源。
数据库迁移与回退约束见[发布说明](docs/art/table-tennis-release-readiness.md)。

修改乒乓球时，先向独立仓库推送提交，再在主站提交更新后的子模块指针。
开发资料见[架构说明](docs/ARCHITECTURE.md)、[测试指南](docs/TESTING.md)和[贡献指南](.github/CONTRIBUTING.md)。

## 当前进展与验证范围

2026-10-07 的更新补充了直接挥拍、按实际落台结果推进的教学、失误提示、重开入口和共用玻璃，
修正了乒乓球肩根、手腕、躯干转轴与第一视角。实现和遗留问题记录在[本轮审计](docs/qa/2026-10-07-followup-audit.md)。

台球动作的本地检查见[2026-10-05 回归记录](docs/qa/2026-10-05-billiards-regression/README.md)。
这些记录有各自的版本和设备范围，旧测试数量不代表新版本全部通过。
持续改进的重点包括连续挥拍自然度、近眼手臂构图、球体光照和移动端手感；完整教学难度、真机性能及公网双设备体验仍需实际试玩。

## 来源与许可证

- 主仓库代码沿用 [GPL-3.0](LICENSE)，基于 [tailuge/billiards](https://github.com/tailuge/billiards) 持续开发，保留原作者与贡献者署名。
- 乒乓球子仓库的原型、许可范围及资源说明单独记录在其 [README](https://github.com/zjqzdhs/psychic-funicular#readme)，不因接入主站自动变更。
- 模型与声音来源见[模型说明](dist/models/MODEL_ASSETS.md)及[音频许可证](dist/sounds/LICENSES.md)。
- 功能建议可提交 Issue；安全问题请按[安全策略](SECURITY.md)私下报告。
