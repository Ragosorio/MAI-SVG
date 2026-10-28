<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Curves and signals: shaping how motion feels

A key's `out` handle shapes how motion leaves it; the next key's `in` handle shapes how it arrives. `speed` is in value units per second (0 = rest), and `influence` (0.001–1) is how far into the segment the handle reaches. Higher influence means a longer, softer ease.

| Feel | How to get it |
|---|---|
| Snappy | `out {speed:0, influence:.15}` then `in {speed:0, influence:.7}`: leaves fast and lands long and soft |
| Heavy | `out {speed:0, influence:.7}` (slow start), short arrival, then a small overshoot and a settle (`acting.beat`) |
| Floaty | Large influences on both sides (.6–.8), long holds near the top, gentle drift signals |
| Bouncy | `acting.beat` with `bounces:1–2`, or an `overshoot` easing on the arrival |
| Mechanical (on purpose) | `linear` or `roving` keys (constant speed), `oscillator` signals |
| Continuous through a key | `auto:"auto"` (Catmull-Rom slope; loops close with the same velocity) |
| Cut or hold | `hold:true` (step); it exports as an instant cut |
| Custom | `curve:"M0 0 C0.2 0 0.4 1.3 1 1"` (x must increase from 0 to 1; y is free) |
| Throw and coast | `curve.inertia` from a key: keeps the incoming velocity and decays exponentially |

Legacy easing names map exactly to handles, so mixing them is safe.

## Signal recipes

| Intent | Signal |
|---|---|
| Breathing that never repeats | `drift {amplitude:.3–.8, period:3–7}` on rotation or y, additive `pose` |
| Blinks | `blink {interval:[2.8,5.2], close:.07, double:.15, amplitude:-.92}` on eye scaleY, `blink` layer, eye pivot at its center; share the seed between both eyes |
| Nervous energy, handheld | `wiggle {frequency:2–6, amplitude, octaves:2}`; gate it with `envelope {start, end, fadeIn, fadeOut}` |
| Glow pulse | `pulse` on `attr:stdDeviation` of a blur, or on opacity |
| Excitement that ramps | any source with `envelope.ramp` keys, or `multiplyBy:"param:energy"` |
| Impact decay | `oscillator {period:.08}` with `envelope {start, decay:9}` |

Signals are deterministic (seeded) and seamless in loops. Change the seed to explore variations, and remove a signal with `signal.remove`.
