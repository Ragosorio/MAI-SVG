# Animar
Consultar MOTION.md. Ejemplo ejecutable: examples/agent-motion.json sobre demo. Ajustar pivote para giros y comprobar alpha en extremos. Recetas rechazan pistas existentes: usar keyframe.delete o track.edit delete de forma explícita si el reemplazo fue solicitado.

Copiar pista: {"type":"track.copy","target":"tail","to":"body","property":"y","offset":0}. El destino debe estar libre y aceptar esa propiedad. Estirar: {"type":"track.edit","target":"body","property":"y","action":"stretch","amount":0.5}. Se estira desde el primer keyframe; no modifica duración global. Invertir invierte valores en el intervalo; revisar easing y dirección. Desplazar usa segundos.

El ciclo de evidencia usa render a 0, duración/2 y duración. Añadir tiempos de máximos, contactos y articulaciones cuando importen. Export standalone y editable, reabrir editable, comparar fotogramas. No llamar listo al movimiento por tener keyframes.
