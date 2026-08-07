import xbmc
import xbmcaddon
import xbmcvfs
import os
import json
import random
import subprocess
import time

ADDON = xbmcaddon.Addon()
ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
SOUND_DIR = os.path.join(ADDON_PATH, 'resources', 'sounds')
REPRO_SCRIPT = os.path.join(ADDON_PATH, 'resources', 'reproduce.py')

# El interruptor vive en el addon principal (plugin.video.vansirius)
MAIN_ADDON_ID = 'plugin.video.vansirius'

# Datos de seguimiento compartidos con el addon principal
MAIN_PROFILE = os.path.join(xbmcvfs.translatePath('special://masterprofile'), 'addon_data', MAIN_ADDON_ID)
WATCHED_FILE = os.path.join(MAIN_PROFILE, 'watched.json')
NOW_PLAYING_FILE = os.path.join(MAIN_PROFILE, 'now_playing.json')


def load_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def save_json(path, data):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        log(f'Error guardando {path}: {e}')


def sounds_enabled():
    """Lee el setting enable_menu_sounds del addon principal (default: activado)."""
    try:
        main_addon = xbmcaddon.Addon(MAIN_ADDON_ID)
        return main_addon.getSetting('enable_menu_sounds') == 'true'
    except Exception:
        return True

sounds = [f for f in os.listdir(SOUND_DIR) if f.lower().endswith(('.wav', '.ogg'))] if os.path.isdir(SOUND_DIR) else []

# Candidatos de python del sistema (el de Kodi no tiene winsound)
PY_CANDIDATES = [
    r'C:\Python314\python.exe',
    r'C:\Python313\python.exe',
    r'C:\Python312\python.exe',
    r'C:\Python311\python.exe',
    r'C:\Python310\python.exe',
    r'C:\Python39\python.exe',
    r'C:\Python38\python.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python314\python.exe'),
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python313\python.exe'),
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python312\python.exe'),
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\Python\Python311\python.exe'),
]


def log(msg):
    xbmc.log(f'[VanSiriusSounds] {msg}', xbmc.LOGINFO)


def play_external(path):
    """Reproduce fuera del player de Kodi via python del sistema + winsound (suena, sin OSD)."""
    # Buscar python del sistema que exista y con winsound
    for py in PY_CANDIDATES:
        if os.path.exists(py):
            try:
                subprocess.Popen([py, REPRO_SCRIPT, path],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 creationflags=0x08000000)
                return
            except Exception as e:
                log(f'Fallo python {py}: {e}')
    # Fallback: winsound si estuviera en el python de Kodi
    try:
        import winsound
        winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
        return
    except Exception:
        pass
    # Ultimo recurso: player de Kodi
    try:
        xbmc.Player().play(path)
    except Exception as e:
        log(f'Player fallo: {e}')


def play_random():
    if not sounds:
        return
    path = os.path.join(SOUND_DIR, random.choice(sounds))
    play_external(path)
    log(f'Reproduciendo: {os.path.basename(path)}')


def find_active_container():
    # Preferir el contenedor que tiene el foco real (System.CurrentControl)
    try:
        ctrl = xbmc.getInfoLabel('System.CurrentControl')
        cid = int(ctrl)
    except Exception:
        cid = -1
    if cid >= 0:
        try:
            num = int(xbmc.getInfoLabel(f'Container({cid}).NumItems'))
        except Exception:
            num = 0
        if num > 0:
            try:
                pos = int(xbmc.getInfoLabel(f'Container({cid}).Position'))
            except Exception:
                pos = -1
            if pos >= 0:
                return (cid, pos)
    # Fallback: escanear contenedores
    for cid in range(1, 51):
        try:
            num = int(xbmc.getInfoLabel(f'Container({cid}).NumItems'))
        except Exception:
            num = 0
        if num > 0:
            try:
                pos = int(xbmc.getInfoLabel(f'Container({cid}).Position'))
            except Exception:
                pos = -1
            if pos >= 0:
                return (cid, pos)
    return (None, -1)


def disable_kodi_ui_sounds():
    # Kodi 21: audiooutput.guisoundmode=0 desactiva los sonidos de GUI (tick)
    _set_gui_sound(0, False)


def enable_kodi_ui_sounds():
    # Restaura los sonidos de GUI de Kodi (tick) al desactivar los nuestros
    _set_gui_sound(1, True)


def _set_gui_sound(mode, enabled):
    for setting, value in [('audiooutput.guisoundmode', mode), ('lookandfeel.soundenabled', enabled)]:
        try:
            xbmc.executebuiltin(f'SetSetting({setting},{str(value).lower()})')
        except Exception:
            pass
        try:
            payload = ('{"jsonrpc":"2.0","id":1,"method":"Settings.SetSettingValue",'
                       '"params":{"setting":"%s","value":%s}}') % (setting, str(value).lower())
            xbmc.executeJSONRPC(payload)
        except Exception:
            pass


def run():
    log(f'Servicio iniciado. Sonidos: {len(sounds)}')
    enabled = sounds_enabled()
    if enabled:
        disable_kodi_ui_sounds()

    last_key = (None, -1)
    last_enabled = enabled
    monitor = xbmc.Monitor()

    try:
        while not monitor.abortRequested():
            if monitor.waitForAbort(0.15):
                break

            # Seguimiento: registrar el progreso de reproducción periódicamente
            _track_playback()

            # Detectar cambio del interruptor en ajustes
            now_enabled = sounds_enabled()
            if now_enabled != last_enabled:
                last_enabled = now_enabled
                enabled = now_enabled
                if enabled:
                    log('Sonidos ACTIVADOS desde ajustes')
                    disable_kodi_ui_sounds()
                else:
                    log('Sonidos DESACTIVADOS desde ajustes')
                    enable_kodi_ui_sounds()

            if not enabled:
                last_key = (None, -1)
                continue

            try:
                win = int(xbmc.getInfoLabel('System.CurrentWindowID'))
            except Exception:
                win = -1

            if win in (12005, 12006, 12010, 12012, 12016, 12901):
                last_key = (None, -1)
                continue

            key = find_active_container()
            if key != last_key and key[0] is not None and last_key[0] is not None:
                play_random()
            last_key = key
    except Exception as e:
        log(f'Error en bucle: {e}')
    log('Servicio detenido')


_last_playback_log = 0
_tracking_started = 0  # momento en que empezó a registrarse la reproducción actual


def _track_playback():
    """Registra el progreso de reproducción del addon principal en watched.json."""
    global _last_playback_log, _tracking_started
    try:
        player = xbmc.Player()
        if not player.isPlaying():
            # Reproducción terminada: olvidar el seguimiento
            _tracking_started = 0
            _last_playback_log = 0
            return

        now_playing = load_json(NOW_PLAYING_FILE)
        path = now_playing.get('path', '')
        if not path:
            return

        # El addon escribe now_playing al resolver el play. Solo lo seguimos si:
        # - aún no hemos empezado a seguir, y el now_playing es reciente (<90s), o
        # - ya estamos siguiendo esta reproducción (misma path)
        if _tracking_started == 0:
            if time.time() - now_playing.get('ts', 0) > 90:
                return
            _tracking_started = time.time()
        elif now_playing.get('ts', 0) > _tracking_started + 5:
            # now_playing se reescribió (nueva reproducción del addon): reiniciar
            _tracking_started = time.time()

        total = player.getTotalTime()
        pos = player.getTime()
        if total <= 0:
            return

        watched = load_json(WATCHED_FILE)
        entry = watched.get(path, {})
        entry['name'] = now_playing.get('name', path.split('/')[-1] if path else '')
        entry['pos'] = pos
        entry['total'] = total
        entry['ts'] = time.time()
        entry['watched'] = (pos / total) >= 0.9
        watched[path] = entry
        save_json(WATCHED_FILE, watched)

        # Log de depuración cada ~10s
        if time.time() - _last_playback_log > 10:
            log(f'Seguimiento: {entry.get("name")} {pos:.0f}s/{total:.0f}s (visto: {entry["watched"]})')
            _last_playback_log = time.time()
    except Exception as e:
        log(f'Error en seguimiento: {e}')


if __name__ == '__main__':
    run()
