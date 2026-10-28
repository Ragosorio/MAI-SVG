<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Observe: see the motion before you describe it

Models read images, so these tools turn time into pictures. Look at them every time you change motion.

| Need | Tool |
|---|---|
| The whole animation at a glance | `render_filmstrip` / `mai filmstrip`: 4–36 labelled frames. Use `sampling:"significant"` to land on keys, beats, markers and blink peaks; `ghost` (onion skin) shows spacing and arcs; `part` frames a detail |
| Arcs, spacing, velocity | `render_motion` / `mai motion render`: the `trail` view shows the world-space path of a part (curved or straight?); `spacing` shows where it speeds up or slows down; `graph` plots value and velocity of a channel |
| What the human will see | `render_video` / `mai video`: MP4/WebM with a poster (it's for the human; you judge with sheets). `background:"auto"` switches to gray when the art is mostly light; pass the real page color when you know it. Longer or larger clips: render `start`/`end` ranges and join them |
| What changed | `compare_motion` / `mai compare motion`: reference, current and a 50 % blend per time, plus pixel and trajectory deltas |
| Exact moments | `render_preview` / `mai preview` at full size |
| Does it play smoothly | `probe_performance` / `mai performance probe`: measured rAF intervals in Chromium, inline and as `<img>` |

How to judge a sheet:

- **Reads:** is the main action clear without labels? Does the eye know where to look?
- **Weight:** spacing tight near extremes (eases) and wide in the middle; a heavy thing takes longer to start and stop.
- **Life:** do parts move at different times (overlap)? Is there something alive in the holds?
- **Arcs:** trails should curve unless the motion is intentionally mechanical.
- **Loop:** the last frame should flow into the first.
- **Identity:** at rest, it is unmistakably the original.

Then write your verdict with `record_critique` / `mai critique record`, citing the artifact ids you looked at. Deterministic metrics and your judgement stay separate, and neither one is the human's approval.

Pitfalls seen on real characters:

- **White on white hides motion.** A light limb rotating *into* a light body disappears; check the sign on a zoomed frame and swing it where it reads against the background (a wave usually opens outward).
- **Rest-pose details.** Crease lines or seams drawn on top of other parts mark a joint *at rest*. Make them follow the part and fade them out as it leaves rest (`expr: -smoothstep(2, 9, abs(ref('arm','rotation')))` on opacity).
- **Too tight a close-up.** If the frame turns into a field of fill color, the character stops reading; prefer `medium` on the head and keep a silhouette edge (ears, outline) in shot.
- **Too timid.** Look at the sheet at the real display size. If you cannot tell keys apart in the filmstrip, the human will not see the motion either.
