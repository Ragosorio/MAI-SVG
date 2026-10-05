# Parts: what is what

- Addresses are semantic paths: `candy`, `candy.head.mouth`, `candy.flask.smoke`; roles (`mouth`, `eyes`) work when unique within one character. `#id` reaches raw SVG ids.
- {{tool:scene.semantics}} lists every part (status `confirmed`/`proposed`, protection, landmarks, regions); {{tool:part.resolve}} explains how a reference resolves.
- "Esto/esta parte": {{tool:scene.selection}} returns what the human selected in the editor, resolved to parts. Canvas comments ({{tool:comments.list}}) carry targets, parts, time, region and a screenshot path.
- Unknown part: {{tool:part.candidates}} with a `point`/`box` → up to 6 candidates (confidence, path counts, bounds). With `propose:{id,role,label}` it opens a board with highlighted previews; the human's choice is stored as a confirmed part.
- Name things once ({{tool:part.label}}); next time use the address. Proposed parts cannot be mutated until confirmed (`UNCONFIRMED_TARGET`).
