# Plastic Army 🪖

Soldaditos de juguete peleando por equipos en un jardín gigante, o todos contra todos en la Plaza y en la Casa. Shooter en primera persona que se juega en el navegador (PC y celular) y se puede instalar como app.

**Jugar:** https://plastic-army.github.io/Plastic-army/ (cuando GitHub Pages esté activado)

## Qué tiene este prototipo
- Mapa **Jardín** (al aire libre): las 4 bases (mesas) están al norte, sur, este y oeste. Cada base tiene un puente directo a la gran mesa redonda del centro y puentes anchos (con cosas para cubrirse) hacia las bases vecinas, pasando por ladrillos en las esquinas. Si te caes al pasto, quedas eliminado.
- **3 cajas sorpresa por partida**, una por vez y siempre en la mesa del centro (avisa arriba 5 s antes): escudo (7 s sin recibir daño), mega granada (mata de un golpe, mucho más alcance) o 200 de vida (se pierde al morir). El escudo y la mega granada se usan con la tecla **F** o el botón ⭐. Los bots también las agarran.
- 3 armas de juguete: **rifle de bolitas**, **escopeta de corchos**, **lanzadardos** (con mirilla), más la **granada de canica**.
- 4 clases: Fusilero, Escudero, Explorador e Ingeniero.
- 4 equipos de 8: Azul (tú + 7 bots), Rojo, Verde y Amarillo (8 bots cada uno). Gana el primero en llegar a 50 eliminaciones.
- Al caer, los soldaditos explotan en confeti (sin sangre).
- Controles de PC (WASD + ratón) y de celular (dos joysticks, disparo automático al apuntar a un enemigo).
- Instalable (PWA) y funciona sin internet después de abrirlo una vez.

## Batalla campal (todos contra todos)
- En **Inicio**, arriba de INICIAR, está **Elegir modo**: *Por equipos* (Jardín) o *Batalla campal*. Al tocar Batalla campal se abre **Elegir mapa** con la foto de cada mapa.
- **Plaza**: al aire libre con pasto, fuente, juegos, arenero, glorieta y setos. 16 jugadores (tú + 15 bots). Caes desde el cielo en un lugar al azar.
- **Casa**: casa grande de 2 pisos (cocina, living, comedor, cuarto de juegos y dormitorios arriba, con dos escaleras) y un patio con cerca. 12 jugadores.
- Todos empiezan con la **pistolita de bolitas** en un lugar al azar. Hay armas (rifle, escopeta, lanzadardos) y bolsitas de canicas tiradas por el mapa: se agarran solas al pasar por encima. Si alguien cae, suelta su arma. Las armas del piso vuelven a aparecer en otro lugar 22 s después.
- No se vuelve a aparecer: gana el último soldadito en pie.

## Controles
| PC | Celular |
|---|---|
| WASD moverse · Shift correr · Espacio saltar · C agacharse | Joystick izquierdo: moverse |
| Ratón apuntar · Clic disparar · Clic derecho mirilla | Joystick derecho: apuntar (dispara solo) |
| 1 / 2 / 3 / 4 o rueda: cambiar arma · R recargar · G canica | Botones: ARMA, ↻ recargar, ● canica, ▲ saltar, ▼ agacharse |
| Esc pausa | II pausa |

## Para desarrolladores
Es una página estática, sin paso de compilación:
- `index.html` y `css/style.css`: pantalla, menús y HUD.
- `js/game.js`: todo el juego (mapa, física, armas, bots, controles).
- `lib/babylon.js`: motor 3D [Babylon.js](https://www.babylonjs.com/) 7.54.3.
- `manifest.webmanifest`, `sw.js`, `icons/`: lo necesario para instalarlo como app.

Para probar en tu computadora: `python3 -m http.server` dentro de la carpeta y abre `http://localhost:8000`.
