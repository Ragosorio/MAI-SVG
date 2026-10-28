<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Verify, critique, deliver

Order: `render_preview` / `mai preview` (look at the PNGs) → `check_identity` / `mai identity check` → `compare_frames` / `mai compare` (vs `previous` or `rest`) → `critique_motion` / `mai critique` → `run_audit` / `mai audit`.
- Keep categories apart in your report: structural (audit), identity metrics, motion craft metrics, your visual judgement, and the human's decision.
- `profile_performance` / `mai profile` explains cost (paths, animated points, frame evaluation time, hotspots) — an estimate, not measured paint time.
- One-shots that end on the approved art: check the last frame with `check_identity` / `mai identity check` against the baseline (MAE ≈ 0). Springs leave sub-pixel residue; give them enough damping to settle before the end.
- Before delivering: `export_capabilities` / `mai export capabilities` (unsupported features come with options; never degrade silently) and `run_audit` / `mai audit` with a delivery profile (`web`, `game`, `mobile`, `icon`…). Then `export_scene` / `mai export` (`editable` keeps MAI metadata; `standalone` is SMIL without scripts or raster). `output:"deliver/x.svg"` also writes a project-relative copy; it never overwrites, and the unique copy in `exports/` stays as the record.
- **Reduced motion.** When the context asks for it (`MAI_CONTEXT_REDUCED_MOTION`, icons, heroes), also deliver `export_scene` / `mai export` `{profile:"standalone", reducedMotion:"still"|"fade"}`. It writes a separate file because SMIL cannot read the media query.
  - `still` freezes the scene: at 0 for loops, at the end for one-shots, or at `at`.
  - `fade` keeps only the opacity and color transitions.
  - The report carries the `<picture><source media="(prefers-reduced-motion: reduce)">` snippet to serve it.
- Wait for human events after proposing: `wait_inbox` / `mai inbox` `{after:<cursor>, wait:300}`; each event has `_next` guidance.
