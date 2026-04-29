# doc-hub

**Document management engine for Google Workspace — bring your own brand pack.**

`doc-hub` is a tenant-agnostic engine that turns any Google Shared Drive into a governed, AI-accessible document management system. You provide a brand pack (colors, fonts, logos, templates) and a `tenant.config.json`; the engine handles creation, versioning, archiving, and auditing.

## What it does

- **One entry point for all docs** — sidebar for humans, skills for AI agents (Claude Code, Hermes, or any MCP-compatible agent)
- **Living docs + immutable snapshots** — no more `PRESENTACION_FINAL_v3.pptx`; versions live in the Registry, not in filenames
- **Brand-consistent by default** — every document inherits from your brand kit; a linter catches drift daily
- **Full audit trail** — every create, edit, snapshot, supersede, adopt, and archive is logged with inverse-ops for rollback
- **Ad-hoc friendly** — not every doc needs a template; "create blank with branding" and "adopt existing" keep everything in the registry without breaking structure
- **Safe to uninstall** — `apps-script/scripts/uninstall.gs` disables the engine without touching user documents

## Architecture

```
┌──────────────────────┐    ┌──────────────────────────────┐
│  Human: Drive Sidebar │    │  AI Agent: doc-hub skills     │
│  (Workspace Add-on)   │    │  (Claude Code / Hermes MCP)  │
└──────────┬───────────┘    └──────────────┬───────────────┘
           │                               │
           └────────────┬──────────────────┘
                        ▼
           ┌────────────────────────┐
           │  Apps Script Web App   │  ← core logic, single source of truth
           │  (HTTP endpoints)      │
           └────────────┬───────────┘
                        │
           ┌────────────┴───────────────────────────┐
           │           Google Shared Drive           │
           │  _manifest Sheet  │  Document-Registry  │
           │  Brand-Kit folder │  Domain folders     │
           └─────────────────────────────────────────┘
```

## Getting started (new tenant)

See [docs/tenant-onboarding.md](docs/tenant-onboarding.md) for full instructions. Quick path:

1. Create a Google Shared Drive (your "DOC HUB")
2. Copy `tenant.config.example.json` → `tenant.config.json`, fill in your Drive IDs
3. Open Apps Script, paste/push `apps-script/` via `clasp`, run `setup()`
4. Install the MCP server: `cd mcp-server && npm install && npm run build`
5. Add to Claude Code: copy `skills/doc-hub/` to `.claude/skills/doc-hub/`

## Agent usage

See [docs/agent-usage.md](docs/agent-usage.md). Quick example:

```
// Find all Legal docs for a specific client
doc-find --category Legal --query "Colegio San Esteban"

// Generate a new NDA
doc-create --template nda-kuill-pilot --inputs '{"cliente":"Colegio X","fecha":"2026-05","scope":"Piloto IA"}'

// Snapshot a doc for sending
doc-snapshot --fileId 1abc...xyz

// Undo the last operation
doc-undo --eventId evt_20260425_143022_abc
```

## Versioning strategy

- **Living docs**: one file, one Drive ID, status in Registry — not in filename
- **Snapshots**: immutable PDF exports for distribution milestones
- **Supersede**: explicit major rewrites, chains preserved in Registry
- Filenames NEVER contain `v1`, `FINAL`, `(1)`, `Copy of`, dates, or status markers

See [docs/versioning.md](docs/versioning.md) for details.

## Structure

```
doc-hub/
├── apps-script/          # Engine — Google Apps Script (deploy via clasp)
├── mcp-server/           # MCP server — wraps Apps Script Web App for agents
├── skills/doc-hub/       # Agent skills — installable in Claude Code & Hermes
├── schemas/              # JSON schemas: tenant.config, manifest, registry
├── scripts/              # setup-drive.ts (Node.js — creates Drive structure)
│   └── (apps-script/scripts/  # install.gs, uninstall.gs, reinstall.gs)
└── docs/                 # Architecture, onboarding, agent usage, versioning, rollback
```

## License

MIT — feel free to fork and adapt for your own organization.
