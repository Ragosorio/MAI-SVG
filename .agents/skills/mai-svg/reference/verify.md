<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Verify, critique, deliver

Order: `render_preview` / `mai preview` (look at the PNGs) → `check_identity` / `mai identity check` → `compare_frames` / `mai compare` (vs `previous` or `rest`) → `critique_motion` / `mai critique` → `run_audit` / `mai audit`.
- Keep categories apart in your report: structural (audit), identity metrics, motion craft metrics, your visual judgement, and the human's decision.
- `profile_performance` / `mai profile` explains cost (paths, animated points, frame evaluation time, hotspots) — an estimate, not measured paint time.
- Before delivering: `export_capabilities` / `mai export capabilities` (unsupported features come with options; never degrade silently) and `run_audit` / `mai audit` with a delivery profile (`web`, `game`, `mobile`, `icon`…). Then `export_scene` / `mai export` (`editable` keeps MAI metadata; `standalone` is SMIL without scripts or raster).
- Wait for human events after proposing: `wait_inbox` / `mai inbox` `{after:<cursor>, wait:300}`; each event has `_next` guidance.
