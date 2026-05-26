# Contributing to AIgolet Next

Thank you for your interest in contributing. This project is licensed under **AGPL-3.0-or-later**; by contributing, you agree that your contributions will be licensed under the same terms.

<p align="center">
  <a href="CONTRIBUTING.md">English</a> ·
  <a href="CONTRIBUTING.zh-CN.md">简体中文</a>
</p>

---

## Before you start

1. Read [`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md) for license implications.
2. Read [`README.md`](README.md) for architecture and development setup.

---

## Development setup

```bash
pnpm install
pnpm build
pnpm start
```

Run tests for packages you touch:

```bash
pnpm --filter @aigolet-next/founder test
pnpm --filter @aigolet-next/persistence test
```

---

## Pull request guidelines

1. **One logical change per PR** — easier to review.
2. **Keep `pnpm build` green** before submitting.
3. **Match existing code style** — TypeScript, formatting, i18n (zh + en for UI strings).
4. **Update docs** if you change APIs, routes, or user-visible behavior.
5. **No secrets** — never commit API keys, `.env`, or personal data paths.

---

## Commit messages

Use clear, imperative summaries:

```
feat(brain): add quick-capture API for decisions
fix(chat): keep scroll pinned during streaming
docs: update AGPL license section in README
```

---

## Scope

We welcome fixes, documentation, tests, and features aligned with the **founder operating platform** vision. Large architectural changes are best discussed in an issue first.

---

## Code of conduct

Be respectful and constructive. We reserve the right to reject contributions that are abusive, plagiarized, or incompatible with project goals or license terms.

---

## Questions

Open a GitHub issue for bugs and feature discussions. For licensing or commercial inquiries, see [`docs/OPEN_SOURCE.md`](docs/OPEN_SOURCE.md).
