<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Relations: expression signals and overlap chains

Use these when one part's motion should depend on another's: ears that react to the head, a shadow that shrinks as the body rises, a tail that whips after a turn. Prefer them to copying keys by hand. A relation keeps working after you retime or reshape the driver.

## Expression signals

An expression signal is a signal whose source is `{kind:"expr", expr:"…"}`. It drives one channel on a layer like any other signal: additive layers add it, override layers replace the channel. Read `mai://expr/functions` (or `operations.describe signal.add`) for the full catalogue.

- **Variables:** `t`, `duration`, `loopPhase` (0→1), `value` (this channel before the signal), `PI`, `TAU`.
- **References:**
  - `body.rotation` reads another part's channel (`x y rotation scaleX scaleY opacity`);
  - `ref('left-ear','rotation')` does the same for ids with dashes and for bones (`boneRotation`);
  - `param.NAME` reads a rig param;
  - `sig('id')` reads another signal's contribution.
- **References see motion before expressions.** That is keys, motion paths, other signals, rig and secondary motion. So a part can read its own channel through `value`, and chains never loop. A signal cycle is rejected with `MAI_EXPR_CYCLE` and the path.
- **Time:**
  - `spring(x, k, c)`: lag with overshoot and settle;
  - `smooth(x, T)`: lag, no overshoot;
  - `delay(x, s)`;
  - `velocity(x)`, `accel(x)`;
  - `valueAt(x, time)`.
- **Shape:** `clamp`, `mix`, `map`/`linear`, `smoothstep`, `step`, `ease('ease-out', u)`, `tanh`.
- **Noise:** `noise(freq, seed)`, `wiggle(freq, amp, seed)`, `random(seed)`.
- **Rules:**
  - temporal and noise parameters must be constants;
  - loops wrap time, so a spring stays seamless at the seam;
  - errors carry a code (`MAI_EXPR_SYNTAX`, `UNKNOWN_IDENTIFIER`, `NONCONSTANT`, `MISSING_TARGET`…) and the position.

### Examples

| Intent | Expression (layer) |
|---|---|
| Ear follows the head's turn, late and springy | `spring(head.rotation, 60, 6) - head.rotation` on the ear (additive) |
| Head lags the body without bounce | `smooth(body.y, .12) - body.y` |
| Shadow shrinks as the body rises | `-clamp(-body.y/60, 0, .35)` on the shadow `scaleX` (additive) |
| Antenna drags behind fast moves | `-0.3*velocity(delay(head.x, .05))` on the antenna rotation |
| Glow pulses with a param | `.4 + .6*param.energy` on an `attr:` output |

## Overlap chains: `motion.propagate`

`motion.propagate {id, driver:{target, property} | {signal}, links:[{target, …}], preset?, mode?}` compiles into the expression signals `<id>-0…n` on the additive `secondary` layer. Each link reads the previous link's **final** motion, so the overlap really travels down the chain.

- **drag** (default): each link is the spring response to the previous link's velocity, softly limited. Use it for tails, hair, antennae and hanging props.
- **follow:** each link copies the previous link late, through a spring (gain 1). Use it for separate parts that should echo a move.
- **Defaults** come from a secondary preset (`tail`, `ears`, `hair`, `cloth`, `antenna`, `accessory`, `plant`). Override them per link with `stiffness`, `damping`, `gain`, `delay` and `limit`.
- **Pivots:** set each link's pivot at its joint first (`pose` pivot). Rotation without a hinge reads as sliding.
- **Look at it:** check the chain with `render.motion` views `["graph","trail"]`. Each link should start later than the one before (overlap) and the tip should swing widest (whip). Write it as an assertion: `lags {follower, driver}`.
- **Change it:**
  - tune one link with `signal.update`;
  - rebuild the chain with `replace:true`;
  - freeze a link to keys with `signal.bake`;
  - deleting a part removes the links that read it.
