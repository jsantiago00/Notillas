# Notillas

PWA de notas a mano alzada pensada para usar con lápiz. Funciona en celular, tablet y compu, y sincroniza tus notas entre dispositivos con Firebase.

> **Estado:** etapa 1 de 7 (setup, PWA y login con Google). El plan completo está en [PLAN.md](PLAN.md).

## Requisitos

- Node **20.19+** o **22.12+**. Vite 8 no corre en versiones anteriores.
- Un proyecto de Firebase. La guía está en [docs/FIREBASE.md](docs/FIREBASE.md).

## Correr en local

```sh
npm install
cp .env.example .env      # completalo con las credenciales de tu app web de Firebase
npm run dev               # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en `localhost`. |
| `npm run dev:lan` | Lo mismo por HTTPS en tu red local, para el celular o la tablet. |
| `npm test` | Tests unitarios (Vitest). |
| `npm run typecheck` / `npm run lint` | TypeScript y ESLint. |
| `npm run build` | Build de producción en `dist/`, con el service worker. |
| `npm run preview` | Sirve `dist/` para revisar el build. |
| `npm run icons` | Regenera los íconos a partir de `public/logo.svg`. |

## Probar en el celular o la tablet

Hay tres formas, de la más rápida a la más completa.

1. **Por la red local** (dibujo, lápiz y gestos).
   - Corré `npm run dev:lan` y abrí en el dispositivo la URL `https://192.168.x.x:5173` que muestra la terminal. El dispositivo tiene que estar en el mismo wifi.
   - El certificado es autofirmado: aceptá el aviso («Avanzado → Continuar»).
   - Agregá esa IP a los dominios autorizados de Firebase Auth ([docs/FIREBASE.md](docs/FIREBASE.md), paso 4).
   - Con este certificado el navegador **no registra el service worker**, así que no se puede instalar ni probar sin conexión.
   - En iPhone y iPad el login puede fallar por la protección de cookies de Safari. Para el login usá la opción 3.
2. **Android por USB** (incluye PWA y modo sin conexión).
   - Activá la depuración USB, conectá el dispositivo y corré `adb reverse tcp:5173 tcp:5173` junto con `npm run dev`.
   - En el dispositivo abrí `http://localhost:5173`: para el navegador es un origen seguro, así que funcionan el service worker, la instalación y el login.
3. **Firebase Hosting** (la versión real).
   - Corré `npm run build && firebase deploy --only hosting` y abrí `https://<id>.firebaseapp.com`.
   - Desde ahí se instala la PWA («Agregar a la pantalla de inicio» o «Instalar app»).

## Desplegar en Firebase Hosting

```sh
npm run build
firebase deploy --only hosting                            # la app
firebase deploy --only firestore:rules,firestore:indexes  # reglas e índices, si cambiaron
```

La primera vez hacen falta `firebase login` y `firebase use --add` ([docs/FIREBASE.md](docs/FIREBASE.md)).

Cuando publicás una versión nueva, la app abierta lo detecta y muestra **«Hay una versión nueva · Actualizar»**. No se actualiza sola, para no cortarte un trazo a la mitad.

## Estructura

```
src/
  firebase/   app.ts (init), auth.ts (login con Google), db.ts (Firestore con caché offline)
  lib/        device.ts (popup o redirect), theme.ts (claro, oscuro o sistema)
  ui/         pantallas y componentes
docs/FIREBASE.md            configuración de la consola de Firebase
firestore.rules             cada usuario solo accede a users/{uid}/**
firestore.indexes.json      exenciones de índice para los campos pesados
firebase.json               Hosting (SPA, caché) y Firestore
```
