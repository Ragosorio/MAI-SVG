# Motion: timing, secondary motion, presets

- Find what animates a part: {{tool:scene.timeline}} with `target`, or `sources` in {{tool:scene.inspect}} (modifiers, secondary motion, tracks `track:<id>:<property>[:<layer>]`).
- "Más lento/rápido": {{tool:animation.adjust}} `property:"speed"` with `scale` (0.7 = 30 % slower). Finite tracks that would overflow the timeline are rejected as a whole (`TIMELINE_OVERFLOW`): extend the duration first ({{tool:timeline.set}}) if the human wants that.
- Global tempo: {{tool:timeline.set}} `retime` (>1 faster). Layers: `timeline.set` with `layer:{id, mute|solo|weight}`.
- Follow-through: {{tool:motion.spring}} `{target:"tail", driver:"candy", preset:"tail", driverProperty:"y"}` — spring/damping/delay from the preset, no manual keyframes; tune with `animation.adjust` (`gain`, `stiffness`, `damping`, `delay`).
- Base motion: {{tool:motion.preset}} (`breathe`, `float`, `sway`, `bounce`, `pulse`, `spin`, `fade`); on the additive `pose` layer it stacks over existing motion.
- Shape changes between different paths: {{tool:morph.apply}} (normalizes topology; reports self-intersections).
- Then {{tool:critique}} for pops, jerks and loop seams, and look at frames.
