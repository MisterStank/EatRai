# EatRai cost kill-switch

The no-loss guarantee for the Places bill (docs/COST_AND_MONETIZATION_PLAN.md
Part 7 / Part 13).

```
Cloud Billing budget  ──alert──▶  Pub/Sub topic  ──trigger──▶  Cloud Function  ──sets MOCK=true──▶  Cloud Run (eatrai)
```

When month-to-date spend crosses the line, the function forces the backend into
`MOCK=true`. The app keeps working (generated restaurants); Google Places is not
called again until a human clears it. The cap is set **at or below** pessimistic
ad revenue, so EatRai cannot run at a loss.

## Files

| file | what |
|---|---|
| `main.py` | the function — `killswitch` entry point, Pub/Sub CloudEvent trigger |
| `requirements.txt` | `functions-framework`, `google-cloud-run` |
| `deploy.sh` | one-time setup: APIs, topic, budget, service account, IAM, function |
| `test_killswitch.py` | pure-logic unit tests (no GCP) — `python3 -m unittest test_killswitch` |

## Deploy

All values are pre-filled (project `eatrai`, billing account `0186D6-72AD25-4619AC`
in THB, region `asia-southeast1`, service `eatrai`). Just:

```sh
cd infra/killswitch && ./deploy.sh
```

Defaults: **฿500** monthly budget (≈ the $15/mo cap in plan Part 13), credits
**excluded**, trips at 100% of budget **or** an absolute month-to-date cost of
฿500. `AUTO_RESTORE=false` — recovery is a deliberate human action.

## Verify (no spend)

```sh
gcloud pubsub topics publish eatrai-budget \
  --message='{"budgetDisplayName":"EatRai kill-switch","costAmount":99,"budgetAmount":15,"currencyCode":"USD","alertThresholdExceeded":1.0}'

gcloud functions logs read eatrai-killswitch --region asia-southeast1 --gen2 --limit 20
gcloud run services describe eatrai --region asia-southeast1 \
  --format='value(spec.template.spec.containers[0].env)'      # expect MOCK=true
```

## Clear the kill-switch

After you've dealt with the cause (raised the budget, fixed a runaway, new month):

```sh
gcloud run services update eatrai --region asia-southeast1 --remove-env-vars MOCK
```

## Tuning env vars (redeploy or `--update-env-vars`)

| var | default | meaning |
|---|---|---|
| `KILL_AT` | `1.0` | trip when a threshold alert ≥ this ratio, or cost/budget ≥ this |
| `KILL_AT_ABS` | `15` | also trip when month-to-date cost ≥ this absolute amount |
| `AUTO_RESTORE` | `false` | clear `MOCK` when a later message shows cost back under `RESTORE_BELOW` and no threshold active |
| `RESTORE_BELOW` | `0.5` | ratio for `AUTO_RESTORE` |
| `DRY_RUN` | `false` | log the decision, never patch Cloud Run |

## Notes

- The function's service account (`eatrai-killswitch@…`) gets `roles/run.admin`
  **on the one service only**, plus `serviceAccountUser` on the service's runtime
  SA so it can roll a new revision. Nothing project-wide.
- Setting `MOCK=true` deploys a new Cloud Run revision at 100% traffic. The old
  revision (real key) is untouched and is what you roll back to.
- Budget data can lag actual spend by a few hours — that's why the budget also
  has a **forecasted-spend** threshold at 120%, and why the cap sits below the
  revenue line rather than at it.
