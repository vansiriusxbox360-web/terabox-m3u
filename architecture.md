# Arquitectura del Sistema — Addon Kodi "El Rincón Dharmatico de Vishnu"

Este documento describe la arquitectura técnica completa del sistema que alimenta el
addon de Kodi `plugin.video.vansirius`. Es el complemento técnico del `AGENTS.md`
(que documenta el **método de trabajo**); aquí se documenta **cómo encajan las piezas**.

---

## 1. Visión general

El sistema son **dos piezas desacopladas** que se comunican a través de un único
artefacto JSON (`lista.m3u`):

```
┌────────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│  Terabox (nube)    │   │  GitHub Actions  │   │  Kodi (addon)        │
│  "Las cositas"     │──▶│  index.js →      │──▶│  default.py +        │
│  (vídeos + juegos) │   │  lista.m3u       │   │  service.py          │
└────────────────────┘   └──────────────────┘   └──────────────────────┘
                              │ (raw.githubusercontent)
                              └────── descargado por el addon ──────▶
```

1. **Generador** (`index.js`): escanea la cuenta de Terabox, agrupa los archivos,
    busca carátulas y genera `lista.m3u` (un JSON gigante de una línea).
   Corre **solo en GitHub Actions cada 8h** (workflow `generate-m3u.yml`).
2. **Addon de Kodi** (`kodi-addon/`): descarga ese JSON, construye un árbol de
   carpetas con la anidación original de Terabox y lo muestra en Kodi. Los vídeos
   se reproducen refrescando el enlace; los juegos MS-DOS se descargan y se lanzan
   con **DOSBox externo de Windows** en una ventana nativa.

---

## 2. Componentes y archivos

| Archivo | Rol |
|---|---|
| `index.js` | Generador del JSON/m3u. Escaneo de Terabox, agrupación, carátulas. |
| `lista.m3u` | Artefacto de salida: JSON embebido que consume el addon. |
| `posters-cache.json` | Caché de carátulas del generador (evita re-buscar cada run). |
| `custom-posters/` | Imágenes de carátulas autohospedadas en el repo (raw de GitHub). |
| `game-saves/` | Partidas guardadas de juegos (`.sav`) para precargar en DOSBox. |
| `kodi-addon/addon.xml` | Manifiesto del addon (id, versión, extensiones plugin+service). |
| `kodi-addon/default.py` | Plugin: navegación, reproducción de vídeo y lanzamiento de juegos. |
| `kodi-addon/service.py` | Servicio: seguimiento de reproducción + control del switch de juegos. |
| `.github/workflows/generate-m3u.yml` | CI: regenere el m3u cada 8h y hace commit+push. |
| `config.json` | Config local (tokens de API) usada por `index.js`. |

---

## 3. El generador (`index.js`)

### 3.1 Flujo principal

1. **Autentica** en Terabox con la cookie `ndus` (secreto `TERABOX_NDUS` en CI) y
   la ruta-jeroglífico hasta `Las cositas`.
2. **Escanea** toda la cuenta y obtiene el listado de archivos (`path`, `fs_id`).
   Si el escaneo encuentra <60% de los archivos previos, aborta sin sobrescribir
   (protección contra rate-limits de Terabox).
3. **Ordena** los archivos por grupo (de `getGroupFromPath`) y luego por ruta.
4. **Obtiene enlaces de descarga** (`getDownloadLinks`).
5. **Busca carátulas** (`fetchPosters`) por grupo.
6. **Busca carátulas por archivo** para películas sueltas sin carátula de grupo.
7. **Genera el JSON** (`generateJSON`) y lo escribe como `lista.m3u`.

### 3.2 Agrupación (`getGroupFromPath`)

Convierte la ruta de Terabox en un grupo. Devuelve `{ group, searchName, fallbackName }`:

- `group` → ruta de carpetas bajo `Las cositas` unida con `/` (lo que el addon usa
  como nombre del grupo en el JSON).
- `searchName` → el nombre "limpio" para buscar carátula (la carpeta de la serie).
  Si hay carpeta de temporada (`T1`, `s1`, etc.), se compone `showName + temporada`
  con `fallbackName = showName`.
- Se saltan carpetas "joke"/contenedor (`isJokeFolder`, `isContainerFolder`,
  `isSeasonFolder`, `isGenericFolderName`) para no usarlas como nombre de búsqueda.

### 3.3 Jerarquía de carátulas (en orden de prioridad)

En `fetchPosters` y `generateJSON`:

1. **`CUSTOM_POSTERS`** (index.js): por **nombre de grupo exacto** (searchName).
2. **Caché** (`posters-cache.json`) — con manejo de `TITLE_ALIASES`.
3. **`PATH_POSTER_SUFFIXES`**: por **sufijo de ruta** del grupo
   (`group === suffix || group.includes(suffix + '/') || group.endsWith('/' + suffix)`).
   Útil para que todas las temporadas de una serie hereden la misma carátula.
4. **TMDb/OMDb** (`searchWithFallback`) con retry.
5. **Wikidata/Wikipedia** (`wikidataSearchSingleWithRetry`) con rate-limit.
6. **`FILE_POSTER_URLS`**: por `cleanName` del archivo o **por fragmento**
   (`frag.length > 6 && cleanName.includes(frag)`) — para archivos sueltos.
7. `isLikelyNonPoster()` descarta logos/screenshots/wallpapers.

Las carátulas de `custom-posters/` se sirven vía `raw.githubusercontent.com`
(no dan 403; filmaffinity y similares bloquean hotlinking).

### 3.4 El workflow (`generate-m3u.yml`)

- Cron cada 8h + `workflow_dispatch`.
- Ejecuta `node index.js` en ubuntu con los secretos de Terabox/OMDb/TMDB.
- Si ok → `git add lista.m3u posters-cache.json`, commit y push (con
  `git pull --rebase -X theirs` para no colisionar con pushes manuales).
- Si falla → crea un issue "Token Terabox necesita actualizacion" detectando
  `425/403/cookie/ndus` en el log.

---

## 4. El addon de Kodi (`default.py`)

### 4.1 Entrada y router

`default.py` se ejecuta con `sys.argv` de Kodi:
`argv[1]` = handle, `argv[2]` = query string (`?action=...&path=...`).
`router()` parsea la query y despacha:

- `root` → `list_root`
- `folder` → `list_folder`
- `play` → `play_video` (vídeo o juego según `game=1`)
- `favorites` / `continue_watching` / `search` / `random` / `utiles` / `settings`
- `trigger_workflow` → dispara la regeneración remota vía GitHub API
- `cache_ajustes` → gestiona `advancedsettings.xml` (caché de streaming 256MB)

### 4.2 Carga de datos (`get_json`)

- Descarga `lista.m3u` desde `JSON_URL` (raw de GitHub) con barra de progreso.
- **Caché local** en el perfil del addon con TTL de **6 horas**; si falla la red,
  usa la caché como fallback.
- `force_download=True` cuando la acción es `root` (entrar al addon refresca).

### 4.3 Construcción del árbol (`build_tree`)

El JSON plano (`groups[]` con `name` = ruta separada por `/`) se convierte en un
árbol anidado:

```python
tree = {
  "ªnime": { "_groups": [...], "_icon": ...,
    "Que se divide eeeennn": { "_groups": [...], ... } }
}
```

Cada nodo guarda `_groups` (los grupos cuyo nombre cae exactamente en esa carpeta)
y `_icon` (hereda la imagen de su grupo o de la carpeta madre vía `inherit`).

### 4.4 Resolución de iconos (`resolve_icon`)

Orden de prioridad al decidir la imagen de un nodo/carpeta:

1. `FOLDER_ICON_BY_PATH_SUFFIX` — carátula por sufijo de ruta (p.ej. temporadas).
2. Puertas de acceso (`DOOR_BY_PATH_SUFFIX`, `RANDOM_DOOR_BY_PATH_SUFFIX`).
3. `FOLDER_IMAGES` (png locales del addon por carpeta temática) y `FOLDER_ICON_URLS`.
4. Si el nodo tiene `_groups` (carpeta "álbum" de peli/serie):
   el **póster forzado** (`STATION_POSTER_OVERRIDES`) de sus estaciones tiene
   **prioridad** sobre la imagen del JSON (que puede ser un fotograma erróneo).
5. Si el nodo tiene hijos ALB (`all_alb`), también se consulta primero el póster
   forzado de las stations de los grupos hijos (para que la carpeta madre de una
   serie muestre su carátula, no un fotograma heredado).
6. `INHERIT_CHILD_ICONS` → si la mayoría de hijos comparten icono, la carpeta
   madre lo hereda.

### 4.5 Pósters forzados (`STATION_POSTER_OVERRIDES`)

Dict `fragmento → URL` que se matchea **por subcadena** (insensible a mayúsculas)
contra el nombre del grupo y el de cada station. Gana sobre la imagen del JSON.

> ⚠️ **Lección aprendida (v1.3.51)**: claves genéricas matchean de más. La clave
> `'Oscar'` (un juego de Vicio) pisaba "Que bello es sobrevivir - 08 - Oscar el
> emprendedor" y "The Magic Pear Tree ... Oscar Nominated Short". Regla: las
> claves **específicas** deben ir **antes** que las genéricas en el dict, porque
> el loop rompe en el primer match. Si una carátula da 403 (filmaffinity, etc.),
> **descargarla a `custom-posters/`** y apuntar a `raw.githubusercontent.com`.

### 4.6 Listado de carpetas (`list_folder`)

Por cada grupo del nodo:
1. Calcula el `group_forced` (override del póster del grupo o de su primera
   station) → gana sobre la imagen del JSON.
2. Si no, imagen por sufijo de ruta (`FOLDER_ICON_BY_PATH_SUFFIX`), herencia del
   nodo, o póster forzado de la primera station.
3. Por cada station aplica el override individual (`STATION_POSTER_OVERRIDES`).
4. Regla del álbum: si todos los capítulos comparten la misma imagen individual,
   es un póster genérico erróneo y **heredan la imagen de su carpeta** (salvo que
   tengan póster forzado individual).

### 4.7 Reproducción de vídeo (`play_video`)

- Si el `path` no es una URL, **refresca el enlace** (`refresh_link`) con la API
  `filemetas` de Terabox (los dlinks expiran a las 8h; el addon cachea 2h en
  `link_cache.json`).
- Notifica al servicio (`now_playing.json`) para el seguimiento.
- `setResolvedUrl` con `ResumeTime` para "continuar viendo".

### 4.8 Lanzamiento de juegos (MS-DOS y Windows)

Los juegos **NO** se reproducen con el player de Kodi. Flujo:

1. `_download_game(url, filename)` → descarga a `profile/games/` (streaming a
   disco con reanudación por `Range` y reintentos), extrae el zip/7z/rar.
2. `_find_game_exe` → localiza el ejecutable usando `GAME_EXE_MAP`
   (fragmento → `.EXE`), `GAME_BAT_MAP` (`.BAT` de lanzamiento propio) y un
   ranking genérico que evita setup/install/ayudas.
3. Juegos con episodios (`GAME_EPISODES`: Monster Bash, Secret Agent, Pickle Wars)
   montan el selector `BASH1/2/3`, `SAM1/2/3`, `PW2/3`.
4. `GAME_WINDOWS` (Claw): se lanza **nativo** con su `.exe` de Windows.
5. El resto se lanza con **DOSBox externo** (`_launch_game_external`):
   - Busca DOSBox portable en `resources/dosbox/` o en rutas del sistema
     (GR-lida, D-Fend, `%LOCALAPPDATA%`, etc.).
   - Monta la carpeta extraída como `C:\` (y el ISO como `D:` con `imgmount`
     para juegos CD-ROM como Los Justicieros).
   - Aplica `CPU_CYCLES` por juego (p.ej. `'schof': 170000`) vía `CALL`.
   - Precarga partidas guardadas de `game-saves/` (`_download_game_save`).
   - `xbmcplugin.endOfDirectory` (NO `setResolvedUrl`) para que Kodi no intente
     abrir el exe como ROM con RetroPlayer.

---

## 5. El servicio (`service.py`)

Servicio de arranque (`xbmc.service`) que corre en bucle mientras Kodi vive:

- **`_track_playback()`**: cada 0.25s comprueba si el addon está reproduciendo
  (leyendo `now_playing.json`). Guarda progreso en `watched.json`:
  `path → { name, pos, total, ts, watched }`, marcando `watched=True` al llegar
  al 90%. Alimenta "Continuar viendo" del plugin.
- **Switch de juegos**: observa el setting `enable_games`; al activarlo pide
  confirmación, localiza/asegura DOSBox (`_ensure_dosbox`, `_find_dosbox_exe`) y
  muestra tips de atajos. Al desactivarlo simplemente oculta la sección Vicio.
- Borra `WELCOME_FLAG` en cada sesión de Kodi para que la bienvenida reaparezca.

---

## 6. Flujo de datos de carátulas (resumen)

```
1. index.js decide la imagen y la guarda en lista.m3u (grupo.image / station.image)
2. GitHub Actions commitea lista.m3u
3. Kodi descarga lista.m3u (caché 6h) y construye el árbol
4. default.py aplica prioridades:
     STATION_POSTER_OVERRIDES (addon, siempre gana)
       → FOLDER_ICON_BY_PATH_SUFFIX / FOLDER_IMAGES / FOLDER_ICON_URLS
       → imagen del JSON (grupo/station)
       → herencia de la carpeta madre / regla del álbum
```

Por eso una carátula puede venir "de dos sitios": del JSON (la puso el generador)
o del addon (override). El override del addon **siempre gana** y es la vía rápida
para corregir sin esperar al workflow; la corrección en `index.js` es la vía
permanente.

---

## 7. Empacado y despliegue

- El zip del addon debe tener la **carpeta raíz `plugin.video.vansirius/`** con
  todo el contenido de `kodi-addon/` dentro.
- ⚠️ Kodi necesita **entradas de directorio explícitas** en el zip
  (`plugin.video.vansirius/`, `resources/`, ...). `Compress-Archive` de PowerShell
  no las escribe y Kodi responde "Estructura inválida". Se empaqueta con
  `zipfile` de Python (ver patrón en `rezip.py`).
- Incrementar la versión en `addon.xml` en cada cambio.
- El zip final se deja en `C:\Users\VanSirius\Downloads\vansirius-addon-vX.Y.Z.zip`.

---

## 8. Resumen de módulos clave en `default.py`

| Función/Constante | Línea aprox. | Qué hace |
|---|---|---|
| `STATION_POSTER_OVERRIDES` | 100 | Pósters forzados por subcadena (gana siempre) |
| `get_json` | 223 | Descarga+caché del JSON (TTL 6h) |
| `build_tree` | 293 | Convierte JSON plano en árbol anidado |
| `resolve_icon` | 338 | Resuelve el icono de cualquier carpeta |
| `list_root` / `list_folder` | 580 / 610 | Navegación |
| `refresh_link` | 869 | dlink fresco de Terabox (caché 2h) |
| `_download_game` | 925 | Descarga/extrae juegos a local |
| `GAME_EXE_MAP` | 1028 | fragmento → ejecutable del juego |
| `GAME_EPISODES` / `GAME_WINDOWS` | 1114 / 1122 | Selectores de episodios / juegos Windows |
| `play_video` | 1483 | Reproducción (vídeo) y lanzamiento (juego) |
| `list_continue_watching` | 1628 | Continuar viendo desde watched.json |
| `router` | 1716 | Despacho de acciones |