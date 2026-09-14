"""EatRai cost kill-switch.

A GCP Cloud Function (2nd gen) subscribed to a Cloud Billing budget's Pub/Sub
topic. When month-to-date spend crosses the configured line it forces the
Cloud Run backend into NO_FETCH mode (NO_FETCH=true) — the app stops calling
Google Places and serves real stale cache or an honest "unavailable" response
instead (never fabricated data), until someone clears it.

See docs/COST_AND_MONETIZATION_PLAN.md Part 7 / Part 13. The rule: this cap is
<= pessimistic ad revenue, so EatRai cannot run at a loss.

Behaviour is latch-on by default: it only ever *sets* NO_FETCH=true. Recovery is
manual (redeploy without NO_FETCH, or `gcloud run services update ... --remove-env-vars NO_FETCH`)
unless AUTO_RESTORE=true is set.

Environment (set at deploy time):
  RUN_PROJECT      GCP project id or number that owns the Cloud Run service   (required)
  RUN_REGION       Cloud Run region, e.g. asia-southeast1                      (required)
  RUN_SERVICE      Cloud Run service name, e.g. eatrai                         (required)
  KILL_AT          trip when threshold-exceeded OR cost/budget >= this ratio   (default 1.0)
  KILL_AT_ABS      also trip when month-to-date cost >= this many currency units (optional)
  AUTO_RESTORE     "true" => clear NO_FETCH when a later message shows cost has
                   fallen back below RESTORE_BELOW (e.g. new billing month)    (default false)
  RESTORE_BELOW    ratio under which AUTO_RESTORE clears NO_FETCH                   (default 0.5)
  DRY_RUN          "true" => log what it would do, change nothing              (default false)
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import logging
import os

try:
    import functions_framework

    _cloud_event = functions_framework.cloud_event
except ModuleNotFoundError:  # allow importing this module in tests without the framework
    def _cloud_event(fn):
        return fn

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("eatrai-killswitch")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default) or default


def _f(name: str, default: str) -> float:
    return float(_env(name, default) or default)


# Tunables (safe defaults; no env required to import this module).
KILL_AT = _f("KILL_AT", "1.0")
KILL_AT_ABS = _f("KILL_AT_ABS", "0")
AUTO_RESTORE = _env("AUTO_RESTORE", "false").lower() == "true"
RESTORE_BELOW = _f("RESTORE_BELOW", "0.5")
DRY_RUN = _env("DRY_RUN", "false").lower() == "true"


def _service_path() -> str:
    project = _env("RUN_PROJECT")
    region = _env("RUN_REGION")
    service = _env("RUN_SERVICE")
    missing = [n for n, v in [("RUN_PROJECT", project), ("RUN_REGION", region), ("RUN_SERVICE", service)] if not v]
    if missing:
        raise RuntimeError(f"missing required env var(s): {', '.join(missing)}")
    return f"projects/{project}/locations/{region}/services/{service}"


# ----------------------------------------------------------------- Pub/Sub parse


def _decode(cloud_event) -> dict:
    """Pull the JSON budget payload out of a Pub/Sub CloudEvent."""
    msg = cloud_event.data.get("message", {}) if cloud_event.data else {}
    raw = msg.get("data")
    if not raw:
        return {}
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _should_kill(payload: dict) -> tuple[bool, str]:
    cost = float(payload.get("costAmount", 0) or 0)
    budget = float(payload.get("budgetAmount", 0) or 0)
    threshold = float(payload.get("alertThresholdExceeded", 0) or 0)
    ratio = cost / budget if budget else 0.0

    if threshold and threshold >= KILL_AT:
        return True, f"threshold {threshold:.2f} >= {KILL_AT:.2f} (cost {cost} / {budget})"
    if ratio >= KILL_AT:
        return True, f"cost ratio {ratio:.2f} >= {KILL_AT:.2f} ({cost} / {budget})"
    if KILL_AT_ABS and cost >= KILL_AT_ABS:
        return True, f"cost {cost} >= KILL_AT_ABS {KILL_AT_ABS}"
    return False, f"ok (cost {cost} / {budget}, ratio {ratio:.2f}, threshold {threshold:.2f})"


def _should_restore(payload: dict) -> bool:
    if not AUTO_RESTORE:
        return False
    cost = float(payload.get("costAmount", 0) or 0)
    budget = float(payload.get("budgetAmount", 0) or 0)
    threshold = float(payload.get("alertThresholdExceeded", 0) or 0)
    ratio = cost / budget if budget else 0.0
    return threshold == 0 and ratio < RESTORE_BELOW


# --------------------------------------------------------------- Cloud Run patch


def _set_no_fetch(on: bool, reason: str) -> str:
    from google.cloud import run_v2  # imported here so the module loads without GCP libs

    client = run_v2.ServicesClient()
    svc = client.get_service(name=_service_path())

    container = svc.template.containers[0]
    current = next((e for e in container.env if e.name == "NO_FETCH"), None)
    is_on = bool(current and current.value == "true")

    if on and is_on:
        return "no-op: NO_FETCH already true"
    if not on and not is_on:
        return "no-op: NO_FETCH already unset"

    kept = [e for e in container.env if e.name != "NO_FETCH"]
    if on:
        kept.append(run_v2.EnvVar(name="NO_FETCH", value="true"))
    container.env = kept

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    svc.template.annotations["eatrai.dev/killswitch"] = (
        f"{'engaged' if on else 'cleared'} {stamp}: {reason}"[:255]
    )
    # a fresh revision must not reuse the previous revision name
    svc.template.revision = ""

    if DRY_RUN:
        return f"DRY_RUN: would set NO_FETCH={'true' if on else '(removed)'} — {reason}"

    # update_service returning an operation means Cloud Run accepted the change and
    # the new revision is rolling out. Confirming the rollout needs project-scoped
    # run.operations.get, which the service-scoped run.admin grant doesn't cover —
    # so treat a polling failure as "submitted, unconfirmed" rather than an error.
    op = client.update_service(service=svc)
    verb = "true" if on else "(removed)"
    try:
        op.result(timeout=180)
        return f"NO_FETCH={verb} deployed — {reason}"
    except Exception as e:  # noqa: BLE001 — best-effort confirmation only
        return f"NO_FETCH={verb} submitted (rollout not confirmed: {type(e).__name__}) — {reason}"


# --------------------------------------------------------------------- entry pt


@_cloud_event
def killswitch(cloud_event):
    payload = _decode(cloud_event)
    if not payload:
        log.warning("empty / unparseable budget message; ignoring")
        return

    log.info(
        "budget msg: name=%s cost=%s budget=%s threshold=%s",
        payload.get("budgetDisplayName"),
        payload.get("costAmount"),
        payload.get("budgetAmount"),
        payload.get("alertThresholdExceeded"),
    )

    kill, reason = _should_kill(payload)
    if kill:
        log.warning("KILL: %s", reason)
        log.warning(_set_no_fetch(True, reason))
        return

    if _should_restore(payload):
        log.info("RESTORE conditions met; clearing NO_FETCH")
        log.info(_set_no_fetch(False, "auto-restore: spend back below threshold"))
        return

    log.info("no action: %s", reason)
