# Notillas: guía para trabajar en el proyecto

**Notillas** es una PWA de notas a mano alzada pensada para stylus: Vite, React 19, TypeScript, Canvas, perfect-freehand y Firebase (Auth con Google y Firestore con caché offline). Toda la interfaz está en español rioplatense (voseo).

- **Plan completo** (arquitectura, modelo de datos y etapas): [PLAN.md](PLAN.md). Leelo primero.
- **Cómo correr, probar y publicar:** [README.md](README.md). **Configurar Firebase:** [docs/FIREBASE.md](docs/FIREBASE.md).
- **Repo:** `jsantiago00/Notillas` por ahora. Después vuelve a `Clavi-K/Notillas`; el código no depende del dueño.
- **Publicada en:** GitHub Pages, con el workflow `.github/workflows/pages.yml`, en cada push a `main`. Como la cuenta jsantiago00 tiene dominio propio, la URL es `https://santiagososa.com.ar/Notillas/`.
- **Firebase:** el proyecto es `notillas-605f9`. La configuración web va en `.env`, que está en `.gitignore`; el modelo es `.env.example`. En GitHub, la misma configuración va en las variables de Actions `VITE_FIREBASE_*`.

## Estado

| Etapa | Estado |
|---|---|
| 1. Setup, PWA y login con Google | ✅ Hecha, más la publicación en GitHub Pages |
| 2. Lienzo: presión, pan/zoom y rechazo de palma | ✅ Hecha |
| 3. Fondos de hoja | ✅ Hecha |
| 4. Herramientas: goma, resaltador, lazo y deshacer | ✅ Hecha (a confirmar en la tablet) |
| 5. Persistencia y sincronización con Firestore | ⏳ Sigue esta |
| 6. Reconocimiento de formas | — |
| 7. Exportar (PNG/PDF) y pulido | — |

Actualizá esta tabla en el mismo commit que cierra cada etapa.

## Cómo trabajar (acordado con el usuario)

- **Una etapa por vez.** Al terminar cada una, explicá cómo probarla (en la compu, y en el celular y la tablet) y **esperá su confirmación** antes de seguir.
- **Antes de commitear,** todo en verde: `npx tsc -b && npx eslint . && npx vitest run && npx vite build`.
- **Commits:**
  - Autor: `juansantiagososa00 <juansantiagososa00@gmail.com>`.
  - Mensaje en español, terminado con la línea `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Push:** el usuario prueba sobre lo publicado, así que pusheá a `main`.
- **El service worker** se versiona solo (vite-plugin-pwa genera los hashes), así que no hace falta subir ninguna versión a mano. La app muestra «Hay una versión nueva · Actualizar».
- **Dispositivos del usuario:** una tablet Android con S Pen (Chrome) y el celular. Probá también con Playwright: Chromium está en `/opt/pw-browsers` y playwright en `/opt/node-tools/node_modules/playwright`. Emulá una tablet de 1280×800 y de 800×1280, y un celular de 390×780.

## Decisiones ya tomadas (no las vuelvas a discutir)

- **Login:**
  - Usa **popup** salvo que la app se sirva desde el mismo dominio que `authDomain`; ahí, en mobile o en la PWA instalada, usa **redirect**. Está en `src/lib/device.ts`.
  - El motivo: con el particionado de almacenamiento (Chrome 115+, Safari 16.1+), el redirect entre dominios distintos pierde el resultado.
  - En GitHub Pages, por lo tanto, siempre es popup.
- **Ruta base:** `BASE_PATH` (en `vite.config.ts`) es `/` en Firebase Hosting y `/<repo>/` en Pages.
  - Para los archivos de `public/`, usá `asset()` o `LOGO` de `src/lib/assets.ts`. En `index.html` usá `%BASE_URL%`.
  - Nunca escribas rutas absolutas como `"/logo.svg"`.
- **Firestore** se inicializa en `src/firebase/db.ts`, aparte, para que el login no cargue Firestore.
- **Organización:** carpetas planas, de un solo nivel. Las páginas se apilan en **scroll vertical continuo**. Si en ese dispositivo nunca se usó un lápiz, **el dedo dibuja**; cuando aparece un lápiz, el dedo pasa a desplazar la hoja.
- **Lecciones de la pizarra de efecen** (la misma tablet del usuario):
  - **No** uses `getContext('2d', { desynchronized: true })`: en Android con S Pen deja el lienzo en blanco.
  - Redibujá en `contextrestored` y al volver de segundo plano (`visibilitychange`).
  - **Botón del S Pen:** Chrome lo informa como botón 2 (barril) o como «clic derecho». Mientras está apretado, la herramienta pasa a ser la goma. La punta trasera de lápices tipo Surface llega como `buttons & 32`.
- **Firebase Storage no se usa** (exige plan Blaze). Las miniaturas van como un WebP chico en el documento de la nota.

## Estructura

```
src/
  firebase/   app.ts (init + redirect de web.app), auth.ts (store de sesión), db.ts (Firestore offline)
  lib/        device.ts (+test), theme.ts, assets.ts, inputPrefs.ts («el dedo dibuja», lápiz visto),
              toolPrefs.ts (herramienta, colores y grosores por dispositivo), layoutMode.ts (celular/tablet/compu)
  model/      types.ts, geometry.ts (+test: goma, lazo, transformaciones), background.ts (presets y último fondo),
              history.ts (deshacer/rehacer), note.ts (+test: NoteModel, todos los cambios pasan por acá;
              transacciones para la goma), memoryNotes.ts (la nota de prueba, sin guardar)
  canvas/     Board.ts (motor: herramientas, selección, cuadros con rAF), Viewport.ts (+test, cámara e inercia),
              InputController.ts (lápiz, dedo, mouse, gestos), palm.ts (+test), Renderer.ts (3 capas),
              strokeOutline.ts (perfect-freehand → Path2D), layout.ts (páginas apiladas),
              backgrounds.ts (+test, lisa/rayada/cuadriculada/punteada; también para exportar)
  ui/         Login, Home, NoteEditor (+ menú ⋯ y título), Toolbar (+ opciones), SelectionBar, MemoryNote, BackgroundPanel, Splash, SetupMissing, AccountButton, ThemeButton, UpdatePrompt, Icon
  App.tsx     rutas (/, /nota/:id) y puerta de login
firestore.rules, firestore.indexes.json, firebase.json
.github/workflows/pages.yml
```
