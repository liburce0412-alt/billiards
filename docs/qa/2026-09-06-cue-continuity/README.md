# Cue continuity — 2026-09-06

Fixed the visible jerk before contact and the backward snap at contact:

- Keep the settled cue still instead of oscillating and snapping to the preparation origin.
- Preserve the existing crouched stance on shot release. Small aim corrections no longer force walking or briefly hide the cue.
- Pause preparation when readiness is lost, preserving its position; resume the same stroke once ready.
- Continue forward from the preparation endpoint on the same axis, then hold until the next aiming phase. Preserve the one-second post-contact hold and opponent overhead view.

Regression evidence before the fix: five new assertions failed, including a 0.06623 m contact discontinuity and forced walking after a small aim correction. Evidence: `.tmp/cue-continuity-before.log`.

Validation: 843 tests / 116 suites; 21 browser regressions; format, lint, CSS lint, dev, production build and origin audit passed. The first browser run lacked Playwright's video encoder; installing its local ffmpeg runtime enabled the two recording tests, which then passed. No application failure was suppressed.

Mouse: 421 preparation/shot frames, 212 forward/contact frames, zero hidden cue frames or backwards steps. Touch: 420 preparation/shot frames, 209 forward/contact frames, zero hidden cue frames or backwards steps. Robot/admin tests separately sample actual physical contacts and require arrival, settled stance and visible cue before any impulse.

`index.html` contains mouse/touch videos and screenshots. Browser checks use local Chrome with touch emulation, not a physical phone or an authenticated production match.

Deployed to https://play.campus3ai.xyz/play

- App label: 260906.21 (the existing hourly version label is unchanged within this hour).
- Worker version: 1325bc2d-e190-4828-ac04-a4efa499a0ef
- Deployment: bf6a9249-7149-405f-a6ff-1074aca7fa0b
- Created: 2026-09-06T13:31:28.00894Z, 100% traffic.
- All 66 production asset hashes match the build. Six page routes return 200; anonymous /api/me returns 401 as expected. See release-verification.json.

Previous cache cleanup remains blocked by tool policy; this fix does not bypass that rejection or remove source, prior QA evidence, settings or backups. No WeChat notification was sent.
