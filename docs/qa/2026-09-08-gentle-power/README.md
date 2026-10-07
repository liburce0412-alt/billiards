# Gentle power control

Human control response is now r * (0.15 + 0.85 * r), reserving more travel for low-speed shots. Zero stays zero and full charge keeps the 17 m/s pool ceiling. 1% gives 0.026945 m/s; 10% gives 0.3995 m/s. Existing physical-speed APIs, AI, replay, and networking stay linear. All human slider, wheel, keyboard and restoration paths use the new curve; physical aim updates use its inverse for stable displayed charge.

Chrome mouse and touch-emulation 10% shots both produced 0.399500 m/s initial speed and 0.391284 m displacement on the pool profile. Actual real-device feel remains unverified. See mouse.json and touch.json.

848 unique unit tests are passing across the full-suite run and focused rerun: three old linear-display expectations were updated to verify recovered physical speed; final controller/spectator rerun passed 46 tests. The power-control tests check monotonicity, round-trip display and unchanged physical-speed API.

16 browser checks passed across the initial 15 and focused consecutive-turn rerun. That test's drag was increased to reach the rack with the new gentle curve; a short shot correctly failed to reach the rack and entered ball placement, instead of the Aim state the test expected. Production behavior was not changed to suppress that foul.

Format, lint, dev, build, CSS lint, and origin audit checked before deployment. Production verification is recorded separately in release-verification.json.

Deployment verified: app 260908.15; Worker 2b85b039-ac3d-47e3-b4bb-2c5ce8405e7e; deployment 6e973602-64bb-4bf8-b829-20d8933a8664 at 2026-09-08T07:40:28.733551Z, 100% traffic. All 66 assets match the build. Six public routes return 200; anonymous /api/me returns 401.
