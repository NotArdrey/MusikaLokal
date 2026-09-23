from __future__ import annotations

import hmac
import threading
import urllib.request
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import FaceServiceConfig
from .engine import FaceMatcher


class FaceSubject(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    reference_image_url: str = Field(min_length=1, max_length=2_000)


class FaceBatchRequest(BaseModel):
    subjects: list[FaceSubject] = Field(min_length=1, max_length=12)
    frame_urls: list[str] = Field(min_length=1, max_length=3)


config = FaceServiceConfig.from_env()
matcher = FaceMatcher(config)
model_lock = threading.Lock()
app = FastAPI(title="MusikaLokal Face Recognition", version=config.service_version)


def authorize(provided_key: str | None) -> None:
    if config.api_key and not hmac.compare_digest(provided_key or "", config.api_key):
        raise HTTPException(status_code=401, detail="Invalid face-service key")


def load_image(url: str) -> bytes:
    if not url.lower().startswith(("https://", "http://127.0.0.1:", "http://localhost:")):
        raise ValueError("Image URLs must use HTTPS (localhost HTTP is allowed for development).")
    request = urllib.request.Request(url, headers={"User-Agent": "MusikaLokal-Face-Service/1.0"})
    with urllib.request.urlopen(request, timeout=config.image_timeout_seconds) as response:
        content_type = response.headers.get_content_type()
        if not content_type.startswith("image/"):
            raise ValueError(f"Expected an image response, received {content_type}.")
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > config.max_image_bytes:
            raise ValueError("Image exceeds the configured size limit.")
        content = response.read(config.max_image_bytes + 1)
    if len(content) > config.max_image_bytes:
        raise ValueError("Image exceeds the configured size limit.")
    return content


@app.get("/health")
def health(x_face_service_key: Annotated[str | None, Header()] = None) -> dict[str, object]:
    authorize(x_face_service_key)
    return {
        "status": "ok",
        "engine": "DeepFace",
        "model": config.model,
        "service_version": config.service_version,
    }


@app.get("/version")
def version(x_face_service_key: Annotated[str | None, Header()] = None) -> dict[str, object]:
    authorize(x_face_service_key)
    try:
        return matcher.metadata()
    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/v1/face-match/batch")
async def face_match_batch(
    payload: FaceBatchRequest,
    x_face_service_key: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    authorize(x_face_service_key)
    subjects = [subject.model_dump() for subject in payload.subjects]

    # TensorFlow model initialization and inference are protected from overlapping
    # requests. The HTTP handler stays async by moving that work to a worker thread.
    def compare() -> dict[str, object]:
        with model_lock:
            return matcher.match_batch(subjects, payload.frame_urls, load_image)

    try:
        return await run_in_threadpool(compare)
    except Exception as error:
        # Service/model failures are explicit 503s. The MusikaLokal client maps these
        # to not_run, never to likely_different_person.
        raise HTTPException(status_code=503, detail=str(error)) from error
