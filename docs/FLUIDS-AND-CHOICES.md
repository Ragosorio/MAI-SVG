# Fluidos y decisiones visuales

## Fluidos disponibles

`fluid.add` genera humo, agua, viento o lava mediante ondas periódicas en curvas cúbicas de topología estable. El humo asciende y se disipa con gradientes de transparencia; agua/viento son cintas de ondas y lava usa flujos más gruesos y lentos. Son efectos vectoriales dirigidos artísticamente, no simulación de física, viscosidad, colisiones ni CFD. No reconstruyen automáticamente un fluido desde sus píxeles.

Investigación: [interpolación de paths SVG](https://w3c.github.io/svgwg/svg2-draft/paths.html) exige estructura compatible; [feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence) y [feDisplacementMap](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap) ofrecen alternativas basadas en filtros. Esta implementación utiliza geometría horneada en el timeline compartido para editar puntos, hacer scrubbing y exportar sin JavaScript. No incorpora un simulador ni afirma haber integrado filtros de turbulencia.

Configuración JSON:
```json
{"id":"steam","kind":"smoke","x":100,"y":200,"width":80,"height":140,"quality":"balanced","cycles":3,"seed":7,"color":"#ef98d7"}
```
Opcional `parent` liga la emisión a una parte preparada (coordenadas locales). Anchura/altura son unidades del SVG. `cycles` entero 1–12 cubre la duración completa; endpoints idénticos cierran el loop. `seed` determina la fase reproducible, no un motor aleatorio de partículas.

Calidades: draft = 3 cintas/8 muestras por ciclo; balanced = 6/16; high = 9/32. Comenzar con balanced, revisar movimiento y facciones, medir tamaño/tiempo y elevar detalle cuando mejore la lectura. High agrega muchas claves y no garantiza realismo. IDs duplicados, geometría inválida o creación dentro de un rasgo protegido se rechazan atómicamente.

```text
mai fluid INPUT.svg --config fluid.json --output OUTPUT.svg
mai fluid --config fluid.json --live --expected-revision N
mai proof OUTPUT.svg --times 0,0.5,1 --output NEW_DIR
mai preview OUTPUT.svg --fps 6 --width 480 --output OUTPUT.gif
```

El modo live ejecuta una transacción compartida: WebSocket actualiza el editor y undo la revierte. Los paths/keyframes generados son editables. Para ajustar un efecto existente, modificar sus claves/curvas o borrar su grupo explícitamente y regenerar con un ID libre. La exportación editable conserva los tracks; standalone los compila a SMIL.

## De imagen estática a efecto

Vectorizar PNG/WebP/JPG con high-color-preserved; marcar la región con segment/separate, revisar la segmentación, aislar el humo/agua existente y conservar una referencia. Separar la anatomía y las partes rígidas del efecto. Ocultar el dibujo estático del fluido mediante una máscara/recorte vectorial deliberado y añadir el emisor dinámico. Comparar borde de unión, cambios de poses, loop y facciones. Candy contiene un recorte explícito del humo original y el emisor en candy-flask; no se borraron paths originales ni se cambiaron los originales de No one.

## Preguntas con vistas previas

El asistente prepara 2–4 opciones reales con operaciones; recomienda una con razón y propone una decisión en la revisión observada. El servidor aplica cada alternativa a una copia, genera PNG en el tiempo indicado y muestra tarjetas en el editor. La propuesta no cambia la revisión ni el dibujo actual. Elegir aplica una transacción con historial; nunca elegir por defecto en nombre del usuario.

```text
mai choices propose examples/candy-emotions/sad-choice.json --expected-revision N
mai choices show
mai choices choose candy-sad-fluid gentle --expected-revision N
mai choices dismiss candy-sad-fluid --expected-revision N
```

`sad-choice.json` es un ejemplo ejecutable con emoción, claves, etiquetas, recomendación y previews a 5.2 segundos. Las opciones pueden cambiar facciones, colores, vestuario, efectos y componentes mediante las operaciones existentes, incluido scene.insert. Para reemplazar un personaje: preparar el componente SVG, retirar el grupo anterior y proponer la inserción; si estaba protegido, la liberación debe ser explícita en esa alternativa y explicada al usuario. No recuperar automáticamente rig/timeline del componente insertado: scene.insert conserva su animación exportada, fuera de las pistas autorales del documento padre. No convertir una propuesta en una promesa de aprobación estética.

Límites: 2–4 alternativas, 500 operaciones por alternativa, request hasta 2 MB; usar componentes preparados y compactos para reemplazos. Previews PNG son miniaturas del selector; maestros/exportaciones permanecen SVG. Se persiste una decisión activa y sus imágenes en .cache/choices. Reiniciar mantiene las opciones. Si otra edición cambia la revisión, elegir retorna 409; descartar/regenerar las vistas. Las rutas mutantes requieren el token local y validan origen. El editor nunca ejecuta instrucciones del texto de una opción.

## Candy y facciones

Tristeza cambia cejas/párpados y permite una lágrima independiente. Iris, nariz y boca mantienen su geometría y sus colores; las facciones pueden evolucionar con candidatos preparados, conservando puntos de referencia y proporciones reconocibles. No reemplazar un hocico complejo por una línea genérica. Distinguir rasgos invariantes de los cambios expresivos intencionales: identity-check mide los primeros; evaluar visualmente los segundos en poses máximas y transiciones. Las métricas no son reconocimiento emocional.

Pruebas: tests/fluid.test.ts verifica cuatro presets, topología, movimiento, loop exacto, fidelidad de SMIL y rollback/protección. tests/choices.test.ts verifica propuesta sin cambios, previews PNG, persistencia, WebSocket, elección/undo, duplicados, conflictos y token. tests/candy-character.test.ts compara la región facial original y fotogramas exportados. scripts/candy-preservation-proof.ts conserva la regresión de la boca anterior y verifica siete tiempos.


Para comparar facciones usar previewRegion {x,y,width,height} en píxeles renderizados: recorta las miniaturas sin modificar el SVG. emotion.update reemplaza una definición existente sin reescribir sus claves previas; aplicar emotion.keyframe en los tiempos intencionales. Candy usa ambos mecanismos para las alternativas de tristeza.
