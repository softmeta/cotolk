# Cotolk

Cotolk is an agent-native localization platform: agents translate, people review, and the repository stays the source of truth for source strings. The same codebase ships self-hosted and as SaaS.

## Working principles

- Use English for code and commit messages.
- macOS, Windows, and Linux are equally supported for the CLI and for development. Use `node:path`, `os.tmpdir()`, and `os.homedir()`; never hardcode `/`, `~`, or `/tmp`; tolerate `\r\n` in input.
- Write only code and tests: no code comments or JSDoc. Express intent through naming, types, structure, and tests. Agent instruction files are the exception.
- Prefer the latest stable dependencies.
- Fix root causes and remove obsolete paths. Released contracts — persisted data, the export format, CLI commands, flags, and `--json` output — change only additively or with a migration.
- Agents and people are equal users: every capability a person has in the web app is reachable through the HTTP API, the CLI, and MCP, backed by the same server code.

## Layout

- `packages/<name>` holds libraries, each with an `index.ts` public entry; `apps/<name>` holds deployable apps.
- Tests live in `tests/unit/<package>` as their own workspace packages (`@cotolk/unit-<package>`), importing code through the package public entry or the `@cotolk/<package>/internal/<path>` subentry. Production code never imports `internal` subentries; biome enforces it.
- Keep fixtures synthetic, fixed, and committed next to the tests that use them. Never copy customer or real product data into fixtures.

## Data compatibility

PostgreSQL is the only database. `@cotolk/db` owns the schema and its forward-only migrations.
- Add a migration as the next numbered file in `packages/db/src/migrations` and register it in `MIGRATIONS`; never edit or remove a released one, and write no `down`.
- Keep migrations value-preserving: add and backfill columns instead of renaming or dropping ones that hold user data.
- A database that records a migration this build does not know was written by a newer release; `migrateToLatest` refuses it without touching it.
- Cover each migration that changes existing data with a test in `tests/unit/db` that migrates to the previous migration, seeds rows, migrates to the latest, and asserts the rows survive.
- Tests run on PGlite (`@electric-sql/pglite`), so they need no database server on any platform.

## Tenancy and access

`@cotolk/core` holds every product operation as a function of `(db, principal, ...)`; HTTP routes, server functions, the CLI, and MCP call it and never query tenant data themselves.
- Resolve the organization through `accessOrganization` or `accessOrganizationAsOwner` first, and scope every later query by its id.
- Report another tenant's organization as not found, never as forbidden, so existence does not leak.
- API tokens belong to one organization and act as a member: they work on projects but never manage tokens, organizations, or deletions.
- Store only SHA-256 hashes of tokens and argon2id hashes of passwords; return a token secret once, at creation.
- Add every new operation to `tests/unit/core/tenancy.test.ts`, which asserts another organization's owner and token are refused and leave every table unchanged.

## Verification

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before pushing. Use TDD for format adapters, quality checks, and other pure logic; a format adapter must round-trip its fixtures byte for byte.

## Git

Never commit on `main`. Land changes through a branch and a pull request, and wait for CI on all three platforms before merging.
