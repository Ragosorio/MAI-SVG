---
name: mai-cleanup
description: Clean selected SVG geometry in MAI SVG through revision-checked CLI operations, preserving unrelated effects and animation.
---

# Geometry cleanup

Read [CLI](../../../docs/CLI.md) and [editor constraints](../../../docs/EDITOR.md). Work from the project root with the local server running.

1. `npm run mai -- session attach`; note revision. `npm run mai -- objects --filter NAME`, then `npm run mai -- object ID`.
2. Save a JSON transaction using selected IDs and supported point/path/attribute operations. Use `path.simplify` only on prepared paths; tolerance is in document units. Boolean operations require sibling paths without tracks or rig.
3. `npm run mai -- apply operations.json --expected-revision N`.
4. Read the new revision. Export editable and render a PNG at the relevant time using the CLI. Validate the SVG and compare the selected region with the reference.
5. If geometry or opacity regresses, `npm run mai -- undo --expected-revision NEW_N`. Reinspect before retrying.

Do not simplify all 50,000 color regions blindly. Preserve eyes, accessories and translucent borders. Do not alter path topology while `d` tracks or bindings exist. On conflict, inspect the current document and revise the transaction; never force an overwrite. Report the IDs, tolerance, paths affected and evidence files.

Para composición, ensayo de cambios y nuevas operaciones consultar la skill [mai-svg](../mai-svg/SKILL.md) y `npm run mai -- capabilities`.
