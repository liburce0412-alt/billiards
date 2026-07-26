# Testing

Break Builder 3D 使用分层测试保护规则、物理确定性、浏览器布局和在线流程。

## 快速检查

```bash
corepack enable
yarn install --immutable
yarn test
yarn build
yarn test:e2e
```

## Jest

```bash
yarn test
```

测试包含物理、规则、AI 规划、录像和工具函数。规则变更至少需要：

1. 一个合法场景；
2. 一个相邻的犯规或边界场景；
3. 序列化后仍可重复的断言；
4. 必要时覆盖 AI、玩家和在线入口共享判定。

当前基线为 96 个测试套件、725 项测试。

## 类型与代码质量

```bash
yarn lint
yarn lint:css
```

提交的新文件必须通过 TypeScript 和 ESLint。仓库仍有一批来自上游旧页面与历史测试的样式/复杂度债务；不要在无关变更中批量格式化它们，也不要增加新的违规项。

## Playwright

首次运行前安装 Chromium：

```bash
yarn playwright install chromium
```

运行本地浏览器测试：

```bash
yarn test:e2e
```

截图基线覆盖：

- `360×800`
- `768×1024`
- `1200×750`
- `1920×1080`
- 低画质对局
- 高画质对局

设计变更确认无误后，使用下列命令更新截图：

```bash
yarn test:e2e:update
```

请在 Pull Request 中说明截图变化的原因。

## 在线双上下文测试

在线用例会创建两个独立 Chromium 上下文，验证房间创建、加入、局面同步和结束流程。它依赖公共中继，因此默认跳过：

```bash
$env:RUN_ONLINE_E2E = "1"
yarn test:e2e e2e/online.spec.ts
```

网络波动不应成为普通本地测试的随机失败来源。

## 手工验收

规则或物理相关改动还应检查：

- 30、60、144 Hz 显示条件下最终球位一致；
- 密集开球无重叠、穿库、能量异常增加或无限旋转；
- 自由球确认前可以重复摆放；
- AI 被挡时选择解球或安全球，而不是直接撞障碍球；
- AI 击球期间相机仍可旋转和缩放；
- 静音、首次用户交互、回放和多人模式行为不变。
