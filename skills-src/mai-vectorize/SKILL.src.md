---
name: mai-vectorize
description: Convert PNG, WebP, JPG or SVG-embedded raster into real vector geometry with MAI SVG and compare fidelity candidates locally.
---

# MAI conversion

Run from the MAI SVG project root. Read [CLI](../../../docs/CLI.md) for supported commands and limits and [status](../../../docs/STATUS.md) before extending scope.

The user selected `high-color-preserved`. Use `npm run mai -- vectorize INPUT --preset high-color-preserved --output NEW_EXPERIMENT_DIR`. Use `--compare` for new quality investigations. Inspect `report.json`, SVG geometry and the comparison gallery. For a directory, exclude composite PNGs and thumbnails by choosing the original raster directory. Inputs stay read-only. Reuse of the same output names overwrites experiments; use a fresh directory when preserving prior evidence.

VTracer discards partial alpha. MAI traces a vector luminance mask. Do not substitute base64 images, feImage or external raster references. Low path counts do not prove fidelity. Inspect eyes, accessories, silhouette and partial-alpha edges over light and dark backgrounds. Report bytes, paths and errors without claiming human approval.

`npm run mai -- gallery --directory OUTPUT` rebuilds accumulated comparisons; `npm run mai -- serve --directory OUTPUT` opens a read-only local gallery. Use `prove-editable` on a copy to verify that generated path IDs can be modified and reopened. It does not demonstrate semantic anatomy or a rig.

Before choosing settings for the other 32 cats, obtain the user's visual selection. If fidelity is insufficient, keep results pending and document the limitation; do not start the editor by treating a successful XML validation as quality approval.

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
