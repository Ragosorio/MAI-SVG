# Arquitectura implementada

Una aplicación web local servida por Node sobre loopback. Vite compila React; no hay servicio de nube, cuentas ni IA obligatoria. El proyecto SVG es la fuente de verdad y contiene metadatos JSON versionados en `<metadata id="mai-project">`.

- **Converter:** Sharp decodifica a RGBA y normaliza orientación; VTracer WASM se ejecuta en worker con límites y timeout. Color y alfa se trazan por separado. SVGO conservador preserva la composición. Los reemplazos raster se hacen con XML, viewports SVG anidados y prefijos de IDs.
- **Core:** `VectorDocument` mantiene DOM e índice de IDs. Ejecuta operaciones atómicas y valida restricciones; selecciona snapshots de atributos para cambios simples y snapshots SVG para cambios estructurales. Paper.js se carga únicamente en el servicio para booleanas y simplificación seleccionadas. La interfaz no importa Paper ni necesita unsafe-eval.
- **Animation:** comparte interpolación, matrices, FK/IK, pesos, malla y morph entre interfaz, CLI y exportador. Huesos tienen reposo global y heredan la transformación delta del padre. La malla se evalúa antes del skinning. Solo topologías compatibles se interpolan.
- **Export:** SMIL de transformaciones en grupos independientes; atributos y deformación horneados adaptativamente. Los grupos generados se identifican y retiran al reabrir el perfil editable. Nunca se usa script ni raster para ocultar una falla de presupuesto.
- **Service:** cola de transacciones con revisión esperada, journal gzip escrito antes de confirmar, checkpoint atómico, undo/redo y WebSocket. Token por arranque y restricciones de host/origen. Los cambios simples envían parches; los estructurales recargan el SVG.
- **Editor:** una escena SVG nativa para evitar reconciliar decenas de miles de paths con React. Panel de capas paginado; inspector, overlays de puntos/huesos/malla y timeline sobre el motor compartido. El preview mantiene efectos originales, pausa CSS/SMIL y los posiciona en el cabezal.
- **Render:** motor de navegador aislado, red bloqueada, PNG transparente en tiempo determinado; valida SVG antes de abrirlo. Máximo 4096×4096. No constituye publicación.

Límites: SVG/importación 32 MiB y 100,000 elementos; raster hasta 4 millones de píxeles; un worker de vectorización a la vez; 1–500 operaciones/transacción; historial activo 40. Autosave/journal son privados y se excluyen de distribución. Electron es una entrega futura opcional.
