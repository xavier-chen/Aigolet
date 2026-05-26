# 参与贡献 Aigolet

感谢你对本项目的关注。本项目采用 **AGPL-3.0-or-later**；提交贡献即表示你同意在相同许可下授权你的代码。

<p align="center">
  <a href="CONTRIBUTING.md">English</a> ·
  <a href="CONTRIBUTING.zh-CN.md">简体中文</a>
</p>

---

## 开始之前

1. 阅读 [`docs/OPEN_SOURCE.zh-CN.md`](docs/OPEN_SOURCE.zh-CN.md) 了解许可含义。
2. 阅读 [`README.zh-CN.md`](README.zh-CN.md) 了解架构与开发环境。

---

## 开发环境

```bash
pnpm install
pnpm build
pnpm start
```

修改相关包时请运行测试：

```bash
pnpm --filter @aigolet-next/founder test
pnpm --filter @aigolet-next/persistence test
```

---

## Pull Request 规范

1. **一个 PR 一个逻辑变更**，便于审查。
2. 提交前确保 **`pnpm build` 通过**。
3. **遵循现有代码风格**；UI 文案需同步 **中英文 i18n**。
4. 若变更 API、路由或用户可见行为，**更新文档**。
5. **勿提交密钥** — 不要包含 API Key、`.env` 或个人路径。

---

## Commit 信息

使用清晰、祈使句式的摘要：

```
feat(brain): add quick-capture API for decisions
fix(chat): keep scroll pinned during streaming
docs: update AGPL license section in README
```

---

## 贡献范围

欢迎与 **创始人操作系统** 方向一致的修复、文档、测试与功能。大型架构变更建议先在 Issue 中讨论。

---

## 行为准则

保持尊重与建设性。我们保留拒绝辱骂、抄袭或与项目目标/许可不兼容的贡献的权利。

---

## 问题反馈

Bug 与功能讨论请使用 GitHub Issue。许可或商业合作见 [`docs/OPEN_SOURCE.zh-CN.md`](docs/OPEN_SOURCE.zh-CN.md)。
