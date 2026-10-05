---
name: mai-svg
description: 'Edit, animate and art-direct SVG characters in MAI SVG through its structured tools (MCP server "mai-svg" or the `mai` CLI): expressions that keep a character''s identity, choice boards, combining options ("la primera con los ojos de la tercera"), flowing existing smoke/water/fire, secondary motion, identity checks, previews and exports. Use for any work on SVG scenes inside MAI; not for generic web design.'
license: Proprietary project skill (MAI SVG)
---
# MAI SVG

You are the intelligence; MAI is the instrument. **MAI never interprets human language** — you read the human's words, inspect the scene, decide, and call structured tools. MAI resolves parts, compiles deterministic operations, protects identity, renders, validates and keeps revisions.

## Setup (once per task)

1. {{tool:capabilities}} — the vocabulary: every tool, schema, side effect, reversibility, availability.
2. {{tool:scene.inspect}} — parts with addresses (`candy.flask.smoke`), real IDs, animation `sources`, parameters, `sessionId`, `documentId`, `snapshotId`, `revision`, board summary and suggested next steps.
3. If the human talks about options: {{tool:choices.inspect}} (board `id`/`version`, options by position 1..n, slots, `slotParts`, preview PNG paths you can look at, the human's notes).

Every mutation needs the `expectedRevision` you last read. `REVISION_CONFLICT` → re-inspect and re-plan; never retry blind.

## Route by intention — load only the playbook you need

| The human asks for… | Read |
|---|---|
| Choosing/mixing options, "la primera pero…", "conserva X", several changes in one sentence | [direction.md](reference/direction.md) |
| An emotion, expression, "más triste", "menos", eyes/mouth changes | [expression.md](reference/expression.md) + [identity.md](reference/identity.md) |
| "No le cambies…", keep features, protect, compare with the original | [identity.md](reference/identity.md) |
| Smoke, steam, water, fire, lava, wind, hair, cloth flowing | [fluid.md](reference/fluid.md) |
| Timing, speed, follow-through, tail/ears reacting, breathing | [motion.md](reference/motion.md) |
| "This part", unknown or ambiguous parts, labeling what is what | [semantics.md](reference/semantics.md) |
| Checking, critique, performance, export, delivery | [verify.md](reference/verify.md) |
| Emotion libraries and sprite states (legacy authoring) | [emotion-library.md](reference/emotion-library.md) |
| Inserting several SVGs into one scene | [compose.md](reference/compose.md) |
| File-only proofs and comparisons without a session | [file-evidence.md](reference/file-evidence.md) |

Converting PNG/WebP/JPG to SVG is a separate skill (mai-vectorize); the approved preset is `high-color-preserved`.

## Rules that always apply

- **One human request with several changes → one plan** ({{tool:plan.execute}}): one transaction, one `undoToken`. Do a `dry-run` first when identity is involved.
- **Ambiguity is shown, not guessed.** `AMBIGUOUS_TARGET`, `UNCONFIRMED_TARGET` or `NOT_FOUND` come with candidates; decide from context only when the evidence is clear, otherwise show candidates ({{tool:part.candidates}} with `propose`) and wait.
- **Never choose for the human.** Recommending is fine. Accept an option only when the human's words or click decided it; record their exact words with {{tool:choice.note}} (author `user`) and in `provenance.text`.
- **Identity first.** "Conserva/no cambies X" = a `preserve` constraint against the snapshot you inspected; protections persist with {{tool:identity.preserve}}. Never release protection without the human's consent.
- **Verify before you describe.** {{tool:preview.render}} and look at the images; {{tool:identity.check}} (explicit reference, non-empty parts/times — `not_evaluated` is not a pass); report deterministic metrics separately from your visual judgement.
- **Undo is cheap.** If a result is wrong, {{tool:history.undo}} with the `undoToken` you received.
- Tools marked `experimental` in capabilities work but are not calibrated on every asset: say so when you rely on them.
- The approved conversion and the human's original files are never overwritten.
