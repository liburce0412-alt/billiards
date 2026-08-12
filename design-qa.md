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
