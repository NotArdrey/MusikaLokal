from __future__ import annotations

import os
from dataclasses import dataclass


def _optional_float(name: str) -> float | None:
    value = os.getenv(name, "").strip()
    return float(value) if value else None


def _boolean(name: str, default: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class FaceServiceConfig:
    service_version: str = "1.0.0"
    model: str = "ArcFace"
    detector_backend: str = "retinaface"
    distance_metric: str = "cosine"
    alignment: bool = True
    threshold: float | None = None
    unclear_margin: float = 0.02
    min_usable_frames: int = 2
    required_matches: int = 2
    max_frames: int = 3
    max_faces_per_image: int = 10
    max_image_bytes: int = 12 * 1024 * 1024
    image_timeout_seconds: float = 15.0
    api_key: str = ""

    @classmethod
    def from_env(cls) -> "FaceServiceConfig":
        threshold = _optional_float("FACE_ARCFACE_THRESHOLD")
        margin = max(0.0, float(os.getenv("FACE_UNCLEAR_DISTANCE_MARGIN", "0.02")))
        return cls(
            detector_backend=os.getenv("FACE_DETECTOR_BACKEND", "retinaface").strip() or "retinaface",
            distance_metric=os.getenv("FACE_DISTANCE_METRIC", "cosine").strip() or "cosine",
            alignment=_boolean("FACE_ALIGNMENT", True),
            threshold=threshold,
            unclear_margin=margin,
            max_image_bytes=max(1, int(os.getenv("FACE_MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))),
            image_timeout_seconds=max(1.0, float(os.getenv("FACE_IMAGE_TIMEOUT_SECONDS", "15"))),
            api_key=os.getenv("FACE_RECOGNITION_API_KEY", "").strip(),
        )
