"""Pure-logic tests — no GCP, no network. Run: python3 -m pytest (or unittest)."""

import base64
import json
import os
import unittest
from unittest import mock

import main


def event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return mock.Mock(data={"message": {"data": data}})


class DecodeTests(unittest.TestCase):
    def test_roundtrip(self):
        self.assertEqual(main._decode(event({"costAmount": 5})), {"costAmount": 5})

    def test_empty(self):
        self.assertEqual(main._decode(mock.Mock(data=None)), {})


class KillTests(unittest.TestCase):
    def test_trips_on_threshold_100pct(self):
        kill, _ = main._should_kill(
            {"costAmount": 14, "budgetAmount": 15, "alertThresholdExceeded": 1.0}
        )
        self.assertTrue(kill)

    def test_does_not_trip_at_50pct(self):
        kill, _ = main._should_kill(
            {"costAmount": 7.5, "budgetAmount": 15, "alertThresholdExceeded": 0.5}
        )
        self.assertFalse(kill)

    def test_trips_on_cost_ratio_even_without_threshold_field(self):
        kill, _ = main._should_kill({"costAmount": 16, "budgetAmount": 15})
        self.assertTrue(kill)

    @mock.patch.dict(os.environ, {"KILL_AT_ABS": "15"})
    def test_absolute_cap(self):
        import importlib

        importlib.reload(main)
        try:
            kill, why = main._should_kill({"costAmount": 15, "budgetAmount": 999})
            self.assertTrue(kill)
            self.assertIn("KILL_AT_ABS", why)
        finally:
            importlib.reload(main)


class RestoreTests(unittest.TestCase):
    def test_off_by_default(self):
        self.assertFalse(
            main._should_restore({"costAmount": 1, "budgetAmount": 15, "alertThresholdExceeded": 0})
        )

    @mock.patch.dict(os.environ, {"AUTO_RESTORE": "true"})
    def test_on_when_cost_low_and_no_threshold(self):
        import importlib

        importlib.reload(main)
        try:
            self.assertTrue(
                main._should_restore(
                    {"costAmount": 1, "budgetAmount": 15, "alertThresholdExceeded": 0}
                )
            )
        finally:
            importlib.reload(main)


class ServicePathTests(unittest.TestCase):
    def test_requires_env(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                main._service_path()

    def test_builds_path(self):
        with mock.patch.dict(
            os.environ,
            {"RUN_PROJECT": "p", "RUN_REGION": "asia-southeast1", "RUN_SERVICE": "eatrai"},
        ):
            self.assertEqual(
                main._service_path(),
                "projects/p/locations/asia-southeast1/services/eatrai",
            )


if __name__ == "__main__":
    unittest.main()
