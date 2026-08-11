# Contributing

Contributions are welcome in English or Chinese.

## Before opening an issue

- Check existing issues and the latest Release notes.
- Confirm the problem still occurs with the latest version.
- Remove account details, proxy credentials, private search history, and copyrighted citation output from screenshots or logs.

## Development workflow

1. Fork the repository and create a focused branch.
2. Make the smallest change that solves the problem.
3. Add or update public-behavior tests.
4. Run `npm run check` and `npm run package`.
5. Open a pull request describing the behavior change and validation evidence.

The extension intentionally uses no runtime framework or external network dependency. Please discuss changes that add permissions, build tooling, telemetry, or third-party services before implementing them.

## Commit style

Use concise imperative commits such as `fix: scope pagination controls` or `docs: clarify Release installation`.
