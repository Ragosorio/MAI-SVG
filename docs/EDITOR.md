# Uso del editor

## Lienzo y capas

Selecciona con ↖, Shift para añadir objetos, o selección por región. Busca capas por nombre o ID; se muestran 80 por página para evitar montar decenas de miles de controles. Zoom con +/− o Ctrl/Cmd + rueda; usa ✥ para desplazar y Centrar para recuperar el lienzo. Aislar oculta las otras formas solamente en la vista.

Pluma crea puntos con clics; **Terminar trazo** completa un trazado. Dibujo libre, rectángulos y círculos se completan arrastrando. En Puntos y curvas, arrastra anclas o manejadores Bézier. Selecciona el extremo de un segmento para añadir, borrar, dividir o convertir una línea a curva. Unir y las booleanas requieren dos trazos hermanos. Simplificar opera solamente sobre la selección.

El inspector cambia nombre, bloqueo, colores, grosor, opacidad, gradientes, pivote y pose. Las transformaciones originales se conservan. Las booleanas hornean las transformaciones propias de los dos operandos; deben estar libres de rig y animación. Los grupos con efectos heredados no se separan silenciosamente.

## Partes y alfa

La vectorización utiliza una máscara **vectorial** para conservar alfa parcial. Al abrir un personaje, el editor mueve esa máscara al grupo de arte; mover el grupo mueve también su transparencia.

Selecciona regiones hermanas y usa **Preparar parte** para llevarlas a un grupo independiente con alfa. Esto coloca la parte delante del resto: revisa las oclusiones y corrige el orden. Nombra cabeza, cola, ojos, accesorios, etc. Completa zonas ocultas manualmente con la pluma.

Una máscara fija sobre un padre puede recortar un trazo deformado. El motor rechaza ese binding. Para usar huesos o mallas en esas partes, reconstruye los bordes con opacidad/gradientes y elimina explícitamente la máscara de parte desde el inspector. **Quitar una máscara cambia la transparencia**; compara el resultado. Esta primera implementación no reconstruye automáticamente una transparencia preparada para deformación.

Los rigs trabajan en coordenadas del documento. Los trazos deben quedar bajo padres sin transformaciones ni viewports SVG anidados. Trabaja sobre el personaje vectorial; conserva la composición original como referencia separada.

## Timeline

Scrubbing con el deslizador o Tiempo exacto. Selecciona propiedad, valor, easing y **Crear keyframe**. Para `d`, se captura la geometría visible; la cantidad y tipos de segmentos deben coincidir. Clic en un diamante salta al tiempo; doble clic lo borra. Hay easing lineal, suave y por pasos, loops y onion skin para hasta cinco trazos seleccionados.

Reproducir evalúa el mismo motor que el CLI. La duración máxima es 300 s y el proyecto admite 1–60 FPS. No se garantiza reproducción a 60 FPS para ilustraciones de 70,000 trazos; reduce complejidad o anima grupos preparados.

## Huesos y mallas

Con ⟷ arrastra para crear un hueso; selecciona Padre al crear para encadenarlo. La posición de reposo de cada hueso se guarda en coordenadas globales. El hijo comienza en el extremo del padre. Cambia rotación y límites en el inspector. Arrastra el extremo de un hijo para IK de dos segmentos; los límites pueden impedir alcanzar el objetivo.

Selecciona trazos preparados y Asignar huesos. Los pesos iniciales usan los dos huesos más próximos; selecciona un punto, hueso y peso para corregirlos. Malla 3 × 3 crea nueve controles; arrástralos o selecciona `meshX`/`meshY` para animar el último control elegido. La malla actúa antes de los pesos de huesos. `boneRotation`, `boneX`, `boneY` animan el hueso seleccionado.

La topología queda estable al vincular un rig o animar `d`. Desvincula el rig y elimina las pistas de `d` antes de crear o borrar segmentos. Máximo: 128 huesos, 500 partes vinculadas, 100,000 puntos/manejadores de rig y 5,000 pistas.

## Guardado

Autosave local en `.cache/current.svg`, con transacciones durables en `.cache/events/`. Deshacer/rehacer conserva 40 transacciones en memoria y recupera historial al reiniciar. No borres `.cache/` mientras estés trabajando.

Guardar SVG guarda una copia en `exports/` dentro de MAI SVG y ofrece descargar el perfil editable: geometría, SMIL y metadatos MAI v1. Importarlo restaura las operaciones editables; las envolturas generadas no se acumulan. Exportar animación guarda en `exports/` y ofrece descargar la distribución sin metadatos ni scripts. Las deformaciones se hornean a animación de `d` con muestreo adaptativo. Si el presupuesto no se cumple, la exportación falla e informa por qué; nunca sustituye geometría por raster.

Render PNG captura un fotograma con Chromium aislado. Incluye CSS original y SMIL en el tiempo elegido. El SVG autónomo reproduce su animación; el rig se recupera solamente del perfil editable.

El servidor confirma el archivo guardado aunque el navegador integrado no complete la descarga. El CLI también puede elegir una ruta de salida. Los SVG de distribución importados conservan sus animaciones nativas, pero solamente el perfil editable recupera las pistas de autoría.

Para practicar rig sin la fragmentación del raster, importa `examples/rig-demo-editable.svg`: contiene dos huesos de cola, pesos, una malla y keyframes. Los puntos vinculados se mueven en reposo; fuera de reposo se pueden seleccionar para editar pesos, pero primero vuelve a reposo o desvincula el rig para cambiar su geometría.
