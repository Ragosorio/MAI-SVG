# Verify, critique, deliver

Order: {{tool:preview.render}} (look at the PNGs) → {{tool:identity.check}} → {{tool:compare.frames}} (vs `previous` or `rest`) → {{tool:critique}} → {{tool:audit}}.
- Keep categories apart in your report: structural (audit), identity metrics, motion craft metrics, your visual judgement, and the human's decision.
- {{tool:performance}} explains cost (paths, animated points, frame evaluation time, hotspots) — an estimate, not measured paint time.
- Before delivering: {{tool:export.capabilities}} (unsupported features come with options; never degrade silently) and {{tool:audit}} with a delivery profile (`web`, `game`, `mobile`, `icon`…). Then {{tool:export}} (`editable` keeps MAI metadata; `standalone` is SMIL without scripts or raster).
- Wait for human events after proposing: {{tool:inbox.wait}} `{after:<cursor>, wait:300}`; each event has `_next` guidance.
