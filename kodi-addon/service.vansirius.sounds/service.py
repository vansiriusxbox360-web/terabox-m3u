import xbmc
import xbmcaddon
import xbmcvfs
import os
import random
import subprocess

ADDON = xbmcaddon.Addon()
ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
SOUND_DIR = os.path.join(ADDON_PATH, 'resources', 'sounds')
REPRO_SCRIPT = os.path.join(ADDON_PATH, 'resources', 'reproduce.py')

# El interruptor vive en el addon principal (plugin.video.vansirius)
MAIN_ADDON_ID = 'plugin.video.vansirius'


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


if __name__ == '__main__':
    run()
