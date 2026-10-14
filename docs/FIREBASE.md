# Configurar Firebase paso a paso

Alcanza con el **plan Spark** (gratis). Notillas no usa Cloud Storage, que hoy exige el plan Blaze.

## 1. Crear el proyecto

1. Entrá a <https://console.firebase.google.com> y tocá **Crear un proyecto**.
2. Ponele un nombre, por ejemplo `notillas`. Anotá el **ID del proyecto** que te propone (por ejemplo `notillas-3f2a1`); lo vas a usar varias veces.
3. Google Analytics no hace falta: podés desactivarlo.

## 2. Registrar la app web y obtener las credenciales

1. En la página del proyecto, tocá el ícono **`</>`** (Web).
2. Como apodo poné `notillas-web`. Podés tildar «Configurar Firebase Hosting» o dejarlo para después.
3. Firebase te muestra un bloque `const firebaseConfig = { … }`.
4. En la raíz del repo, copiá `.env.example` como `.env` y completalo con esos valores:

   | `firebaseConfig` | `.env` |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` (dejalo como `<id>.firebaseapp.com`) |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

   Si lo perdés, está en ⚙️ **Configuración del proyecto → General → Tus apps**.

Estos valores no son secretos (viajan al navegador de todos modos). Lo que protege los datos son las reglas de Firestore del paso 5.

## 3. Activar el login con Google

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Agregar proveedor nuevo → Google**.
3. Activalo, elegí tu mail como **correo de asistencia** y guardá.

## 4. Dominios autorizados

Están en **Authentication → Configuración → Dominios autorizados**.

- `localhost`, `<id>.firebaseapp.com` y `<id>.web.app` ya vienen cargados.
- Para probar desde el celular o la tablet en tu red local, **agregá la IP de tu compu** (por ejemplo `192.168.0.23`, sin puerto ni `https://`). La IP la muestra `npm run dev:lan` al arrancar.

## 5. Crear Firestore y subir las reglas

1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Elegí la edición **Standard** si te pregunta.
3. Ubicación: `southamerica-east1 (São Paulo)`, que es la más cercana. **No se puede cambiar después.**
4. Empezá en **modo de producción**: todo queda cerrado hasta que subas las reglas.
5. Instalá el Firebase CLI y subí las reglas y los índices del repo:

   ```sh
   npm install -g firebase-tools
   firebase login
   firebase use --add          # elegí tu proyecto y como alias poné "default"
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   `firebase use --add` crea `.firebaserc`; podés commitearlo, porque solo tiene el ID del proyecto.

Las reglas (`firestore.rules`) dejan que cada usuario lea y escriba **solo** lo que está bajo `users/{su uid}`. Para verificarlo, en la consola andá a **Firestore → Reglas → Zona de pruebas**.

## 6. Hosting (para instalar la PWA y probar el login en el celu)

```sh
npm run build
firebase deploy --only hosting
```

La app queda en `https://<id>.web.app` y en `https://<id>.firebaseapp.com`. **Usá y aplicá como PWA la de `firebaseapp.com`.** Es el mismo dominio que `authDomain`, y así el login con redirect anda también en Safari y en la app instalada. Si entrás por `web.app`, la app te redirige sola.

## Problemas frecuentes

| Mensaje | Qué hacer |
|---|---|
| «Este dominio (…) no está autorizado» | Agregalo en Authentication → Configuración → Dominios autorizados (paso 4). |
| «El acceso con Google no está habilitado» | Activá el proveedor de Google (paso 3). |
| `Missing or insufficient permissions` | No subiste las reglas (paso 5), o la app está usando otro proyecto: revisá el `.env`. |
| El login con redirect vuelve a la pantalla de inicio sin entrar (iPhone o iPad) | Safari bloquea el almacenamiento de terceros fuera del dominio de `authDomain`. Probalo desde `https://<id>.firebaseapp.com` (paso 6). |
