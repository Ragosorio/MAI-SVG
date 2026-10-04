# MAI-SVG

Conversor local PNG/WebP/JPG → geometría SVG, editor de puntos y animaciones, CLI y sincronización por WebSocket. Proyecto independiente; los originales de **No one** permanecen intactos.

## Abrir

```sh
cd '/Users/roor.osorio/Desktop/MAI SVG'
npm ci
npx playwright install chromium
npm run build
npm start
```

Editor: **http://127.0.0.1:4318/**. Galería de comparación: `npm run mai -- serve --directory experiments/review --port 4317`.

Selecciona un gato o practica con el demo. Importa PNG, WebP, JPG o SVG; `high-color-preserved` es el preset elegido. Guarda SVG editable para recuperar capas, rig y timeline; exporta SVG de distribución para reproducir SMIL sin JavaScript externo.

## Entregables

- `assets/vector/`: 32 personajes SVG, sin imágenes incrustadas.
- `assets/animated/`: 32 composiciones con sus efectos originales y personajes vectoriales.
- `assets/manifest.json`: procedencia, métricas y estado individual.
- `examples/rig-demo-editable.svg`: ejemplo listo de huesos, pesos, malla y timeline.
- `experiments/review/`: comparaciones de fidelidad.
- `experiments/evidence/`: pruebas, auditoría, exportaciones y capturas.
- `packages/core/`: comandos, geometría, keyframes, FK/IK, pesos, mallas y exportación.
- `apps/editor/`: interfaz React; servicio local en `packages/server/`.
- `.agents/skills/`: conversión, limpieza, preparación de partes, animación y validación.

[Uso del editor](docs/EDITOR.md) · [CLI y operaciones](docs/CLI.md) · [Estado y límites](docs/STATUS.md) · [Arquitectura](docs/ARCHITECTURE.md) · [Investigación](docs/RESEARCH.md) · [Dependencias](docs/DEPENDENCIES.md)

## Verificar

```sh
npm run typecheck
npm run build
npm test
npm run mai -- validate assets/vector/candy_alchemist_cat.svg
```

Las ilustraciones trazadas tienen **27,345–73,312 caminos** y alcanzan **11.29 MiB**. Son regiones de color editables; preparar partes anatómicas es un trabajo asistido y manual. La elección del preset no equivale a aprobar visualmente los otros 31 gatos. Ver `docs/STATUS.md`.

Agentes: [guía MAI](.agents/skills/mai-svg/SKILL.md), [adaptación de Impeccable](docs/IMPECCABLE.md). `npm run mai -- capabilities` descubre operaciones reales; `apply --dry-run` ensaya sin guardar. Agregar SVG / imagen permite componer sin sustituir la escena.

Render local: si faltan los binarios Playwright en macOS se usa Chrome oficial instalado. Firefox/WebKit requieren `npx playwright install firefox webkit`; su ausencia no equivale a compatibilidad confirmada.

Ejemplo de actuación: [Milo: emociones y sprites](docs/CHARACTERS.md), master examples/emotions/milo-editable.svg, animación standalone y atlas SVG/PNG de 24 cuadros.


Rutas para videojuegos y correspondencias de los 32 gatos: [GAME-ASSETS](docs/GAME-ASSETS.md), con versiones JSON/CSV. Herramientas de conservación de facciones, separación asistida y ejemplos ejecutables: [PRESERVATION](docs/PRESERVATION.md). Candy corregido vive en examples/candy-emotions; el editor local carga su versión editable.


Fluidos editables y decisiones del asistente con opciones visuales: [guía y CLI](docs/FLUIDS-AND-CHOICES.md). Candy incluye humo ascendente conectado a la botella y candidatos de tristeza que conservan sus facciones.
