---
name: mai-validate
description: Validate MAI SVG vector outputs, local references, raster purity and static render evidence; distinguish structural validity from visual approval.
---

# MAI validation

From the MAI SVG project root run `npm run mai -- validate FILE.svg` and `npm run mai -- inspect FILE.svg --json`. Read [CLI](../../../docs/CLI.md) when selecting a render mode.

Reject image/feImage, scripts, event handlers, entities/DOCTYPE, external URLs and unresolved local IDs. Preserve masks, defs and IDs required by artwork. Do not apply default SVGO optimizations that remove editability or references without testing.

Run `npm run mai -- render FILE.svg --output NEW_PREVIEW.png` for static geometry only. The current CLI deliberately rejects CSS/SMIL animation and --time; do not fabricate a temporal comparison using the static renderer. Browser animation and rig roundtrip are pending features.

After conversion changes run `npm run test` and `npm run typecheck`. Compare original and candidate in the gallery, including partial alpha. State separately: structural validity, measured raster comparison, human visual approval, and unsupported features. Do not mark the full project done on the strength of these checks.

For animated deliverables, export editable and standalone, render multiple times with the browser renderer, and reopen editable SVG to verify rig and tracks. `npm test` verifies transactions, geometry, alpha, IK, skinning, mesh, SMIL and live CLI/session recovery. Distinguish Chromium/Firefox/WebKit evidence from native Safari testing.

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
