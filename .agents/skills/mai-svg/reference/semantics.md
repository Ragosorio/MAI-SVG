<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Parts: what is what

- Addresses are semantic paths: `candy`, `candy.head.mouth`, `candy.flask.smoke`; roles (`mouth`, `eyes`) work when unique within one character. `#id` reaches raw SVG ids.
- `list_parts` / `mai semantics` lists every part (status `confirmed`/`proposed`, protection, landmarks, regions); `resolve_part` / `mai resolve` explains how a reference resolves.
- "Esto/esta parte": `get_selection` / `mai selection` returns what the human selected in the editor, resolved to parts. Canvas comments (`list_comments` / `mai comments`) carry targets, parts, time, region and a screenshot path.
- Unknown part: `find_part_candidates` / `mai part candidates` with a `point`/`box` → up to 6 candidates (confidence, path counts, bounds). With `propose:{id,role,label}` it opens a board with highlighted previews; the human's choice is stored as a confirmed part.
- Name things once (`label_part` / `mai part label`); next time use the address. Proposed parts cannot be mutated until confirmed (`UNCONFIRMED_TARGET`).
