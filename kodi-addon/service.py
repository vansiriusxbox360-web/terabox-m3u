import xbmc
import xbmcaddon
import xbmcvfs
import xbmcgui
import os
import json
import time

# Datos compartidos con el addon principal
MAIN_ADDON_ID = 'plugin.video.vansirius'
MAIN_PROFILE = os.path.join(xbmcvfs.translatePath('special://masterprofile'), 'addon_data', MAIN_ADDON_ID)
WATCHED_FILE = os.path.join(MAIN_PROFILE, 'watched.json')
NOW_PLAYING_FILE = os.path.join(MAIN_PROFILE, 'now_playing.json')
WELCOME_FLAG = os.path.join(MAIN_PROFILE, '.welcome_shown')


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


DOSBOX_EXE_CANDIDATES = [
    r'C:\Program Files\GR-lida\DOSBox\DOSBox.exe',
    r'C:\Program Files (x86)\D-Fend Reloaded\DOSBox\DOSBox.exe',
    r'C:\Program Files (x86)\DOSBox\DOSBox.exe',
    r'C:\Program Files\DOSBox\DOSBox.exe',
    r'C:\DOSBox\DOSBox.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\DOSBox\DOSBox.exe'),
]


def _find_dosbox_exe():
    """Busca DOSBox.exe: primero el portable incluido en el addon, luego el del sistema."""
    bundled = os.path.join(xbmcaddon.Addon(MAIN_ADDON_ID).getAddonInfo('path'), 'resources', 'dosbox', 'DOSBox.exe')
    if os.path.exists(bundled):
        return bundled
    for c in DOSBOX_EXE_CANDIDATES:
        if os.path.exists(c):
            return c
    import shutil
    try:
        p = shutil.which('dosbox') or shutil.which('DOSBox')
        if p:
            return p
    except Exception:
        pass
    return None


def _ensure_dosbox():
    """Comprueba el DOSBox (portable del addon o externo de Windows).

    Los juegos se lanzan con DOSBox.exe en ventana nativa. El portable va
    incluido en el addon, así que no hace falta instalar nada ni reiniciar.
    """
    try:
        if _find_dosbox_exe():
            log('DOSBox encontrado (portable del addon o del sistema)')
            return True
        log('DOSBox.exe NO encontrado')
        xbmcgui.Dialog().ok(
            'Juegos (DOSBox)',
            'No se ha encontrado DOSBox.\n\n'
            'El addon debería incluir un DOSBox portable en\n'
            'resources/dosbox. Comprueba que el zip esté completo\n'
            'o instala DOSBox 0.74 / D-Fend Reloaded en el sistema.'
        )
        return False
    except Exception as e:
        log(f'Error asegurando DOSBox: {e}')
        return False


def _show_dosbox_tips():
    """Instrucciones útiles de DOSBox tras activarlo."""
    try:
        xbmcgui.Dialog().ok(
            'Juegos (DOSBox)',
            'DOSBox activado. La carpeta Vicio ya aparecerá al volver\n'
            'a la raíz del addon (sin reiniciar).\n\n'
            'El addon incluye DOSBox portable, así que no necesitas\n'
            'instalar nada.\n\n'
            'Atajos de DOSBox:\n'
            '  Ctrl+F9  = Cerrar DOSBox / salir del juego\n'
            '  Alt+Enter = Pantalla completa / ventana\n'
            '  Ctrl+F10 = Capturar / soltar el ratón\n\n'
            'Velocidad (si un juego va lento o rápido):\n'
            '  Ctrl+F12 = Subir la velocidad\n'
            '  Ctrl+F11 = Bajarla'
        )
    except Exception as e:
        log(f'Error mostrando tips DOSBox: {e}')


def _confirm_games_enable():
    """Pide confirmación al activar el switch de juegos; si se acepta, instala DOSBox."""
    try:
        if not xbmcgui.Dialog().yesno(
            'Juegos (DOSBox)',
            'Has activado los juegos.\n\n'
            'Esto mostrará la sección Vicio con juegos MS-DOS que se\n'
            'abren con DOSBox (solo Windows, emulador incluido).\n\n'
            '¿Quieres activar los juegos ahora?',
            yeslabel='Sí, activar',
            nolabel='No'
        ):
            xbmcaddon.Addon(MAIN_ADDON_ID).setSetting('enable_games', 'false')
            xbmcgui.Dialog().ok('Juegos', 'Juegos desactivados.\nPuedes activarlos de nuevo desde Ajustes.')
            return
        _ensure_dosbox()
        _show_dosbox_tips()
        # Refrescar la vista actual para que Vicio aparezca sin salir del addon
        try:
            xbmc.executebuiltin('Container.Refresh')
        except Exception:
            pass
    except Exception as e:
        log(f'Error confirmando juegos: {e}')


def run():
    log('Servicio tracker iniciado')
    # Nueva sesión de Kodi: borrar el flag para que la bienvenida salga de nuevo
    try:
        if os.path.exists(WELCOME_FLAG):
            os.remove(WELCOME_FLAG)
    except Exception as e:
        log(f'Error borrando flag de bienvenida: {e}')
    monitor = xbmc.Monitor()
    try:
        last_games_setting = xbmcaddon.Addon(MAIN_ADDON_ID).getSetting('enable_games')
    except Exception:
        last_games_setting = 'false'
    try:
        while not monitor.abortRequested():
            if monitor.waitForAbort(0.25):
                break
            _track_playback()
            try:
                cur = xbmcaddon.Addon(MAIN_ADDON_ID).getSetting('enable_games')
            except Exception:
                cur = None
            if cur != last_games_setting:
                last_games_setting = cur
                if cur == 'true':
                    log('Switch de juegos activado, pidiendo confirmación')
                    _confirm_games_enable()
    except Exception as e:
        log(f'Error en bucle: {e}')
    log('Servicio tracker detenido')


if __name__ == '__main__':
    run()
