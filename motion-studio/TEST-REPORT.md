# Motion Studio acceptance report

Date: 26 October 2026. Runtime: Node 24, Python 3.12, ffmpeg 6.1 on the build host. Docker targets Node 22 / Python 3.11. Live fal credits were not used.

## Automated results

- **7 frontend tests passed** (`npm test`): capability-driven limits, 12 s image-mode block/switch/split, segment counts, orientation-specific element references, appearance clause removal, positive prompt fallback, timing drift detection.
- **16 backend tests passed** (`python -m pytest backend/tests -q`): actual ffmpeg media processing through HTTP TestClient; tests cover uploads/consent, 8 s jobs, 45 s split/stitch, idempotency, failed history/retry, all simulated failure classes, schema validation, low-motion cuts, score aggregation, face thresholds, matting fallback, signed media and signed webhook verification. One upstream Starlette/AnyIO deprecation warning; no failing tests.
- **Production frontend build passed** (`npm run build`): TypeScript check + Vite build.
- **Built frontend secret scan passed** with a fake server-secret sentinel. No configured server secret values were present in public build assets. This does not substitute for inspecting a real live-provider network trace.
- Python modules compile. Docker execution unavailable on this host; CI includes a Docker build job.

## Required acceptance matrix

| Requirement | Result | Evidence / limitation |
| --- | --- | --- |
| 8 s Match video, duration/fps within one frame and displayed | **Pass in mock E2E** | Generated 360×640 / 24 fps input; downloaded backend output = 8.000 s / 24 fps / 192 frames. Input/output columns are implemented. Real Kling behavior not verified. |
| 8 s Match image; face lock unavailable with reason | **Pass in mock E2E + browser** | Request has no element / `@Element1`; result binding null. Browser displayed “Element binding requires Match video. Identity relies on the character image.” |
| 12 s Match image blocked, switch/split options | **Pass API + frontend logic** | HTTP 422 with `canSwitch` and `canSplit`; UI fix actions implemented. |
| 45 s Match video split, warned, stitched with exact total | **Pass in mock E2E** | Approval required; two valid segments; hard-cut output = 45.000 s / 24 fps / 1080 frames. Visible seam warning; no retiming. |
| Two people, picker and other person masked | **Not accepted yet** | HOG preview detector + picker + optional RVM component isolation implemented. No configured real matting weights or two-person footage verification; robust subject tracking absent. Blocks selected-person generation if isolation is unavailable/failed. |
| Small/blurry face warned before generation | **Pass threshold logic; real accuracy unverified** | CPU detector path available. Deterministic 60 px / flat-blur detector fixture produces both warnings. Actual landmark/yaw/occlusion model accuracy not established. |
| Correct and wrong real face give distinct scores, wrong flagged | **Blocked** | No licensed identity weights. Aggregation flags .8 Pass vs .1 Fail and excludes missing-face timestamps, but these are numerical fixtures, not real face recognition. UI returns Review/unavailable without weights. |
| No API key in frontend files/network/logs | **Partial** | Build scan passed with fake sentinel; frontend contains no fal credential route. Provider request/network/log inspection needs a real backend/key. No access logs in launch commands. |
| Simulated failure, retry, double click creates one job | **Pass mock API E2E** | Safety rejection retained with plain message; new-key retry succeeds; identical keys return one job and one segment. Other failure classes tested. Browser demo also offers failure selection. |
| Provider lacks negative prompt support | **Pass contract** | Captured fal payload has no negative field; positive “Static camera” fallback. Schema rejects fabricated `fps` field. |
| 390 px viewport, controls reachable/readable | **Browser checked** | Narrow iframe inspected; initial 390 px outer frame gave 375 px content due scrollbar, with contentWidth = viewport (no horizontal overflow). Typography increased after inspection. Exact 390 px content harness included. Native phone/touch, large text and full accessibility audit remain untested. |

## Other verification

ED25519 webhook tests accept a valid raw-body signature and reject altered bodies, missing/invalid signatures and expired timestamps. Signed media rejects invalid signatures. Invalid file bytes cannot be accepted just by naming them PNG.

Mock outputs are visibly labeled and replay input footage. They do not validate image animation, face preservation, background replacement, output tier resolution or generation quality.

## Still required before production acceptance

Run a paid 3–8 s live request with public signed object URLs; verify status/webhook/result contracts and dimensions; validate licensed YuNet/ArcFace/RVM weights and commercial rights; calibrate face scores; complete missing pose/occlusion/seam checks and outpainting; test real multi-person and VFR phone clips; run Docker/Compose and restart/Redis recovery tests; review HTTPS/auth/rate limits/budgets/retention under deployment conditions.
