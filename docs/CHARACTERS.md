# Personajes, emociones y sprites

MAI admite bibliotecas reutilizables de expresiones ligadas a IDs vectoriales y variantes discretas. Un LLM puede construirlas con operaciones JSON, inspeccionarlas en project.emotions/project.sprites, ponerlas en timeline y generar un atlas. No requiere clicks para crear el personaje.

## Ejemplo reproducible: Milo

`examples/emotions/milo-source.svg` contiene geometría original creada para este ejemplo. No es Candy convertido automáticamente a un rig: Candy conserva su candidato high-color-preserved y requiere preparación anatómica antes de expresar emociones.

`milo-operations.json` contiene 129 operaciones reales: siete expresiones (seis emociones más parpadeo), estados de efectos, dos huesos de cola, morph facial y 26 pistas. Hay anticipación y squash/stretch antes del salto, saludo y movimiento retrasado de cola. Es una demostración de capacidades; la calidad profesional sigue requiriendo dirección artística y revisión de timing, peso y anatomía.

```sh
npm run mai -- session attach
npm run mai -- load examples/emotions/milo-source.svg --expected-revision N
npm run mai -- apply examples/emotions/milo-operations.json --expected-revision N1 --dry-run
npm run mai -- apply examples/emotions/milo-operations.json --expected-revision N1
npm run mai -- export --profile editable --expected-revision N2 --output experiments/milo.svg
npm run mai -- preview experiments/milo.svg --fps 10 --width 480 --output experiments/milo.gif
npm run mai -- spritesheet experiments/milo.svg --frames 24 --columns 6 --cell 180 --output experiments/milo-sheet.svg --png
```

N1/N2 son revisiones devueltas, no números que deban asumirse. Guardar checkpoint editable del documento actual antes de load; load es reemplazo reversible, insert añade un componente pero compila su autoría y no fusiona bibliotecas.

## Operaciones

- `emotion.define`: `{emotion:{id,name,targets:{"mouth":{attrs:{d:"M..."}},"head":{pose:{rotation:-6}}}}}`. Propiedades de pose: x/y/rotation/scaleX/scaleY; atributos animables: d/fill/stroke/opacity. Colores #RRGGBB. Datos limitados y validados; nunca scripts.
- `emotion.apply`: aplica expresión estática. Rechaza campos con pistas activas; usar keyframe para animación.
- `emotion.keyframe`: id,time,easing; expande a pistas reales de todos sus componentes en una transacción atómica. Morph exige topología compatible. Configurar pivotes antes.
- `sprite.define`: `{sprite:{id,name,initial,variants:{"idle":["frame-idle"],"run":["frame-run"]}}}`. IDs disjuntos, sin ancestros compartidos entre variantes. No descubre anatomía ni convierte imágenes en poses.
- `sprite.state`: selección estática; rechaza pistas de opacidad activas.
- `sprite.keyframe`: id,state,time; visibilidad exclusiva por opacidad step. Inicializa tiempo cero cuando sea necesario. No mezcla silenciosamente una pista continua existente.

Las bibliotecas vuelven a abrirse desde SVG editable. Distribución guarda SMIL y geometría; no incluye bibliotecas de autoría. La interfaz ofrece botones de emoción y estado que crean keyframes en el tiempo actual.

## Atlas y evidencia

Spritesheet produce SVG vectorial, manifest JSON (índice, tiempo, rectángulo) y PNG opcional para motores que consumen sprites raster. No reemplaza el personaje SVG por un bitmap. Hasta 120 cuadros, máximo 4096 px de atlas. Usa pistas MAI; rechaza SMIL/CSS de movimiento importado que no puede congelar estructuralmente.

Preview GIF es una vista de revisión con FPS reducido, no el master. Hasta 240 cuadros y 128 MiB de buffers. El master SVG exportado mantiene el movimiento declarativo.

Validar fotogramas de cada emoción y extremos de articulaciones. Verificar exclusividad de estados en los límites de tiempo, continuidad al cerrar loop, alfa y que editable reabra sus bibliotecas. Prueba CLI aislada en tests/character.test.ts construye el ejemplo desde source+operaciones, hace dry-run y guarda/reabre. Render compara editor y standalone en tres puntos del relato.

## Candy convertido desde PNG

`examples/candy-emotions/candy-editable.svg` usa el candidato aprobado `experiments/color-preserved/candy_alchemist_cat/high-color-preserved.svg`. El original no se modifica; provenance.json registra su hash. `scripts/candy-character.ts` prepara cabeza, ojos, boca y frasco por recortes vectoriales y referencias locales a la geometría original. Las regiones originales siguen editables; sus cambios se reflejan en las partes referenciadas.

72 operaciones reproducibles en candy-operations.json crean seis emociones y parpadeo, 21 pistas y estados exclusivos de efectos. Cabeza, ojos originales y frasco se mueven; cejas/párpados/boca se reconstruyen localmente. El pelaje descubierto necesita revisión artística: esto es una prueba funcional sobre el gato convertido, no un rig anatómico automático ni una animación profesional terminada. Los movimientos están limitados para evitar descubrir regiones ocultas.

Entregas: master editable, standalone sin raster/scripts, GIF de revisión a 6 FPS, seis sprites individuales SVG y atlas PNG opcional con manifiesto. Prueba de fidelidad contra la pose inicial del candidato aprobado y comparación de frame authored/standalone en tests/candy-character.test.ts. Proof definitivo: experiments/candy-approved-character. Las otras carpetas candy-emotions-* son iteraciones de revisión.

Reproducción: ejecutar scripts/candy-character.ts; cargar candy-source.svg con mai load contra la revisión observada; ejecutar mai apply candy-operations.json contra la nueva revisión. Después exportar/renderizar y verificar. En esta sesión la carga y las 72 operaciones fueron realizadas por CLI y aparecieron en el editor, revisión 21.

## Corrección de identidad de Candy
La primera actuación tenía parches de boca/pelaje y aplastaba los iris; el usuario reportó pérdida de facciones. La versión actual preserva ojos, nariz y boca originales, protege sus IDs y usa poses rígidas, párpados discretos y efectos. Se elimina la boca reconstruida y la copia de textura de otras regiones. 83 operaciones, 13 pistas. Esto reduce expresividad facial respecto al morph anterior a cambio de conservar identidad. Ver PRESERVATION.md e identity-profile.json. Las métricas ayudan, pero siguen pendientes valoración artística y preparación anatómica para deformación avanzada.
