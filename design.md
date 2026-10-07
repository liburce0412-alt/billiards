# Design — Break Builder 3D

A locked, product-wide interface system. Every product page and game overlay reads
this file before visual changes are made. Extend this system deliberately; do not
invent page-local themes.

## Direction

- Route: custom, bespoke
- Idea: a daylight match desk with actual environment previews, surrounding a luminous real-time billiards table
- Voice: precise, calm, kinetic when the player commits to a shot
- Audience: desktop and recent Android players who need to enter, join and play quickly

## Macrostructure family

- Entry and onboarding: Split Studio — concise product promise beside the playable setup workbench
- Product pages: Workbench — information and actions stay visible around the task being performed
- Content and help: Long Document — readable continuous content with restrained navigation
- Game: Scene First — the table owns the viewport; interface occupies measured safe bands around it

## Theme

- Platform canvas: paper white and restrained mist blue; dark ink for all primary text
- Structure: one readable panel layer with ice hairlines; dark framing is reserved for scene previews
- Primary signal: electric cyan for selection, connection and focus
- Energy signal: warm amber-orange for power, urgency and committed shot state
- Optical colour: violet appears only as scene-derived dispersion, never as a permanent painted border
- Materials: restrained daylight glass on navigation, solid readable forms, OpticalGlass within the game

The canonical OKLCH values and every exported implementation token live in
`tokens.css`. Raw colours and page-local font declarations are not allowed.

## Typography

- Display: Tomorrow, weight 700, roman
- Body: IBM Plex Sans, weight 400
- Mono/outlier: IBM Plex Mono for room codes, diagnostics and tabular state only
- Headings use tight tracking and no italic emphasis
- Body copy stays at 16px or larger; interactive labels never wrap

## Spacing and geometry

- Four-point named spacing scale
- Touch targets: 44px minimum; primary shot action: 56px minimum
- Surfaces use asymmetric composition and one containment layer
- Scene, HUD, controls, drawer, modal and notification use named z-index levels only
- Root pages use `overflow-x: clip`; ordinary pages scroll vertically

## Motion

- UI motion communicates entry, state or direct manipulation; decorative UI loops are prohibited
- Button feedback: 100–150ms; popovers: 180–220ms; drawers: 250–300ms
- Only transform and opacity animate during frequent interactions
- Reduced motion keeps state changes but freezes ambient drift and removes spatial reveals

## Microinteractions

- Success is silent when the result is visible
- Clipboard actions replace their own label with “已复制” instead of opening a toast
- Errors explain what failed and what the player can do next
- Hover has a focus/tap equivalent; touch controls use pointer capture and ignore extra touches

## Responsive contract

- Ordinary pages work at 320, 375, 414 and 768 CSS pixels and can scroll to every action
- Android play requires landscape; portrait shows a non-playable rotation gate
- Fullscreen and orientation lock are requested only from an explicit user gesture
- Browser-landscape fallback uses `visualViewport`, safe-area and keyboard insets
- In landscape, the scene uses at least 60% of visible height; HUD stays below 14% and controls below 28%

## Shared component voice

- Navigation: compact system rail with an explicit destination/status control, never a generic SaaS link row
- Primary action: solid or emphasized glass with one verb and warm energy only when commitment is required
- Secondary action: transparent titanium outline
- Forms: visible labels, fixed border width, stable helper/error slot and 44px minimum height
- Footer: mast-headed legal/identity close; no four-column generic sitemap

## Product boundaries

- React owns page and overlay DOM.
- Three.js, deterministic physics, rules and AI remain imperative behind `GameEngineAdapter`.
- Identity, room membership, readiness, invitations and chat authorship remain server-authoritative.
- Google/Naver verification files remain raw static assets.
