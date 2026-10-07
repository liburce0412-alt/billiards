# Design QA

final result: passed

## Sources

- `C:\Users\28219\.codex\generated_images\019ff692-5296-7002-94a1-a71e4bfba3a7\exec-7d7ba33e-d9a9-4b19-a42e-289391d16259.png` — selected Option 1 game shell, table, HUD, and social treatment.
- `C:\Users\28219\.codex\generated_images\019ff692-5296-7002-94a1-a71e4bfba3a7\exec-151cf3a7-b71d-4b78-bed0-4947c2cf5c07.png` — selected Option 3 bottom shot-control dock.
- `C:\Users\28219\Documents\xwechat_files\wxid_kv3404ff2t522_738a\temp\RWTemp\2026-08\9e20f478899dc29eb19741386f9343c8\21329029e7b5786e222dd3bc825bbf5f.jpg`
- `C:\Users\28219\Documents\xwechat_files\wxid_kv3404ff2t522_738a\temp\RWTemp\2026-08\9e20f478899dc29eb19741386f9343c8\b4f2fdc1d2611f18e82a5e5234b2c5ab.jpg`
- `C:\Users\28219\Documents\xwechat_files\wxid_kv3404ff2t522_738a\temp\RWTemp\2026-08\9e20f478899dc29eb19741386f9343c8\99b7808b5c43fb654a1d310da3c74e93.jpg` — SPECTRA paper-white, iridescent live-color material references.

## Captures

- `qa-artifacts/auth-login-desktop.png` (1440×1000)
- `qa-artifacts/auth-login-mobile.png` (390×844)
- `qa-artifacts/launcher-desktop-light.png` (1440×1000)
- `qa-artifacts/launcher-mobile.png` (390×844)
- `qa-artifacts/account-desktop.png` (1440×1000, full page)
- `qa-artifacts/lobby-desktop.png` (1440×1000, full page)
- `qa-artifacts/lobby-chat.png` (1440×1000, selected friend/chat state)
- `qa-artifacts/admin-desktop.png` (1440×1000, full page)
- `qa-artifacts/game-desktop.png` (1440×1000)
- `qa-artifacts/game-mobile.png` (390×844)

## Comparison result

- Full-page comparison: passed. All product surfaces use the same paper-white, mist-blue, low-saturation cyan/violet/peach SPECTRA field, fine dark typography, restrained borders, and soft glass elevation.
- Focused comparison: passed. The game preserves Option 1's upper/table composition and Option 3's complete lower control dock; the Option 1 cue-ball strike-point view is integrated into that dock.
- Density comparison: passed at desktop and mobile. No horizontal overflow at 390 px. The mobile launcher navigation is horizontally contained and the fixed start action remains reachable.
- State comparison: passed for login, selected game mode, account personalization, empty social state, active direct-message state, admin overview, expanded game controls, collapsed social drawer default, and responsive mobile game state.

## Interaction checks

- Auth login/register/reset tabs are keyboard-addressable and switch content.
- Launcher rule and opponent selectors, settings disclosure, and sticky start action are reachable.
- Friend chat opens from an explicit icon button; the direct-message composer and match invite action appear.
- Presence visibility includes online, away, do-not-disturb, and invisible.
- Game shot dock expands/collapses outside an active pull gesture; mother-ball strike point, cue elevation, power pull/cancel, and hit confirmation remain present.
- Game social drawer opens/closes and now defaults to closed so it does not obscure mobile play.

## Runtime and accessibility checks

- The in-app browser was used for local QA.
- Fresh demo pages produced no new console warnings or errors. The only recorded error was from an intentionally superseded static-server request before the auth-preview fixture was added.
- WebGL2 background has static/reduced-motion/low-quality fallback behavior and pauses when the page is hidden.
- Visible icons use the bundled Phosphor icon font; controls carry accessible labels.
- Reference and implementation screenshots were inspected together at matching desktop density, then the implementation was corrected for the launcher background, mobile start action, auth input width, and game social default.

## History

1. Initial launcher capture exposed a retained dark-teal legacy background.
2. Replaced it with the selected light SPECTRA paper field and re-captured.
3. Mobile capture exposed an overly heavy edge-to-edge sticky action; tightened it into a floating glass capsule and contained navigation overflow.
4. Auth capture exposed intrinsic-width text fields; expanded fields to the full card width and re-captured.
5. Mobile game capture showed the social drawer obscuring play by default; changed the account/platform default to collapsed while preserving the user preference.
6. Production review exposed a Cloudflare redirect loop on `/account`, `/lobby`, and `/admin`; removed Worker-side `.html` rewrites and kept canonical extensionless links.
7. Production game capture exposed the old aiming camera, an undersized table, and a flat white environment. Set launcher games to the selected top composition, expanded the Option 3 dock, and added a live GLSL SPECTRA dome plus cue-ball caustic projection.
8. Matching-viewport comparison at 1680×936 showed the selected Option 3 composition needs social as a lower-left floating surface, not a fixed right column. The drawer now opens on demand from the live online control and floats at the lower-left without resizing the table.
9. A second reference pass exposed three missing silhouettes: the deep concave power arc, the bottom-right quarter-circle control cluster, and the selected Option 1 versus card. Those structures now match the references, with live controls wired to spin/elevation/camera/cue selectors.
10. The SPECTRA cue-ball shader was expanded to two animated follow layers, and the ivory table received woven cloth plus separate ice, graphite, and brushed-silver rail/pocket trim.

## 2026-08-13 regression pass

- Final capture: `qa-artifacts/game-hybrid-option1-option3.png` (1680×936).
- Reference comparison: selected Option 1 shell + selected Option 3 control dock + final capture were reviewed together at matching size.
- Composition: passed — the live view now keeps the full table in frame with mild perspective, a separate graphite/silver body skirt, and a full-width versus plate using generated player portraits, ranks, levels, scores, and turn state.
- Controls: passed — the power control now has a double outline, dense major/minor ticks, cyan progress, and an independent glass drag block; the lower-right controls form a complete dual-layer transparent glass disc with an inner cue orbit.
- Table: passed — American ivory now has woven cyan cloth, a visibly thick graphite/silver body, and six layered silver/graphite/ice pocket collars; the inner well is dark blue graphite rather than a flat black cut-out.
- Environment: passed — the GLSL light-space dome remains contrasted; two animated cyan/violet/rose caustic layers follow the cue ball.
- Runtime routes: local regression verification passed; production deploy/version check follows this capture.

## 2026-08-13 liquid-glass fidelity pass

- Intermediate capture: `qa-artifacts/game-liquid-glass-pass1.png` (1680×936).
- The first live WebGL2 control material pass successfully added moving cyan/violet/peach refraction and preserved every DOM control, but the same-viewport review found the power rail still too shallow and the pocket collars too visually subordinate.
- Final capture: `qa-artifacts/game-light-fog-rainbow-compact.png` (1680×936).
- Final comparison: passed for the user-directed material correction. The control dock now reads as transparent liquid glass with a clearly visible warm-orange volumetric fog layer rather than opaque frosted colour; WebGL loss, reduced motion, and low quality retain a static fallback.
- Mother-ball comparison: passed. The effect now follows the cue ball as an asymmetric white water-caustic network, with a compact cyan/violet/gold refraction streak on one edge instead of the rejected blue-violet concentric halo.
- Framing comparison: passed. The top view now reserves visible light-space above the table so the table no longer touches the player matchup panel while keeping the playing surface large.

## 2026-08-13 core silhouette and global material pass

- Final game capture: `qa-artifacts/game-core-final-framed.png` (1680×936).
- Cross-page captures: `qa-artifacts/launcher-global-glass.png`, `account-global-glass.png`, `lobby-global-glass.png`, `admin-global-glass.png`, and `rules-global-glass.png`.
- Reference comparison: passed. The same 1680×936 game state was compared against selected Option 1 and Option 3. The table remains fully visible, the opponent plate has real portraits and full match metadata, the lower-left real-time social drawer is preserved, the concave power rail has its required silhouette, and the lower-right controls are one complete glass disc rather than unrelated buttons.
- Interaction: passed. The shot dock was clicked in the real in-app browser and changed `expanded → collapsed → expanded`; the overlap that initially blocked the toggle was fixed by separating the quick-loadout and toggle stacking layers.
- Fresh-runtime check: passed. A new game tab loaded the production build locally with zero console errors; the motion recovery watchdog now resets after a recovery so it cannot emit the same recovery repeatedly.
- Global material: passed. Launcher, auth, account/personalization, lobby/chat, admin, and rules now share one WebGL2 colored volumetric light-fog renderer per page; translucent panels reveal clearly visible warm orange, cyan, and violet fog while preserving light-theme contrast. Reduced-motion and WebGL fallback behavior remain present.
- Asset fidelity: passed. Two dedicated HUD portrait assets were generated, cropped, optimized to WebP, and stored in `dist/assets/`; letter-avatar placeholders were removed from the match plate.

## 2026-08-13 match HUD and control-geometry pass

- References: `codex-clipboard-e6280d85-b64f-4a2b-be21-5e4b80155e8a.png` for the matchup bar and `codex-clipboard-e7567c08-d271-4517-95ed-8c3f9655883f.png` for the bowed power rail and lower-right disc.
- Match HUD: passed. The bar now has system status, two readable player blocks, a central `0 – 0` scoreline with real rule/turn state, and the online entry. Fixed `LV.28`, invented ranks, and fake latency were removed. Platform avatar/name, AI name and actual `botLevel/11`, and optional server-stamped online avatar data are used.
- Power rail: passed. `PowerArcGeometry` is the shared source for WebGL2/GLSL rendering, the DOM readout/drag block and pointer input. Canvas fallback remains available for low quality or unavailable WebGL. Arrow keys adjust by 1%, Shift+Arrow by 5%, Escape cancels an active gesture, and release still strikes.
- Operation disc: passed. The independent glass orbit was removed; one 380 px liquid-glass disc now owns the inner cue disc and four polar controls. Settings and low-frequency overflow actions were moved above the play field, outside the disc.
- Structural overlap: passed. At 1680×936 and 2048×1080, radial/quick-loadout/menu/power pairwise overlap areas are all `0`. At 1440×900 and 1280×720 the optional quick-loadout collapses and the remaining areas are `0`; at 390×844 the compact control set also reports `0`.
- Responsive states: passed at 2048×1080, 1680×936, 1440×900, 1280×720 and 390×844. Both expanded/collapsed dock transitions and the overflow menu were exercised in the real page. Mobile retains both names, central score and turn state.
- Runtime: passed. The fresh 1680×936 game run produced no console warnings/errors. Real HUD text remained present at every viewport and the forbidden fabricated metadata scan stayed false.

## 2026-08-17 mobile, room-state, and match-chat pass

- Mobile viewport: passed at 390×844 portrait and 844×390 landscape with touch emulation. Normal pages retain vertical scrolling; only the active game root locks to the visual viewport. Primary shot controls, chat entry, and the enlarged elevation control remain inside the visible viewport.
- Landscape controls: passed. The low-height layout now uses one compact glass disc with a shared center for precision aim, spin, elevation, camera, and the central shot action. The quick-loadout is removed from this constrained layout, so it no longer intersects the power rail.
- Portrait fallback: passed. Rotation is recommended but optional; the fallback uses a top view, a separate final row for the control strip, an in-bounds elevation trigger, and no instruction text over the power/control hit targets.
- Room form: passed. The custom room code and invitation link receive full-width rows, the room code limit is consistently 3–24 characters, and the mobile launcher can scroll the fields and final action into view.
- Room lifecycle: passed in a real Durable Object two-WebSocket test. Server-authoritative roles and ready state start the room once, spectators cannot ready or send game actions, disconnect grace is 30 seconds, and empty waiting rooms expire after five minutes.
- Match chat: passed. Messages are structured DOM bubbles with sender/time metadata, unread state, 240-character enforcement, text-only rendering for untrusted content, server-stamped identity, and a composer that follows the visual viewport above the software keyboard.
- Glass material: passed. The bottom dock keeps its WebGL liquid-light layer while the base veil is reduced to 7% and the static/low-quality fallback to 16–24%; edge refraction and local power-rail/label contrast remain intact.
- Visual baselines: refreshed and passed for 360×800, 768×1024, 1200×750, and 1920×1080 launcher states plus low/high game scenes. Functional responsive checks are in `e2e/responsive.spec.ts`.
- Deployment: intentionally not performed. This pass is verified locally and remains ready for an explicitly authorized Cloudflare preview or production deployment.

## 2026-08-26 React control-chamber and preview pass

- React shell: passed. A single `createRoot` owns the application shell, canonical routes and the game mount boundary; `/play` lazily loads the existing Three.js engine through `GameEngineAdapter` without duplicating the physics or render loop.
- Design language: passed. Launcher, account, lobby, admin, rules, help/tools routes and game chrome share the locked paper-white holographic control-chamber tokens. Cyan communicates state, warm orange communicates shot energy, and violet is limited to secondary optical refraction.
- Hallmark review: passed. Pre-emit critique scored `P5 H5 E4 S5 R4 V5`; the 58-gate slop audit found no blocking template, contrast, motion, token, icon, horizontal-overflow or two-line-affordance issue in the new React/game styles. All colour values in those styles now consume semantic tokens.
- Android policy: passed and supersedes the earlier optional portrait fallback. Coarse-pointer portrait renders a rotation gate without mounting the interactive game. At 844×390, the table, HUD and shot dock remain separated; the table occupies at least 60% of the visual viewport and social remains closed by default.
- Table construction: passed. The ivory and metallic table presets now generate four structural legs, four floor feet, a longitudinal brace and two lateral braces. Generated geometry and materials are disposed when the table style changes; top/aim cameras preserve play visibility while free orbit reveals the support frame.
- Browser regression: passed. `e2e/responsive.spec.ts` and `e2e/visual.spec.ts` completed 9/9 checks across portrait gate, low-height landscape, mobile room scrolling, launcher viewports and low/high game rendering.
- Static/runtime checks: passed. TypeScript/ESLint, Stylelint, the table-style test suite, production Webpack build and legacy-origin audit all pass. `/`, `/play`, `/account`, `/app.js`, `/css/react-app.css` and `/api/config` return 200 from the preview worker; anonymous `/api/me` correctly returns 401.
- Cloudflare preview: passed at `https://break-builder-preview.campus3ai-games.workers.dev`, version `6b928577-010b-4ace-89ca-b9bc65777916`. It uses isolated preview D1 and KV resources plus preview Durable Objects and does not share production data. Production routing remains unchanged pending real-device acceptance.

## 2026-08-26 mobile camera, break handoff, and clear-glass pass

- Mobile camera: passed at 915×412 with touch emulation. A two-pointer drag changes the persisted camera preference from `2d` to `free`; centroid motion controls orbit and pinch distance controls zoom. The previous Interact.js gesture handler was removed so the same gesture cannot also change the cue aim.
- Break handoff: passed. The placement state presents a dedicated `确认母球` action above the dock; activating it changes the dock from `placement` to `shot`, enables the power control, and exposes the normal `击球` action. Invalid overlaps now keep placement active and show a corrective message.
- OpticalGlass: passed. The high-quality dock samples the live Three.js scene and applies restrained refraction/dispersion at a maximum 30 fps. Its scene-derived layer now peaks near 20% alpha, while the low-quality/static fallback uses an 8% paper veil. The table and support frame remain visibly continuous behind the dock.
- Table construction: passed in free-orbit capture at `.tmp/design-qa/desktop-legs-fixed.png`. Four legs, floor feet, collars and braces are visible. Generated support geometry now cancels the imported glTF root scale instead of being reduced to approximately 1/17.5 of its intended size.
- First-run layering: passed. The tutorial raises the scene stacking context while open, so its close action is the pointer hit target instead of the lower shot dock.
- Runtime checks: TypeScript/ESLint, Stylelint, 102 Jest suites (735 tests), six Worker tests, four responsive Playwright checks and six refreshed visual baselines pass. The personal UI component library verifier passes all 36 curated modules.
- Hallmark audit: passed after `P5 H5 E4 S5 R4 V5` review. The active surface remains Scene First / Workbench rather than a generic hero-card template; controls preserve single-line affordances, fixed focus states, reduced-motion fallbacks and semantic token use. `final result: passed` remains valid.
- Production deployment: passed at `https://play.campus3ai.xyz`, deployment `973558bd-f522-485a-88bb-978eba490256`, version `37aeae02-926e-41a6-85fb-e1cff0278224` at 100% traffic. The custom domain and `17 3 * * *` schedule are both active. `/`, `/play`, `/account`, the game stylesheet and `/api/config` return 200; anonymous `/api/me` returns the expected 401. Production CSS contains the OpticalGlass, clear fallback and tutorial-layer markers. The unauthenticated account action computes white text on an accent gradient when enabled and dark ink on pale cyan/orange glass when disabled, eliminating the reported white-on-white state.

## 2026-08-26 clean game composition and production pass

- HUD lifecycle: passed. The React preparation status now unmounts after the engine resolves, so it cannot cover the central score and turn state. The top online entry remains inside the match HUD; the duplicate lower-left social dock was removed.
- Table pockets: passed. The generated six-ring/twelve-torus pocket decoration was removed. The ivory table keeps twelve linear silver/ice rail details, while the real pocket wells and table support geometry remain intact.
- Shot composition: passed. The default aim camera uses a 34-ball-radius distance and 15-ball-radius height, showing a readable length of cue fore-end. Desktop right/middle drag and wheel, plus mobile two-finger orbit and pinch, still switch into the persisted free camera.
- Control cleanup: passed. The lower-right radial console no longer exists; precision aim and camera actions moved to the compact overflow menu, while the quick loadout occupies its own desktop grid track.
- Mobile power rail: passed. At 915×412 the rail is 560×80 px; at 844×390 it is capped at 500 px wide and 62 px high. Both retain the shared curved input geometry and stay within the visual viewport. The 915×412 HUD is 55.6 px high, the dock is 107.1 px high, and the scene-safe band remains at least 60% of the viewport.
- Hallmark review: passed after `P5 H5 E4 S5 R4 V5`. The scene-first atmospheric game HUD removes redundant chrome, preserves clear hierarchy, keeps the top and bottom glass surfaces transparent, and passes the responsive, contrast, token, reduced-motion and single-line affordance gates.
- Automated regression: passed. TypeScript/ESLint, Stylelint, 102 Jest suites (736 tests), six Worker tests, five responsive Playwright checks and six refreshed visual baselines pass. The complete Playwright run reports 11 passed and one opt-in online test skipped.
- Production deployment: passed at `https://play.campus3ai.xyz`, version `890d2eb2-f43d-4eaf-96f9-b1c44c9e4abd` at 100% traffic. `/`, `/play`, `/account`, `/css/game-react.css` and `/api/config` return 200; anonymous `/api/me` correctly returns 401. The live stylesheet contains the 560 px and 500 px mobile power-rail caps.
- Preview cleanup: passed. Worker `break-builder-preview`, D1 `break-builder-preview` (`ac31f56b-660c-43a2-9750-dc7d9654920d`) and KV `break-builder-preview-avatars` (`a67e5384237e480783cfc1227f85efa6`) were permanently deleted. The preview URL returns 404; production D1 `f18fdb66-ea7c-49d7-ab5c-ed8e3ce200ca` and KV `3240ae47831e4fc691de1d2803635ffe` remain present.

## 2026-09-01 night arena, identity, and demo-assist pass

- Platform visual direction: passed. Launcher, account, lobby, and admin now use a deep-graphite night-arena control deck with cyan state and restrained warm-orange commitment; the luminous game surface remains unchanged for aim readability.
- Hallmark review: passed after `P5 H5 E5 S5 R5 V5`. The launcher uses a split match desk, while the task pages retain focused control dossiers. Contrast, semantic tokens, reduced motion, focus states, single-line actions, and 320–1920 px overflow rules were reviewed; legacy chat and reduced-motion panels were corrected for dark-surface contrast.
- Physics regression: passed. Sliding friction now interpolates exactly to zero surface slip before switching to rolling, preventing the tiny reverse-slide loop that previously reached the 45-second motion watchdog. Two bounded-settling regression tests cover side-spin and low-speed drift.
- Verified HUD identity: passed. The React session publishes server-verified display name, avatar URL, username, user ID, and role before mounting the game. Browser tests require `未来玩家` and `@future_player · ID 00000000` in the match HUD.
- Administrator demo assist: passed. The admin-only local setting persists an invisible enable switch and 1–11 strength. Level 11 executes a real local shot through the normal aim/controller path. A dedicated guard test keeps the feature disabled in online rooms and for non-admin identities.
- Automated regression: passed. TypeScript/ESLint, Stylelint, 104 Jest suites (743 tests), two Worker suites (six tests), the production Webpack build, and 16 Playwright browser checks pass. The external live-room browser test remains intentionally opt-in and was skipped; Durable Object two-socket readiness and spectator restrictions pass locally.
