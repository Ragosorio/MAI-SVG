# Decisiones vectoriales
La fuente de verdad es SVG más metadatos MAI versionados. IDs estables, referencias locales, geometría real; cero imágenes incrustadas para simular vectorización. No redondear globalmente ni fusionar regiones del candidato aprobado.

| Uso | Punto de partida | Qué esperar |
|---|---|---|
| Identidad, accesorios, alfa | high-color-preserved | Hasta decenas de miles de regiones; fidelidad primero |
| Edición local | balanced-color-preserved como candidato | Menos detalle; medir y comparar antes de sustituir |
| Animación de personaje completo | high-color-preserved y pose del grupo | Conserva alfa; coste de render depende de geometría |
| Deformación anatómica | partes reconstruidas y simplificadas | Preparación manual, topología estable y rig explícito |

`npm run mai -- quality --intent motion` explica la decisión sin cambiar el preset por defecto. Comparar a 100% y 400%, silueta, ojos, accesorios y alfa sobre fondos claro y oscuro. Registrar bytes, trazos, comandos, alfa y coste de interacción. Las métricas nunca aprueban estética por sí solas.
