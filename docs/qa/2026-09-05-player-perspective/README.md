# Player avoidance, eye camera and bridge-hand correction

User evidence: Desktop screenshot directory, 2026-09-05 22:33:29 and 22:33:41.

- Striking position has priority. A conflicting waiting bay moves to the opposite side, with a smoothed outward sidestep when the travel paths meet. An outward-only clearance correction maintains at least 0.85 m between player roots without crossing the table. Role swaps are covered.
- The automatic 3D camera uses the actual robot eye position for aiming and rising. The 0.85-second follow-through hold remains. The current player's own body stays hidden during first-person observation, including the fully upright pose. Manual free inspection and explicitly chosen 2D views retain control.
- Walking uses an outside third-person camera looking between the player and the table. Arrival blends back to the eyes. Two-finger free view and touch pitch controls remain available.
- The bridge thumb now bends in segments beneath and alongside the shaft. Wrist joints were reduced and moved behind the palm, eliminating the joint previously enveloping the cue.

## Verification

- `corepack yarn lint`, `prettify`, `dev`, `build`, `lint:css`, `audit:origins`: passed.
- `corepack yarn test --runInBand`: 819 tests, 114 suites passed.
- `e2e/player-perspective.spec.ts`: passed. Includes deliberately occupied bays, first-person rising without a visible helmet, third-person walking, return to eyes, and screenshots of the thumb.
- `e2e/responsive.spec.ts`: 12 tests passed, including shot hold, touch pitch, two-finger control and consecutive power resets.
- `browser-evidence.json` records measured separation and camera/visibility assertions.
- Screenshots are from browser mobile-touch emulation. Real phone performance and comfort remain unverified.

Production asset hash and route checks are saved in `release-verification.json` after deployment.

## Production

Released 260905.23 at 2026-09-05 23:17:53 Asia/Shanghai.
Worker version: `9a559b94-1807-492d-8117-56157bb82307`.
Deployment: `dd1f5b5e-d6b2-437d-9d8f-11f9f1d8d8d7`, 100% traffic.
66/66 remote asset hashes match the release. Six page routes return 200; unauthenticated `/api/me` returns the expected 401.
