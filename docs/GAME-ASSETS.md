# Gatos para el videojuego

Personajes: /Users/roor.osorio/Desktop/MAI SVG/assets/vector

Composiciones: /Users/roor.osorio/Desktop/MAI SVG/assets/animated

Preset: high-color-preserved. Los originales no se modifican. Usar personajes para preparar rigs; las composiciones conservan efectos originales. Los 32 SVG existen; la revisión visual individual sigue pendiente salvo la selección realizada por el usuario.

| PNG original | SVG vectorial |
|---|---|
| alien_galaxy_cat.png | alien_galaxy_cat.svg |
| arce_autumn_cat.png | arce_autumn_cat.svg |
| bytewhisker_cat.png | bytewhisker_cat.svg |
| candy_alchemist_cat.png | candy_alchemist_cat.svg |
| canelo_cozy_cat.png | canelo_cozy_cat.svg |
| cyber_bloom_cat.png | cyber_bloom_cat.svg |
| deepsea_sprite_cat.png | deepsea_sprite_cat.svg |
| fossilstone_guardian_cat.png | fossilstone_guardian_cat.svg |
| iridescent_origami_cat.png | iridescent_origami_cat.svg |
| jelly_aquatic_cat.png | jelly_aquatic_cat.svg |
| kintsugi_tea_spirit_cat.png | kintsugi_tea_spirit_cat.svg |
| lantern_spirit_cat.png | lantern_spirit_cat.svg |
| lumen_lens_cat.png | lumen_lens_cat.svg |
| margarita_daisy_cat.png | margarita_daisy_cat.svg |
| masquerade_phantom_cat.png | masquerade_phantom_cat.svg |
| mecha_neon_cat.png | mecha_neon_cat.svg |
| menta_botanical_cat.png | menta_botanical_cat.svg |
| mochi_bell_cat.png | mochi_bell_cat.svg |
| molten_ember_cat.png | molten_ember_cat.svg |
| mushroom_druid_cat.png | mushroom_druid_cat.svg |
| neon_glitch_cat.png | neon_glitch_cat.svg |
| nori_lunar_cat.png | nori_lunar_cat.svg |
| nube_dream_cat.png | nube_dream_cat.svg |
| prism_crystal_cat.png | prism_crystal_cat.svg |
| regal_cosmic_cat.png | regal_cosmic_cat.svg |
| sakura_whisper_cat.png | sakura_whisper_cat.svg |
| selene_moonlit_cat.png | selene_moonlit_cat.svg |
| sol_sunbeam_cat.png | sol_sunbeam_cat.svg |
| sonata_prima_cat.png | sonata_prima_cat.svg |
| steampunk_clockwork_cat.png | steampunk_clockwork_cat.svg |
| stormcloud_elemental_cat.png | stormcloud_elemental_cat.svg |
| storybook_ink_cat.png | storybook_ink_cat.svg |

Rutas completas y estado: GAME-ASSETS.json y GAME-ASSETS.csv. Candy animado corregido se entregará separado de estos originales.

## Entrega a NO ONE LIKE CATS (2026-10-05)

- `npx tsx scripts/game-export.ts assets/vector "<No one>/game/public/cats-svg"` genera el perfil **game-compact/v1**: mismo SVG high-color-preserved, solo fusiona tramos `L` colineales y reescribe comandos relativos. IDs, colores, máscara alfa y orden intactos; `mai compare` da MAE 0 y error máximo 0 (neon_glitch). 262 MB → 190 MB. Pruebas: `tests/game-export.test.ts`.
- Rigs de juego en `exports/game-rigs/<gato>.rig.json` (`mai.game-rig/v1`): nodos semánticos `head` (elipse + `neck`), `ear-*` (`base`/`tip`), `eye-*` (`inner/outer/upper/lower/iris` como la plantilla `eye`), `tail` (espina) y `prop-float`. Anotados por agente con cuadrícula; `status: proposed`, revisión visual pendiente.
- El juego (PixiJS) no reproduce SMIL: rasteriza el SVG puro a 1.5× y lo deforma en una malla con esos rigs (`game/src/art/livingCat.ts`, compacto en `game/src/data/catRigs.json`). Mantener ambos en sincronía si se edita un rig.
