<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Expressions that keep identity

Expressions are **parameters** (`sadness`, `happiness`, `anger`, `fear`, `surprise`, `tiredness`, `mouth-open`, `mouth-wide`, `mouth-round`, `lips-closed`, `smirk`, `squint`, `look-x`, `look-y`, `ear-droop`) acting on expression features rigged on the character's **own** mouth/eyes/brows/ears. A frown is the same mouth bent (same color, thickness and topology), never a replacement line.

- Scope by slot: `sadness@mouth`, `sadness@eyes`, `sadness@brows`, `sadness@ears`. A global `sadness` reaches every slot (including preserved ones).
- Static change: `apply_expression` / `mai expression apply` `{params:{"sadness@eyes":0.6}, expectedRevision}`. Keyframes: add `time` (and `layer`, default `expression`; blink/lipsync layers add on top).
- "Un poquito menos triste": read current values in `inspect_scene` / `mai inspect` `parameters`, compute the new values yourself (e.g. ×0.8), apply.
- Several interpretations for the human: `propose_expression` / `mai expression propose` `{emotion, intensity, count:3, time, preserve:["mouth"]?}`.
- Preservation mode bounds every deformation: `strict` ≤12 % of feature size, `balanced` ≤32 % (a smile can read as sadness), `free` ≤60 % — `set_preservation` / `mai identity mode` only when the human asks for subtler or exaggerated acting.

## Rigging a converted character (once per character)
1. The feature must be real, separate geometry: `extract_part` / `mai part extract` copies the artwork inside a region into its own layer (pixel-identical at rest, alpha preserved) and hides the source there.
2. `rig_expression` / `mai expression rig` with role and landmarks in document coordinates:
   - mouth: `left`, `right` (corners), `center` (upper lip middle), `lower` (lower lip bottom)
   - eye-left/eye-right: `inner`, `outer`, `upper`, `lower`, `iris`
   - brow: `inner`, `middle`, `outer`; ear: `base`, `tip`
   Place landmarks by looking at a zoomed `render_preview` / `mai preview` of the part; boundary pins come from the part's region.
3. Check extremes with a `dryRun` + `preview` per emotion before showing the human; `run_audit` / `mai audit` reports `MAI_WARP_FOLD` if a mix folds.
