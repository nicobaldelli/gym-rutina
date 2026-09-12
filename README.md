# GYM — Mi rutina (PWA)

App para registrar tu rutina de gimnasio: pesos, reps, timer de descanso, historial y progresión. Es una **PWA estática**: sin backend, sin build step, 100% offline después de la primera carga. Todos los datos viven en tu dispositivo (IndexedDB, con fallback a localStorage).

## Estructura del proyecto

```
├── index.html          Shell de la app (una sola página)
├── manifest.json       Manifest PWA (instalable, standalone, portrait, tema oscuro)
├── sw.js               Service worker (cache-first, offline total)
├── css/styles.css      Estilos (mobile-first, modo oscuro)
├── js/
│   ├── db.js           Persistencia: IndexedDB + fallback localStorage
│   ├── data.js         Rutina precargada (3 días)
│   ├── timer.js        Timer de descanso (sobrevive a cambio de app / pantalla apagada)
│   ├── chart.js        Gráfico de línea SVG propio (sin dependencias)
│   ├── sync.js         Sincronización opcional entre dispositivos (Firebase/Firestore)
│   └── app.js          Lógica: ruteo, sesiones, historial, stats, progresión, edición, import/export
└── icons/              Íconos 192 y 512 px
```

## Probarlo localmente

Necesitás servirlo por HTTP (el service worker no funciona con `file://`). Con Node instalado:

```bash
npx http-server -p 8080 .
```

o con Python:

```bash
python -m http.server 8080
```

y abrí `http://localhost:8080` en el navegador.

## Publicarlo gratis en GitHub Pages

1. Creá un repositorio en GitHub (por ejemplo `gym`), público.
2. Subí **todos** los archivos del proyecto a la raíz del repo:
   ```bash
   git init
   git add .
   git commit -m "App de rutina de gimnasio"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/gym.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment**, en *Source* elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardá.
4. En un minuto la app queda en `https://TU_USUARIO.github.io/gym/`.

> Cuando actualices la app, subí también la versión de caché en `sw.js` (cambiá `gym-cache-v1` por `v2`, etc.) para que los celulares descarguen los archivos nuevos.

## Instalarla en Android (Chrome)

1. Abrí la URL de GitHub Pages en Chrome.
2. Menú **⋮** → **"Agregar a pantalla de inicio"** (o el aviso "Instalar app" si aparece).
3. Confirmá. Queda como una app más, a pantalla completa y funcionando sin conexión.
4. Para las notificaciones del timer: **Ajustes → Activar notificaciones del timer** dentro de la app.

## Uso rápido

- **Inicio**: tocá un día → se crea la sesión con la fecha de hoy (editable) y se abre el **hub del día**: elegís el ejercicio que vas a hacer (de a uno), lo completás en su propia pantalla y lo marcás con "✓ Terminé este ejercicio". Volvés al hub con la barra de progreso, los pendientes y los hechos (tocá uno hecho para revisarlo o corregirlo; también podés desmarcarlo). Al terminar todos aparece la elongación y, cuando la marcás (o la saltás), confirmás la sesión. El botón ⏱ de cada serie arranca el descanso (1:40 por defecto, configurable), en gris ves lo que levantaste la última vez, y todo se autoguarda al instante. Si cortás antes, "Finalizar ahora" guarda igual.
- **Historial**: ver, editar o borrar sesiones pasadas.
- **Progreso**: arriba, stats del período (este mes / este año / todo): sesiones, series, volumen, **balance entre días** (para ver si hiciste más Día 1 que Día 3 y compensar) y sesiones por mes/año. Abajo, la evolución por ejercicio del peso máximo y del volumen (peso × reps).
- **Rutina**: agregar, borrar, reordenar y editar ejercicios; importar/exportar.
- **Ajustes**: unidad kg/lb (los datos se guardan siempre en kg, cambiar de unidad no rompe nada), descanso por defecto, notificaciones y sincronización en la nube.

## Sincronización entre dispositivos (opcional, gratis)

Por defecto todo vive en el dispositivo. Si querés el mismo historial en el celu y la compu, la app puede sincronizar contra **Firebase (Firestore)** con tu cuenta de Google. El plan gratuito (Spark) sobra para esto y no se pausa por inactividad. Configuración una sola vez:

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com) y creá un proyecto (podés desactivar Analytics).
2. **Authentication → Sign-in method**: habilitá **Google**. En **Authentication → Settings → Authorized domains** agregá tu dominio de GitHub Pages (`TU_USUARIO.github.io`).
3. **Firestore Database → Crear base de datos** (modo producción). En la pestaña **Reglas** pegá y publicá:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   Así cada usuario solo puede leer/escribir sus propios datos.
4. **Configuración del proyecto (⚙️) → Tus apps → ícono web `</>`**: registrá una app web y copiá el objeto `firebaseConfig` que te muestra.
5. En la app: **Ajustes → ☁️ Sincronización**, pegá el `firebaseConfig`, guardá e iniciá sesión con Google.
6. Repetí el paso 5 en cada dispositivo (misma config, misma cuenta de Google) y listo.

Cómo sincroniza: sigue siendo offline-first — todo se guarda local al instante y se sube cuando hay conexión (al abrir la app, después de cada cambio, o con "Sincronizar ahora"). Si el mismo dato se editó en dos lados, gana la última edición. Los borrados también se propagan.

## Esquema JSON para importar la rutina

Desde **Rutina → Importar rutina (JSON)**. El archivo se valida y se muestra una vista previa antes de reemplazar la rutina actual (el historial no se toca).

Campos obligatorios: `days` (lista), y en cada día `name` y `exercises` (lista con al menos un ejercicio con `name`). Todo lo demás es opcional y toma valores por defecto.

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `days[].id` | string | autogenerado | Identificador del día |
| `days[].name` | string | **obligatorio** | Nombre del día |
| `days[].exercises[].name` | string | **obligatorio** | Nombre del ejercicio |
| `days[].exercises[].group` | string | `""` | Grupo muscular |
| `days[].exercises[].grip` | string | `""` | Agarre |
| `days[].exercises[].sets` | entero 1-20 | `3` | Series objetivo |
| `days[].exercises[].repsTarget` | string | `"8-12"` | Reps (o segundos) objetivo, texto libre |
| `days[].exercises[].type` | `"reps"` \| `"time"` | `"reps"` | `"time"` para ejercicios por segundos (ej. plancha) |
| `days[].exercises[].restSec` | número 5-3600 | `100` | Descanso sugerido en segundos |
| `days[].exercises[].url` | string | `""` | Link de demo |
| `days[].stretches[]` | lista | `[]` | Elongación (solo lectura): `{ "name", "url" }` |

### Ejemplo mínimo

```json
{
  "version": 1,
  "days": [
    {
      "name": "Día 1 - Pecho y Bíceps",
      "exercises": [
        {
          "group": "Pecho",
          "name": "Press plano (barra o mancuernas)",
          "grip": "Prono, ancho apenas mayor a hombros",
          "sets": 4,
          "repsTarget": "6-10",
          "type": "reps",
          "restSec": 100,
          "url": "https://musclewiki.com/exercise/barbell-bench-press"
        },
        {
          "group": "Abdominales",
          "name": "Plancha con peso",
          "sets": 3,
          "repsTarget": "30-60 seg",
          "type": "time"
        }
      ],
      "stretches": [
        { "name": "Pecho en marco de puerta — 30 seg/lado", "url": "https://www.acefitness.org/resources/everyone/blog/5657/5-chest-stretch-variations/" }
      ]
    }
  ]
}
```

> Tip: exportá tu rutina actual con **Exportar rutina (JSON)**, editala afuera y volvé a importarla. El export de historial (JSON/CSV) sirve de backup: los pesos van siempre en kg.

## Notas técnicas

- **Pesos**: se guardan internamente en kg. Al mostrar se redondea a 0,5 kg o 1 lb según la unidad elegida.
- **Timer**: guarda el timestamp de fin en localStorage y recalcula al volver; sobrevive a pantalla apagada, cambio de app y recarga. Vibración + sonido + notificación al terminar (el sonido requiere haber tocado la pantalla antes, limitación de Android).
- **Autosave**: cada cambio en una serie se guarda a los ~300 ms. Si se cierra el navegador a mitad de sesión, la sesión queda "en curso" y se retoma desde Inicio.
- **Sync**: cada sesión lleva un `updatedAt` y la rutina/ajustes un sello de versión; al sincronizar gana el más nuevo de cada lado. Los borrados dejan una marca en la nube para no resucitar en otros dispositivos. El SDK de Firebase se carga solo si configuraste la sincronización; sin conexión la app ni lo intenta.
