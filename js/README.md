# Estructura del front-end de LUNARA

`index.html` solo contiene el HTML. Los estilos están en `css/` y el código en `js/`.
Cada persona puede trabajar en sus ficheros sin pisar los de los demás.

## Cómo arrancar

Doble clic en `start_lunara_spice.bat` y abrir `http://127.0.0.1:8765/`.
No abrir `index.html` con doble clic (`file://`): el navegador no carga bien los ficheros sueltos.

## Qué hay en cada fichero

| Fichero | Qué contiene |
|---|---|
| `js/core/state.js` | Constantes, estado compartido (`ephemeris`, `rows`, `currentScenario`…) y utilidades (`$`, `clamp`, vectores) |
| `js/core/ephemeris.js` | Posiciones del Sol y la Tierra: modo demo y lectura de `positions.json` |
| `js/core/geometry.js` | Geometría local, horizonte, elevación/azimut, intervalos de visibilidad |
| `js/core/comms.js` | Comunicaciones con la Tierra: visibilidad de las estaciones DSN y balance de enlace (panel «Link to Earth») |
| `js/data/terrain.js` | Horizontes de terreno por sitio: carga los CSV de LOLA de `horizons/` y los CSV subidos a mano |
| `js/ui/horizon-2d.js` | Vista 2D del horizonte (Sol y Tierra alrededor del sitio); la usan la columna principal y el comparador |
| `js/ui/render.js` | Pintar métricas, resumen de la ventana, gráfica de elevación y línea de tiempo |
| `js/ui/scenes-3d.js` | Escenas Three.js: cielo local con el relieve LOLA y panel «Link to Earth» (Luna, Tierra, estaciones DSN); vista 2D de respaldo |
| `js/ui/comparison.js` | Comparador (4 huecos, añadir sitios desde el hueco libre, 3D/2D, ★ mejor valor) y buscador de sitios |
| `js/data/files.js` | Cargar `positions.json` y CSV de horizonte; exportar informes |
| `js/app/controls.js` | `calculate()` y los listeners de los controles principales |
| `js/data/spice-bridge.js` | Conexión con el servidor Python de SPICE |
| `js/boot.js` | Arranque: carga Three.js, crea las escenas y hace el primer cálculo |
| `js/workspace-controller.js` | Monta el layout de vistas (se ejecuta mientras se lee el HTML) |
| `js/foldout-navigation.js` | Navegación entre secciones plegables |
| `js/intro.js` | Pantalla de introducción |
| `css/01-…` a `css/09-…` | Estilos, en el mismo orden en que estaban en el `index.html` original |
| `css/10-data-panel.css` | Columna derecha de datos (escenario, resumen, vista 2D, lecturas, herramientas) |
| `css/11-compare.css` | Comparador a pantalla completa |

## Terreno LOLA: cómo añadir un sitio

El mapa de alturas LOLA (cientos de MB) nunca se carga en la web. Para cada sitio del catálogo se precalcula
su horizonte (un CSV de ~8 KB) y la web solo carga ese fichero:

1. Añadir el sitio a `tools/sites_south_pole.csv` (nombre, lat, lon).
2. `python tools/lola_horizon.py --download` (solo la primera vez: baja el mapa a `data/lola/`, ignorado por git).
3. `python tools/lola_horizon.py` → genera `horizons/<nombre>.csv`.
4. Añadir el sitio a `PRESETS` en `js/core/state.js` (con `horizon: 'horizons/<nombre>.csv'`) y su `<option>` en `index.html`.

## Dos reglas importantes

**1. El orden de los `<script defer>` de `index.html` importa.**
Los ficheros de `js/core`, `js/ui`, `js/data`, `js/app` y `js/boot.js` son scripts clásicos (no módulos):
lo que uno declara arriba del todo (`let`, `const`, `function`) lo ven los demás.

- Usar algo de otro fichero **dentro de una función** funciona siempre.
- Usarlo **directamente al cargar** (fuera de una función) solo funciona si ese otro fichero va antes en la lista.
- `boot.js` va siempre el último.
- No declarar dos veces el mismo nombre en ficheros distintos (da error).
- No usar `await` fuera de una función (solo vale en módulos); si hace falta, meterlo en `boot.js`.
- Un fichero nuevo necesita su `<script defer src="…">` en `index.html`, en el sitio que le toque.

**2. El orden de los CSS también importa.** Si dos reglas chocan, gana la del fichero que va después.
Para cambiar algo del diseño, mejor editar la regla en el fichero más alto de la lista que la defina,
o añadir los cambios en el fichero de la sección que estéis tocando.
