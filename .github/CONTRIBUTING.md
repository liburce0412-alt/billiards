# Contributing

感谢你帮助改进 Break Builder 3D。规则、台球物理、AI 走位、Three.js 渲染、声音、可访问性和移动端体验方面的贡献都很有价值。

## 开始之前

1. 对较大的规则或架构改动先创建 Issue，写清规则来源、用户场景和兼容性影响。
2. 从 `master` 创建短生命周期分支。
3. 不要将无关格式化、生成物和功能修改混在一个提交中。
4. 新增外部模型、纹理或音频时，必须同时记录来源与许可证。

## 本地开发

```bash
corepack enable
yarn install --immutable
yarn serve
```

浏览器打开 <http://localhost:8080/>。

## 修改约束

- 规则变更从 `RuleScenario` 测试开始，并由共享规则入口实现。
- AI 必须使用合法候选和正式物理试打，不能绕过犯规判定。
- 物理结果不能依赖渲染帧率、画质或相机。
- 不破坏现有 URL 参数、录像、回放和在线消息。
- 外观选择不能改变同一规则下的物理结果。
- 新 UI 应支持键盘焦点、触控尺寸、ARIA 状态和减少动态效果模式。

## 提交前

```bash
yarn test
yarn build
yarn test:e2e
```

并运行与改动相关的 TypeScript、ESLint 和样式检查。完整说明见 [`docs/TESTING.md`](../docs/TESTING.md)。

## Pull Request

PR 描述应包含：

- 解决的问题和采取的方案；
- 规则或数据来源（如适用）；
- 自动测试和手工验证；
- 可见变化的截图或短视频；
- 对录像、联机、移动端和性能的影响。

项目基于 [tailuge/billiards](https://github.com/tailuge/billiards)，贡献需遵守仓库的
GPL-3.0 许可证。
