# FamilyGuard

Control parental propio: ubicación en tiempo real + historial, geocercas,
control de apps/tiempo de pantalla, y botón de pánico. Diseño y código
originales — no es un fork ni una copia de ninguna app comercial.

## Estructura

```
familyguard/
  backend/      Node.js + TypeScript + Express + Prisma (PostgreSQL) + socket.io
  app-child/    App Android (Kotlin) que va en el celular del hijo/a
  app-parent/   App Android (Kotlin) que usás vos para ver todo
```

## Cómo encajan las piezas

1. El **padre** se registra en `app-parent`, genera un código de 6 dígitos
   desde la pantalla de Inicio.
2. En el celular del **hijo/a**, se instala `app-child` y se escribe ese
   código una sola vez. A partir de ahí queda emparejado para siempre (hasta
   que lo desinstales).
3. `app-child` manda su ubicación al backend cada minuto, reporta el uso de
   apps una vez por día, y tiene un botón de SOS en la notificación
   permanente.
4. El backend evalúa las geocercas en cada ubicación recibida y avisa por
   **socket.io** (tiempo real) y **push** (FCM) a `app-parent`.
5. `app-parent` muestra todo: mapa en vivo, historial, geocercas, uso de apps
   con botón de bloqueo, y el historial de alertas SOS.

## 1. Levantar el backend

Requisitos: Node.js 20+, PostgreSQL 14+.

```bash
cd backend
npm install
cp .env.example .env
# editá .env: DATABASE_URL con tu Postgres, y un JWT_SECRET largo y random
npx prisma migrate dev --name init
npm run dev
```

Por defecto escucha en `http://localhost:4000`. Probalo con:

```bash
curl http://localhost:4000/health
```

### Notificaciones push (opcional)

Sin configurar nada, todo funciona (ubicación, geocercas, uso, SOS) salvo las
notificaciones push de Android. Si las querés:

1. Creá un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Bajá el archivo de credenciales de servicio (Project Settings → Service
   Accounts → Generate new private key) y poné su ruta en
   `FIREBASE_CREDENTIALS_PATH` dentro de `.env`.
3. Agregá la app Android al mismo proyecto Firebase y poné el
   `google-services.json` que te da en `app-parent/app/` y `app-child/app/`
   (y el plugin `com.google.gms.google-services` en los `build.gradle.kts`,
   que no vino incluido en este scaffold para no asumir que ya tenés cuenta).

## 2. Compilar las apps Android

Abrí `app-child/` y `app-parent/` cada una como proyecto **separado** en
Android Studio (no son módulos del mismo proyecto).

Antes de compilar, en cada `gradle.properties`:

- `FAMILYGUARD_API_BASE_URL`: la URL de tu backend.
  - Si corrés el backend en tu PC y probás con el **emulador** de Android
    Studio, dejá `http://10.0.2.2:4000/` (así es como el emulador ve a tu PC).
  - Si probás con un **celular físico** (como tu moto g82), poné la IP de tu
    PC en la red local, ej. `http://192.168.0.15:4000/`, y asegurate de que
    el firewall de Windows permita esa conexión entrante.
- En `app-parent/gradle.properties`, además `MAPS_API_KEY` con una clave de
  [Google Maps SDK for Android](https://console.cloud.google.com/google/maps-apis)
  (gratis hasta un volumen alto de uso).

### Permisos que hay que otorgar a mano en el celular del hijo/a

Android no deja pedir estos por diálogo normal — hay que guiar al chico/a (o
hacerlo vos) la primera vez:

- **Ubicación en segundo plano**: "Permitir todo el tiempo", no solo "mientras se usa la app".
- **Acceso a datos de uso**: Ajustes → Apps → Acceso especial → Acceso a
  datos de uso → FamilyGuard → activar. (La app abre esta pantalla sola la
  primera vez, pero el toggle final lo tiene que tocar la persona.)
- **Servicio de Accesibilidad** (para bloquear apps): Ajustes →
  Accesibilidad → Apps instaladas → FamilyGuard → activar.
- **Optimización de batería**: convendría poner FamilyGuard como "sin
  restricciones" para que Android no mate el servicio de ubicación.

## 2.1. Motorola (incluido moto g06): por qué se corta el GPS

Todos los Motorola (no solo el g06) tienen un gestor de batería propio que
mata procesos en segundo plano mucho más agresivo que el Android "puro" —
el mismo problema que tienen Samsung, Xiaomi, etc. Pasa esto: aunque la app
pida permiso de ubicación "todo el tiempo" y el servicio sea foreground
(con notificación visible), Motorola igual lo corta después de un rato sin
uso de pantalla. Para esta versión ya metimos tres cosas en el código para
compensarlo:

1. **Prioridad de ubicación alta** (`PRIORITY_HIGH_ACCURACY`): usa GPS real,
   no solo redes, que es donde más se nota la imprecisión en equipos de
   entrada de gama.
2. **Worker de respaldo cada 15 minutos**: aunque Motorola mate el servicio
   principal, `LocationFallbackWorker` (vía WorkManager, que usa el propio
   scheduler del sistema) sigue mandando un ping independiente.
3. **Pedido de exclusión de optimización de batería**: la app ahora, la
   primera vez que arranca, dispara el diálogo de Android para que la
   excluyas de Doze/App Standby.

Aun con todo eso, **hay un paso que solo se puede hacer a mano, en el
teléfono del hijo/a**, porque Motorola lo bloquea para apps de terceros:

1. Ajustes → Batería → **Optimización de batería** (o "Uso de batería por
   app") → tocar "Todas las apps" → FamilyGuard → elegir **"No optimizar"**.
2. Ajustes → Apps → FamilyGuard → Batería → **"Sin restricciones"** (no
   "Optimizada").
3. Ajustes → Ubicación → confirmar que el modo sea **"Alta precisión"** (usa
   GPS + Wi-Fi + redes móviles), no "Solo dispositivo" ni "Ahorro de
   batería".
4. Abrir la lista de apps recientes, buscar FamilyGuard y tocar el ícono de
   **candado** (si el modelo lo tiene) para que el sistema no la cierre al
   "limpiar" la memoria.
5. Confirmar que el permiso de ubicación quedó en **"Permitir todo el
   tiempo"** (Ajustes → Apps → FamilyGuard → Permisos → Ubicación) y no en
   "Solo mientras se usa la app".

Si tenés el modelo exacto a mano y los menús no coinciden con esta
descripción (Motorola cambia nombres de menú según la versión de Android y
la capa "Hello UX"), decime qué ves en pantalla y ajustamos los textos del
README y, si hace falta, agregamos detección específica por `Build.MODEL`
en el código.

## 3. Qué falta para producción real

Este scaffold es funcional pero pensado para correr en tu red local /
desarrollo. Antes de usarlo "en serio" con tus hijos, conviene:

- Desplegar el backend en un servidor con HTTPS (Render, Railway, un VPS
  propio con Caddy/nginx + certificado). Sin HTTPS, `usesCleartextTraffic`
  tiene que seguir activo y es menos seguro.
- Revisar la retención de datos: hoy `LocationPing` crece sin límite; agregar
  un job que borre pings de más de N días.
- Agregar verificación de email/recuperación de contraseña en `auth`.
- Sumar límites de intentos de login (rate limiting) — no está incluido.
- Firmar los APK con una keystore propia antes de instalarlos fuera de modo
  debug.

## Diseño de la base de datos

Ver [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) — son 9
tablas: `Parent`, `PairingCode`, `ChildDevice`, `LocationPing`, `Geofence`,
`GeofenceEvent`, `AppUsageRecord`, `BlockedApp`, `SosAlert`, `PushToken`.
