# Notillas: plan de desarrollo

PWA de notas a mano alzada pensada para stylus. Funciona en celular, tablet y compu, y sincroniza entre dispositivos con Firebase.

## 1. Decisiones principales

| Tema | Decisión | Por qué |
|---|---|---|
| Trazos | **perfect-freehand** (~4 KB, sin dependencias) para lapicera y goma por área; el resaltador usa un trazo de ancho fijo | Da grosor variable con presión real, y simula la presión con mouse o dedo. No hace falta una librería de pizarra. |
| Render | Tres canvas apilados: **fondo** (hoja), **tinta** (trazos confirmados, con caché) y **vivo** (trazo en curso, predicción, lazo, ajuste de forma) | El trazo en curso redibuja solo una capa chica. El fondo nunca se mezcla con la tinta. |
| Páginas | Tamaño fijo tipo A4 (1240 × 1754 unidades), **apiladas en scroll vertical continuo** | Es lo que se espera de una app de notas (como Goodnotes o Samsung Notes) y facilita exportar a PDF. |
| Organización | **Carpetas planas** (un solo nivel), más «Todas las notas» | Es lo más simple de mantener: un campo `folderId` por nota. Las etiquetas agregan UI de filtros y no suman mucho al principio. |
| Firestore | **Un documento por trazo**, dentro de `pages/{id}/strokes` | No hay límite de 1 MB por página. Cada trazo se agrega o se borra solo, así que no hay conflictos entre dispositivos. |
| Puntos | Se guardan como **`Bytes`** (Int16 cuantizado a 1/10 de unidad, con la presión en 0–255) | Ocupan unas 4 veces menos que un array de números, y Firestore no indexa cada número. |
| Miniaturas | WebP chico (~10–20 KB) en base64 dentro del documento de la nota | Así no hace falta Firebase Storage, que hoy exige el plan Blaze. |
| PDF | **jsPDF**, cargado bajo demanda, con trazos **vectoriales** | El PDF queda nítido y liviano, y no suma peso al inicio de la app. |
| Tests | **Vitest** para el reconocimiento de formas, la codificación, la geometría y el historial de deshacer | Son módulos puros, sin DOM. |
| Estado de UI | React y un store chico (Zustand, ~1 KB). El lienzo es **imperativo** (fuera del ciclo de render de React) | Así React no re-renderiza en cada `pointermove`. |

### Lo que ya aprendimos en la pizarra de efecen y vuelve a aplicarse acá

- **Sin `getContext('2d', { desynchronized: true })`.** En la tablet Android con S Pen dejaba el lienzo en blanco. La baja latencia sale de los eventos coalescidos y predichos, y de dibujar en `requestAnimationFrame`.
- **Redibujar** en `contextrestored` y al volver del segundo plano (`visibilitychange`).
- **Botón del S Pen:** Chrome lo informa como botón 2 (barril), o como clic derecho. Mientras está apretado, la herramienta pasa a ser la goma. La punta trasera de lápices tipo Surface llega como `buttons & 32` y también borra.

## 2. Arquitectura

```
src/
  main.tsx, App.tsx              rutas: /login, / (lista), /nota/:id
  firebase/
    app.ts                       initializeApp, Firestore con persistentLocalCache (multi-pestaña)
    auth.ts                      Google: popup en escritorio, redirect en mobile o PWA instalada
    repo.ts                      CRUD de carpetas, notas y páginas, y suscripciones con onSnapshot
    strokeSync.ts                cola de operaciones de trazos → writeBatch, más el eco de escrituras propias
    syncStatus.ts                sincronizado / sincronizando / sin conexión
  model/
    types.ts                     Folder, Note, Page, Stroke, Background
    codec.ts                     puntos ⇄ Bytes (con tests)
    geometry.ts                  bbox, distancia punto–segmento, punto en polígono, transformaciones
  canvas/
    Viewport.ts                  cámara (pan/zoom), conversión pantalla ⇄ página, inercia
    InputController.ts           Pointer Events: pen / touch / mouse, rechazo de palma, gestos
    Renderer.ts                  capas, caché por página, culling, Path2D por trazo
    backgrounds.ts               libre, rayada, cuadriculada y punteada (se usa también al exportar)
    strokeOutline.ts             perfect-freehand y el estilo de cada herramienta
    tools/                       pen, highlighter, eraser (trazo y área), lasso
    history.ts                   deshacer y rehacer con comandos invertibles (con tests)
  recognition/                   reconocimiento de formas (puro, sin DOM, con tests)
    index.ts                     recognize(points) → { kind, confidence, shape } | null
    resample.ts, rdp.ts, corners.ts, fitLine.ts, fitCircle.ts, fitEllipse.ts, polygon.ts
    adjust.ts                    ajuste de la forma mientras el lápiz sigue apoyado
  export/ png.ts, pdf.ts
  ui/                            NoteList, Toolbar, ColorPicker, PageStrip, SyncBadge, temas
tests/ (o *.test.ts junto a cada módulo) + fixtures/strokes/*.json
```

### Entrada (InputController)

- Usa `pointerdown/move/up/cancel` con `setPointerCapture`. Lee `getCoalescedEvents()` en cada movimiento. Los puntos de `getPredictedEvents()` se dibujan solo en la capa viva y se descartan en el cuadro siguiente.
- **Según `pointerType`:**
  - `pen` dibuja con la herramienta activa;
  - `mouse` dibuja con el botón izquierdo y desplaza con el del medio, con la rueda o con espacio + arrastre; Ctrl + rueda hace zoom;
  - `touch`: un dedo desplaza y dos dedos hacen pan y pellizco para zoom, con el ancla en el punto medio.
- **Rechazo de palma:** desde que hay un `pen` apoyado, y durante unos 300 ms después de levantarlo, se ignoran los toques nuevos. Además, un toque que empezó cuando apareció el lápiz se cancela, y si ya había dibujado algo, ese trazo se descarta.
- **Dibujar con el dedo:** es un interruptor. Si en ese dispositivo nunca se vio un lápiz, viene activado (es lo útil en el celular). Cuando aparece un lápiz por primera vez, se desactiva solo.
- **Bloqueos del navegador:** `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none` y `-webkit-user-select: none` en el lienzo; `preventDefault` en `contextmenu`, `selectstart`, `dblclick` y `gesturestart` (iOS); `overscroll-behavior: none` en `body`.

### Render

- Cada trazo guarda su `bbox` y un `Path2D` en memoria. Se dibuja solo lo que interseca la vista.
- **Durante un gesto de pan o zoom**, la capa de tinta se mueve con una transformación sobre el bitmap ya dibujado, que es barata. Al terminar el gesto, se redibuja nítida al zoom nuevo.
- **Orden:** primero los resaltadores (alfa 0,35, debajo de la tinta para que no la tapen) y después la tinta, por `z`.
- **Hoja:** el papel es blanco o crema en ambos temas. En modo oscuro cambia la UI, no el papel; dejo «papel oscuro» como opción para la etapa 7.

## 3. Modelo de datos (Firestore)

```
users/{uid}
  folders/{folderId}        { name, order, createdAt, updatedAt }
  notes/{noteId}            { title, folderId|null, pageIds: string[], thumb: string (dataURL webp),
                              createdAt, updatedAt, deleted: bool }
    pages/{pageId}          { width, height, background: { type: 'blank'|'ruled'|'grid'|'dots',
                                spacing, color, paper }, createdAt, updatedAt }
      strokes/{strokeId}    { tool: 'pen'|'highlighter', color, size, opacity,
                              pts: Bytes,                 // x,y Int16 (×10) + presión Uint8, intercalados
                              n: number,                  // cantidad de puntos
                              bbox: [x0,y0,x1,y1],
                              z: number,                  // orden: timestamp del cliente + desempate por id
                              shape?: { kind, params },   // si salió del reconocimiento de formas
                              createdAt, deviceId }
```

- **IDs:** se generan en el cliente (`doc().id` o nanoid), así un trazo existe localmente antes de subir.
- **Tamaño:** un trazo de 2000 puntos ocupa unos 10 KB, muy lejos de 1 MB. Una página puede tener miles de trazos sin problema.
- **Operaciones sobre trazos** (para que los conflictos no se pisen):
  - *Agregar:* `set` del documento nuevo.
  - *Borrar con goma por trazo:* `delete`.
  - *Borrar con goma por área:* `delete` del original y `set` de cada pedazo que queda, con ids nuevos.
  - *Mover o escalar con el lazo:* `set` de los trazos transformados (se reemplazan completos).
  - Todo se agrupa en `writeBatch` de hasta 500 operaciones.
  - Si dos dispositivos tocan el mismo trazo, gana la última escritura, pero eso queda limitado a ese trazo. Si un trazo se borró en otro dispositivo, al moverlo se ignora.
- **Deshacer y rehacer:** es una pila local por página y por sesión, de comandos invertibles (`add` ⇄ `remove`, `replace(antes, después)`). Deshacer genera las escrituras inversas. No se sincroniza, igual que en cualquier app de notas.
- **Guardado automático:**
  - Los trazos se escriben al levantar el lápiz. La caché local es inmediata y el envío se agrupa con un debounce de unos 400 ms.
  - El título, el fondo y la miniatura se escriben con un debounce de 1,5 s.
  - Al pasar a segundo plano (`visibilitychange: hidden`) se fuerza el envío.
- **Tiempo real:** hay un `onSnapshot` sobre la lista de notas y otro sobre los trazos de cada página **visible** (± 1). Los cambios llegan con `docChanges()` y se aplican de forma incremental. El eco de las escrituras propias se reconoce por el id del trazo.
- **Offline:** se usa `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. Las escrituras quedan en cola en IndexedDB y suben al volver la conexión. El shell de la app queda precacheado por el service worker.
- **Indicador de estado:**
  - *Sin conexión:* `navigator.onLine` es falso, o `snapshot.metadata.fromCache` sigue verdadero sin respuesta del servidor.
  - *Sincronizando:* hay `hasPendingWrites`, o lotes en vuelo hasta que resuelve `waitForPendingWrites()`.
  - *Sincronizado:* en los demás casos.
  - Se muestra como un punto o ícono chico junto al título.
- **Borrar una nota:** primero se marca `deleted: true`, así desaparece de la lista en todos lados. Después se purgan en lotes los trazos, las páginas y la nota, porque desde el cliente no hay borrado recursivo.
- **Duplicar:** copia la nota, sus páginas y sus trazos en lotes, con ids nuevos.
- **Índices:** se agrega una exención de indexado para `pts` en `firestore.indexes.json`.
- **Reglas de seguridad:**

  ```
  match /users/{uid}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```

  Además, en `strokes` se limita el tamaño de `pts`.

## 4. Autenticación

- `browserLocalPersistence`, que es la opción por defecto. Con `onAuthStateChanged`, si ya hay sesión en el dispositivo se entra directo. Mientras se resuelve se muestra un splash, sin parpadeo de la pantalla de login.
- **Popup o redirect:**
  - se usa redirect si es una PWA instalada (`matchMedia('(display-mode: standalone)')` o `navigator.standalone`), o si el dispositivo es táctil (`pointer: coarse`) y no es de escritorio;
  - en los demás casos se usa popup, y si falla (`auth/popup-blocked`) se pasa a redirect;
  - al cargar se llama a `getRedirectResult`.
- **Redirect en navegadores que bloquean el almacenamiento de terceros** (Safari, Chrome moderno):
  - el `authDomain` es el **mismo dominio donde se sirve la app**. En Firebase Hosting eso funciona solo, porque Hosting sirve `/__/auth/*`;
  - en desarrollo, Vite hace de proxy de `/__/auth` hacia `<proyecto>.firebaseapp.com` (opción documentada por Firebase).

## 5. Reconocimiento de formas (`src/recognition/`)

**Disparo:** en `pointermove`, si el lápiz se movió menos de unos 6 px de pantalla durante 500 ms, se llama a `recognize`. El tiempo se configura.

**Algoritmo:**

1. Remuestreo equiespaciado y medidas básicas: largo del trazo `L`, tamaño de la caja `D`, y si está cerrado (distancia entre extremos menor a 0,15·D, o el trazo se cruza cerca de los extremos).
2. **Abierto:**
   - *Línea:* ajuste por mínimos cuadrados totales. Se acepta si la relación cuerda/largo es mayor a 0,95 y el residuo normalizado es bajo. Se ajusta a 0°, 45° o 90° si está a menos de unos 5°.
   - *Flecha:* después de RDP, un segmento largo seguido de un «gancho» corto en V al final (ida y vuelta), dibujado en el mismo trazo.
   - *Arco:* ajuste de círculo algebraico (Kåsa con refinamiento de Gauss-Newton), con barrido angular de entre 30° y 300° y residuo bajo.
3. **Cerrado:**
   - *Polígono:* RDP con épsilon proporcional a `D`, más fusión de esquinas cercanas o de ángulo casi llano.
     - 3 vértices: triángulo.
     - 4 vértices con ángulos de 90° ± 15°: rectángulo (cuadrado si la relación de lados está entre 0,9 y 1,1). Se alinea a los ejes si está casi derecho.
     - 4 vértices sin ángulos rectos: cuadrilátero.
     - 5 o 6 vértices: polígono. Se regulariza si los lados y ángulos son parecidos.
   - *Elipse:* ajuste directo de Fitzgibbon por mínimos cuadrados. Si los ejes son casi iguales, es un círculo.
   - Se elige la forma con menor error normalizado; ante un empate se prefiere la de menos parámetros. Si ninguna supera el umbral de confianza, devuelve `null` y el trazo queda como estaba.
4. **Salida:** la forma paramétrica (para el ajuste) y su polilínea densa, con presión constante. Se guarda como un **trazo común**, con `shape` como metadato.

**Ajuste con el lápiz apoyado** (`adjust.ts`): se ancla en el punto donde se disparó el reconocimiento.

- *Línea:* el extremo final sigue al lápiz (rota y estira).
- *Círculo o elipse:* cambia el radio o la escala desde el centro.
- *Polígono o rectángulo:* escala y rota desde el centro, según el vector entre el centro y el lápiz.
- Al levantar el lápiz se confirma la forma.

**Interruptor:** un botón de «forma» en la barra de herramientas, que se recuerda por dispositivo.

**Tests (Vitest):**

- trazos sintéticos con ruido y RNG con semilla: líneas, arcos, círculos, elipses rotadas, triángulos, rectángulos rotados, pentágonos, flechas y trazos libres (letras, garabatos) que **no** se deben reconocer;
- además, *fixtures* JSON con trazos reales. Dejo un atajo de depuración para exportar el último trazo desde la tablet.

## 6. Herramientas y UI

- **Herramientas:**
  - lapicera;
  - resaltador;
  - goma, con dos modos: por trazo completo (toca el trazo y lo borra) y por área (recorta los puntos dentro del radio y divide el trazo);
  - lazo: selecciona los trazos cuyos puntos quedan mayormente dentro del polígono; tiene manijas para mover y escalar desde las esquinas, y botones para borrar, duplicar y cambiar el color;
  - deshacer y rehacer, con Ctrl+Z, Ctrl+Shift+Z o Ctrl+Y.
- **Color y grosor:** 5 presets de color por herramienta, más un selector libre. 3 grosores rápidos, más un deslizador. Los ajustes se recuerdan por herramienta.
- **Barra de herramientas:**
  - **Tablet:** flotante, en vertical sobre un costado (izquierdo o derecho, configurable), con botones de 44 px o más.
  - **Escritorio:** horizontal arriba.
  - **Celular vertical:** una fila compacta arriba; color y grosor se abren en una hoja inferior.
  - La barra nunca tapa el lienzo de forma fija: el lienzo usa el espacio restante.
- **Lista de notas:** una grilla de tarjetas con miniatura, título y fecha relativa («hace 5 min»), y una barra lateral (o un cajón en el celular) con las carpetas. Desde el menú de cada nota se puede renombrar, duplicar, mover a una carpeta o borrar (con un «Deshacer» de unos segundos).
- **Páginas:** «+ página» al final. Una tira de miniaturas permite saltar, reordenar o borrar páginas. Cada página tiene su propio ajuste de fondo: tipo, espaciado y color de línea, con un botón para aplicarlo a todas.
- **Temas:** claro, oscuro o sistema.

## 7. Exportar

- **PNG de una página:** se renderiza fuera de pantalla a 2× (fondo, resaltadores y después tinta). Se puede elegir **con fondo** o **sin fondo** (transparente). El fondo sale de `backgrounds.ts`, nunca de los trazos.
- **PDF de la nota:** con jsPDF, cargado bajo demanda. Una página PDF por página de la nota. El contorno de cada trazo (perfect-freehand) va como trazado vectorial relleno; los resaltadores, con transparencia, y el fondo, como líneas vectoriales en una capa aparte. Opción para exportar con fondo o sin fondo.
- **Para compartir:** se usa `navigator.share({ files })` donde exista (celular), y si no, la descarga.

## 8. Etapas

Al final de cada una te paso cómo probarla (en la compu, y en el celular y la tablet por la red local) y espero tu OK.

| # | Etapa | Entregable | Cómo se prueba |
|---|---|---|---|
| 1 | Setup, PWA y login | Vite + React + TS, ESLint, Vitest, vite-plugin-pwa (manifest, íconos, offline), Firebase Auth (popup o redirect), splash, rutas, temas, `.env.example`, `firestore.rules`, `firebase.json`, guía de configuración de Firebase | `npm run dev -- --host` con HTTPS local (plugin basic-ssl) y probar desde `https://<IP>:5173`. Para el login con redirect en la PWA instalada, desplegar en un canal de preview de Hosting (`firebase hosting:channel:deploy etapa1`), porque Google no acepta IPs como dominio de OAuth. |
| 2 | Lienzo | Viewport, InputController (pen, touch, mouse), perfect-freehand con presión, eventos coalescidos y predichos, pan y zoom con pellizco e inercia, rechazo de palma, bloqueos del navegador; las páginas en memoria | Dibujar con el lápiz mientras se apoya la palma, hacer pellizco con dos dedos, probar el mouse y la rueda. |
| 3 | Fondos | Hoja libre, rayada, cuadriculada y punteada, con espaciado y color; varias páginas apiladas | Cambiar el fondo de una página y comprobar que el zoom lo mantiene nítido. |
| 4 | Herramientas | Resaltador, goma por trazo y por área, lazo (mover, escalar, borrar), deshacer y rehacer, selector de color y grosor, barra adaptable | Una lista de verificación por herramienta, más tests de `history` y `geometry`. |
| 5 | Persistencia y sincronización | Repo de Firestore, cola de operaciones con `writeBatch`, `onSnapshot` incremental, caché offline, indicador de estado, lista de notas (crear, renombrar, duplicar, borrar), carpetas, miniaturas, reglas desplegadas | Dos dispositivos abiertos a la vez; modo avión en uno, dibujar y volver a conectarlo. |
| 6 | Reconocimiento de formas | `src/recognition` con tests, retención de 500 ms, ajuste en vivo, interruptor en la barra | `npm test`, y dibujar cada forma en la tablet. |
| 7 | Exportar y pulir | PNG, PDF, compartir, accesibilidad, atajos, rendimiento con páginas grandes, README final (local, Firebase, Hosting) | Exportar una nota de varias páginas y abrirla en el celular. |

## 9. Riesgos y temas abiertos

- **Costo de lecturas:** abrir por primera vez en un dispositivo una página con 3000 trazos son 3000 lecturas. La cuota gratis es de 50 000 por día, que alcanza para uso personal. Después la caché offline evita releer. Si algún día molesta, se pueden compactar los trazos viejos en documentos «chunk», sin cambiar la UI.
- **iOS:** Safari en iPad entrega la presión del Apple Pencil, pero no tiene `getPredictedEvents`; la app lo detecta y sigue sin predicción.
- **Firebase Storage** no se usa, para no necesitar el plan Blaze.
