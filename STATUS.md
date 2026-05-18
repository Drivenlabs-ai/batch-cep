# batch-cep — Status & Next Steps

> **Document à consulter en PREMIER quand on reprend le projet.** Capture l'état actuel, les décisions clés, ce qui reste à faire, et comment reprendre le travail efficacement.

**Dernière mise à jour** : 2026-05-15
**Version actuelle** : v0.1.0 (en review, pas encore live-validated)
**Status global** : 🟡 Implementation complete, awaiting live smoke test in Cowork

---

## Quick context — où on en est

`batch-cep` est un Claude skill qui wrap l'API Batch.com (CEP v2.11 + MEP v1.1) en 60 commandes invoquables en langage naturel ("liste mes audiences batch", "envoie une push de bienvenue à u_42"). Il vit dans le marketplace privé `driven-alex-plugins/`.

**Pattern** : router SKILL.md (style impeccable) + scripts `.mjs` standalone (style Dougs) + references markdown chargés on-demand (Anthropic Agent Skills format).

**Distribution** :
- Claude Code users : `claude plugin marketplace add alexbouchez/driven-alex-plugins` puis `claude plugin install batch-cep@driven-alex-plugins`
- Cowork users : zip `skills/batch-cep/` → upload Settings > Skills

**Cible primaire** : Knowledge workers Claude Cowork (CEOs PME, marketing, growth) — non-tech users qui chattent en langage naturel.

---

## ✅ Ce qui est fait (Phases 1-6 du workflow create-plugin)

### Architecture
- 60 commandes wrappées (26 CEP + 34 MEP) via `bin/batch.mjs` dispatcher
- 3 lib modules : `client.mjs` (HTTP+auth), `config.mjs` (credentials), `validate.mjs` (input)
- 22 reference markdown files (6 cross-cutting + 7 CEP + 9 MEP)
- 6 examples (`first-run-setup`, `create-campaign`, `csv-sync`, `cross-platform-fanout`, `audience-csv-membership`, `ab-test-campaign`)
- 350 Vitest specs (mocked fetch, RED→GREEN→commit TDD)

### Validation (Phase 6 — 6 agents indépendants)
- **plugin-validator** : structural validation passée
- **skill-reviewer** : qualité SKILL.md reviewée
- **4 personas scenarios** : CEO PME, Marketing Analyst, PM Mobile, DPO/GDPR — tous joués

22 findings identifiées + 22 fixes appliqués :
- 9 critiques (LICENSE, AGPL headers, pnpm-workspace, audiences replace 3-layer alignment, GDPR signature alignment, MEP campaigns when shape, in-app command name, ${SKILL_PATH} → bin/batch.mjs, GDPR table signatures)
- 6 importantes (`app_keys` optional CEP-only, GDPR 30-day deadline, install_id completeness, MEP+CEP audit scope, setup command exception, description rewrite)
- 7 nice-to-have (cross-platform fanout, campaign targeting audiences, A/B pattern, audience per-call limits, personalization templating, plugin limits section, deeplink in mep/campaigns)

### Distribution
- Marketplace entry dans `driven-alex-plugins/.claude-plugin/marketplace.json`
- README plugin avec install instructions
- LICENSE AGPL-3.0 à la racine du plugin
- Push public : tous les commits sur `origin/master` de `driven-alex-plugins`

### Decisions log (les choix clés)

| Décision | Choix | Justification |
|---|---|---|
| Cible utilisateur | Claude Cowork (non-tech) | Audience Drivenlabs = PME, pas devs |
| Format | Agent Skill + `.mjs` scripts | Cowork friendly, pas d'OAuth requis (vs MCP HTTP) |
| Distribution | Marketplace privé + .zip Cowork | Pattern Dougs réutilisé |
| Format scripts | Node.js `.mjs` direct (pas TypeScript) | Cohérent stack Alex, port partiel du MCP server |
| Credentials | Per-user local `batch-credentials.json` | Conforme Batch best practice + Cowork sandbox local |
| Setup | First-run auto via chat Claude | UX fluide, "codify this" Cowork pattern |
| Scope | CEP + MEP (60 endpoints) | Couverture complète Batch surface |
| Custom Audience | v1.1 only (install_ids) | v1.0 superseded par CEP audiences |
| GDPR | 2 commandes séparées (access non-destructif, erasure destructif) | Différence sémantique légale |
| Async 202 | Script returns indexing_token, Claude poll via `audiences view` | Pas d'auto-polling baked-in |
| `audiences replace` | Destructive avec `--confirm` (post-validation fix) | Drop members non-listés = data loss potentielle |
| Repo `batch-mcp` | Archivé sur GitHub (lecture seule), local supprimé | TypeScript MCP server = référence d'archi seulement |

### Pivot rationale (essentiel)

Le projet a commencé sous forme de **MCP server TypeScript** (`batch-mcp` repo) avec :
- 60 typed tools (Zod schemas, error mapping, async patterns)
- 318 Vitest specs
- Distribution prévue : npm publish + Vercel HTTP endpoint

**Pivot** vers Claude skill `batch-cep` parce que :
1. Cible réelle = users Cowork (browser, non-tech), pas devs Claude Code
2. Cowork ne supporte pas plugin marketplace direct comme Claude Code CLI
3. Custom Connectors Cowork = OAuth 2.1 obligatoire → SaaS multi-tenant à héberger → contraire à la philosophie open-source-simple
4. Agent Skill = .zip upload simple, scripts locaux dans sandbox Cowork, credentials per-user → zero hosting côté Drivenlabs

Le code TypeScript reste accessible dans le repo archivé `batch-mcp` comme référence d'archi.

---

## 🟡 Ce qui reste à faire (Phases 7-8 + post-release)

### 🔴 BLOQUANT — Avant utilisation sérieuse

**1. Smoke test live dans Cowork avec vraies credentials Batch**

LE seul truc qui n'est PAS validé. Le plugin marche en tests mockés (350 tests vert) mais aucun call réel vers `api.batch.com` n'a été fait depuis le sandbox Cowork.

Procédure suggérée (~30 min) :
1. Zip le skill : `cd ~/Code/driven-alex-plugins/batch-cep && zip -r ~/Downloads/batch-cep.zip skills/batch-cep/`
2. Cowork : Settings > Skills > "+ Create skill" > Upload `batch-cep.zip`
3. Dans une nouvelle conversation Cowork, créer un Project "Batch test"
4. Demander : "Configure mes credentials Batch" → vérifier le first-run setup auto
5. Test read : "Liste mes audiences Batch CEP" → doit retourner JSON
6. Test write : "Crée une audience custom_ids nommée test_smoke" → doit retourner indexing_token
7. Test async poll : "Vérifie le status de cette audience" → poll via `audiences view`
8. Test destructive : "Supprime l'audience test_smoke" → doit demander confirm
9. Test MEP : "Donne-moi les stats du group_id welcome_v1" → MEP transactional stats
10. Test trigger-events : "Fire l'event onboarding_complete pour user u_test"

Output attendu : tous les calls retournent du JSON valide ou erreurs structurées (`{ok:false, error:{...}}`).

**Risques connus à valider** :
- Path resolution dans le sandbox Cowork (`${PROJECT_FOLDER}` mount point exact)
- Network access pour `fetch()` vers api.batch.com (selon settings Pro/Team)
- First-run setup : Claude peut-il écrire `batch-credentials.json` via bash heredoc dans le Project folder ?
- Triggering : la description du skill match-elle au bon moment ?

**2. Fix bugs découverts en live**

Probable que 1-3 ajustements émergent (paths, error format, args parsing). À documenter dans le CHANGELOG comme v0.1.1.

### 🟡 IMPORTANT — Avant ouverture publique

**3. GitHub Release v0.1.0 propre**
- Tag `batch-cep-v0.1.0` sur driven-alex-plugins
- Release notes (depuis le CHANGELOG.md)
- Asset `.zip` pré-buildé pour Cowork (au lieu que les users clonent + zippent)

**4. GitHub Actions CI**
- `.github/workflows/batch-cep-ci.yml` : run `pnpm vitest && biome check` sur PR touchant `batch-cep/`
- Build `.zip` artifact à chaque tag

**5. Release artifact zip script**
- Script npm `pnpm release:zip` qui produit `batch-cep-v<version>.zip` propre (exclut node_modules, tests, docs/superpowers)

### 🟢 NICE-TO-HAVE — Long terme

**6. Marketing & annonce**
- LinkedIn post Drivenlabs présentant le plugin (cible : agences IA + équipes growth PME)
- Page "Outils" sur drivenlabs.com avec liste des plugins
- Tweet/X-post

**7. Indexation communautaire**
- Soumettre à [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills)
- Anthropic Discord / forum si pertinent

**8. v0.2.0 features (selon feedback)**
- Helper A/B testing (audience split automatique)
- Templating Batch documenté avec exemples concrets
- Polling auto async (option) pour `audiences create + view`
- i18n SKILL.md description (multi-lang triggers)

---

## Comment reprendre le travail rapidement

### Si tu reviens dans 1 semaine
1. Lire ce fichier `STATUS.md`
2. Lire `CHANGELOG.md` pour voir les changements récents
3. Faire le smoke test live (cf §🔴 bloquant)
4. Selon résultat : fix bugs OU release v0.1.0

### Si tu reviens dans 1 mois+
1. Idem ci-dessus
2. Re-lire la spec : `docs/superpowers/specs/2026-05-13-skill-impl-design.md` (architecture + décisions)
3. Re-vérifier que `pnpm test` passe toujours (devrait — pas de change attendu en mode pause)
4. Vérifier qu'aucune dépendance critique n'a breaking change (vitest, biome)

### Si on doit re-bootstrap from scratch
Le repo `batch-mcp` archivé (`https://github.com/alexbouchez/batch-mcp`) reste la référence d'architecture MCP. Le skill `batch-cep` est porté à partir de ce code TypeScript. Si on doit re-créer un MCP server, le port reverse est faisable (`.mjs` → `.ts` + MCP SDK).

---

## Files & structure (référence rapide)

```
batch-cep/
├── .claude-plugin/plugin.json           # manifest v0.1.0
├── README.md                             # user-facing install + usage
├── STATUS.md                             # ← CE FICHIER
├── CHANGELOG.md                          # historique releases
├── LICENSE                               # AGPL-3.0
├── package.json                          # dev tooling (vitest + biome)
├── biome.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── vitest.config.mjs
├── docs/superpowers/specs/2026-05-13-skill-impl-design.md   # design détaillé Phase 5
├── skills/batch-cep/
│   ├── SKILL.md                          # router avec table 60 commandes
│   ├── bin/batch.mjs                     # entry dispatcher
│   ├── lib/
│   │   ├── client.mjs                    # HTTP + auth + error
│   │   ├── config.mjs                    # credentials loader
│   │   └── validate.mjs                  # input validators
│   ├── scripts/cep/                      # 7 scripts (profiles, audiences, etc.)
│   ├── scripts/mep/                      # 9 scripts (transactional, trigger-events, etc.)
│   ├── reference/                        # 22 markdown docs on-demand
│   └── examples/                         # 6 workflows concrets
└── tests/                                 # 350 Vitest specs
    ├── helpers.mjs
    ├── lib/                              # 3 test files
    └── scripts/{cep,mep}/                # 16 test files
```

## Commands utiles

```bash
# Run tests
cd ~/Code/driven-alex-plugins/batch-cep
npx vitest run

# Lint
npx biome check .                       # check
npx biome check --write .               # auto-fix safe
npx biome check --write --unsafe .      # auto-fix all

# Sanity smoke (sans credentials)
node skills/batch-cep/bin/batch.mjs help

# Build .zip pour Cowork upload
zip -r ~/Downloads/batch-cep.zip skills/batch-cep/

# Test direct CLI (avec creds dans ./batch-credentials.json local)
node skills/batch-cep/bin/batch.mjs audiences list
```

## Liens

- **Repo actif** : https://github.com/alexbouchez/driven-alex-plugins (master)
- **Repo archivé (référence MCP)** : https://github.com/alexbouchez/batch-mcp
- **Batch API docs** : https://doc.batch.com
- **Anthropic Skills doc** : https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- **Claude Cowork product** : https://claude.com/product/cowork
