# MusikaLokal DeepFace / ArcFace service

This service is the only face-recognition implementation used by the gig portfolio
review. It consumes the representative JPEG frames already produced by the client;
it never extracts a second set of frames from the video.

Configuration is intentionally explicit: ArcFace, RetinaFace, cosine distance,
alignment enabled, at most three frames, and the existing production aggregation
rule of at least two usable frames and at least two verified matches. The default
ArcFace/cosine threshold is `0.68` in the pinned DeepFace 0.0.101 release and is
resolved from DeepFace at runtime. `FACE_ARCFACE_THRESHOLD` is an
operator-controlled override; benchmark analysis never writes it.

Start locally:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The first inference downloads/loads ArcFace model weights and can be slower. The
service provides `GET /health`, `GET /version`, and `POST /v1/face-match/batch`.
If `FACE_RECOGNITION_API_KEY` is set, send it as `X-Face-Service-Key`.

The batch endpoint accepts `{ "subjects": [{ "id": "...", "reference_image_url":
"https://..." }], "frame_urls": ["https://..."] }`. Its normalized response
contains one result per subject with status, median distance, threshold, usable and
matched counts, no-face/multiple-face/failure counts, and per-frame outcomes. A
profile image must contain exactly one detectable face. Video frames may contain
several faces; the closest ArcFace distance is used and the ambiguity is recorded.
No-face and near-threshold frames are excluded from usable frames. Download and
decode failures remain `unclear`; service/model failures return HTTP 503 so the
TypeScript client can store `not_run` with the actual error.

For a hosted Supabase Edge Function, `FACE_RECOGNITION_URL` must be an HTTPS URL
reachable from Supabase; `127.0.0.1` is suitable only when Supabase is also running
locally. Keep the service private or authenticated and do not expose model files or
image contents in diagnostics.
