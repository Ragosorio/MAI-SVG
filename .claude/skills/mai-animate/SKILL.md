---
name: mai-animate
description: Animate SVG transforms, colors, compatible paths, bones and mesh controls in MAI SVG and export standalone SMIL with verified frames.
---
<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->

# Animation and export

Read [CLI](../../../docs/CLI.md), [editor](../../../docs/EDITOR.md) and [status](../../../docs/STATUS.md). Use a local session and expected revision for every edit.

On the practice document, `examples/tail-wave.json` is a runnable transaction: inspect revision, then `npm run mai -- apply examples/tail-wave.json --expected-revision N`. It sets the pivot and rotation keys. Existing keys at other times remain; inspect and remove unwanted keys explicitly before evaluating the loop.

For prepared parts, choose target IDs, duration and properties. Supports x/y/rotation/scaleX/scaleY/opacity/fill/stroke/d, boneRotation/boneX/boneY, meshX/meshY. Mesh target is `PATH_ID::CONTROL_INDEX`. Easings: linear, ease-in-out, ease-in, ease-out, overshoot, anticipate, step, or `cubic-bezier(x1,y1,x2,y2)` (y may leave 0–1 for custom overshoot); the easing belongs to the segment leaving the key. Any field of any operation: `operations.describe`. Path keyframes must have identical topology. Do not infer hidden anatomy.

Export editable to preserve rig and tracks, standalone for distribution. Render at start, extrema and intermediate times, then compare with the reference or engine. Validate no scripts, raster resources or external dependencies. Repeat SVG reopening and check rig, timeline and topology.

If adaptive sampling exceeds size/sample/tolerance limits or a mixed discontinuous track fails, revise the track, quality or duration; do not rasterize. Report bytes, sample count and measured interpolation error with its stated units and limitations. Compatibility must identify the browser actually tested.

Beyond keys, the engine has the animator's controls, all of them editable data that SMIL exports exactly:
- tangent handles (`track.set`, `key.tangent`, `curve.custom`, `curve.inertia`);
- acting beats (`acting.beat`);
- arcs (`motion.path`);
- seeded procedural signals (`signal.add`: drift, blink, wiggle, noise, pulse);
- relations and overlap chains (expression signals, `motion.propagate`);
- a 2.5D camera (`camera.shot`, `camera.depth`);
- effects (`effect.stack`).

Presets (`motion.preset`) are a starting point, not a ceiling: they expand into those same operations. Look at the motion before describing it: `render_filmstrip` / `mai filmstrip` with `sampling:"significant"`, plus `verify_motion` / `mai motion verify` with assertions. For the full direction loop read [motion](../mai-svg/reference/motion.md), [relations](../mai-svg/reference/relations.md) and [camera](../mai-svg/reference/camera.md).

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
