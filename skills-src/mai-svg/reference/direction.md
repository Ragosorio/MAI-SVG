# Art direction: choices, mixes and multi-change requests

## Read first
1. {{tool:choices.inspect}} → board `id`, `version`, `options[]` with `position` (1 = "la primera"), `label`, per-slot `slots`, `slotParts` (which parts each slot controls), `previewPath` (open the PNGs), `notes` (the human's words).
2. {{tool:scene.inspect}} → `sessionId`, `documentId`, `snapshotId`, `revision`, and each part's `sources` (`sourceId` for animation changes).

Map the human's words yourself: ordinals and labels → option ids; "los ojos de la tercera" → `take:{eyes:"C"}`; "conserva/no cambies la boca" → a `preserve` constraint on the part `mouth` against the inspected `snapshotId`; "baja 30% la velocidad del humo" → `animation.adjust` with the smoke part's `sourceId` and `scale:0.7`.

## Apply everything at once: {{tool:plan.execute}}
```json
{"plan":{"protocol":"mai.agent-plan/v1","requestId":"<new id per attempt>","sessionId":"<inspect.sessionId>","documentId":"<inspect.documentId>","expectedRevision":<inspect.revision>,"mode":"dry-run","label":"A, ojos de C, boca como está, humo ×0.7",
 "constraints":{"preserve":[{"part":{"partId":"mouth","within":"candy"},"reference":{"kind":"snapshot","id":"<inspect.snapshotId>"},"channels":["geometry","paint","expression"],"allowRigidMotion":true}]},
 "commands":[{"id":"expression","type":"variant.apply","target":{"partId":"candy"},"board":{"id":"<board.id>","version":<board.version>},"base":"A","take":{"eyes":"C"}},
  {"id":"smoke-speed","type":"animation.adjust","target":{"partId":"smoke","within":"candy"},"sourceId":"<smoke source>","property":"speed","scale":0.7,"onOverflow":"reject"}],
 "validation":{"times":[0,1.5,3],"required":["structural","identity"],"preview":true},
 "provenance":{"kind":"user-direction","text":"<the human's exact words>"}}}
```
- Run `mode:"dry-run"` → look at `artifacts` (previews), `identity.status` must be `pass`. Then the same plan with `mode:"commit"` and a **new** `requestId`.
- One commit = one transaction: scene, accepted option and receipt together; `transaction.undoToken` undoes all of it.
- Same `requestId` again returns the stored receipt (`replayed:true`) — safe after a timeout ({{tool:plan.status}}).
- Errors you will see: `STALE_CHOICE` (board changed or scene content changed since the previews) → {{tool:choice.regenerate}} or re-propose; `NOT_COMBINABLE` (slot missing, or taking a slot you also preserve); `TIMELINE_OVERFLOW`; `IDENTITY_BLOCKED`; `VALIDATION_NOT_EVALUATED` (a required gate could not run — never treat as pass).
- `provenance.kind:"agent-proposal"` cannot accept a pending choice in commit mode: that needs the human's direction.

## The human changes their mind ("pensándolo mejor, la segunda")
The board is already `chosen`: repeat `variant.apply` on the **same board** with `"rechoose": true`. The new acceptance supersedes the previous one in the same transaction: parameters the previous option set and the new one does not return to 0, preserved slots keep their value, and undo returns to the previous acceptance. "Tal como estaba" means no `take`. A `STALE_CHOICE` on a chosen board carries `recovery.action:"rechoose"`.
Do not rebuild the options on a new board or set the parameters with {{tool:expression.apply}} instead: the scene would no longer match the recorded decision.

## Only propose (no decision yet)
- {{tool:variant.combine}} with `base`, `take`, `preserve`, `scale` adds a derived option with a preview to the board (version +1). Show it; wait.
- {{tool:expression.propose}} renders 2–6 interpretations of an emotion; {{tool:choice.regenerate}} replaces them (optionally `keep` slots original).
- Always record the human's words: {{tool:choice.note}} `{text, author:"user"}`.

## When the human picks by clicking in the editor
The editor applies {{tool:choice.choose}} itself; you will see `choice.chosen` in {{tool:inbox.wait}}. Verify and continue.
