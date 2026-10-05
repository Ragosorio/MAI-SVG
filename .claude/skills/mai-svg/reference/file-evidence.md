<!-- Generated from skills-src by scripts/build-skills.ts — edit the source, then run: npm run skills -->
# Evidencia y calidad
`quality --intent fidelity|edit|motion` recomienda candidato sin convertir ni sustituir. `audit [archivo.svg]` evalúa reglas técnicas con códigos, severidad, objetivo y reparación; ninguna significa aprobación visual. Si no hay archivo usa el documento de la sesión abierta.

Flujo real: inspect → objects/object → JSON → apply --dry-run --expected-revision N → apply --expected-revision N → render --time T → audit → export. Guardar JSON, PNG, reportes y SVG bajo experiments con nombre del caso. Evidencia antes/después debe usar el mismo viewport, tiempos y fondo. Comparar ojos, silueta, accesorios, alfa, articulaciones y cierre del loop.

Para validar app: npm test, npm run typecheck, npm run build. Para movimiento verificar export standalone en varios tiempos; no solo XML. Las pruebas headless Chromium/Firefox/WebKit no prueban Safari nativo. Si el documento no cumple presupuesto no bajar calidad en silencio: crear candidato alternativo y presentar diferencias concretas.

Para automatizar evidencias: `npm run mai -- proof examples/rig-demo-editable.svg --times 0,2.5,5 --output experiments/rig-proof-N`. Para dos variantes: `npm run mai -- compare BEFORE.svg AFTER.svg --times 0,2.5,5 --output experiments/compare-N`. Guarda PNG, SVG, galería HTML y error premultiplicado; usar salida nueva.
