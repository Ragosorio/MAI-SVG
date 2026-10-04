---
name: mai-rig
description: Prepare SVG parts and build constrained bones, normalized weights, two-bone IK and control meshes in a live MAI SVG session.
---

# Parts and rig

Read [editor](../../../docs/EDITOR.md) and [operations](../../../docs/CLI.md). Vectorization produces visible color regions, not anatomy or hidden surfaces.

Inspect revision and selected IDs. Group sibling regions and name the part. For preserved-alpha artwork, `part.prepare` creates a separate masked group; it moves that part to the front, so compare occlusions. Complete hidden geometry manually through create/path/point operations.

Rigid group poses preserve the part's alpha mask. For deformable parts, rebuild transparency with opacity/gradients and explicitly remove the part mask after reviewing the visual change. Binding under a fixed ancestor mask, transform or nested SVG viewport is rejected. Do not bypass this guard.

Create bones with global rest x/y/length/angle and bounds; child rest origin must match the parent's rest endpoint for IK. Bind selected paths using `skin.bind`. Inspect weights, adjust using `skin.weight`; the motor renormalizes them. Mesh rows/cols must be 2–8. A rig locks topology.

Executable example: on the practice document, create a root bone at `(450,440)` of length 100, bind `tail`, then add `boneRotation` keyframes. Use the schemas in CLI.md; apply with the current revision. Export editable, render two poses and validate. Check joint limits, weight sums, consistent topology and that SVG reopening restores the rig. Undo failed preparations with the newest revision.

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
