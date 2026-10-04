# Estado de implementación — 2026-10-04

## Decisión de calidad

El usuario eligió **high-color-preserved**: «que sea el high-color-preserved ese es». Se conserva el candidato original elegido; es ahora el predeterminado del conversor, importación y batch. Registro: `QUALITY-SELECTION.json`.

## Implementado

| Área | Resultado verificable |
|---|---|
| Conversión | 32 personajes y 32 composiciones SVG válidas, cero raster; PNG/WebP/JPG y SVG con imágenes incrustadas; batch y comparación |
| Preservación | Hashes de los 32 originales/fixtures coinciden; auditoría estructural de las 32 composiciones conserva nodos, atributos y CSS originales |
| Geometría | Selección, región, zoom/pan/aislamiento, pluma/dibujo/formas, anclas y handles, creación/subdivisión/borrado de puntos, curvas, dividir/unir/cerrar/simplificar/booleanas |
| Capas y estilo | Agrupar, ordenar, bloqueo, nombres, colores, grosor, opacidad, gradientes lineales/radiales, pivotes y poses |
| Animación | Keyframes, interpolación, easing, scrubbing, loop, reproducción, onion skin de trazos; transformaciones, opacidad, color y `d` |
| Rig | Reposo global, jerarquía FK, límites, IK de dos segmentos, pesos normalizados, corrección por punto, malla y keyframes de controles |
| Guardado | SVG editable con metadatos v1; distribución SMIL sin scripts/raster; deformación horneada adaptativamente, presupuestos explícitos; archivos locales en exports/ |
| Agentes | CLI comparte operaciones, revisiones esperadas, transacciones atómicas, historial/undo/redo, journal/recovery y WebSocket; cinco skills validadas |

## Evidencia actual

- `npm run typecheck` y `npm run build`: pasan.
- `npm test`: **20 pruebas, 20 pasan**; ver `experiments/evidence/editor-tests.tap`.
- `assets-audit.json`: **32/32 válidos**, cero raster; 27,345–73,312 paths, hasta 11,840,605 bytes.
- `browser-compatibility.json`: transformaciones SMIL comparadas con el motor en Chromium, Firefox y WebKit, tres tiempos por motor.
- `embedding-compatibility.json`: SVG como documento y `<img>` en esos motores. Para `<img>`, animación no repetida de 1 ms congelada en la pose final; no controla tiempos arbitrarios dentro de la imagen. La prueba inline usa pauseAnimations/setCurrentTime.
- Las capturas transparentes se verifican con Chromium; Firefox/WebKit se compararon con fondo opaco por una limitación del renderer de Firefox en macOS.
- `session-benchmark.json`: tiempo de transacción del servicio y arranque+CLI/WebSocket medidos por separado; undo, redo, conflictos, autenticación y recuperación al reiniciar comprobados.
- `ui-benchmark.json`: **24 ms** desde emisión de WebSocket hasta dos requestAnimationFrame en el editor abierto, sobre una edición simple de Candy. Excluye arranque del CLI y trabajo del servicio; es una muestra, no percentiles de rendimiento.
- Verificación visual en el editor: gato complejo visible, selección de cola del demo, punto arrastrado/deshecho, creación de keyframes y cambio del CLI visible sin recargar.
- `candy-floating-editable.svg`, `candy-floating-standalone.svg` y `candy-frame-2.5.png`: personaje real con movimiento global, 49,661 paths, 7.91 MiB, cero raster. No es un rig anatómico reconstruido. `examples/rig-demo-editable.svg` sí contiene dos huesos, skin y malla animados sobre el gato de práctica; su distribución y fotogramas también se guardaron.
- `skills-validation.txt`: las cinco skills pasan el validador.
- `npm-audit.json`: **0 vulnerabilidades** tras actualizar Sharp y SVGO; licencias y versiones en DEPENDENCIES.md y licenses/.

## Límites y trabajo de calidad pendiente

Esta es una implementación funcional de las capacidades principales, con verificación local. No se presenta como una suite profesional terminada ni como validación estética automática de toda la colección.

1. Los otros 31 gatos requieren revisión visual individual. Todos tienen mucha fragmentación y están etiquetados `requires-cleanup`, incluso si conservan bien su apariencia. No hay reducción automática a pocas formas anatómicas.
2. Las zonas ocultas y partes para rig se preparan manualmente. Una máscara de alfa fija no puede deformarse automáticamente con el trazo: el binding bajo esa máscara se rechaza. Preparar parte permite movimiento rígido preservando alfa; para deformación hay que reconstruir opacidad/gradientes o quitar la máscara explícitamente y revisar los bordes.
3. No se promete 60 FPS con 70,000 caminos. La carga/operaciones estructurales pueden tardar segundos. La muestra de propagación rápida no demuestra ese rendimiento para todas las escenas o rigs.
4. WebKit no equivale a una prueba de **Safari nativo**: esta sigue pendiente. Tampoco se probó cada gato en cada navegador y contexto.
5. El muestreo adaptativo verifica cuartos/medios/tres cuartos de intervalos: su error reportado no es una cota matemática continua. Mezclar saltos y curvas en una pista puede exceder presupuesto y rechazarse; ajustar las pistas en vez de rasterizar.
6. Abrir el perfil de distribución conserva la animación nativa, pero no reconstruye pistas/rig de autoría; usa el editable para roundtrip completo.
7. El navegador integrado no confirmó el evento de descarga de un blob durante la primera prueba. La interfaz ahora guarda siempre el archivo en MAI SVG/exports y ofrece descarga HTTP; el archivo creado desde el botón se confirmó en disco y el guardado/descarga del servicio se verifican en la prueba de sesión.
8. Electron/distribución instalable quedan como entrega posterior opcional; no hubo publicación ni despliegue.

Reproducir y evaluar con README.md, EDITOR.md y CLI.md. No borrar .cache/ durante una sesión activa; contiene el autosave y el historial.

## Extensión de agentes y composición — 2026-10-04
Contexto PRODUCT/VECTOR/MOTION y skill mai-svg inspirados en Impeccable. CLI capabilities/quality/audit, transacciones dry-run, composición con namespaces, canvas, cuatro recetas de keyframes y edición/copia de pistas. Proof/compare generan evidencia visual en tiempos definidos.
Limitación de composición: CSS/keyframes se aíslan mediante parser; reglas globales no soportadas requieren estilos inline; animación y rig importados se compilan a SMIL, no se fusionan sus metadatos con el timeline/rig de la escena. Las geometrías y poses del componente sí se editan.

Verificación de esta extensión: 24 pruebas funcionales pasan, 0 fallos; typecheck/build pasan, seis skills válidas. Render/proof/compare verificados con Chrome oficial instalado. Las dos pruebas de compatibilidad completas fallan por ausencia de ejecutables Firefox/WebKit en este entorno; no se presentan como aprobadas. Evidencia: experiments/evidence/agent-delivery.json.

## Personajes, emociones y sprites — 2026-10-04

Bibliotecas reutilizables de emociones y estados de sprites, operaciones atómicas en CLI/editor, morph facial de topología estable y keyframes discretos. Exportación de atlas SVG con manifiesto y PNG opcional, y preview GIF local; los maestros siguen siendo SVG.

Demostración: `examples/emotions/milo-editable.svg`, construido con 129 operaciones reproducibles. Seis emociones, parpadeo, 26 pistas, dos huesos para cola articulada, saludo, anticipación, salto y squash/stretch. Atlas de 24 fotogramas y SVG autónomo sin raster ni scripts. Milo es dibujo vectorial preparado para demostrar actuación; no demuestra extracción automática de anatomía de Candy ni calidad profesional automática.

Verificación: 29 pruebas funcionales pasan, incluyendo CLI, roundtrip de bibliotecas, rollback, exclusividad de sprites y comparación de fotogramas del SVG exportado en Chrome. Typecheck/build pasan. Firefox/WebKit siguen pendientes por ausencia de ejecutables. Checkpoint de Candy: `experiments/evidence/candy-before-emotions-autosave.svg`. Ver `docs/CHARACTERS.md` y `experiments/evidence/character-tests.tap`.

## Candy real: actuación desde la conversión aprobada

Se añade examples/candy-emotions con master SVG editable y autónomo, seis emociones, parpadeo y sprites del Candy high-color-preserved original. Preparación localizada manual de regiones, sin reemplazar la ilustración por otro gato ni rasterizar el master. 72 operaciones del CLI aplicadas en vivo (revisión 21), 21 pistas. Conservar limitaciones de reconstrucción facial y anatomía oculta; no se declara calidad profesional terminada. Evidencia visual en experiments/candy-approved-character y prueba de fidelidad en experiments/evidence/candy-character-tests.tap.


## Conservación de facciones y entrega al videojuego — 2026-10-04

Catálogo de 32 entradas: GAME-ASSETS.md, GAME-ASSETS.json y GAME-ASSETS.csv. PNG → SVG conserva el nombre base; personajes en assets/vector y composiciones en assets/animated. Las aprobaciones visuales individuales pendientes aparecen en el catálogo.

Se añadieron segment (OpenCV GrabCut con rectángulos guía, PNG/WebP/JPG), separate (máscaras vectoriales y fuente compartida), identity-check (MAE RGBA por regiones y tiempos), gate opcional de identidad durante vectorize y identity.protect/release en motor/inspector. No hay inferencia anatómica automática ni reconstrucción de partes ocultas.

Candy corregido: se eliminaron las bocas sustituidas y el aplastamiento de iris. Boca y nariz permanecen en la cabeza original; los ojos originales mantienen su geometría. Las expresiones usan actuación rígida, párpados temporales y efectos. 83 operaciones, 13 pistas, 4 regiones protegidas. Se regeneraron editable/standalone, seis sprites SVG, atlas PNG opcional y GIF de 54 fotogramas. Cargado en el editor local, revisión 22.

Prueba de regresión: la variante antigua es rechazada; la corregida pasa siete tiempos (0, .66, 1.6, 2.8, 4.1, 5.2, 6.5). MAE nariz .2989 y boca .0702 sobre 255 después de alinear movimiento rígido. Es comparación de regiones, no reconocimiento semántico ni aprobación artística. Evidencias: experiments/identity-regression y experiments/evidence/candy-identity-regression.json.

Validación: typecheck y build pasan; npm test ejecutó 36 pruebas: 34 pasan, 2 fallan por ejecutables de Firefox/WebKit ausentes. La compatibilidad completa permanece pendiente. Diez skills pasan quick_validate; se añadieron mai-preserve-identity, mai-separate-parts, mai-game-delivery y mai-refine-animation. El validador YAML se instaló solo en /private/tmp, no como dependencia del producto.

Límites actuales: Candy tiene aproximadamente 49.674 paths y 8,3 MB; falta optimización medida para videojuegos. Las máscaras conservan la imagen en reposo y soportan poses rígidas; rig deformable/anatomía necesitan preparación. Las nuevas skills autorizan mejorar instrucciones y animación local manteniendo referencia y regresiones.


## Fluidos vectoriales y decisiones con previews — 2026-10-04

Fluid.add / mai fluid admite smoke, water, wind y lava en calidad draft/balanced/high. Genera curvas periódicas de topología estable y loop exacto, con gradientes de transparencia para humo. Son efectos artísticos, no física, colisiones, viscosidad o CFD. La conversión de la región estática requiere identificar/recortar el efecto; no se reconoce automáticamente un fluido desde una imagen.

Candy aprobado mantiene sus paths originales y las facciones. Un recorte vectorial oculta solamente el humo estático; el nuevo emisor está ligado a candy-flask. Se añadieron cejas/párpados expresivos y una lágrima opcional, sin sustituir el hocico por una línea. 84 operaciones, 25 pistas. Aplicado mediante CLI load + apply: revisión 24, transacción de 3294.88 ms en este gato complejo. WebSocket actualizó el editor; esta medida no cumple un presupuesto de 250 ms para Candy.

Choices propose/show/choose/dismiss admite 2–4 alternativas, recomendación razonada, previews PNG enfocables, persistencia y revisión esperada. Proponer no modifica la escena. Elegir es una transacción reversible; una edición posterior invalida las alternativas (409). El selector del editor muestra dos opciones reales de tristeza a 5.2 s y espera elección del usuario. Emotion.update reemplaza una definición sin reescribir claves anteriores; las alternativas incluyen las nuevas claves explícitamente.

Pruebas actuales: npm test 41 pruebas, 39 pasan y 2 fallan por falta de los ejecutables de Firefox/WebKit. Typecheck y build pasan. Skills mai-svg/mai-refine-animation actualizadas y validadas. Fluidos: topología, loop, playback/exportación SMIL y rechazo atómico. Decisiones: previews sin edición, recorte de facciones, persistencia, WebSocket, elegir, undo, duplicados, conflictos y token. CLI fluid genera un SVG editable real. Regresión de nariz/boca: rechaza el caso antiguo y aprueba siete tiempos con los efectos actuales.

Entregables: examples/candy-emotions/{candy-editable.svg,candy-standalone.svg,candy-preview.gif,sad-choice.json,options/,sprites/}; guía docs/FLUIDS-AND-CHOICES.md y evidencia experiments/evidence/{fluids-full-suite.tap,candy-fluid-identity.json,candy-fluid-live-apply.json,candy-sad-choice-live.json,candy-fluid-choice-editor.png}. Son previews y candidatos locales; queda revisión artística y optimización de los SVG grandes.
