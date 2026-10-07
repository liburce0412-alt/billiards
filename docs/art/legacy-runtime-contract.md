# Existing billiards art and Blender handoff

The source inventory has **100 exports**: 11 cues (including custom), 24 actual
Rack ball variants, 48 tables (8 finishes × 3 distinct rule geometries × 2 sizes),
8 environments, 5 robot geometry prototypes, and 4 expanded robot pose references.
The **96 production assets** exclude the four static pose references. Billiards
continues to animate its existing robot instances and shot state machine.

## Reproduce the sources

Run from the repository root with Node and installed dependencies:

```powershell
foreach ($family in @('robots','cues','balls','tables','environments')) {
  node scripts/art/export-legacy-assets.cjs .tmp/legacy-art-export $family
}
```

For a custom cue update only:

```powershell
node scripts/art/export-legacy-assets.cjs .tmp/legacy-art-export cues cue-custom
```

The offline bridge uses the actual constructors, material pixels and Rack
palette. It flattens active robot instances, preserves node extras and exports
Z-up authoring coordinates through a glTF Y-up wrapper. The runtime adds the
inverse X rotation. Cues/balls/environment geometry use the source radius in
the manifest; runtime size adaptation uses the current physical radius. Table
variants already include their actual rule radius and dimensions.

Before export, compact pocket tables shorten the bed between pockets while
preserving each pocket mouth's dimensions. The two disconnected legacy snooker
leg assemblies are removed from its wood primitive (40 triangles); its 84 rail
triangles remain unchanged. The shared runtime path performs the same operations
for the existing model fallback. Physics collision surfaces are not refactored.

## Refine and verify

Blender writes native `.blend` files under `assets/blender/legacy/` and GLBs under
`dist/models/legacy-refined/`. The MCP scripts preserve contact geometry and
custom metadata. `scripts/art/refine-tables.py` receives `INPUT_FILE`,
`OUTPUT_ROOT` and `ASSET_ID` and runs through Blender MCP, not a shell Blender
substitute. MCP receipts and four-angle captures belong in
`docs/qa/2026-10-05-blender-mcp/`.

```powershell
node scripts/art/build-legacy-manifest.cjs --require-complete
```

This checks the 100 source GLB containers, source SHA-256 values and transformed
bounding boxes (maximum 0.03 mm export error). The production manifest includes
only native-refined GLBs with a `.blend`, a successful MCP receipt and current
source provenance. Textual `Error`/`Rejected` results are failures even when an
upstream tool returned `isError: false`. A source changed after refinement is
pending until it is refined again.

Angle image existence is evidence collection, not visual approval. Each manifest
entry has `angleImages` and `visualReviewed`. After actually reviewing the current
GLB, a reviewer may record `<id>-review.json` beside the receipts, with
`{"passed": true, "sha256": "<current GLB hash>", "reviewer": "...", "notes": "..."}`.
`--require-visual-review` enforces those current-hash review records separately.

## Runtime boundaries

- Fixed cues retain Blender PBR materials. Custom cues preserve all inlay/ring
  variants; tint and pattern selectors remain functional. Only explicit custom
  pattern changes replace those texture slots. Carried cues resync by art revision.
- Robot prototypes replace geometry beneath existing instance matrices; they do
  not replace walking, bending, aiming, cue contact, follow-through or camera timing.
- Refined balls keep the physical radius. Dotted balls retain the live marker
  shader; numbered balls use their authored maps and resin material.
- Environments replace visible static geometry while the original sky, caustic
  and celestial shader objects retain their uniforms, animation and draw order.
  Frozen meteor duplicates are excluded from rendering.
- Table variants have separate cache keys for rule, size and finish. No subsequent
  procedural style pass overwrites the imported finish.
- A game loads only its selected cue/environment/table plus ball/prototype assets.
  Consumers own disposable geometry/material copies; template textures are shared.
  On exit, consumers stop first, then cached geometry/materials/textures and image
  bitmaps are released. A generation guard disposes late downloads instead of
  allowing an exited game to refill the cache.

Runtime-only exceptions are explicit in the inventory: reflection-lighting
helpers, input guides/placement arrows/contact shadows, and shader programs that
glTF cannot represent. Source export, Blender refinement, screenshot review and
runtime/browser acceptance are separate evidence levels; none asserts phone
hardware acceptance.
