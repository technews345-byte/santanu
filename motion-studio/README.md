# Motion Studio

A character-image + driving-video motion transfer app using hosted Kling V3 Motion Control. This repository contains the responsive TypeScript frontend, FastAPI backend, persistent job worker, ffmpeg pipeline, schema snapshots, tests and Docker setup. No video generation model runs locally.

**Status:** the frontend, backend and media pipeline have been exercised end to end with the MockProvider. Live fal generation, licensed identity inference, production matting and outpainting have not been verified. See [TEST-REPORT.md](TEST-REPORT.md) and [Deviations](#deviations) before treating this as a finished production system.

## Run the complete app

Requirements: Docker Engine + Compose. From this folder:

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:8080. The API serves the compiled frontend at the same origin. Postgres persists jobs, assets, segments and face checks. Redis/RQ persists work. Media uses a shared named volume. The default `MOTION_PROVIDER=mock` costs nothing and **returns the driving clip unchanged**; it is not motion transfer. The UI labels it as a demo.

For local development without Docker, install Python 3.11+, Node 22+ and ffmpeg/ffprobe:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
npm ci
npm run samples
npm run build
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Open http://localhost:8000. With no `DATABASE_URL`/`REDIS_URL`, local development uses SQLite and an in-process background thread. This mode resumes saved jobs on a single API process restart. Do not use multiple API processes in this mode. For frontend hot reload, run `npm run dev`; Vite proxies `/api` to port 8000. Environment values in `.env` are consumed by Compose; for direct Python execution export selected variables in your shell. Do not source untrusted env files.

The published private preview has no Python runtime and uses a clearly marked browser demo with IndexedDB history. Studio settings can connect it to an HTTPS backend, with an explicitly allowed frontend origin. The Docker deployment is the full application.

## GitHub server / Codespaces

GitHub stores source and runs CI. GitHub Pages cannot run Python, ffmpeg, a queue worker or Postgres. A Codespaces configuration is included at `.devcontainer/motion-studio/devcontainer.json` in the parent repository. In GitHub **Code → Codespaces → New with options**, select the motion-studio configuration on the `codex/motion-studio` branch. It installs dependencies, builds the frontend and starts the API on forwarded port 8000. Keep that port private. The mock flow works without a paid API key. A Codespace stops when idle and is a development server, not durable production hosting.

For continuous hosting, deploy the Compose stack to a Linux server (at least 2 vCPU / 4 GB RAM as an initial CPU-only configuration; model inference may need more). Put it behind a reverse proxy with HTTPS, keep database/Redis ports private, back up Postgres/media, and provide server secrets. Never expose the unauthenticated development configuration.

## Enable real Kling generation

1. Set `MOTION_PROVIDER=fal`, `FAL_KEY` on the **server** and `APP_AUTH_TOKEN` to a strong private-studio token. Set `APP_ENV=production` and a strong `MEDIA_SIGNING_SECRET`.
2. Configure a publicly reachable S3/R2 bucket using `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Inputs are uploaded server-side and passed as signed GET URLs. The optional Compose MinIO profile is internal/local development storage; fal cannot read its private `minio:9000` hostname. Create the local bucket in the MinIO console if testing that profile.
3. Optionally set `PUBLIC_WEBHOOK_URL=https://your-domain/api/webhooks/fal`. Webhooks use the documented ED25519 JWKS signature, timestamp and raw-body hash verification. Polling remains the authoritative completion fallback. Never disable signature verification.
4. Keep the schema/model IDs synchronized. Run `sh scripts/refresh-schema.sh`, review the schema diff, then rebuild. The checked-in TS types were generated from the live schemas fetched on 26 October 2026. Python validates request payloads against those same snapshots and rejects extra fields.
5. Update `PRICE_STD_PER_SECOND` and `PRICE_PRO_PER_SECOND` to your provider's current prices. The initial config examples are $0.126 and $0.168 per second; they are estimates, not a billing contract. Configure `USER_SPEND_CAP_USD` before submitting. Provider work already started may still be billed after cancel or timeout.
6. Open Studio settings and supply `APP_AUTH_TOKEN` (not FAL_KEY). Submit a short consented clip and check provider balance, returned media metadata and identity report before broader use.

**No live key was present during this build; no paid Kling job was submitted.** A real end-to-end request must be validated after configuring credentials/storage. The adapter itself and exact submitted request fields are covered by mock/contract tests.

## Input and output behavior

- JPG/PNG bytes are decoded and verified; MP4/MOV uses ISO-BMFF signature + ffprobe. Image limits are 10 MiB, 340–3850 px per side and aspect 0.4–2.5; driving video starts at 100 MiB and 340–3850 px per side. These follow the captured fal constraints. A 45 s input is accepted locally for segmentation.
- Uploads require session consent; consent text and timestamp are stored with each job. Image/reference uploads run CPU face detection and blur/size checks. A licensed YuNet ONNX detector enables five landmarks and a rough yaw estimate. Coverage/occlusion and pose checks are explicitly unavailable, not fabricated.
- Match video is default, accepts 3–30 s and automatically binds one face element. Match image accepts 3–10 s and sends no element, with an explicit reason in the UI.
- The live element is `elements: [{ frontal_image_url, reference_image_urls }]`. Up to three additional image URLs are sent. The best measured source/reference rank selects the frontal image; if no separate angle image is provided, that frontal URL also fills the required reference list. The provider may prefer genuine angle references. All uploaded images remain available for post-checking.
- No `aspect_ratio`, `resolution`, `duration`, `fps`, `seed` or `negative_prompt` is sent to fal. Ratio is a non-distorting crop of the character image. The backend rejects a crop cutting a detected face. 720p/1080p UI choices select standard/pro model IDs; actual output dimensions are measured and shown. The captured endpoint schema only says pro is higher quality; it does not itself confirm exact 720p/1080p pixel dimensions. Treat these as tier labels pending a live output check.
- The prompt preview displays environment + fixed identity wording + positive static-scene/camera intent. Appearance-change clauses are stripped heuristically, not by a semantic model. Motion verbs trigger a warning with a removal action. Edit the final prompt deliberately; heuristic detection is not exhaustive.
- Videos exceeding the selected limit require explicit split approval. Frame-balanced segments are refined to low-motion cuts, respect the 3 s minimum and a configurable 28 s cap. An eligible 30 s Match video clip remains one job. Hard cuts stream-copy output frames and remux original continuous audio when requested. No retiming or crossfades are applied.
- Duration, fps and decoded frame count are compared with a one-frame tolerance. Differences are reported; the output is never silently corrected. VFR matting is skipped to preserve timestamps; VFR segmentation needs additional validation.
- Every backend output gets `comment=AI-generated with Motion Studio` MP4 metadata. A visible watermark is optional. This is not signed C2PA Content Credentials.

## Vision model configuration

No identity or matting weights are downloaded automatically. Mount approved weights into `/models` and set paths:

| Variable | Purpose |
| --- | --- |
| `FACE_DETECTOR_ONNX` | OpenCV-compatible YuNet detector with five landmarks |
| `FACE_EMBEDDING_ONNX` | ArcFace-style aligned RGB 112×112 NCHW ONNX embedding model |
| `FACE_MODEL_LICENSE_CONFIRMED` | Set `true` only after verifying your model's rights and requirements |
| `RVM_ONNX` | Official-compatible recurrent Robust Video Matting ONNX model (`src`, `r1i`…`r4i`, `downsample_ratio`) |

OpenCV Haar detection provides a lightweight fallback for frontal face size/blur checks. It has no landmarks and **cannot enable identity scoring**. Missing weights/references produce **Review — identity check unavailable**, never Pass. InsightFace code is MIT, but its distributed pretrained recognition models/training data are restricted to non-commercial research; arrange a suitable commercial licence or supply another properly licensed model before commercial use. RVM has its own licensing obligations; assess the exact weights and integration before distribution.

Face scoring normalizes embeddings, selects the maximum cosine match against source + all references per sampled frame, and reports minimum, mean, percent under threshold, missing-face timestamps and weakest frames. Default threshold .45 is uncalibrated. Default sampling is .5 s capped at 60, distributed over long videos. Missing-face frames are excluded from failed scores. If every sampled face is missing, scoring is unavailable. Partial face disappearance is reported separately and can require human review even when scored frames pass.

Matting composites onto mid-grey, remuxes original audio and checks timing. Missing/failed matting falls back with a warning. A selected multi-person input instead stops if isolation fails, so another person is not silently sent as the selected performer. Current component selection uses the chosen preview rectangle; crossing or large translations are not robustly tracked.

## Jobs, safety and security

Job stages are named, with elapsed time and no fabricated percentage. ETA uses the median of completed jobs of the same tier with duration within five seconds; no history means “Not enough history.”

The submit key is unique per user, request fingerprints reject key reuse with different settings, and budget reservations are serialized. Provider request IDs and segment handles are saved before subsequent work. A crash or transport error during an ambiguous paid POST **does not automatically resubmit**: it becomes “Needs review,” prompting provider-dashboard reconciliation. Read-only status/result calls retry network and 5xx failures with backoff; safety, validation and quota failures never auto-retry. This is a deliberate duplicate-charge safeguard. A single worker deployment is supported; distributed worker failover still needs further testing.

Rate limits apply by private-studio user and connecting IP; Redis shares limits between API processes when configured. This is a single-user studio, with one optional server access token; it does not implement multi-user identity or billing. Do not trust arbitrary forwarded-IP headers. Backend media links are signed bearer URLs with configurable expiry; access logs are disabled in the launch commands to avoid logging those tokens. Signed S3 URLs are only passed from the backend to fal. Frontend assets never contain provider keys.

Retention worker deletes expired jobs, local media and the corresponding S3 prefix; configure a matching bucket lifecycle as a second protection. Delete removes output and inputs not used by another job. The spending budget is conservative: reservations count failed/cancelled jobs because provider charges can still happen; reconcile actual provider spend before resetting it. See limitations below for accounting requirements.

## Configuration

All settings are in `.env.example`. Important groups:

| Group | Variables |
| --- | --- |
| Provider | `MOTION_PROVIDER`, `FAL_KEY`, `FAL_MODEL_STD`, `FAL_MODEL_PRO`, `PUBLIC_WEBHOOK_URL` |
| Runtime | `DATA_DIR`, `DATABASE_URL`, `REDIS_URL`, `APP_ENV`, `APP_AUTH_TOKEN`, `ALLOWED_ORIGINS` |
| Storage | `S3_*`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MEDIA_SIGNING_SECRET`, `SIGNED_URL_SECONDS`, `RETENTION_DAYS` |
| Cost/wait | `PRICE_*_PER_SECOND`, `USER_SPEND_CAP_USD`, `SEGMENT_TIMEOUT_SECONDS`, `SEGMENT_HARD_CAP` |
| Media | `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES`, `MIN_IMAGE_DIMENSION`, `MAX_IMAGE_DIMENSION` |
| Face checks | `FACE_MIN_PX`, `FACE_BLUR_THRESHOLD`, `FACE_MAX_YAW`, `FACE_SIMILARITY_THRESHOLD`, `FACE_SAMPLE_INTERVAL`, `FACE_MAX_SAMPLES` |
| Experiments | `IDENTITY_CLAUSE_ENABLED`, `MOCK_DELAY_SECONDS`, `POLL_INTERVAL_SECONDS` |

Default credentials in `.env.example` are local placeholders. Replace them before deployment, including the Postgres password in both the database URL and Compose environment. The spend cap is an application guard, not a provider-side hard billing limit.

## Swap the provider

Implement `MotionProvider` in `backend/app/providers.py`: `submit`, `status`, `result`, `cancel`, plus capabilities. Preserve the request ID and authoritative queue URLs in serializable handles. Add its own schema and types, capabilities/config route, error mapping, webhook verification and contract tests. Change the `provider()` factory and server capability source together. UI behavior reads the server capabilities. No second paid provider adapter is shipped; the optional direct Kling adapter was not implemented.

## Tests

```bash
npm test
npm run build
python -m pytest backend/tests -q
python scripts/check-secrets.py
```

The 8/12/45 s fixtures are generated by ffmpeg, not downloaded or paid. See [TEST-REPORT.md](TEST-REPORT.md) for the precise acceptance scope, blocked checks and browser verification. GitHub Actions runs frontend tests/build, Python tests, secret scan and a container build. CI is not a deployment and does not submit paid requests.

## Deviations

1. **React + Vite instead of Next.js.** The UI is a client-side studio; FastAPI serves both API and built assets at one origin. This avoids an unnecessary second server runtime while retaining TypeScript.
2. **Live E2E unavailable.** No fal key, public S3 configuration or always-on production host was supplied. Mock E2E works; live generation and exact tier dimensions remain unverified. The hosted preview is explicitly a browser demo.
3. **Fal element references:** live schema accepts one element, a frontal image, and 1–3 reference images, not four additional angles. The UI accepts four extras for checks, but binding sends at most three angles plus its chosen frontal image. Schema snapshots/types are included.
4. **No outpainting.** A model/provider and schema were not configured. Crop works; “Extend background” is unavailable and cannot charge or pretend to extend. A complete outpainting adapter, pixel-paste verification and approval workflow remain to be implemented.
5. **Vision weights not bundled.** Real commercial identity scores and matting require legally usable weights and calibration. Optional ONNX execution paths exist but were not validated against real weights. Fallbacks explicitly report unavailable or warn; mock scores are not presented as real identity scores.
6. **Incomplete vision warnings.** Face size/blur and optional landmark yaw checks exist. Reliable occlusion, stylization, head obstruction, body coverage <5%, pose/framing mismatch and robust multi-person tracking are not implemented. HOG people detection is a limited preview-frame heuristic, not a production pose model.
7. **Multi-person isolation is experimental.** A selectable preview and component masking path exist, but crossing subjects/large motion are not robust. The real two-person masking acceptance test is blocked until a configured matting model and real footage are available. Single-person footage is recommended.
8. **No automatic pose seam/background stability score.** Per-segment identity checks exist. Seam pose scoring and background-change detection are unavailable and reported. VFR segment timebase handling needs dedicated real-phone validation.
9. **No identity-clause A/B test.** A configuration switch is provided; a paid, consented calibration set and licensed scorer are required. Thresholds are starting points.
10. **No C2PA.** Output metadata marks AI generation, but is not cryptographically authenticated Content Credentials. Visible watermark is optional.
11. **Single-user authentication.** One private studio identity and optional bearer token, not per-account login. Production mode refuses unauthenticated API use. Multi-user auth, migrations and account-specific budget administration are future work.
12. **No auto-retry of ambiguous submissions.** Unlike blanket retry guidance, a POST interrupted before receiving the request ID cannot be safely duplicated without provider-supported idempotency. It is held for reconciliation. Status/result GETs do retry.
13. **Spending accounting is conservative reservation, not settled billing.** A separate durable ledger retains reservations after failed/cancelled/deleted jobs. Actual provider-charge reconciliation and multi-user budget administration are not implemented.
14. **No Docker daemon in build environment.** Host-native frontend/backend/mock media tests were run; Compose is supplied and a container CI job is configured, but a successful local Docker build is not claimed.
15. **Model tier dimensions:** live schema/docs retrieved here describe quality tiers without an explicit pixel-dimension guarantee. 720p/1080p are UI tier labels from the brief; returned dimensions are inspected instead of enforced/resampled.

## Provider evidence

Retrieved 26 October 2026, before request adapter implementation:

- [Pro live OpenAPI](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/pro/motion-control)
- [Standard live OpenAPI](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/standard/motion-control)
- [Motion Control API and element schema](https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control/api)
- [fal queue webhook/signature verification](https://fal.ai/docs/documentation/model-apis/inference/webhooks)
- [fal motion-control pricing overview](https://fal.ai/kling-motion-control)
- [InsightFace code vs pretrained-model licensing](https://github.com/deepinsight/insightface#license)

Provider documentation examples are used only as clearly marked illustrative inputs. Run `npm run samples` to fetch them; substitute cleared media for commercial launch.
