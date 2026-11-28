# Plastic Army 🪖

Soldaditos de juguete peleando en un jardín gigante, cuatro equipos y cuatro mesas. Shooter en primera persona que se juega en el navegador (PC y celular) y se puede instalar como app.

**Jugar:** https://plastic-army.github.io/Plastic-army/ (cuando GitHub Pages esté activado)

## Qué tiene este prototipo
- Mapa **Jardín** (al aire libre): cada equipo tiene su mesa como base, puentes-regla con barandas unen las bases, y en el medio hay una gran mesa redonda con sombrilla. Si te caes al pasto, quedas eliminado.
- 3 armas de juguete: **rifle de bolitas**, **escopeta de corchos**, **lanzadardos** (con mirilla), más la **granada de canica**.
- 4 clases: Fusilero, Escudero, Explorador e Ingeniero.
- 4 equipos de 8: Azul (tú + 7 bots), Rojo, Verde y Amarillo (8 bots cada uno). Gana el primero en llegar a 50 eliminaciones.
- Al caer, los soldaditos explotan en confeti (sin sangre).
- Controles de PC (WASD + ratón) y de celular (dos joysticks, disparo automático al apuntar a un enemigo).
- Instalable (PWA) y funciona sin internet después de abrirlo una vez.

## Controles
| PC | Celular |
|---|---|
| WASD moverse · Shift correr · Espacio saltar · C agacharse | Joystick izquierdo: moverse |
| Ratón apuntar · Clic disparar · Clic derecho mirilla | Joystick derecho: apuntar (dispara solo) |
| 1 / 2 / 3 o rueda: cambiar arma · R recargar · G canica | Botones: ARMA, ↻ recargar, ● canica, ▲ saltar, ▼ agacharse |
| Esc pausa | II pausa |

## Para desarrolladores
Es una página estática, sin paso de compilación:
- `index.html` y `css/style.css`: pantalla, menús y HUD.
- `js/game.js`: todo el juego (mapa, física, armas, bots, controles).
- `lib/babylon.js`: motor 3D [Babylon.js](https://www.babylonjs.com/) 7.54.3.
- `manifest.webmanifest`, `sw.js`, `icons/`: lo necesario para instalarlo como app.

Para probar en tu computadora: `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`.
