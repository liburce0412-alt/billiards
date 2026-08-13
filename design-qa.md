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
