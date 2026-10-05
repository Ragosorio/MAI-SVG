# Trazabilidad de los 44 requisitos

Fecha: 2026-10-04. Fuente: conversación aportada por el usuario y corrección de arquitectura. `Preliminar` significa código local sin cierre del recorrido completo; no aprobación artística ni funcional integral. S0–S4 se definen en [CONTINUATION.md](CONTINUATION.md).

## Sistemas posteriores al corte de agentes

| Hito | Dependencias | Entrega vertical |
|---|---|---|
| V1 Semántica e identidad | S4 | Grafo confirmado, baselines, landmarks, ownership, split/merge que conserva políticas |
| V2 Expresión y capas | V1 | Deformación paramétrica, blink/visemes compatibles, mezcla y elección visual |
| V3 Morph y rig | V1, V2 para rostro | Correspondencias, constraints, meshes, IK/FK y auto-rig asistido con candidatos |
| V4 Movimiento orgánico | V1 y evaluación estable | Humo existente, máscaras/alfa, secondary, fuentes y anclajes; presets verificados por técnica |
| V5 Timeline e interacción | V2–V4 | Clips/layers/retiming, state machine y runtime/editor; graph editor después del modelo probado |
| V6 Conversión y optimización | V1 + gates perceptuales | Pipeline por etapas, segmentación asistida, cleanup/LOD con A/B y presupuestos |
| V7 Exportación y extensiones | Según features exportadas | Matriz por feature/target, bundles y manifest de plugins con límites |

La investigación de cada hito precede implementación. No se exige esperar a V5 para arreglar un fallo de conversión; el orden expresa dependencias del producto, no impide mantenimiento acotado.

| # | Requisito | Estado observado / siguiente hito |
|---|---|---|
| 1 | Semantic Scene Graph | `semantic.ts` preliminar; resolver scope en S0, cerrar ownership/confirmación en V1 |
| 2 | Identity Preservation | Guard y políticas preliminares, bypass demostrado; S0/S1 + baselines V1 |
| 3 | Expresiones paramétricas | `expression.ts` y features preliminares; fixture Candy y mezcla segura S4/V2 |
| 4 | Expression/Animation Layers | Modelo y evaluación preliminar; orden, neutral e interacción entre canales V2 |
| 5 | Morph profesional | `morph.ts` preliminar; correspondencia, esquinas, landmarks e intersecciones V3 |
| 6 | Rig asistido | Base FK/IK/skin/mesh existente; auto-rig y constraints avanzadas pendientes V3 |
| 7 | Image → SVG pipeline | Conversor/GrabCut existente; nuevas etapas/motores y prompts de segmentación V6 |
| 8 | Cleanup inteligente | Simplificación/booleanas existentes; shared boundaries, opacidad/gradientes y A/B V6 |
| 9 | Fluid/Organic Motion | Efectos añadidos existentes y modificadores de forma preliminares; prueba humo original S4/V4 |
| 10 | Secondary Motion | `secondary.ts` preliminar; determinismo de scrub, damping/overshoot y export V4 |
| 11 | Timeline profesional | Pistas base existentes, clips/markers/layers preliminares; nested, graph/easing editor V5 |
| 12 | State Machines | Tipos/operaciones/evaluación preliminares; eventos runtime, guards y blending V5 |
| 13 | Components/Instances | Inserción namespaced existente, authoring preliminar; overrides y referencias sin duplicación V1/V7 |
| 14 | Variants | OptionSpec y combinación preliminar; ownership de slots S1/V2 |
| 15 | Lip Sync | Operación y visemes preliminares; alineación audio/phonemes y convivencia con emoción V2/V5 |
| 16 | Interacciones | No demostradas en editor/runtime; pointer/drag/scroll/custom events V5 |
| 17 | Behavior Graph | No cerrado; editar visualmente el modelo estable de V5, no otro motor |
| 18 | AI Selection / lenguaje | Interpretación del LLM obligatoria; candidatos geométricos preliminares S0/S2/V1 |
| 19 | Comentarios en canvas/timeline | Backend presente, UI pendiente S2 |
| 20 | Choice Boards 2–6 | Servicio ampliado, cierre consistente y UI pendientes S1/S2 |
| 21 | Edición no destructiva | Snapshot/undo existentes; journal coordinado, modifiers y baselines S1/V1 |
| 22 | Procedural Modifiers | Catálogo/evaluación preliminares; fixture, límites y export por modificador V4 |
| 23 | SVG Filters | Operaciones preliminares; grafo de dependencias y controles visuales V4/V5 |
| 24 | Masks/clipping/booleans | Base existente; preview, máscaras animadas y topología V3/V6 |
| 25 | Gradientes/materiales | Gradientes base existentes; tokens/patterns/animación por feature V4/V7 |
| 26 | Optimization Profiles | `profiles.ts` con presupuestos; medir coste real y no degradar V6 |
| 27 | LOD | No demostrado; versiones con comparación y aceptación V6 |
| 28 | Profiler | `profiler.ts` preliminar; diferenciar coste de motor de FPS real en editor S4/V6 |
| 29 | Exportaciones | Editable/SMIL/sprites existentes; otros targets declarados no equivalen a exportador V7 |
| 30 | Compatibility Matrix | Dos pruebas interrumpidas por Firefox; reproducir entorno S0/S4 y ampliar V7 |
| 31 | Perceptual Testing | Métricas existentes/preliminares; coverage y baseline independiente S0/S1/V1 |
| 32 | Animation Critique | Reglas preliminares; medida real distinta de IoU en un caso; craft visual separado S4/V4 |
| 33 | Workflow del agente | Router anterior + servicio preliminar; recorrido externo S0–S4 |
| 34 | Agent IR | Vista de escena existe; plan transaccional falta S1 |
| 35 | SDK | Servicio TS interno no equivale a SDK público; adaptador programático sobre contratos S3/V7 |
| 36 | Plugins | Diseñado en ADR-001, runtime futuro V7; sin carga remota automática |
| 37 | Patrón Impeccable | Router previo existente; fuentes investigadas y pruebas de comportamiento S3 |
| 38 | Contexto duradero | PRODUCT/VECTOR/MOTION presentes; asset knowledge en metadatos/baselines V1 |
| 39 | Detectors deterministas | `detectors.ts` preliminar + auditor previo; cobertura/gates honestos S0/S1 |
| 40 | Mejora segura de skills | Skills editables existentes; workflow diagnose/propose/test/compare/apply S3/V7 |
| 41 | Research Corpus | Docs previos + fuentes de Agent Surface verificadas; resto por cada hito |
| 42 | Research-driven implementation | Gate obligatorio por sistema en CONTINUATION, no breadth por conteo |
| 43 | Candy benchmark permanente | Fixtures previos existentes; baseline fuente + humo original + flujo externo S4 |
| 44 | Petición final completa | Criterio acumulativo S4 + V1–V7; no implementado aún |

## Investigación que falta por sistema

| Sistema | Fuentes primarias por revisar antes de implementar | Pregunta de diseño |
|---|---|---|
| Rig/estado | Rive, Blender constraints, dotLottie | Qué datos persistimos y qué comportamiento requiere runtime |
| Morph/motion | GSAP MorphSVG/MotionPath, SVG 2 | Correspondencias y límites sin copiar código propietario |
| Conversión | VTracer, Potrace, OpenCV, SAM 2 | Etapas, alfa, segmentación y licencia de integración/modelos |
| Cleanup | Paper.js, SVG.js, SVGO | Topología compartida y reducción medida de paths |
| Fluido/filtros | SVG 2, MDN SVG filters, WAAPI | Geometría existente, técnica, loop y compatibilidad de export |
| Export | SVGator, Lottie Creator/dotLottie, specs SVG | Qué se representa, qué se hornea y qué se rechaza |

Esta tabla es una agenda de investigación, no afirmación de que se revisaron todas esas herramientas durante la fase de arquitectura.
