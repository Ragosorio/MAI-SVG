---
name: mai-animate
description: Animate SVG transforms, colors, compatible paths, bones and mesh controls in MAI SVG and export standalone SMIL with verified frames.
---

# Animation and export

Read [CLI](../../../docs/CLI.md), [editor](../../../docs/EDITOR.md) and [status](../../../docs/STATUS.md). Use a local session and expected revision for every edit.

On the practice document, `examples/tail-wave.json` is a runnable transaction: inspect revision, then `npm run mai -- apply examples/tail-wave.json --expected-revision N`. It sets the pivot and rotation keys. Existing keys at other times remain; inspect and remove unwanted keys explicitly before evaluating the loop.

For prepared parts, choose target IDs, duration and properties. Supports x/y/rotation/scaleX/scaleY/opacity/fill/stroke/d, boneRotation/boneX/boneY, meshX/meshY. Mesh target is `PATH_ID::CONTROL_INDEX`. Use linear, ease-in-out or step. Path keyframes must have identical topology. Do not infer hidden anatomy.

Export editable to preserve rig and tracks, standalone for distribution. Render at start, extrema and intermediate times, then compare with the reference or engine. Validate no scripts, raster resources or external dependencies. Repeat SVG reopening and check rig, timeline and topology.

If adaptive sampling exceeds size/sample/tolerance limits or a mixed discontinuous track fails, revise the track, quality or duration; do not rasterize. Report bytes, sample count and measured interpolation error with its stated units and limitations. Compatibility must identify the browser actually tested.

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
