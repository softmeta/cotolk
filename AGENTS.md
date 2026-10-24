# Lingora

Lingora is an agent-native localization platform: agents translate, people review, and the repository stays the source of truth for source strings. The same codebase ships self-hosted and as SaaS.

## Working principles

- Use English for code and commit messages.
- macOS, Windows, and Linux are equally supported for the CLI and for development. Use `node:path`, `os.tmpdir()`, and `os.homedir()`; never hardcode `/`, `~`, or `/tmp`; tolerate `\r\n` in input.
- Write only code and tests: no code comments or JSDoc. Express intent through naming, types, structure, and tests. Agent instruction files are the exception.
- Prefer the latest stable dependencies.
- Fix root causes and remove obsolete paths. Released contracts — persisted data, the export format, CLI commands, flags, and `--json` output — change only additively or with a migration.
- Agents and people are equal users: every capability a person has in the web app is reachable through the HTTP API, the CLI, and MCP, backed by the same server code.

## Layout

- `packages/<name>` holds libraries, each with an `index.ts` public entry; `apps/<name>` holds deployable apps.
- Tests live in `tests/unit/<package>` as their own workspace packages (`@lingora/unit-<package>`), importing code through the package public entry or the `@lingora/<package>/internal/<path>` subentry. Production code never imports `internal` subentries; biome enforces it.
- Keep fixtures synthetic, fixed, and committed next to the tests that use them. Never copy customer or real product data into fixtures.

## Verification

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before pushing. Use TDD for format adapters, quality checks, and other pure logic; a format adapter must round-trip its fixtures byte for byte.

## Git

Never commit on `main`. Land changes through a branch and a pull request, and wait for CI on all three platforms before merging.
