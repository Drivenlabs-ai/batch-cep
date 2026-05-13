# A/B test campaigns

**Scenario:** "Test A/B sur le copy push : variant A = 'Bonus exclusif' vs B = 'Cadeau pour toi'"

## Native A/B vs plugin pattern

Batch's dashboard has native A/B test creation with built-in audience splitting. The plugin does **not** expose A/B as a first-class primitive — the API does not offer a single "A/B campaign" endpoint.

Plugin pattern: create 2 separate campaigns with different `messages`, each targeting a non-overlapping audience half.

## Step-by-step

### 1. Split your audience

Split your target into 2 halves before creating campaigns. Two options:

- **Dashboard split:** Use the Batch dashboard to create two segments from a parent audience (no plugin support for splitting).
- **Existing segments:** Use 2 pre-existing non-overlapping segments (e.g., `q2_cohort_a` and `q2_cohort_b`).

The critical constraint: ensure the two targeting sets have zero overlap — otherwise some users receive both variants.

### 2. Create variant A

```bash
$batch-cep campaigns create '{
  "name": "abtest_q2_variant_a",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "audiences": ["q2_cohort_a"] },
  "channels": {
    "push": {
      "title": "Bonus exclusif",
      "body": "Ton bonus t'\''attend — découvre-le maintenant."
    }
  }
}'
# → campaign_token: cmp_variant_a_abc
```

### 3. Create variant B

```bash
$batch-cep campaigns create '{
  "name": "abtest_q2_variant_b",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "audiences": ["q2_cohort_b"] },
  "channels": {
    "push": {
      "title": "Cadeau pour toi",
      "body": "On a quelque chose de spécial à te montrer."
    }
  }
}'
# → campaign_token: cmp_variant_b_xyz
```

### 4. Review in dashboard, then launch

Once you've verified both drafts look correct:

```bash
$batch-cep campaigns update cmp_variant_a_abc '{ "state": "RUNNING" }'
$batch-cep campaigns update cmp_variant_b_xyz '{ "state": "RUNNING" }'
```

Launch both at the same time (or within seconds) to avoid timing bias.

### 5. Compare stats

For CEP campaigns, use `orchestrations stats`:

```bash
$batch-cep orchestrations stats cmp_variant_a_abc
$batch-cep orchestrations stats cmp_variant_b_xyz
```

For MEP mass campaigns, use `campaigns stats`:

```bash
$batch-cep campaigns stats tok_variant_a --app-key ios_live
$batch-cep campaigns stats tok_variant_b --app-key ios_live
```

Compare `opened` / `delivered` ratios across variants to determine the winner.

## Pitfall — overlapping audiences

Without Batch's native splitting, you must guarantee non-overlapping audiences. If a user is in both `q2_cohort_a` and `q2_cohort_b`, they receive both variants — which corrupts your test results and creates a poor user experience.

Validate audience sizes sum to your expected total before launching:

```bash
$batch-cep audiences view q2_cohort_a  # check size
$batch-cep audiences view q2_cohort_b  # check size
```

## See also

- [campaigns reference (CEP)](../reference/cep/campaigns.md) — targeting custom audiences
- [campaigns reference (MEP)](../reference/mep/campaigns.md) — MEP mass campaigns
- [audiences reference](../reference/cep/audiences.md) — audience creation and membership
