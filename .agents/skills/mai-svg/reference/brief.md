<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# From the human's words to a tested animation

The human says what must happen; you decide everything else. Example: «Quiero que la mascota tenga los dos ojos abiertos en su posición saludando y guiñe el ojo a los 3.6 s, lo demás hazlo creativo».

## 1. Split musts from latitude

- **Musts** are only what they explicitly asked: states, gestures, timings, what must stay. Here: both eyes open while waving; a wink at 3.6 s.
- **Latitude** is everything else: acting, rhythm, overlap, camera, effects, secondary motion. Your ideas never become musts.
- If a must is ambiguous (which eye? "al final" of a loop?), pick the most literal reading, say which one you chose, and keep going. Ask only when no reading works.

## 2. Record it as data

Use `set_direction` / `mai direction set` with:

- `brief` set to their words verbatim;
- `musts` holding one entry per requirement, each with assertions that prove it;
- `latitude` saying what is yours.

Assertions that fit briefs:

| Brief says | Assertion |
|---|---|
| "ojos abiertos mientras saluda" | `{type:"state", part:"<sprite>", state:"open", during:[a,b]}` |
| "guiña a los 3.6 s" | `{type:"state", part:"<sprite>", state:"wink", at:3.7}` (just after the change) |
| "termina como el original", "guiña al final como en el diseño" | `{type:"matchesBaseline", part:"#mascot", at:t}`: the rendered part equals the approved art at that time |
| "saluda", "salta" | `moves`, `energy` on the arm/body, or `before` events for order |
| a child's own motion | add `relativeTo:"#parent"` |

A must with no assertion stays **untested**, and the critic reports it as `MAI_DIRECTION_UNTESTED`. Judge it on the filmstrip and say so.

`verify_motion` / `mai motion verify` (with no arguments) and every motion-plan v2 receipt (`verify.direction`) report each must as passed, failed or untested. Plans and `direction.set` can share one transaction.

## 3. States the approved art does not show

The approved SVG is the identity reference, **not** a pose you must hold at frame 0. A winking mascot may start with both eyes open and wink later.

1. **Find the state drawn by the design system.** A sibling file, e.g. the "smile" expression, has the right eye open on the same artboard. Never redraw it.
2. **`borrow_part` / `mai part borrow`** `{id:"eye-right-open", file:"approved/mascot-smile.svg", ids:["<source id>"], parent:"face"}`. This copies the drawing with its paint, hidden, with prefixed ids. Put it in the parent that moves with the part, so it inherits head motion. Use `align:{to:"<id>"}` only when the artboards differ.
3. **Make the states.** `sprite.define {id:"eyes", variants:{wink:["eye-wink"], open:["eye-right-open"]}, initial:"open"}`, then `sprite.keyframe` the change at the time the brief asks. The switch is a cut; make it read as an action by closing the open eye fast (scaleY to ~.1 over 2–3 frames), cutting to the wink, then popping the wink slightly (scale 1.1 → 1).
4. **Prove it.** Use `state` assertions for the variants. If the approved pose is reached at some time, add `matchesBaseline` there, and use that time for `reducedMotion:"still"` with `at`.
5. **Loops.** If the piece loops and starts with eyes open, the eye has to reopen before the seam. Make it a blink, not a pop.

## 4. Report back

List every must with its status, then what you invented within the latitude. Metrics and the filmstrip are evidence, not the human's approval.
