# batch-cep — Changelog

Toutes les modifications notables au plugin sont documentées ici. Format suit [Keep a Changelog](https://keepachangelog.com/) ; versioning [semver](https://semver.org/).

---

## [Unreleased]

### Pending live validation
- Smoke test live dans Cowork avec vraies credentials Batch (voir `STATUS.md`)
- Fix bugs découverts en live (si applicable)

### Planned for v0.1.1 (post-smoke-test fixes)
- TBD selon les bugs trouvés en live

---

## [0.1.0] — 2026-05-15

### Initial release

Premier port complet de l'API Batch.com (Customer Engagement Platform v2.11 + Mobile Engagement Platform v1.1) en Claude skill, à partir du repo référence `batch-mcp` (TypeScript MCP server, désormais archivé).

#### Added — 60 commandes wrappées

**CEP (26 commandes)** :
- `profiles` : update / mass-update / export
- `audiences` : create / update / replace / remove / list / view (async 202 + indexing_token)
- `campaigns` : create / update / delete (omnichannel push/email/sms/in-app)
- `catalogs` : create / update / remove / view / list / edit-items
- `orchestrations` : list / stats / view (read-only)
- `exports` : list / view / download (signed URLs, manual redirect)
- `segments list`

**MEP (34 commandes)** :
- `transactional` : send / stats (1-to-1 action-triggered pushes)
- `trigger-events` : send / send-bulk (path `/1.0/`, fire dashboard automations)
- `mep-campaigns` : create / update / delete / stats / view / list (mass push)
- `in-app` : create / update / delete / view / list (in-app campaigns)
- `custom-audience` (v1.1) : create / update / replace / remove / list / view (install-id only)
- `custom-data` : set / delete (per-user attributes)
- `app-data` : set / list / update / delete (app-wide values)
- `gdpr` : access-request / erasure-request / requests-list / requests-view (4 commandes)
- `mep-export` : create / list / view

#### Added — Foundation

- **3 lib modules** : `client.mjs` (HTTP + auth CEP/MEP + error mapping), `config.mjs` (credentials loader + first-run setup), `validate.mjs` (input validators)
- **1 entry dispatcher** : `bin/batch.mjs` avec RESOURCE_MAP couvrant toutes les 16 ressources
- **Tests** : 350 Vitest specs (mocked fetch, TDD strict)
- **Confirm gate** : 8 commandes destructives requièrent `--confirm` (campaigns delete, audiences replace/remove, catalogs remove, custom-audience replace/remove, custom-data delete, app-data delete, gdpr erasure-request)

#### Added — Documentation (22 references + 6 examples)

**6 cross-cutting references** :
- `overview.md` (CEP vs MEP decision tree)
- `setup.md` (first-run workflow, credentials format)
- `identifiers.md` (custom_id vs install_id vs email vs advertising_id)
- `rate-limits.md` (300/s per Custom ID, mass-update semantics)
- `async-pattern.md` (202 + indexing_token poll loop, CEP only)
- `errors.md` (status codes, local error codes, troubleshooting)

**16 per-resource references** : 7 CEP + 9 MEP, format uniforme (usage, args, output, examples, pitfalls, see-also).

**6 examples** :
- `first-run-setup.md` (walkthrough du setup auto credentials)
- `create-campaign.md` (workflow audience CEP → campaign)
- `csv-sync.mjs` (script bulk CSV → /profiles/mass-update)
- `cross-platform-fanout.md` (iOS + Android + Web pattern)
- `audience-csv-membership.md` (CSV → CEP audience avec chunking)
- `ab-test-campaign.md` (2-campaign A/B pattern, faute de support natif)

#### Architecture decisions (key)

- **Format** : `.mjs` Node.js direct (pas TypeScript, pas de build step)
- **Distribution duale** : Claude Code plugin marketplace + Cowork `.zip` upload
- **Credentials** : per-user local `${PROJECT_FOLDER}/batch-credentials.json`, server-side dans sandbox Cowork
- **Setup** : first-run auto via Claude chat prompt + bash heredoc write
- **Pattern router** : SKILL.md style impeccable (table commands + references on-demand)
- **Network** : direct `fetch()` vers api.batch.com depuis sandbox (HTTPS, X-Authorization MEP / Bearer + X-Batch-Project CEP)
- **Async 202** : script retourne indexing_token, Claude orchestre le poll via `audiences view`

#### Validation Phase 6 — 22 fixes appliqués

- **9 critiques** : LICENSE AGPL-3.0, AGPL headers tests, pnpm-workspace allowBuilds, audiences replace 3-layer alignment, GDPR signature alignment, MEP campaigns `when.start_time` shape, in-app command name `in-app`, `${SKILL_PATH}` → explicit dispatcher path, SKILL.md GDPR table signatures
- **6 importantes** : `app_keys` optional pour CEP-only, GDPR 30-day deadline reminder, install_id completeness warning, MEP+CEP audit data scope warning, setup command routing exception, frontmatter description rewrite (third-person + triggers FR)
- **7 nice-to-have** : cross-platform fanout example, audience-csv-membership example, A/B test example, audience per-call limits doc, personalization templating section, plugin limits honest section in SKILL.md, deeplink in mep/campaigns ref + platform isolation in transactional ref

### Technical stats

- 69 files (16 scripts + 22 references + 6 examples + 3 lib + 19 tests + 3 config)
- 17,849 lines (code + docs)
- 350 Vitest specs
- 35 git commits sur batch-cep
- Lint clean (Biome 42 files)
- Zero MCP dependency, zero npm publish, zero hosting required

### Build from

Ported from [`alexandrebouchez/batch-mcp`](https://github.com/alexandrebouchez/batch-mcp) (archived) — TypeScript MCP server (60 tools, 318 specs) which served as the API surface modeling reference.
