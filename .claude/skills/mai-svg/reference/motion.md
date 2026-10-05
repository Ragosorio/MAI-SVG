<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Motion: timing, secondary motion, presets

- Find what animates a part: `get_timeline` / `mai timeline` with `target`, or `sources` in `inspect_scene` / `mai inspect` (modifiers, secondary motion, tracks `track:<id>:<property>[:<layer>]`).
- "Más lento/rápido": `adjust_animation` / `mai animate adjust` `property:"speed"` with `scale` (0.7 = 30 % slower). Finite tracks that would overflow the timeline are rejected as a whole (`TIMELINE_OVERFLOW`): extend the duration first (`set_timeline` / `mai timeline set`) if the human wants that.
- Global tempo: `set_timeline` / `mai timeline set` `retime` (>1 faster). Layers: `timeline.set` with `layer:{id, mute|solo|weight}`.
- Follow-through: `add_spring` / `mai motion spring` `{target:"tail", driver:"candy", preset:"tail", driverProperty:"y"}` — spring/damping/delay from the preset, no manual keyframes; tune with `animation.adjust` (`gain`, `stiffness`, `damping`, `delay`).
- Base motion: `add_motion` / `mai motion preset` (`breathe`, `float`, `sway`, `bounce`, `pulse`, `spin`, `fade`); on the additive `pose` layer it stacks over existing motion.
- Shape changes between different paths: `morph_path` / `mai morph` (normalizes topology; reports self-intersections).
- Then `critique_motion` / `mai critique` for pops, jerks and loop seams, and look at frames.
