# Cyber players release — 260905.22

Implemented two distinct cyber billiards players in Three.js. Bevelled chest and limb armour, optical helmets, mechanical joints, articulated bridge fingers, planted bridge hand and animated rear hand. The player holds the strike posture for 0.85 s and rises gradually. Players travel along the outside perimeter; the waiting player occasionally chalks a cue. Near-eye body hiding is restricted to the player's own viewpoint. Hidden cues also hide their projected shadows.

The pose follows cue orientation/elevation; decorative animation does not alter physics or delay inputs. Robot geometry uses a maximum of 22 instanced batches across both players, without a remote model download or a new runtime dependency. This is a stylized mechanical model with procedural poses, not motion capture or a physically constrained humanoid solver.

The two cyber cue styles now have separate mechanical chassis geometry and emissive cores. Wood and carbon shaft channels use 256 × 1024 procedural textures. Eight existing themed architectural sets gained additional structures; low-quality detail counts retain their existing geometry budget.

## Verification

- `corepack yarn dev` and `corepack yarn build`: passed.
- `corepack yarn prettify`, `corepack yarn lint`, `corepack yarn lint:css`: passed.
- `corepack yarn test --runInBand`: 816 tests / 114 suites passed.
- `corepack yarn test:e2e e2e/robot-showcase.spec.ts e2e/responsive.spec.ts`: 13 passed, covering touch aiming, primary 2D/3D switch, consecutive power reset, camera hold/return, render lifecycle, both robots, materials and eight environments.
- `corepack yarn audit:origins`: passed.
- Targeted bridge-hand test repeated using the actual maximum power: passed.
- Actual WebGL screenshots and an 8-second shot recording are linked from `index.html`.
- Real phone/GPU performance and subjective touch comfort remain unverified. Browser touch emulation is not device acceptance.

## Tool and asset evaluation

Reviewed the official [Quaternius Cyberpunk Game Kit](https://quaternius.com/packs/cyberpunkgamekit.html), CC0, and rendered its Blender-exported humanoid glTF. Its cartoon jacket silhouette did not match the intended armoured billiards players. No third-party model from that evaluation is shipped. The current rig and hard-surface geometry are authored in the existing Three.js renderer, with no new plugin or runtime model service.

Deployment and remote asset integrity evidence is recorded in `release-verification.json` after publication.

## Production release

Published to https://play.campus3ai.xyz/ on 2026-09-05 at 22:19 (Asia/Shanghai).

- Worker version: `18ab6715-56f8-4f8f-b4ab-0053fa05251b`
- Deployment: `5e2a83fe-8ed7-4a42-a8b8-b94a924915b4`, 100% traffic.
- 66/66 remote asset hashes match the local release; all six checked page routes return 200 and unauthenticated `/api/me` returns the expected 401.

A clean production mobile browser session reaches the expected private-account login page. The demo query is not a production authentication bypass. Authenticated production gameplay was not exercised; local gameplay validation plus remote asset hash matching are the release evidence.
