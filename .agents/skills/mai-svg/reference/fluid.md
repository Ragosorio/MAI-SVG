<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Flowing existing artwork (smoke, steam, water, fire, lava, wind, hair, cloth, grass…)

MAI animates **the smoke that is already drawn** — it never swaps it for a template.
1. Find it: `resolve_part` / `mai resolve` `candy.flask.smoke`. If it does not exist, the smoke is still baked in the trace: `extract_part` / `mai part extract` with a polygon region around it (`source` = the trace group, e.g. `#mai-artwork`; leave a margin over transparent background, keep the bottle out), `role:"smoke"`, `parent:"flask"`. Ambiguous? `find_part_candidates` / `mai part candidates` with a box and `propose`, wait for the human.
2. `animate_fluid` / `mai fluid animate` `{target:"candy.flask.smoke", preset:"smoke"}` — the preset parameterizes a curl-noise flow field + traveling waves anchored at the emitter (bottom of the part for rising presets), preserving silhouette and alpha. `technique:"geometry"` (default, exact and editable) or `"filter"` (feTurbulence/feDisplacementMap, light for web export).
3. Adjust from words with `adjust_animation` / `mai animate adjust` (or inside a plan): `speed` ("más lento" → scale < 1), `amplitude`, `turbulence`, `direction` (`{x,y}`, e.g. left = `{x:-1,y:-1}` for smoke rising leftwards).
   Speed changes are exact; on looping timelines MAI closes the loop with an explicit crossfade (reported as `loopPolicy`). Filter technique needs whole tiles per loop (`LOOP_INCOMPATIBLE` otherwise).
4. Look at frames across the loop (`render_preview` / `mai preview` times 0, ¼, ½, ¾ of duration). These are procedural effects, not physics (no collisions/viscosity).
