# 生产部署 · 2026-09-05

- 用户明确授权直接部署。
- 地址：https://play.campus3ai.xyz/
- Worker：`break-builder-prod`。
- 构建版本：`260905.15`。
- 部署时间：2026-09-05 15:37:21（Asia/Shanghai）。
- Worker 版本：`1b9a45aa-a37d-4e9f-9e77-320544cddab9`。
- 部署 ID：`9bb67202-12bd-4269-a00b-60e028eca8c3`，部署列表确认承接 100% 流量。

## 检查结果

- 生产构建、资源来源检查通过；服务端 2 个测试文件、6 个用例通过。
- 远程数据库没有待执行迁移。
- 发布后通过真实域名下载 66 个文件，包括 HTML、JavaScript、CSS 和八套环境图片；全部返回 200，SHA-256 与本地发布包逐个一致。
- `/`、`/play`、`/account`、`/lobby`、`/rules`、`/help` 返回 200 HTML。
- 匿名 `/api/me` 返回预期的 401 JSON。
- 逐文件校验结果见 [release-verification.json](release-verification.json)。

## 验证边界

本地完整检查记录见 [页面记录](README.md)。本次生产浏览器预览工具超时，未完成部署后的浏览器交互复验；HTTP 路由和文件一致性验证通过，不代表已经完成生产登录对局或实体手机验收。
