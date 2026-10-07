# Immediate human shot — 2026-09-06

User clarification: the one-second pause belongs AFTER contact, not after pressing or releasing the shot control.

Human input now bypasses the automated preparation. If the shooter is ready, contact, physics impulse and post-shot camera/robot hold begin in the same request. If not yet ready, the request waits for arrival/readiness and strikes on its first ready update, with no extra backswing or settle timer. AI and administrator assist retain their visible arrival/aim/stroke sequence. The one-second post-contact hold is unchanged.

Validation:

- 846 unit tests in 116 suites passed, including same-call contact, first-ready-frame contact and preserved assist preparation.
- 17 browser regressions passed: mouse/touch release timing, cue visibility and continuity, one-second post-contact hold, real bot and assist contacts, chalk animation, responsive controls and repeated shots.
- Measured mouse release to contact: 1.8 ms. Touch emulation: 4.3 ms. Both shooters were ready at release; neither entered the automatic pre-stroke animation.
- Format, lint, dev build, production build, CSS lint and origin audit passed.
- Local Chrome with touch emulation and demo data; not physical-device or authenticated production play acceptance. See videos and JSON in index.html.

Deployment:

- https://play.campus3ai.xyz/play
- Worker version 1491f488-1f4f-49c1-862f-30085e854d43
- Deployment 2ce368d2-678f-4f49-b8da-21f3bf2c4533 at 2026-09-06T13:45:36.614634Z, 100% traffic.
- Hourly app label remains 260906.21.
- All 66 online asset hashes match the new build; six public pages return 200 and anonymous /api/me returns 401. See release-verification.json.

No prior evidence, source, settings or backups were deleted. No WeChat notification was sent.
