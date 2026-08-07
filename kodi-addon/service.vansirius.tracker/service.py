import xbmc
import xbmcvfs
import os
import json
import time

# Datos compartidos con el addon principal
MAIN_ADDON_ID = 'plugin.video.vansirius'
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


def log(msg):
    xbmc.log(f'[VanSiriusTracker] {msg}', xbmc.LOGINFO)


_last_playback_log = 0
_tracking_started = 0


def _track_playback():
    """Registra el progreso de reproducción del addon principal en watched.json."""
    global _last_playback_log, _tracking_started
    try:
        player = xbmc.Player()
        if not player.isPlaying():
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

        if time.time() - _last_playback_log > 10:
            log(f'Seguimiento: {entry.get("name")} {pos:.0f}s/{total:.0f}s (visto: {entry["watched"]})')
            _last_playback_log = time.time()
    except Exception as e:
        log(f'Error en seguimiento: {e}')


def run():
    log('Servicio tracker iniciado')
    monitor = xbmc.Monitor()
    try:
        while not monitor.abortRequested():
            if monitor.waitForAbort(0.15):
                break
            _track_playback()
    except Exception as e:
        log(f'Error en bucle: {e}')
    log('Servicio tracker detenido')


if __name__ == '__main__':
    run()
