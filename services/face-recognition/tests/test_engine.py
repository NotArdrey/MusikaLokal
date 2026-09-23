from __future__ import annotations

import pathlib
import sys
import unittest

SERVICE_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import FaceServiceConfig
from app.engine import FaceMatcher, NoFaceError


class FakeBackend:
    deepface_version = "test-version"

    def __init__(self, representations: dict[str, list[list[float]] | Exception]):
        self.representations = representations

    def represent(self, image_bytes: bytes) -> list[list[float]]:
        value = self.representations[image_bytes.decode()]
        if isinstance(value, Exception):
            raise value
        return value

    def distance(self, first: list[float], second: list[float]) -> float:
        return abs(first[0] - second[0])

    def default_threshold(self) -> float:
        return 0.5


def loader(url: str) -> bytes:
    return url.encode()


class FaceMatcherTests(unittest.TestCase):
    def matcher(self, representations: dict[str, list[list[float]] | Exception], margin: float = 0.02):
        config = FaceServiceConfig(threshold=None, unclear_margin=margin)
        return FaceMatcher(config, FakeBackend(representations))

    def test_two_of_three_matches_preserves_production_aggregation(self):
        matcher = self.matcher({
            "profile": [[0.0]],
            "frame-1": [[0.10]],
            "frame-2": [[0.20]],
            "frame-3": [[0.90]],
        })
        response = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2", "frame-3"],
            loader,
        )
        result = response["results"][0]
        self.assertEqual(result["status"], "likely_same_person")
        self.assertEqual(result["matched_frames"], 2)
        self.assertEqual(result["usable_frames"], 3)
        self.assertEqual(result["distance"], 0.2)
        self.assertIsNone(result["confidence"])
        self.assertIsNone(result["similarity"])

    def test_multiple_video_faces_use_best_arcface_distance(self):
        matcher = self.matcher({
            "profile": [[0.0]],
            "frame-1": [[0.90], [0.10]],
            "frame-2": [[0.15]],
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "likely_same_person")
        self.assertEqual(result["multiple_people_frames"], 1)
        self.assertEqual(result["frames"][0]["distance"], 0.1)

    def test_one_clear_frame_returns_limited_advisory_result(self):
        matcher = self.matcher({
            "profile": [[0.0]],
            "frame-1": [[0.10]],
            "frame-2": NoFaceError("no face"),
            "frame-3": [[0.49]],
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2", "frame-3"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "likely_same_person")
        self.assertEqual(result["usable_frames"], 1)
        self.assertIn("limited evidence", result["limitation"])

    def test_one_clear_non_match_remains_inconclusive(self):
        matcher = self.matcher({
            "profile": [[0.0]],
            "frame-1": [[0.90]],
            "frame-2": NoFaceError("no face"),
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "unclear")
        self.assertEqual(result["usable_frames"], 1)
        self.assertIn("at least 2", result["summary"])

    def test_near_threshold_and_no_face_frames_remain_unclear(self):
        matcher = self.matcher({
            "profile": [[0.0]],
            "frame-1": [[0.49]],
            "frame-2": NoFaceError("no face"),
            "frame-3": [[0.80]],
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2", "frame-3"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "unclear")
        self.assertEqual(result["usable_frames"], 1)
        self.assertEqual(result["no_face_frames"], 1)
        self.assertEqual(result["frames"][0]["outcome"], "unclear")

    def test_multiple_profile_faces_are_ambiguous(self):
        matcher = self.matcher({
            "profile": [[0.0], [0.2]],
            "frame-1": [[0.0]],
            "frame-2": [[0.0]],
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "unclear")
        self.assertEqual(result["error"], "multiple_profile_faces")

    def test_processing_failures_do_not_become_negative_matches(self):
        matcher = self.matcher({
            "profile": ValueError("malformed image"),
            "frame-1": [[0.9]],
            "frame-2": [[0.9]],
        })
        result = matcher.match_batch(
            [{"id": "solo", "reference_image_url": "profile"}],
            ["frame-1", "frame-2"],
            loader,
        )["results"][0]
        self.assertEqual(result["status"], "unclear")
        self.assertIn("malformed image", result["error"])


if __name__ == "__main__":
    unittest.main()
