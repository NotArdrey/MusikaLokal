from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from .config import FaceServiceConfig


class NoFaceError(ValueError):
    """Raised when DeepFace cannot find any face in an image."""


class FaceBackend(Protocol):
    deepface_version: str

    def represent(self, image_bytes: bytes) -> list[list[float]]: ...

    def distance(self, first: list[float], second: list[float]) -> float: ...

    def default_threshold(self) -> float: ...


class DeepFaceBackend:
    """Lazy adapter around DeepFace so startup health checks stay inexpensive."""

    def __init__(self, config: FaceServiceConfig):
        self.config = config
        try:
            import cv2
            import numpy as np
            from deepface import DeepFace
            from deepface.modules import verification
            from importlib.metadata import version
        except ImportError as error:
            raise RuntimeError(
                "DeepFace runtime is not installed. Install services/face-recognition/requirements.txt."
            ) from error
        self._cv2 = cv2
        self._np = np
        self._deepface = DeepFace
        self._verification = verification
        self.deepface_version = version("deepface")

    def represent(self, image_bytes: bytes) -> list[list[float]]:
        encoded = self._np.frombuffer(image_bytes, dtype=self._np.uint8)
        image = self._cv2.imdecode(encoded, self._cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("The image could not be decoded.")
        try:
            representations = self._deepface.represent(
                img_path=image,
                model_name=self.config.model,
                detector_backend=self.config.detector_backend,
                enforce_detection=True,
                align=self.config.alignment,
                normalization="base",
                max_faces=self.config.max_faces_per_image,
            )
        except ValueError as error:
            detail = str(error)
            if "face could not be detected" in detail.lower() or "no face" in detail.lower():
                raise NoFaceError(detail) from error
            raise
        embeddings = [item.get("embedding") for item in representations if item.get("embedding")]
        if not embeddings:
            raise NoFaceError("DeepFace returned no face embeddings.")
        return embeddings

    def distance(self, first: list[float], second: list[float]) -> float:
        return float(self._verification.find_distance(first, second, self.config.distance_metric))

    def default_threshold(self) -> float:
        return float(self._verification.find_threshold(self.config.model, self.config.distance_metric))


@dataclass(frozen=True)
class ImageRepresentations:
    embeddings: list[list[float]]
    error_kind: str = ""
    error: str = ""


class FaceMatcher:
    AGGREGATION_STRATEGY = "at_least_2_usable_frames_and_2_verified_matches"
    FRAME_CONFIGURATION = "existing_client_representative_jpegs; maximum_3_frames"

    def __init__(
        self,
        config: FaceServiceConfig,
        backend: FaceBackend | None = None,
    ):
        self.config = config
        self._backend = backend

    @property
    def backend(self) -> FaceBackend:
        if self._backend is None:
            self._backend = DeepFaceBackend(self.config)
        return self._backend

    @property
    def threshold(self) -> float:
        return self.config.threshold if self.config.threshold is not None else self.backend.default_threshold()

    def metadata(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": "deepface_arcface",
            "engine": "DeepFace",
            "service_version": self.config.service_version,
            "deepface_version": self.backend.deepface_version,
            "model": self.config.model,
            "detector_backend": self.config.detector_backend,
            "distance_metric": self.config.distance_metric,
            "threshold": self.threshold,
            "threshold_source": "environment" if self.config.threshold is not None else "deepface_default",
            "alignment": self.config.alignment,
            "aggregation_strategy": self.AGGREGATION_STRATEGY,
            "frame_configuration": self.FRAME_CONFIGURATION,
        }

    def _represent(self, image_bytes: bytes) -> ImageRepresentations:
        try:
            return ImageRepresentations(self.backend.represent(image_bytes))
        except NoFaceError as error:
            return ImageRepresentations([], "no_face", str(error))
        except Exception as error:  # malformed images stay advisory instead of failing the whole review
            return ImageRepresentations([], "processing_error", str(error))

    def match_batch(
        self,
        subjects: list[dict[str, str]],
        frame_urls: list[str],
        image_loader: Callable[[str], bytes],
    ) -> dict[str, Any]:
        selected_frames = frame_urls[: self.config.max_frames]
        representation_cache: dict[str, ImageRepresentations] = {}

        def cached_represent(url: str) -> ImageRepresentations:
            if url not in representation_cache:
                try:
                    representation_cache[url] = self._represent(image_loader(url))
                except Exception as error:
                    representation_cache[url] = ImageRepresentations([], "processing_error", str(error))
            return representation_cache[url]

        frame_representations = [(url, cached_represent(url)) for url in selected_frames]
        metadata = self.metadata()
        results = [
            self._match_subject(subject, frame_representations, cached_represent(subject["reference_image_url"]), metadata)
            for subject in subjects
        ]
        return {**metadata, "results": results}

    def _match_subject(
        self,
        subject: dict[str, str],
        frames: list[tuple[str, ImageRepresentations]],
        reference: ImageRepresentations,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        common = {
            "subject_id": subject["id"],
            "confidence": None,
            "similarity": None,
            "threshold": self.threshold,
            "provider": "deepface_arcface",
            "model": self.config.model,
            "detector_backend": self.config.detector_backend,
            "distance_metric": self.config.distance_metric,
            "alignment": self.config.alignment,
            "aggregation_strategy": self.AGGREGATION_STRATEGY,
            "service_version": self.config.service_version,
            "deepface_version": metadata["deepface_version"],
        }
        if reference.error_kind == "no_face":
            return self._unclear_result(common, len(frames), "No usable face was detected in the profile photo.", reference.error)
        if reference.error_kind:
            return self._unclear_result(common, len(frames), "The profile photo could not be processed.", reference.error)
        if len(reference.embeddings) != 1:
            return self._unclear_result(
                common,
                len(frames),
                "The profile photo contains multiple faces, so the reference person is ambiguous.",
                "multiple_profile_faces",
            )

        frame_results: list[dict[str, Any]] = []
        for index, (frame_url, represented) in enumerate(frames, start=1):
            base = {
                "frame": index,
                "frame_url": frame_url,
                "verified": None,
                "distance": None,
                "threshold": self.threshold,
                "faces_detected": len(represented.embeddings),
                "error": represented.error or None,
            }
            if represented.error_kind == "no_face":
                frame_results.append({**base, "outcome": "no_face"})
                continue
            if represented.error_kind:
                frame_results.append({**base, "outcome": "processing_error"})
                continue

            distances = [
                self.backend.distance(reference.embeddings[0], candidate)
                for candidate in represented.embeddings
            ]
            distance = min(distances)
            if abs(distance - self.threshold) <= self.config.unclear_margin:
                frame_results.append({**base, "outcome": "unclear", "distance": distance})
                continue
            verified = distance <= self.threshold
            frame_results.append({
                **base,
                "outcome": "matched" if verified else "different",
                "verified": verified,
                "distance": distance,
            })

        usable = [frame for frame in frame_results if isinstance(frame["verified"], bool)]
        matched = [frame for frame in usable if frame["verified"]]
        distances = [float(frame["distance"]) for frame in usable]
        enough_evidence = len(usable) >= self.config.min_usable_frames
        likely_same = enough_evidence and len(matched) >= self.config.required_matches
        status = (
            "unclear"
            if not enough_evidence
            else "likely_same_person"
            if likely_same
            else "likely_different_person"
        )
        match_rate = len(matched) / len(usable) if usable else 0.0
        if status == "likely_same_person":
            summary = f"ArcFace matched {len(matched)} of {len(usable)} usable representative video frames."
            limitation = ""
        elif status == "likely_different_person":
            summary = f"ArcFace matched {len(matched)} of {len(usable)} usable representative video frames."
            limitation = "This advisory result should be checked against the original profile photo and video."
        else:
            summary = f"ArcFace could not decide: only {len(usable)} usable frame(s) were available; at least {self.config.min_usable_frames} are required."
            limitation = "No-face, processing-error, and near-threshold frames are excluded from the usable-frame count."

        processing_errors = [frame for frame in frame_results if frame["outcome"] == "processing_error"]
        return {
            **common,
            "status": status,
            "distance": statistics.median(distances) if distances else None,
            "summary": summary,
            "frames_compared": len(usable),
            "sampled_frames": len(frames),
            "usable_frames": len(usable),
            "matched_frames": len(matched),
            "match_rate": match_rate,
            "no_face_frames": sum(frame["outcome"] == "no_face" for frame in frame_results),
            "multiple_people_frames": sum(frame["faces_detected"] > 1 for frame in frame_results),
            "processing_failure_frames": len(processing_errors),
            "frames": frame_results,
            "limitation": limitation,
            "error": "; ".join(str(frame["error"]) for frame in processing_errors if frame["error"]) or None,
        }

    def _unclear_result(
        self,
        common: dict[str, Any],
        sampled_frames: int,
        summary: str,
        error: str,
    ) -> dict[str, Any]:
        return {
            **common,
            "status": "unclear",
            "distance": None,
            "summary": summary,
            "frames_compared": 0,
            "sampled_frames": sampled_frames,
            "usable_frames": 0,
            "matched_frames": 0,
            "match_rate": 0.0,
            "no_face_frames": 0,
            "multiple_people_frames": 0,
            "processing_failure_frames": 1 if error and error != "multiple_profile_faces" else 0,
            "frames": [],
            "limitation": summary,
            "error": error or None,
        }
