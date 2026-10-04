# Plan de implementación: MAI SVG

Proyecto independiente en `/Users/roor.osorio/Desktop/MAI SVG`. Fuentes de gatos en `/Users/roor.osorio/Desktop/No one/assets/cats-source`; tratarlas como solo lectura.

## Objetivo y decisiones aceptadas

Convertir PNG/WebP/JPG en geometría SVG, editarla y animarla con timeline y rig avanzado, y ofrecer el mismo motor a agentes mediante CLI con cambios visibles en tiempo real. Priorizar fidelidad sin convertir una ilustración compleja en una caricatura simplificada. No imponer 500 trazos ni un tamaño fijo antes de medir.

Web local React/TypeScript/Vite, servicio Node, workers, WebSocket y motor compartido. Sin cuentas, nube o claves de IA necesarias para el funcionamiento básico. Electron como empaquetado posterior. Tauri no es un requisito.

El SVG es la fuente de verdad. Paper.js se usará únicamente para operaciones geométricas aisladas. SVG-Edit y Glaxnimate son referencias, no motores completos a integrar sin verificar preservación y licencias.

## A. Conversión y decisión visual

1. Copiar fixtures con hashes y procedencia; preservar originales.
2. Comenzar con Candy Alchemist, PNG RGBA de 700×700.
3. Sharp → RGBA → VTracer en worker → alfa vectorial → SVG → SVGO conservador → validación → comparación renderizada.
4. Comparar curvas/polígonos y stacked/cutout, perfiles equilibrados y de alta fidelidad; documentar resultados deficientes, no ocultarlos.
5. Galería con original, zoom, fondos, superposición y métricas. Medir tamaño, formas, comandos, colores, tiempo y memoria con semántica explícita.
6. No confundir regiones trazadas con cola/ojos/patas. Probar modificación y reapertura de un trazo para demostrar geometría real.
7. Si el trazado es demasiado fragmentado, estudiar segmentación por regiones y reconstrucción localizada con gradientes. No presentar investigaciones como funciones disponibles.

**Gate humano explícito del plan:** la elección visual del usuario cierra A; los números no aprueban la apariencia. Preparar comparaciones adicionales no equivale a aprobarlas. No comenzar el editor antes de que haya candidatos validados visualmente en varios estilos.

## B. Generalizar

Comparar Origami (geometría), Canelo (pelaje), Jelly Aquatic (transparencia) y Steampunk (accesorios). Después de establecer calidad aceptable, procesar los 32 con estados aprobado/requiere limpieza/fallido. Se permiten presets distintos por gato.

Entradas: PNG/WebP/JPG, SVG con imágenes base64 y directorios batch. Parsear XML; reemplazar solamente el raster; preservar x/y, viewport, preserveAspectRatio, transforms, classes, gradients, masks, filters y CSS. Prefijar IDs y sus referencias para evitar colisiones. Si existe personaje separado no trazar el PNG compuesto. Producir personaje y composición animada cuando corresponda.

## C. Editor vectorial

Lienzo, capas, inspector y timeline. Selección individual/múltiple/región, zoom/pan/aislamiento, pluma/libre/formas, puntos y manejadores Bézier, dividir/unir/cerrar/simplificar, booleanas, colores/bordes/gradientes/opacidad, grupos/orden/bloqueo/nombres, pivotes y transformaciones, undo/redo y recuperación.

Preparación asistida de cabeza, ojos, orejas, cola, patas y accesorios. Completar manualmente regiones ocultas. Mantener datos XML ajenos a la operación seleccionada.

## D. Timeline y rig avanzado

Keyframes, easing, playback/scrubbing, loops y onion skin. Transformaciones, colores, opacidad y morph de puntos. Huesos jerárquicos, pose de reposo, pesos, cinemática directa e IK para dos segmentos, mallas de control, restricciones y edición de pesos.

Topología estable por pista. Modificar número de puntos exige actualizar explícitamente los keyframes; rechazar interpolación incompatible silenciosa.

## E. SVG editable y autónomo

Guardar geometría y metadatos MAI versionados (capas, rig, pesos, timeline/configuración). Exportar SVG editable con metadatos y de distribución sin ellos. SMIL para transformaciones; hornear rig/malla como animación de trazados, muestreo adaptativo y reducción de keyframes. Sin JavaScript externo o raster de reemplazo. Informar error y tamaño, permitiendo ajustar precisión o duración. Reabrir SVG editable recupera autoría.

## CLI y agentes

Comandos previstos: serve, vectorize, inspect, session attach, apply --expected-revision, render --time, validate, export --profile standalone, history, undo.

UI y CLI comparten transacciones validadas, IDs estables, revisión esperada, historial y JSON. Conflictos rechazan la operación y exigen releer. Broadcast WebSocket de transacciones confirmadas. Medir el objetivo de actualización sencilla <250 ms con un documento de referencia.

Skills: conversión/comparación, limpieza, partes/rig, animación y validación/exportación. Cada skill debe describir funciones existentes y límites reales; no instrucciones para comandos ficticios. Ciclo inspeccionar → modificar → renderizar → comparar → validar con evidencia.

## Verificación y entrega

Tests: transparencia/formatos/errores, pureza SVG, preservación XML, geometría y undo, pesos/IK/topología, roundtrip del rig, exportación en varios tiempos y tolerancias, conflictos CLI/UI y recuperación, imports inseguros y límites, rendimiento representativo.

Compatibilidad: Chrome, Firefox y Safari como documento, inline e img. Separar comprobación estática de animación y compatibilidad real. Entrega completa requiere los 32 validados, editor/rig, exportación autónoma reeditable, CLI vivo y skills verificadas. No marcar completo al terminar solo el conversor.

## Ejecución registrada — 2026-10-04

La selección del usuario de `high-color-preserved` cerró la decisión inicial de fidelidad. Se generaron las 32 salidas vectoriales y composiciones preservadas, y se implementaron las capacidades principales de editor, rig, timeline, exportación y CLI/sesión. El detalle verificable y los límites pendientes están en **STATUS.md**. La conversión técnica de 32 archivos no sustituye su revisión estética ni el trabajo manual de preparación de partes; Safari nativo y endurecimiento/rendimiento para entrega profesional siguen pendientes.
