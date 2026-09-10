#!/usr/bin/env bash
# One-time setup for the EatRai cost kill-switch.
#
#   Budget (Cloud Billing)  --alert-->  Pub/Sub topic  --trigger-->  Cloud Function  --sets MOCK=true-->  Cloud Run
#
# Run from this directory once. Re-running is safe (create steps that already
# exist just error; the function deploy updates in place).
#
# Prereqs: gcloud CLI, authed as a user with Owner (or Billing Admin + Cloud
# Functions Admin + Run Admin + Project IAM Admin) on the project.

set -euo pipefail

# ---- fill these in -----------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-eatrai}"                    # project number 223664935213
BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_ID:-0186D6-72AD25-4619AC}"
REGION="${REGION:-asia-southeast1}"
RUN_SERVICE="${RUN_SERVICE:-eatrai}"

# Billing account currency is THB. $15/mo target (plan Part 13) ≈ ฿520; rounded to 500.
BUDGET_AMOUNT="${BUDGET_AMOUNT:-500}"                 # monthly budget, in THB
KILL_AT="${KILL_AT:-1.0}"                             # trip at 100% of budget (a threshold alert or cost ratio)
KILL_AT_ABS="${KILL_AT_ABS:-500}"                     # also trip if month-to-date cost hits ฿500
AUTO_RESTORE="${AUTO_RESTORE:-false}"                 # keep false: recovery should be a human decision
# ---------------------------------------------------------------------------

TOPIC="eatrai-budget"
FUNCTION="eatrai-killswitch"
FN_SA="eatrai-killswitch@${PROJECT_ID}.iam.gserviceaccount.com"

echo ">> project=$PROJECT_ID region=$REGION service=$RUN_SERVICE budget=${BUDGET_AMOUNT}"
gcloud config set project "$PROJECT_ID" >/dev/null

echo ">> enabling APIs"
gcloud services enable \
  cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  pubsub.googleapis.com eventarc.googleapis.com billingbudgets.googleapis.com \
  cloudscheduler.googleapis.com artifactregistry.googleapis.com

echo ">> Pub/Sub topic $TOPIC"
gcloud pubsub topics create "$TOPIC" 2>/dev/null || echo "   (already exists)"

echo ">> budget 'EatRai kill-switch' -> $TOPIC (credits excluded)"
# Connecting the topic here makes Cloud Billing provision its publisher
# (billing-budgets@system.gserviceaccount.com) and grant it pubsub.publisher on
# the topic automatically — which is why this must run before the IAM step below.
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT_ID" \
  --display-name="EatRai kill-switch" \
  --budget-amount="${BUDGET_AMOUNT}" \
  --filter-projects="projects/${PROJECT_ID}" \
  --credit-types-treatment=exclude-all-credits \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.2,basis=forecasted-spend \
  --notifications-rule-pubsub-topic="projects/${PROJECT_ID}/topics/${TOPIC}" \
  || echo "   (budget may already exist — check: gcloud billing budgets list --billing-account=$BILLING_ACCOUNT_ID)"

# Attaching the topic to the budget above auto-grants pubsub.publisher to
# billing-budget-alert@system.gserviceaccount.com. Just verify it landed.
echo ">> verify budget publisher on $TOPIC"
gcloud pubsub topics get-iam-policy "$TOPIC" --format='value(bindings.members)' \
  | grep -q "billing-budget-alert@system.gserviceaccount.com" \
  && echo "   ok" \
  || echo "   WARN: publisher grant not visible yet — re-check in a minute: gcloud pubsub topics get-iam-policy $TOPIC"

echo ">> runtime service account for the function"
gcloud iam service-accounts create eatrai-killswitch \
  --display-name="EatRai cost kill-switch" || true

echo ">> grant it permission to update ONLY the $RUN_SERVICE service"
gcloud run services add-iam-policy-binding "$RUN_SERVICE" --region="$REGION" \
  --member="serviceAccount:${FN_SA}" --role="roles/run.admin"

RUNTIME_SA="$(gcloud run services describe "$RUN_SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"
if [ -n "$RUNTIME_SA" ]; then
  echo ">> allow the function to deploy revisions as the service's runtime SA ($RUNTIME_SA)"
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
    --member="serviceAccount:${FN_SA}" --role="roles/iam.serviceAccountUser"
else
  echo "   service uses the default compute SA; run.admin is enough"
fi

echo ">> deploy the function"
gcloud functions deploy "$FUNCTION" \
  --gen2 --region="$REGION" --runtime=python312 \
  --source=. --entry-point=killswitch \
  --trigger-topic="$TOPIC" \
  --service-account="$FN_SA" \
  --memory=256Mi --timeout=300s --max-instances=3 \
  --set-env-vars="RUN_PROJECT=${PROJECT_ID},RUN_REGION=${REGION},RUN_SERVICE=${RUN_SERVICE},KILL_AT=${KILL_AT},KILL_AT_ABS=${KILL_AT_ABS},AUTO_RESTORE=${AUTO_RESTORE}"

cat <<EOF

Done.

Test without spending money:
  gcloud pubsub topics publish $TOPIC --message='{"budgetDisplayName":"EatRai kill-switch","costAmount":99,"budgetAmount":15,"currencyCode":"USD","alertThresholdExceeded":1.0}'
  gcloud functions logs read $FUNCTION --region $REGION --gen2 --limit 20
  gcloud run services describe $RUN_SERVICE --region $REGION --format='value(spec.template.spec.containers[0].env)'   # expect MOCK=true

Clear the kill-switch (after you've dealt with the cause):
  gcloud run services update $RUN_SERVICE --region $REGION --remove-env-vars MOCK

Dry-run mode (log only, never patch Cloud Run):
  gcloud functions deploy $FUNCTION --gen2 --region $REGION --update-env-vars DRY_RUN=true
EOF
