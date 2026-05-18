# batch-cep

Plugin Claude pour orchestrer **Batch.com** (CEP + MEP) en langage naturel.

Wrap direct de l'API Batch via fetch Node — pas de MCP server, pas d'OAuth, pas de SaaS. Tu installes, tu donnes tes credentials une fois, Claude appelle Batch quand tu lui demandes.

> **Status v0.1.0** : implementation complete (350 tests, lint clean, 22 fixes from validation Phase 6).
> 🟡 Awaiting live smoke test in Cowork with real credentials avant publication.
> Pour reprendre le travail : voir [`STATUS.md`](STATUS.md). Historique des releases : [`CHANGELOG.md`](CHANGELOG.md).

## Couverture

**60 commandes** réparties sur les 2 plateformes Batch :

- **CEP** (Customer Engagement Platform, v2.11) — profile-centric, project-scoped
  - profiles : update, mass-update, export
  - audiences : create, update, replace, remove, list, view (async 202 + indexing_token)
  - campaigns : create omnichannel, update, delete
  - catalogs : create, update, remove, view, list, edit-items
  - orchestrations : list, stats, view (read-only)
  - exports : list, view, download (signed URLs)
  - segments : list

- **MEP** (Mobile Engagement Platform, v1.1) — app/install-centric, per-platform app key
  - transactional : send, stats
  - trigger-events : send, send-bulk (path `/1.0/`)
  - campaigns : create, update, delete, stats, view, list (mass push)
  - in-app-campaigns : create, update, delete, view, list
  - custom-audience : create, update, replace, remove, list, view (v1.1, install-id)
  - custom-data : set, delete
  - app-data : set, list, update, delete
  - gdpr : access-request, erasure-request, list, view
  - exports : create, list, view

## Installation

### Cible : Claude Code

```bash
claude plugin marketplace add alexbouchez/driven-alex-plugins
claude plugin install batch-cep@driven-alex-plugins
```

### Cible : Claude Cowork / Claude.ai (Pro/Team/Enterprise)

Télécharger `skills/batch-cep.zip` depuis la dernière release GitHub, puis :

1. Dans Cowork : `Customize > Skills > "+ Create skill" > Upload a skill`
2. Sélectionner le `.zip` téléchargé

## First-run setup

À la première invocation, Claude te demandera tes credentials Batch :

- `BATCH_REST_KEY` (account-wide REST API key — Settings > General)
- `BATCH_PROJECT_KEY` (CEP project key — Settings > General du projet CEP)
- Optionnellement : 5 app keys MEP (`BATCH_IOS_LIVE_KEY`, `BATCH_IOS_DEV_KEY`, `BATCH_ANDROID_LIVE_KEY`, `BATCH_ANDROID_DEV_KEY`, `BATCH_WEB_KEY`) pour les opérations MEP

Tes credentials sont écrites dans `${PROJECT_FOLDER}/batch-credentials.json` (local à ton Project Cowork, ne quitte pas ta machine) et réutilisées pour les conversations suivantes.

## Usage

Langage naturel :

> "liste mes audiences batch"
> "crée une campagne push pour les abandonnés panier"
> "envoie une push de bienvenue à u_42"
> "synchronise les utilisateurs Premium dans une audience batch"

Ou commandes explicites :

> `$batch-cep audiences list`
> `$batch-cep campaigns create '{"name":"hello","state":"DRAFT",...}'`
> `$batch-cep transactional send '{"group_id":"welcome","recipients":{"custom_ids":["u_42"]},"message":{"body":"Bienvenue !"}}'`

Voir [skills/batch-cep/SKILL.md](skills/batch-cep/SKILL.md) pour la table complète des commandes.

## Architecture

```
batch-cep/
├── .claude-plugin/plugin.json          # manifest
└── skills/batch-cep/
    ├── SKILL.md                          # router — 60 commandes, table de dispatch
    ├── reference/                        # détails par commande (chargés on-demand par Claude)
    │   ├── overview.md
    │   ├── identifiers.md
    │   ├── rate-limits.md
    │   ├── async-pattern.md
    │   ├── errors.md
    │   ├── setup.md
    │   ├── cep/<resource>.md
    │   └── mep/<resource>.md
    ├── scripts/                          # fetch wrappers .mjs (Node 18+)
    │   ├── lib/
    │   │   ├── client.mjs                # auth + fetch + error handling shared
    │   │   ├── config.mjs                # credentials loading + first-run setup
    │   │   └── schemas.mjs               # validation
    │   ├── cep/<resource>.mjs            # per-resource fetch wrappers
    │   └── mep/<resource>.mjs
    └── examples/                          # workflows concrets, CSV sync, etc.
```

## Sécurité

- Tes credentials Batch restent en local (`${PROJECT_FOLDER}/batch-credentials.json`).
- Aucune donnée ne transite par un serveur tiers — tous les appels vont directement de ton container Claude vers `api.batch.com`.
- Les opérations destructives (`*_delete`, `*_remove`, `audience replace`, `gdpr erasure-request`) demandent confirmation explicite avant exécution.

## Versioning

- v0.1.0 (en cours) — port from MCP server reference (`alexbouchez/batch-mcp` repo)

## Licence

AGPL-3.0
