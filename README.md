# BlackJack

Blackjack en el navegador, pensado para desplegarse tal cual en GitHub Pages: sin servidor propio, sin build y sin dependencias que instalar.

- **Multijugador con salas privadas.** Creas una sala y compartes un enlace (`…/?sala=K7Q2XM`). Quien lo abre entra directamente en tu mesa. Contraseña opcional, expulsión de jugadores y recuperación del asiento si un invitado recarga la página.
- **Chat dentro de la sala**, con reacciones rápidas.
- **Mesas reales:** Las Vegas Strip, Atlantic City, doble baraja, una baraja, europeo (sin carta tapada) y personalizado (barajas, penetración, H17/S17, pago 3:2 / 6:5 / 1:1, doblar, dividir, redividir ases, rendición, seguro, límites).
- **Formatos:** partida libre, torneo (manos fijas, sin recargas ni ayudas) y entrenador de conteo.
- **Mecánica de casino para poder contar cartas:** zapato barajado una sola vez con barajado criptográfico, carta quemada, carta de corte visible dentro del zapato, bandeja de descartes que crece, reparto en el orden real, carta tapada con revisión del crupier, y todas las cartas de todos los asientos a la vista.
- **Personalización:** tres diseños de carta, baraja de cuatro colores, cinco reversos y seis colores, seis tapetes, cuatro barandas, fichas clásicas o planas, velocidad, sonido, totales ocultables.
- **Guía integrada:** reglas, una mano paso a paso, pagos, modos, tabla de estrategia básica generada para las reglas de cada mesa, conteo Hi-Lo, cuenta verdadera y las 18 desviaciones más rentables.
- **Bots** que juegan estrategia básica para llenar la mesa.

## Publicarlo en GitHub Pages

1. Crea un repositorio y sube el contenido de esta carpeta a la raíz (incluido el archivo `.nojekyll`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En un par de minutos estará en `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

También funciona en cualquier hosting estático. Para probarlo en local basta con servir la carpeta, por ejemplo `python3 -m http.server 8080`, y abrir `http://localhost:8080`. Abrir `index.html` con doble clic no funciona porque los módulos de JavaScript necesitan servirse por HTTP.

## Cómo funciona el multijugador

GitHub Pages solo sirve archivos estáticos, así que las salas funcionan entre navegadores con WebRTC usando [PeerJS](https://peerjs.com/):

- El navegador de quien crea la sala **es la mesa**: ejecuta el motor del juego, valida cada jugada y envía a los demás solo el estado público.
- El servidor gratuito de PeerJS (`0.peerjs.com`) solo sirve para que los navegadores se encuentren. Las partidas y el chat viajan cifrados (DTLS) directamente entre jugadores; si una red no permite la conexión directa, se usan los servidores TURN de PeerJS.
- Si el anfitrión cierra la pestaña, la sala se cierra para todos. Si un invitado recarga, recupera su asiento durante 90 segundos.

### Usar tu propio servidor de señalización

El servidor público de PeerJS es gratuito y puede saturarse. Si quieres uno propio:

```bash
npm install -g peer
peerjs --port 9000 --key peerjs --path /
```

Y en `js/config.js`:

```js
export const PEER_OPTIONS = { host: 'tu-servidor.example.com', port: 443, path: '/', secure: true };
```

Si haces un fork, cambia también `ROOM_PREFIX` en ese archivo para que tus salas no compartan espacio de nombres con otras copias.

## Seguridad

- El anfitrión es autoritativo: los invitados solo envían intenciones (`pedir`, `apostar`…) que se validan contra el turno, el asiento, la fase, los límites de la mesa y la banca. Un clic duplicado no pide una carta de más.
- Los mensajes de red pasan por una lista blanca de tipos y acciones, con límites de tamaño, de rango y de ritmo (incluido el chat).
- Los invitados nunca reciben el orden del zapato ni la carta tapada del crupier antes de que se descubra.
- Todo el texto que viene de la red (nombres, chat, avisos) se pinta con `textContent`; además hay una Content Security Policy sin `unsafe-inline`.
- Los códigos de sala y el barajado usan `crypto.getRandomValues` sin sesgo de módulo.
- Límite inherente al modelo P2P: el anfitrión tiene el motor en su navegador y podría inspeccionar el zapato con las herramientas de desarrollo. Para jugar con amigos es aceptable; para algo competitivo con desconocidos haría falta un servidor de confianza.

## Estructura

```
index.html            página única
css/styles.css        estilos
fonts/                Limelight, Barlow y Barlow Condensed (SIL OFL)
js/config.js          configuración de red y límites
js/engine.js          motor de la mesa (sin DOM)
js/shoe.js            zapato, barajado y carta de corte
js/rules.js           modos, formatos y ventaja de la casa
js/strategy.js        estrategia básica y desviaciones Hi-Lo
js/count.js           conteo Hi-Lo calculado con las cartas vistas
js/protocol.js        validación de mensajes y limitador de ritmo
js/net.js             transporte PeerJS
js/room.js            sala en solitario, anfitrión e invitado
js/prefs.js           preferencias y datos guardados en el navegador
js/audio.js           sonidos sintetizados con Web Audio
js/ui/                mesa, controles, panel lateral, diálogos y guía
js/vendor/peerjs.min.js  PeerJS 1.5.5 (MIT)
```

## Atajos de teclado

`1`–`5` pedir, plantarse, doblar, separar y rendirse · `Intro` repartir · `S` / `N` seguro · `?` consejo · `C` contador.
