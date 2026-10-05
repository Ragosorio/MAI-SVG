# Dependencias utilizadas

Versiones fijadas en package.json y package-lock.json. Licencias copiadas del paquete instalado en docs/licenses/. No se integra SVG-Edit, Glaxnimate, Inkscape ni Potrace como dependencias; son referencias de investigación.

| Paquete | Versión | Licencia |
|---|---|---|
| @visioncortex/vtracer | 1.0.0-alpha.4 | MIT OR Apache-2.0 |
| @xmldom/xmldom | 0.9.12 | MIT |
| paper | 0.12.18 | MIT |
| playwright | 1.63.0 | Apache-2.0 |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| sharp | 0.35.5 | Apache-2.0 |
| svgo | 4.1.0 | MIT |
| svgpath | 2.6.0 | MIT |
| ws | 8.22.0 | MIT |
| @types/node | 22.19.0 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/ws | 8.18.2 | MIT |
| tsx | 4.20.6 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vite | 8.3.2 | MIT |

Sharp distribuye componentes nativos con avisos adicionales (libvips y codecs): revisar sus licencias transitivas antes de empaquetar una aplicación redistribuible. Electron no está incorporado. Los gatos se copiaron del proyecto local para uso privado; estas licencias de código no conceden derechos sobre esas ilustraciones.

La conversión aceptada de los 32 gatos conserva los archivos generados antes de la actualización de Sharp 0.34.5 → 0.35.5 y SVGO 4.0.1 → 4.1.0. Las nuevas operaciones usan las versiones corregidas, con pruebas de regresión. No se regeneró silenciosamente el candidato visual elegido. npm-audit.json registra el resultado actual.

Composición CSS: css-tree 3.1.0 (MIT), @types/css-tree 2.3.10 (MIT, desarrollo). Parser solo servidor, no aumenta bundle del editor. Fuente: https://github.com/csstree/csstree.


Segmentación asistida: Python externo, opencv-python 5.0.0.93 (OpenCV 5.0.0) y numpy 2.0.2, fijados en scripts/requirements-segmentation.txt. OpenCV moderno usa Apache-2.0: https://opencv.org/license/. El paquete Python incluye avisos propios y de terceros; conservarlos al redistribuir. No está incorporado al bundle JavaScript. PyYAML 6.0.3 se usó exclusivamente en /private/tmp para validar skills.

## Superficie para agentes (2026-10-04)

| Paquete | Versión fijada | Licencia | Uso |
|---|---|---|---|
| ajv | 8.20.0 | MIT | Validador JSON Schema 2020-12 único para CLI, API HTTP, MCP y planes `mai.agent-plan/v1` |
| @modelcontextprotocol/sdk | 1.32.0 | MIT | Servidor MCP por stdio (`mai mcp`) y cliente en las pruebas de paridad; arrastra express/hono/zod como dependencias transitivas del SDK |
| zod | 3.25.76 | MIT | Dependencia par del SDK MCP |

`npm audit`: 0 vulnerabilidades tras la instalación. Entorno de pruebas: navegadores Playwright 1.63 (Firefox, WebKit 26.6) instalados en la caché de Playwright del usuario; Chromium se resuelve con Google Chrome instalado. Segmentación OpenCV: entorno local `.venv-segmentation/` (Python 3.12, `scripts/requirements-segmentation.txt`, ignorado por git); `MAI_PYTHON` permite otro intérprete.
