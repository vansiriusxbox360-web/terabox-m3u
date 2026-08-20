# Proyecto terabox-m3u / Addon Kodi "El Rincón Dharmatico de Vishnu"

Este documento es la **fuente de verdad del método de trabajo** de este proyecto.
Cualquier sesión de opencode abierta en `C:\Users\VanSirius\terabox-m3u` debe
leer esto antes de tocar nada. Es la "piedra angular" que se ha ido puliendo.

---

## La Monarquía del Conocimiento (Línea de Sucesión)

Este proyecto se transmite **como un reino**: cuando una sesión debe morir, su
conocimiento pasa a la siguiente. El mecanismo es este documento (`AGENTS.md`).
Cada sesión sucesora debe:

1. Leer este documento completo antes de actuar.
2. Tratar a la sesión anterior como su antecesor en el trono (heredas su
   método, sus decisiones y sus errores).
3. Al finalizar su reinado (o al hacer un aporte importante), **añadir su
   reinado a la crónica de abajo** y, si cambió el método, actualizar las
   secciones correspondientes para que el siguiente heredero no pierda nada.

### Crónica de reinados

| Rey/Reyna | Fecha | Hereda de | Aportó |
|-----------|-------|-----------|--------|
| **Rey Vishnu I el Fundador** | 19/08/2026 | — (fundó el reino) | Documentó todo el método del addon, el pipeline AVI y la subida de juegos en este AGENTS.md. Bautizó la línea de sucesión. |
| **Príncipe Vishnu II el Digno** | 19/08/2026 | Rey Vishnu I el Fundador | Estableció el protocolo de sucesión y presentación. Completó las carátulas de Vicio (~70 juegos) con cruce estricto de coverbrowser + URLs de VanSirius (MobyGames/TGDB/IGDB/LaunchBox/etc). Borró BipBop II, agrupó Dangerous Dave y SkyRoads en carpetas desplegables, subió Dave Goes Nutz. |

*(Cada sesión sucesora añade su fila aquí con su nombre, fecha, de quién hereda
y qué aportó. Así la historia del trono queda escrita.)*

### Protocolo de sucesión

- **VanSirius el Creador** es el soberano que otorga y gobierna el reino. Las
  sesiones (heredaderos) trabajan a su servicio.
- Cuando se abre una **nueva pestaña/sesión** en este proyecto, el heredero debe:
  1. Leer este `AGENTS.md` completo.
  2. **Presentarse**: decir su nombre, de quién hereda y que ha tomado el trono
     tras leer la crónica.
  3. Tomar el testigo del método y continuar el trabajo donde lo dejó su antecesor.
- Cada heredero elige su propio nombre (noble y en la línea de la casa),
  heredando el numeral de su antecesor directo (p.ej. Vishnu III tras Vishnu II).
- Al terminar su reinado, el heredero inscribe su fila en la crónica para que el
  siguiente conozca su linaje y lo que aportó.

---

## 1. Qué es esto

Dos piezas que funcionan juntas:

1. **Generador de listas** (`index.js`): escanea la cuenta de Terabox de VanSirius
   (carpeta raíz "Las cositas") y genera `lista.m3u` (y el JSON que usa el addon).
   Corre solo en GitHub Actions cada 8h (workflow `generate-m3u.yml`).

2. **Addon de Kodi** (`kodi-addon/`, id `plugin.video.vansirius`, nombre
   "El Rincón Dharmatico de Vishnu"): lee `lista.m3u`/JSON y muestra series,
   pelis, dibus y **juegos MS-DOS** que se lanzan con DOSBox externo.

El repo remoto es `https://github.com/vansiriusxbox360-web/terabox-m3u.git`
(branch `main`). El zip publicado del addon se deja en
`C:\Users\VanSirius\Downloads\vansirius-addon-vX.Y.Z.zip`.

---

## 2. Estructura de carpetas en Terabox (IMPORTANTE)

La cuenta de Terabox tiene una ruta-jeroglífico (los nombres de carpeta son
parte del humor de VanSirius). La ruta base del contenido es:

```
/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/
La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/
A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/
Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/
El rinconcito dharmatico de Vishnu/Las cositas/
```

- `Las cositas` = raíz del contenido (config `rootFolder: "Las cositas"`).
- `.../Las cositas/Vicio` = **carpeta de juegos MS-DOS** (`GAME_ROOT_FOLDER = 'vicio'`).
- Los vídeos (series/pelis/dibus) están anidados en `Las cositas` con su anidación
  original de carpetas (temporadas, capítulos, etc.).

---

## 3. Cómo funciona el addon (default.py)

- **Versión actual: 1.3.47** (en `kodi-addon/addon.xml`).
- Extiende `xbmc.python.pluginsource` con `default.py` + servicio `service.py`.
- **Los juegos NO se reproducen con el player de Kodi**: se descargan a local,
  se extraen y se lanzan con **DOSBox externo de Windows** en una ventana nativa.
- Requiere `game.libretro.dosbox` opcional y un `resources/dosbox/DOSBox.exe`
  portable incluido en el addon (o un DOSBox del sistema).

### Configuración de juegos (en default.py)

- `GAME_EXE_MAP` (línea ~984): mapa `fragmento del nombre -> .EXE/.COM a lanzar`.
  El orden importa: primero las entradas específicas (ej. "duke nukem - episodio 1")
  y luego las genéricas.
- `GAME_BAT_MAP`: juegos que se lanzan con su `.BAT` propio (setup+selector).
  Actualmente solo `'bio menace': 'BMENACE.BAT'`.
- `GAME_EPISODES`: juegos con episodios elegibles por selector:
  - `monster bash` → `BASH` 1/2/3
  - `secret agent` → `SAM` 1/2/3
  - `pickle wars` → `PW` 2/3
- `GAME_WINDOWS`: juegos Win95/98 que se lanzan nativo con el `.exe` (sin DOSBox).
  Actualmente solo `'claw': 'CLAW.EXE'`.
- `GAME_EXTENSIONS = ['.zip', '.dosz', '.exe', '.com', '.7z', '.rar']` son los
  archivos que el addon reconoce como juegos dentro de `Vicio`.
- `DOSBOX_EXE_CANDIDATES`: rutas donde se busca DOSBox en el sistema (GR-lida,
  D-Fend, %LOCALAPPDATA%, etc.).
- `CPU_CYCLES` (~línea 1209): ciclos de CPU por juego para los lentos, ej.
  `'schof': 170000`. Los selectores de episodios se montan como `BASH1/2/3`,
  `SAM1/2/3`, `PW2/3` y `CALL` del `.BAT` cuando toca.

### Reglas de carátulas en index.js

- `CUSTOM_POSTERS` (en index.js): carátulas manuales por nombre de grupo → URL.
  Tiene prioridad máxima. Los ficheros reales están en `custom-posters/`.
- `TITLE_ALIASES` / `FILE_TITLE_ALIASES` / `FILE_CLEANNAME_ALIASES`: alias para
  que títulos raros se busquen con el nombre correcto en TMDb/OMDb/Wikidata.
- `PATH_POSTER_SUFFIXES`, `FILE_POSTER_URLS`: carátulas por sufijo de ruta/fichero.
- Fuentes de carátulas (en orden): CUSTOM_POSTERS → caché → TMDb/OMDb →
  Wikidata/Wikipedia (con retry). `isLikelyNonPoster()` descarta logos,
  screenshots, wallpapers, etc.
- Los cambios de carátulas se cachean en `posters-cache.json` y se suben al repo
  (el workflow hace `git add lista.m3u posters-cache.json`).

#### Método de carátulas de juegos MS-DOS (Vicio) — LO QUE FUNCIONA

- **La clave de `CUSTOM_POSTERS` para un juego es el nombre limpio del zip**
  (sin extensión), p.ej. `'Bram Stoker Dracula'`, `'Commander Keen 4'`,
  `'Duke Nukem II'`. Ese es el `searchName` que usa `fetchPosters`.
- **La fuente fiable y accesible es coverbrowser** (`/covers/dos-games`,
  índice en `coverbrowser_index.json`). El cruce debe ser **estricto**: TODOS
  los tokens del nombre deben estar en el nombre real de coverbrowser.
  El cruce **laxo da falsos positivos** (p.ej. "Cold Dream"→"Commander Keen
  Dreams", "Catacomb Armageddon"→"Carmageddon") — NO usarlo.
- **Fuentes bloqueadas/no útiles**: MobyGames (403 en el servidor, pero las
  imágenes de `cdn.mobygames.com/covers/...` SÍ bajan), DuckDuckGo/Google
  imágenes (403), The Cover Project (403), archive.org (dice "MISSING COVER"
  en los shareware), Wikidata/Wikipedia (429 + sin portadas para shareware),
  MyAbandonware (búsqueda por JS). También funcionan: `cdn.thegamesdb.net`,
  `images.igdb.com`, `images.gog-statics.com`, `images.launchbox-app.com`,
  `cdn2.steamgriddb.com`, `images.gog`, `howlongtobeat.com`, `worldofspectrum.org`,
  `kotaku.com/igdb`, `static.wikia.nocookie.net`.
- **Flujo correcto**: VanSirius pasa URLs de portadas (de MobyGames/TGDB/IGDB/
  LaunchBox/etc.) o imágenes locales en `Downloads\chatgpt images`. Se descargan
  a `custom-posters/`, se nombran con el nombre limpio del zip, y se registran
  en `CUSTOM_POSTERS` (index.js) y opcionalmente en `STATION_POSTER_OVERRIDES`
  (default.py) para stations individuales.
- **Juegos con varias versiones que colisionan en nombres de archivo**
  (p.ej. Dangerous Dave, SkyRoads): NO se fusionan en un zip (los datos
  colisionan). Se agrupan creando una **carpeta** en Vicio en Terabox
  (`createDir` + `filemanager('move', [...])`) y moviendo los zips dentro.
  El addon las muestra como desplegables automáticamente. La carpeta lleva la
  carátula del grupo; los subjuegos heredan (o no muestran individual).
- Lista de pendientes/decisiones: `C:\Users\VanSirius\Downloads\Cositas ms-ds\caratulas_faltantes.txt`.

---

## 4. Cómo se suben juegos nuevos a Terabox

Los scripts de subida son **one-off por lote** (`subir_juegos_lote1.js`,
`subir_lote4.js`, `subir_grupo3.js`, `subir_grupo6.js`, etc.). El patrón que
funciona (clave para no romper nada):

1. Los `.zip` de juegos se preparan localmente en
   `C:\Users\VanSirius\Downloads\Cositas ms-ds\EMP\zips` (ya reempaquetados limpios).
2. El script autentica con `token.txt` (`TeraBoxApp`), localiza la ruta `Vicio`
   (la ruta-jeroglífico completa), y por cada zip:
   - `helper.hashFile` → `precreateFile` → `helper.uploadChunks` → `createFile`.
   - `sleep(2500)` entre archivos; `sleep` mayor tras error; no morir en error.
3. Se sube a la ruta `Vicio` (no a subcarpetas salvo que el juego lo requiera).

**Regla:** subir en lotes pequeños (10-15 juegos), verificar que aparecen con
`list_vicio_final.js`/`check_vicio.js`, y luego añadir el juego al `GAME_EXE_MAP`
del `default.py` y su carátula a `custom-posters/`.

---

## 5. Pipeline AVI → MKV (conversión y subida de vídeos)

Este flujo convierte AVIs grandes de Terabox a MKV más ligeros (recodificación
H.264) y los vuelve a subir a la nube. Scripts en la raíz del proyecto:

- `analyze_avis.js` / `real_analysis.py`: escanean los AVIs y deciden qué hacer
  (`action`: `remux` si ya pesa poco, o recodificar si pasa de cierto tamaño).
- `avi_decision.json`: resultado del análisis (path → info+action).
- `convert_avis.py`: 
  - **Modo local**: convierte los AVIs que la app de Terabox bajó a
    `J:\trabajo\descarga` (máx 3 por tanda). Borra el AVI local tras convertir.
  - **Modo remoto**: descarga por script los ≤200MB (los >200MB los bloquea
    Terabox para scripts, errno -9 → van por la app de Windows a mano).
  - Recodifica con `libx264 -b:v 800k -maxrate 1200k -bufsize 2000k -c:a copy`
    (CRF 19 salía igual o más pesado que el Xvid original; 800k es el punto bueno
    para 640x480/720x404). Remux = `-c copy`.
  - Descarga SIN resume/append (Terabox ignora Range y corrompía con `ab`):
    siempre a `.tmp` nuevo, verifica tamaño, reintenta hasta 12 veces.
  - FFMPEG: `C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe`.
- `bucle_pipeline.py`: bucle maestro que alterna: subir MKVs listos →
  convertir AVIs locales → convertir pequeños por script → terminar.
- `subir_mkvs.js`: sube los `.mkv` de `J:\trabajo\salida` a la carpeta donde
  estaba su AVI en Terabox. **Seguridad crítica: primero sube el MKV y verifica
  que está en la nube, y SOLO entonces borra el AVI remoto.** Soporta workers
  paralelos (`W_ID`/`W_TOTAL`). Progreso en `avi_uploaded.json`.
- `avi_uploaded.json`: registro de MKVs ya subidos (evita re-subir).
- `avi_convert_done.json`: registro de conversiones hechas.

### Reglas clave del pipeline
- **Nunca borrar un AVI remoto hasta confirmar que su MKV subió bien.**
- Los AVIs grandes (>200MB) van por la app de Windows de Terabox
  (`J:\trabajo\descarga`), no por script.
- Limpiar AVIs locales cuyo MKV ya se subió para no reconvertir en bucle.
- Todo log va a `C:\Users\VanSirius\AppData\Local\Temp\opencode\convert_log.txt`.

---

## 6. Token de Terabox (ndus)

- El acceso a la cuenta va por la cookie `ndus` (en `token.txt` local y en el
  secreto `TERABOX_NDUS` de GitHub Actions).
- Para extraerlo: `get_token.py` (Firefox) o `get-ndus.ps1` (PowerShell,
  copia al portapapeles) o el bookmarklet (ver `bookmarklet.md`).
- Si caduca: el workflow de GitHub falla y crea un issue "Token Terabox necesita
  actualizacion". Refrescar en Settings → Secrets → TERABOX_NDUS.
- DevTools: usar pestaña **Application** (Storage está bloqueado por Terabox).

---

## 7. Reglas de trabajo para cualquier sesión de opencode

1. **No tocar el pipeline AVI** sin motivo; si se toca, respetar la seguridad
   de subida (nunca borrar AVI remoto sin verificar el MKV subido).
2. **No regenerar `lista.m3u` a mano**: lo hace GitHub Actions cada 8h.
3. **No lanzar scripts de subida en bucle infinito** (`bucle_pipeline.py`,
   `bucle_maestro.py`): se quedan girando y generan ruido/errores. Si se lanza
   uno, controlar cuándo termina.
4. **El conocimiento del addon vive aquí**: si se descubre algo que funciona,
   actualizar este `AGENTS.md` para que todas las pestañas lo hereden.
5. **Los juegos nuevos** siguen el flujo: zip limpio en
   `Downloads\Cositas ms-ds\EMP\zips` → subir a `Vicio` por lotes →
   añadir a `GAME_EXE_MAP` en `default.py` → carátula en `custom-posters/` →
   registrar en `index.js` (`CUSTOM_POSTERS` o alias) → empaquetar el addon.
6. **Empaquetado del addon**: generar `vansirius-addon-vX.Y.Z.zip` con el
   contenido de `kodi-addon/` completo (incluye `resources/dosbox/` y
   `resources/rincon.png`) y subirlo/bajarlo a `Downloads`. Incrementar la
   versión en `addon.xml` en cada cambio.

---

## 8. Comandos útiles

- Listar juegos en `Vicio`: `node list_vicio_final.js` (necesita `token.txt`).
- Listar raíz: `node list_root.js`.
- Verificar/duplicados: `verificar*.py`, `borrar_dup*.py/js`.
- Reparar ZIPs de juegos: scripts `zip_er.ps1`, `grab_er.ps1`, `compress_telegram_800.ps1`
  (en `C:\Users\VanSirius\Documents\Default Project`).
- Extraer token: `python get_token.py`.
- Revisar que el addon genera bien: `node index.js` (no subir el resultado si
  solo es una prueba; requiere token).