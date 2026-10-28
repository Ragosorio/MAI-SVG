<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Identity: what may change and how it is proven

## Two different tools
- **This request only** ("conserva la boca", "esa parte no la cambies"): a `constraints.preserve` entry in `execute_plan` / `mai execute` against the `snapshotId` you inspected. "Como está" means the current evaluated state (it may already be expressive), not a reset to neutral. "Como era originalmente" → a `baseline` reference instead.
- **From now on**: `protect_identity` / `mai identity preserve` `{targets:["nose"], levels:["protected"]}` (persistent; later operations that violate it fail with `IDENTITY_BLOCKED`, including indirect routes like drivers, parameters, clips, modifiers, ancestors and shared paint).

## Levels (strictest wins, combined by intersection)
`locked` nothing · `protected` rigid motion only · `deformable` expression warps within budget, no recolor/delete/topology · `style-preserved` / `color-preserved` keep paint · `topology-preserved` keep nodes/subpaths · `silhouette-preserved` rendered-mask IoU ≥ 0.9 · `free`.
Use `deformable` + `color-preserved` + `topology-preserved` for faces that should act; `protected` for features that must not deform (nose, logo marks). `release_identity` / `mai identity release` only with the human's explicit consent.

## Creative envelope: constrain identity, not creativity

Use it when a protected part needs a short, expressive excursion, such as an eye that blinks, a body that squashes on landing, or a mark that smears on a fast move, while its shape at rest stays exact. The op is `semantic.envelope {id, envelope}`, and it needs the human's agreement, like any change to protection.

- **Channels.** `rigidTransform`, `deform` (scale and geometry), `paint`, `topology`, `effects` and `visibility`. Each one is `free`, `bounded` or `preserve`. A channel's policy overrides what the protection levels allow for that channel: `preserve` denies it even on a free part.
- **Bounds** for `bounded` channels:
  - `translate` and `deform`: fraction of the part size;
  - `rotation`: degrees;
  - `scale`, `paint`, `opacity`: fractions.
  - Defaults: .15, .12, 15°, .15, .1 and .5.
- **`transientDeviation {allowed, maxPeak (2×), maxDuration (.5 s), mustRecover (true)}`.** A bounded channel may go over budget only briefly, up to maxPeak× the budget, and must be back before every rest point: start, end, and settle or hold beats.
- **Measurement.** It is measured over time after every transaction, even when the same transaction loosened the policy. A failure rolls back with `IDENTITY_BLOCKED`, `detail.kind` set to `envelope` or `transient`, and the channel, metric, measured value, budget, time span and reason.
- **`preserve` also guards ancestors.** Breathing or squash on a parent group scales the features inside it. Small ancestor scale (within the preservation budget, judged by the signal's real amplitude) passes; more than that is blocked with `envelopeChannels` and `viaAncestor` in the error. For characters that breathe and jump, give facial features `deform: "bounded"` with a small budget and a transient instead of `preserve`.
- **Budget left.** `scene.identity` lists each part's envelope, its peak/budget ratios and its excursions.
- **Example**, an eye that may blink:

```json
{"deform": "bounded", "bounds": {"scale": 0.5}, "transientDeviation": {"allowed": true, "maxDuration": 0.4}}
```

## Proof
`check_identity` / `mai identity check` needs an explicit `reference` and non-empty `parts`/`times`:
- `{kind:"snapshot", id}` — "nothing changed since what I saw"
- `{kind:"baseline", id}` — against the approved original (`capture_baseline` / `mai baseline capture` registers a project file or the current state by sha256; new baselines are `unreviewed` until the human approves)
- `{kind:"rig-rest"}` — how far expressions displace features (not a regression test)
Statuses: `pass`, `fail`, `not_evaluated` (nothing measurable or renderer unavailable — never report it as success). Report the metrics, then your own visual judgement separately.

## Parts that are only a region of shared artwork
A part with a `region` but no own elements (e.g. a nose painted inside the converted artwork: `ids: []`) is checked **by pixels in its region** (`method:"region-pixels"`, the same threshold as `identity.check` for `unchanged`), both in plans and in `check_identity` / `mai identity check`. Its region box can include neighbouring pixels: if a nearby change (an opening mouth) shows up there, that is real on screen. Report it, propose binding the part to its own shapes (`find_part_candidates` / `mai part candidates` → confirm with the human), and do not silence the gate.
The reference must predate **all** the changes you are evaluating: inspect, then put every change of the request in the same plan; a snapshot taken after a separate commit hides that commit, one taken before it blames the new plan for it.
