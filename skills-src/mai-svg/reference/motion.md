# Motion: direct it like an animator

You have an animator's controls. Presets are starting points, not the vocabulary. Identity rules still apply ([identity.md](identity.md)): constrain what makes the character itself, not the performance.

## The loop (do not skip the looking)

1. **Understand.** {{tool:scene.inspect}}, {{tool:scene.timeline}}, {{tool:context.get}}. Where will this be seen (an icon, a hero, a game sprite, an idle) and at what size? Does it loop? What must stay identical? Record the human's answer with {{tool:context.set}}; its priors (duration, loop, camera, energy, delivery profile) are defaults you may break with a reason.
2. **Direct.** Decide the beats in words first: what happens, when, and what each part does differently. Check {{tool:study.list}} for approved studies of similar work, and adapt their recipe to this scene's parts and proportions instead of copying it.
3. **Test first.** Turn the brief into assertions with {{tool:motion.assertions}}, for example "the tail lags the body", "the logo ends exactly at rest", "the cat stays inside the frame", "the jump overshoots and settles". They become regression tests for every refinement.
   - Children inherit their parent's motion. To test a part's *own* motion (an arm returning to rest while the torso breathes, a head shake that starts after a startle), add `relativeTo:"#parent"` to the assertion or to a `before` event; world-space checks will otherwise fail for the wrong reason.
4. **Author** with primitives (below) through {{tool:plan.execute}} with `protocol:"mai.motion-plan/v2"`, using an `ops` command plus your `assertions` and `evaluation:{filmstrip:{count:12,sampling:"significant"},critique:true}`. Dry-run first: the receipt carries the draft's filmstrip, critique, assertion results and a `loop` status. Then commit the same commands with a new requestId. It is one atomic, undoable transaction and needs no permission prompt per try. {{tool:ops.apply}} remains for single quick edits.
   - **Explore before choosing:** {{tool:variation.branch}} the directions you believe in (subtle, elastic, cinematic…), {{tool:variation.compare}} them side by side, then {{tool:variation.promote}} the one that serves the intent. Ask the human only when the intent itself is ambiguous; choice boards are for their decisions.
5. **Observe** ([observe.md](observe.md)): {{tool:render.filmstrip}}, {{tool:render.motion}} (trail, spacing, graph), {{tool:render.video}} for the human.
6. **Verify and critique.** {{tool:motion.verify}} runs your assertions. {{tool:critique}} names pops, robotic spacing, straight paths, twinning, moving holds, actions without wind-up and loop seams. Record your own visual judgement with {{tool:critique.record}}; it is your opinion, not approval.
7. **Refine** the single thing that helps most, then look again ({{tool:compare.motion}} against the previous state). Stop when the assertions pass, the critique has nothing you disagree with, and it reads alive at its real size.

## Author with primitives

- **Curves:** `track.set` writes a whole channel with tangent handles (`out`/`in` `{speed, influence}`, `auto`, `roving`, `hold`, custom `curve`). Vocabulary: [curves.md](curves.md). Single edits: `key.tangent`, `curve.custom`; velocity-preserving deceleration: `curve.inertia`. Exact fields: {{tool:operations.describe}}.
- **Acting beats:** `acting.beat` compiles rest → opposite anticipation → fast action → overshoot → long settle (optional bounces) into editable keys, and records the beats. Then reshape. Mark holds and accents with `beat.set`; the critic and filmstrips read them.
- **Overlap:** parts never start and stop together.
  - For a real chain (tail, hair, antennae, ears after the head), use `motion.propagate`: each link springs from the previous link's final motion.
  - For a relation between two parts, use an expression signal: `spring(head.rotation, 60, 6) - head.rotation`. See [relations.md](relations.md).
  - Otherwise use `track.copy` with `offset`, then `track.edit` `scale`; or {{tool:motion.spring}}; or a separate signal per part with its own period.
- **Life:** procedural signals (`signal.add`) are seeded and loop-aware. Use `drift` for breathing sway, `wiggle`/`noise` for handheld or nervous energy, `blink` for eyes, `pulse` for glows, `oscillator` for mechanical rhythm, `curve` for an authored envelope. Each one drives one channel on a layer, with an envelope for fades, decay and windows. Bake it with `signal.bake` only if it must become keys.
- **Camera:** shots, parallax and handheld feel: [camera.md](camera.md).
- **Effects** (`effect.stack`, one stack per part): `glow` (`pulse`/`period` make it breathe), `shadow`, `blur`, `motionSmear` (directional blur that follows the part's real speed: fast moves read as fast), `echo` (trailing ghosts at delayed poses), `saturate`/`hue`, `displace`. Glow, shadow, blur, smear and echo are overlays, allowed on protected parts; recolor and warps are not. Use them to accent beats, not as decoration.
- **Arcs:** `motion.path` makes a part travel along a curve by arc length (through `points` or along a `d`), optionally oriented to the tangent, with any easing on its progress. Otherwise give x and y different timings, or rotate around a well-placed pivot (`pose` pivot at the hinge). Check the result with the `render.motion` trail.
- **Layers:** additive `pose` for breathing and bobbing over acting, `blink` for eyelids, `eyes` for gaze, override `expression` for faces; set weights with `layer.set`.
- **Loops:** match values and velocity at the seam (`auto` tangents do it; signals are seamless by construction).

## Quick starts — then edit what they built

- {{tool:motion.preset}}: `idle` composes organic breathing, blinks on labelled eyes, gaze drift (if `look-x`/`look-y` exist), ears and tail from their `base` landmark. It skips protected parts and leaves notes. `breathe` with `style:"organic"` gives asymmetric, volume-keeping breathing. Classic kinds (`float`, `sway`, `bounce`, `pulse`, `spin`, `fade`, `breathe`) write plain keys. Every preset expands to operations you can inspect (`operations.describe {type:"motion.preset"}` lists what each one teaches).
- {{tool:motion.spring}} presets (tail, ears, hair, cloth, antenna, accessory, plant); tune them with {{tool:animation.adjust}}.

## Timing tools

- "Más lento/rápido": {{tool:animation.adjust}} `property:"speed"` with `scale` (0.7 = 30 % slower); `TIMELINE_OVERFLOW` means you should extend the duration first ({{tool:timeline.set}}).
- Global tempo: {{tool:timeline.set}} `retime` (>1 faster). Shape changes between different paths: {{tool:morph.apply}}.

## Taste notes (priors, not rules)

- Small and alive beats large and mechanical, but too small reads as static: judge at the real display size.
- Holds are part of the motion. A "moving hold" (≤10 % of the peak speed) keeps life without losing the read.
- Context decides energy: a UI icon wants short, clear and functional motion; a hero shot can be cinematic; a game idle must loop invisibly and stay readable at sprite size.

## Keep what worked

When the human likes a result, save it with {{tool:study.save}}. Pass their own words as `approval.quote`, plus `teaches` (the reusable lessons) and the context. Without approval the study is `pending-review`: an example, never a reference. Never present it as approved.
