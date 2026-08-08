import xbmc
import xbmcaddon
import xbmcvfs
import xbmcgui
import os
import json
import time

# Emulador MS-DOS necesario para los juegos de la carpeta "vicio"
DOSBOX_ADDON = 'game.libretro.dosbox'
REPOSITORY = 'repository.xbmc.org'

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


def _ensure_dosbox():
    """Comprueba e instala el emulador DOSBox si falta (para los juegos de 'vicio')."""
    try:
        # Habilitar el sistema de juegos de Kodi (RetroPlayer)
        try:
            xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Settings.SetSettingValue","params":{"setting":"games.enable","value":true}}')
        except Exception:
            pass
        # Desinstalar DOSBox Pure si está presente (roto/compite con game.libretro.dosbox)
        try:
            xbmcaddon.Addon('game.libretro.dosbox-pure')
            log('Desinstalando game.libretro.dosbox-pure (roto o conflictivo)...')
            xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Addons.UninstallAddon","params":{"addonid":"game.libretro.dosbox-pure"}}')
            xbmc.executebuiltin('UninstallAddon(game.libretro.dosbox-pure)')
        except Exception:
            pass
        # Comprobar si DOSBox ya está instalado
        try:
            addon = xbmcaddon.Addon(DOSBOX_ADDON)
            log(f'DOSBox ya instalado (v{addon.getAddonInfo("version")})')
            return
        except Exception:
            pass
        # Asegurar que el repositorio oficial está presente
        try:
            xbmcaddon.Addon(REPOSITORY)
        except Exception:
            log('Repositorio oficial no encontrado. Se intentará instalar DOSBox igualmente.')
        log('Instalando DOSBox (game.libretro.dosbox)...')
        xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Addons.InstallAddon","params":{"addonid":"' + DOSBOX_ADDON + '"}}')
        xbmc.executebuiltin('InstallAddon(' + DOSBOX_ADDON + ')')
    except Exception as e:
        log(f'Error asegurando DOSBox: {e}')


def _confirm_games_enable():
    """Pide confirmación al activar el switch de juegos; si se acepta, instala DOSBox."""
    try:
        if not xbmcgui.Dialog().yesno(
            'Juegos (DOSBox)',
            'Has activado los juegos.\n\n'
            'Esto instalará DOSBox (emulador MS-DOS) para poder jugar\n'
            'a los juegos de la sección Vicio.\n\n'
            '¿Quieres activar los juegos ahora?',
            yeslabel='Sí, activar',
            nolabel='No'
        ):
            xbmcaddon.Addon(MAIN_ADDON_ID).setSetting('enable_games', 'false')
            xbmcgui.Dialog().ok('Juegos', 'Juegos desactivados.\nPuedes activarlos de nuevo desde Ajustes.')
            return
        _ensure_dosbox()
    except Exception as e:
        log(f'Error confirmando juegos: {e}')


def run():
    log('Servicio tracker iniciado')
    monitor = xbmc.Monitor()
    last_games_setting = None
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
