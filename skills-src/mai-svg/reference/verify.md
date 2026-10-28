# Verify, critique, deliver

Order: {{tool:preview.render}} (look at the PNGs) → {{tool:identity.check}} → {{tool:compare.frames}} (vs `previous` or `rest`) → {{tool:critique}} → {{tool:audit}}.
- Keep categories apart in your report: structural (audit), identity metrics, motion craft metrics, your visual judgement, and the human's decision.
- {{tool:performance}} explains cost (paths, animated points, frame evaluation time, hotspots) — an estimate, not measured paint time.
- One-shots that end on the approved art: check the last frame with {{tool:identity.check}} against the baseline (MAE ≈ 0). Springs leave sub-pixel residue; give them enough damping to settle before the end.
- Before delivering: {{tool:export.capabilities}} (unsupported features come with options; never degrade silently) and {{tool:audit}} with a delivery profile (`web`, `game`, `mobile`, `icon`…). Then {{tool:export}} (`editable` keeps MAI metadata; `standalone` is SMIL without scripts or raster). `output:"deliver/x.svg"` also writes a project-relative copy; it never overwrites, and the unique copy in `exports/` stays as the record.
- **Reduced motion.** When the context asks for it (`MAI_CONTEXT_REDUCED_MOTION`, icons, heroes), also deliver {{tool:export}} `{profile:"standalone", reducedMotion:"still"|"fade"}`. It writes a separate file because SMIL cannot read the media query.
  - `still` freezes the scene: at 0 for loops, at the end for one-shots, or at `at`.
  - `fade` keeps only the opacity and color transitions.
  - The report carries the `<picture><source media="(prefers-reduced-motion: reduce)">` snippet to serve it.
- Wait for human events after proposing: {{tool:inbox.wait}} `{after:<cursor>, wait:300}`; each event has `_next` guidance.
