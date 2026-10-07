# 发布路径与回退约束（2026-10-05）

发布目标仍是 `wrangler.jsonc` 的 `break-builder-prod` Worker、
`play.campus3ai.xyz` 自定义域名和同源 `dist/` 静态资源。
乒乓球源码在 `packages/table-tennis` Git 子模块；主站 webpack 独立分块加载，
`npm run assets:table-tennis` 将已验证的 GLB 复制到 `dist/models/table-tennis`。
台球精修 GLB 由 `dist/models/legacy-refined/manifest.json` 定位。
`.blend`、离线导出和 QA 文件位于 `dist/` 之外，不随静态资源发布。

发布执行者须先记录当前线上部署和版本，再检查并执行 D1 的
`0004_table_tennis.sql`，然后部署 Worker。迁移为原房间添加默认 `billiards`
的 `game_type` 和独立乒乓球结果表，不覆盖旧房间或旧成绩。
`wrangler deploy` 同时引入 `v2-table-tennis` SQLite Durable Object 类。
2026-10-05 已用 Wrangler 4.122.0 完成上述发布：远程 D1 迁移成功，
Worker 版本 `2a353ef1-040c-434c-8dbb-bc71adbf6521` 已承接 100% 流量。
再次检查远程迁移时没有待执行项目。完整交付记录见
[`../qa/2026-10-05-release.md`](../qa/2026-10-05-release.md)。

不能承诺用 `wrangler rollback` 直接跨回新增 Durable Object 类以前的版本。
Cloudflare 明确禁止跨类生命周期迁移的回滚，且回滚代码不会回滚绑定数据。
参见 [官方回滚限制](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings)。
若本轮首次发布失败，应前滚恢复旧页面/行为，同时保留新的类导出、绑定、迁移记录和
D1 新列/表；不要用删除 namespace 或数据库对象来绕过限制。
完成该类迁移后的后续兼容版本，可按当前实际部署版本 ID 进行正常回滚。

最终检查应包括 `/`、`/play`、`/table-tennis`、`/account` 的页面响应，
匿名账户接口仍返回 401，新的 JS/GLB 与本地产物哈希一致，以及
`/models/legacy-refined/manifest.json` 的实际完整度。旧的 9 月部署记录只是历史，
不能替代发布前实时记录。实体手机验证按用户当前要求跳过。
