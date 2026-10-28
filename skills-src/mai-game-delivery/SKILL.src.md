---
name: mai-game-delivery
description: Entregar gatos SVG y sprites de MAI a un proyecto de videojuego con rutas, correspondencias y capacidades de reproducción verificadas.
---
# mai-game-delivery

Leer [catálogo](../../../docs/GAME-ASSETS.md) y GAME-ASSETS.json para las 32 correspondencias PNG → SVG y rutas absolutas. assets/vector contiene personajes; assets/animated contiene composiciones con efectos originales. La existencia y validez técnica no significan rig preparado ni aprobación estética de los 32 gatos.

Para un personaje nuevo entregar master editable, standalone vectorial y, si el motor necesita texturas, atlas PNG + manifest. Mantener sprites SVG individuales cuando se requiera edición. Comprobar que el motor del videojuego soporte SMIL antes de recomendar reproducción del SVG autónomo; un importador estático puede mostrar solo el primer frame.

Registrar dimensiones, pivotes, nombres de estados, duración, FPS de preview y presupuesto de memoria. No reemplazar masters por atlas. El agente receptor puede mejorar animaciones/skills del proyecto cuando esté autorizado, manteniendo referencias de facciones y pruebas. No enviar mensajes a otros agentes sin autorización explícita del usuario.
