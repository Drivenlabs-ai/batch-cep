---
name: batch-cep
description: >
  Orchestre Batch.com (Customer Engagement Platform + Mobile Engagement Platform) en langage
  naturel. Wrap l'API Batch via fetch direct depuis Node — profils, audiences, campagnes
  omnichannel, catalogues, transactional push, in-app campaigns, custom data, GDPR, exports.
  Activé quand l'utilisateur mentionne 'batch', 'batch.com', 'Batch CEP', 'Batch MEP',
  'marketing automation', 'push notification', 'campagne push', 'in-app campaign',
  'audience custom', 'segmentation', 'transactional push', 'profil utilisateur Batch',
  'orchestration marketing', 'GDPR Batch', 'export Batch', 'créer une campagne',
  'liste mes audiences', 'envoyer une push', 'sync profils', 'déclencher une automation',
  ou toute action liée à la marketing automation mobile/web via Batch.
---

# Batch-CEP — orchestration Batch.com depuis Claude

Wrap direct de l'API Batch (CEP v2.11 + MEP v1.1) via fetch Node, sans MCP intermédiaire. Couvre les 60 endpoints publics : Customer Engagement Platform (profile-centric, project-scoped) + Mobile Engagement Platform (app/install-centric, per-platform).

**Principe :** chaque commande appelle un script `scripts/<platform>/<resource>.mjs` qui parse les args, lit les credentials locaux, fait le call HTTP vers `api.batch.com`, et print le résultat JSON sur stdout. Claude lit l'output et le formate pour l'utilisateur.

## Setup gates (à passer avant toute action)

| Gate | Vérif | Si fail |
|---|---|---|
| Credentials | `${PROJECT_FOLDER}/batch-credentials.json` existe et contient au minimum `rest_key` + `project_key` | Lancer `$batch-cep setup` (le skill demande les keys à l'utilisateur et écrit le fichier) |
| Platform | Détecter CEP vs MEP selon le besoin (profile-level → CEP, install-id mobile → MEP) | Voir `reference/overview.md` |
| Confirm | Pour les opérations destructives (`*_delete`, `*_remove`, `audience replace`, `gdpr erasure`), demander confirmation explicite à l'utilisateur avant exécution | Refuser et redemander |

## Commands

| Command | Category | Description | Reference |
|---|---|---|---|
| `setup` | Config | Setup interactif des credentials (REST key, project key, app keys MEP) | [reference/setup.md](reference/setup.md) |
| `help` | Meta | Show command menu (this table) | this |
| `overview` | Meta | Quand utiliser CEP vs MEP, distinctions auth | [reference/overview.md](reference/overview.md) |
| **CEP commands** | | | |
| `profiles update <data>` | CEP | Update profile attributes + events (1-200 edits) | [reference/cep/profiles.md](reference/cep/profiles.md) |
| `profiles mass-update <data>` | CEP | Mass update (1-10000 edits, full-dump sync) | [reference/cep/profiles.md](reference/cep/profiles.md) |
| `profiles export <types>` | CEP | Request profile export | [reference/cep/profiles.md](reference/cep/profiles.md) |
| `audiences create <name> <type>` | CEP | Create custom audience (async 202) | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `audiences update <name> <ids>` | CEP | Add ids to audience (async 202, idempotent) | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `audiences replace <name> <ids>` | CEP | Replace audience membership wholesale (async 202) | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `audiences remove <name> <ids>` | CEP | Remove ids from audience (async 202, **destructive**) | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `audiences list` | CEP | List audiences (paginated) | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `audiences view <token-or-name>` | CEP | View audience metadata or poll async indexing | [reference/cep/audiences.md](reference/cep/audiences.md) |
| `campaigns create <data>` | CEP | Create omnichannel campaign (push/email/sms/in-app) | [reference/cep/campaigns.md](reference/cep/campaigns.md) |
| `campaigns update <token> <patch>` | CEP | Update campaign | [reference/cep/campaigns.md](reference/cep/campaigns.md) |
| `campaigns delete <token>` | CEP | Delete campaign (**destructive**) | [reference/cep/campaigns.md](reference/cep/campaigns.md) |
| `catalogs create <name> <schema>` | CEP | Create product catalog | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `catalogs update <name> <patch>` | CEP | Update catalog | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `catalogs remove <name>` | CEP | Remove catalog (**destructive**) | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `catalogs view <name>` | CEP | View catalog metadata + first items | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `catalogs list` | CEP | List catalogs (paginated) | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `catalogs edit-items <name> <ops>` | CEP | Atomic upsert+delete items | [reference/cep/catalogs.md](reference/cep/catalogs.md) |
| `orchestrations list` | CEP | List orchestrations (campaigns + automations) | [reference/cep/orchestrations.md](reference/cep/orchestrations.md) |
| `orchestrations stats <token>` | CEP | Orchestration analytics | [reference/cep/orchestrations.md](reference/cep/orchestrations.md) |
| `orchestrations view <token>` | CEP | Orchestration details | [reference/cep/orchestrations.md](reference/cep/orchestrations.md) |
| `exports list` | CEP | List exports | [reference/cep/exports.md](reference/cep/exports.md) |
| `exports view <id>` | CEP | View export status + download_url | [reference/cep/exports.md](reference/cep/exports.md) |
| `exports download <id>` | CEP | Download export (signed URL) | [reference/cep/exports.md](reference/cep/exports.md) |
| `segments list` | CEP | List segments | [reference/cep/segments.md](reference/cep/segments.md) |
| **MEP commands** (require `app_key`) | | | |
| `transactional send <data>` | MEP | Fire 1-to-1 push (action-triggered) | [reference/mep/transactional.md](reference/mep/transactional.md) |
| `transactional stats <group_id>` | MEP | Stats for a transactional group | [reference/mep/transactional.md](reference/mep/transactional.md) |
| `trigger-events send <user> <events>` | MEP | Fire events to trigger dashboard automations (path /1.0/) | [reference/mep/trigger-events.md](reference/mep/trigger-events.md) |
| `trigger-events send-bulk <users>` | MEP | Fire events for multiple users in 1 call | [reference/mep/trigger-events.md](reference/mep/trigger-events.md) |
| `mep-campaigns create <data>` | MEP | Create mass push campaign | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `mep-campaigns update <token> <patch>` | MEP | Update push campaign | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `mep-campaigns delete <token>` | MEP | Delete push campaign (**destructive**) | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `mep-campaigns stats <token>` | MEP | Campaign analytics | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `mep-campaigns view <token>` | MEP | Campaign details | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `mep-campaigns list` | MEP | List push campaigns | [reference/mep/campaigns.md](reference/mep/campaigns.md) |
| `in-app create <data>` | MEP | Create in-app campaign | [reference/mep/in-app-campaigns.md](reference/mep/in-app-campaigns.md) |
| `in-app update <token> <patch>` | MEP | Update in-app | [reference/mep/in-app-campaigns.md](reference/mep/in-app-campaigns.md) |
| `in-app delete <token>` | MEP | Delete in-app (**destructive**) | [reference/mep/in-app-campaigns.md](reference/mep/in-app-campaigns.md) |
| `in-app view <token>` | MEP | View in-app | [reference/mep/in-app-campaigns.md](reference/mep/in-app-campaigns.md) |
| `in-app list` | MEP | List in-app campaigns | [reference/mep/in-app-campaigns.md](reference/mep/in-app-campaigns.md) |
| `custom-audience create <name>` | MEP | Create custom audience v1.1 (install-id) | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-audience update <name> <ids>` | MEP | Add install_ids | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-audience replace <name> <ids>` | MEP | Replace membership (**destructive**) | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-audience remove <name>` | MEP | Delete audience (**destructive**) | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-audience list` | MEP | List custom audiences | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-audience view <name>` | MEP | View audience | [reference/mep/custom-audience.md](reference/mep/custom-audience.md) |
| `custom-data set <user> <attrs>` | MEP | Set/merge user custom data | [reference/mep/custom-data.md](reference/mep/custom-data.md) |
| `custom-data delete <user>` | MEP | Delete all user custom data (**destructive**) | [reference/mep/custom-data.md](reference/mep/custom-data.md) |
| `app-data set <key> <value>` | MEP | Create app-wide data key | [reference/mep/app-data.md](reference/mep/app-data.md) |
| `app-data list` | MEP | List app-wide keys | [reference/mep/app-data.md](reference/mep/app-data.md) |
| `app-data update <key> <value>` | MEP | Update app-wide key | [reference/mep/app-data.md](reference/mep/app-data.md) |
| `app-data delete <key>` | MEP | Delete app-wide key (**destructive**) | [reference/mep/app-data.md](reference/mep/app-data.md) |
| `gdpr access-request <id> <email>` | MEP | Create GDPR access request | [reference/mep/gdpr.md](reference/mep/gdpr.md) |
| `gdpr erasure-request <id> <email>` | MEP | Create GDPR erasure request (**destructive**, irreversible) | [reference/mep/gdpr.md](reference/mep/gdpr.md) |
| `gdpr requests-list` | MEP | List GDPR requests | [reference/mep/gdpr.md](reference/mep/gdpr.md) |
| `gdpr requests-view <id>` | MEP | View GDPR request | [reference/mep/gdpr.md](reference/mep/gdpr.md) |
| `mep-export create <type>` | MEP | Request MEP data export | [reference/mep/exports.md](reference/mep/exports.md) |
| `mep-export list` | MEP | List MEP exports | [reference/mep/exports.md](reference/mep/exports.md) |
| `mep-export view <id>` | MEP | View MEP export status | [reference/mep/exports.md](reference/mep/exports.md) |

## Routing rules

1. **No argument** (`$batch-cep`) → render the table above as user-facing menu, ask what they'd like to do.
2. **First word matches a command** → load the referenced markdown file, then execute the corresponding script via bash. Format: `node ${SKILL_PATH}/scripts/<platform>/<resource>.mjs <action> <args...>`.
3. **First word doesn't match** → suggest closest commands and propose `$batch-cep help`.

## Cross-cutting references (load as needed)

- [reference/overview.md](reference/overview.md) — CEP vs MEP, when to use which
- [reference/identifiers.md](reference/identifiers.md) — custom_id vs install_id vs email vs advertising_id
- [reference/rate-limits.md](reference/rate-limits.md) — 300/s per Custom ID, mass-update vs update, retry/backoff
- [reference/async-pattern.md](reference/async-pattern.md) — 202 + indexing_token poll loop (CEP only)
- [reference/errors.md](reference/errors.md) — error codes, troubleshooting, retryable vs not

## Setup gate detail

Before any Batch action, verify credentials:

```bash
test -f "${PROJECT_FOLDER:-.}/batch-credentials.json" && \
  node -e "const c = require('${PROJECT_FOLDER:-.}/batch-credentials.json'); if (!c.rest_key || !c.project_key) process.exit(1)"
```

If the file is absent or incomplete → run `$batch-cep setup` first.

## Destructive operations

Tools marked **destructive** (in the table above) require explicit user confirmation before execution:

> "Tu vas [action]. C'est irréversible (ou: récupérable seulement via [way]). Confirmer ? (oui/non)"

Only proceed on "oui" / "yes" / "confirm". Otherwise abort and report back to user.
