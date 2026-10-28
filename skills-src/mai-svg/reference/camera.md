# Camera: film the scene

The 2.5D camera is a view transform around the whole scene. It never changes the artwork: protected and locked parts allow it, `identity.check` judges the art without it, and filmstrips and previews show the shot. Use it when the context asks for cinema (hero, editorial, explainer, social). A UI icon or a game sprite usually wants no camera.

## Set up

- `camera.set` creates the camera from the viewBox; options are safe areas, zoom limits and the subject.
- `camera.depth` gives each top-level layer a plane: `background` (.2), `midground` (.55), `subject` (1), `foreground` (1.35), or an explicit factor (`0` = fixed sky). Parallax makes flat art feel deep.
- Full-bleed planes need bleed. If a layer touches the frame edges at rest, parallax and zoom can reveal its border. The critic says `MAI_CAMERA_PLANE_EDGE`; extend that artwork, lower its factor or move less.

## Shots (grammar, not coordinates)

`camera.shot {intent, subject, start, duration, to:{framing}, motion}` compiles to editable `@camera` keys:

| Intent | Use it for |
|---|---|
| `establish` | Open on the whole scene, with a slow push |
| `reveal`, `push-in` | Bring attention to the subject; `to.framing` is `medium`, `close-up` or `extreme-close-up`, with `offset` for rule of thirds |
| `pull-out` | Show the context after a moment |
| `pan` | Move attention sideways |
| `orbit-2d` | A small roll that suggests circling the subject |
| `impact` | Zoom punch plus a decaying shake, synced to an action beat |
| `handheld` | Seeded noise: alive and documentary |
| `cut` | Hold, then jump: a new shot |
| `follow` | Ease into a framing (`to.zoom` or `to.framing`), then track the moving subject with lag set by `motion`. It compiles to expression signals `smooth(ref(subject,'x'), lag)` and rests where the subject left it |

Pan and zoom follow the optimal van Wijk path: the camera zooms out to travel far, then back in. `motion` sets the feel: `smooth`, `snappy`, `lazy` or `linear`. Use `camera.fit {targets, time}` to frame parts from their real bounds. You can always edit or add keys on `@camera` (`x`, `y` = the world point looked at; `zoom`; `rotation`) with `track.set`, or add camera signals.

## Direction notes

- Motivate every move: the camera follows the action or the story; it never moves just because it can.
- Let a hold be a hold: lock the camera while the subject acts, and move between beats.
- Watch the critic: `MAI_CAMERA_SUBJECT_OUTSIDE` (action-safe area), `MAI_CAMERA_FAST`, `MAI_CAMERA_ZOOM_RATE`, `MAI_CAMERA_ROLL`.
- Look at the filmstrip with the camera on; check identity with it off. Both happen automatically.
