import sys
import xbmc
import xbmcaddon
import xbmcvfs
import os
import random
import time

ADDON = xbmcaddon.Addon()
ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
SOUND_DIR = os.path.join(ADDON_PATH, 'resources', 'sounds')

NO_SOUND_WINDOWS = {12005, 12006, 12010, 12012, 12016, 12901}

sounds = [f for f in os.listdir(SOUND_DIR) if f.lower().endswith(('.wav', '.ogg'))] if os.path.isdir(SOUND_DIR) else []

LOCK_FILE = os.path.join(ADDON_PATH, '.running')

# winsound: reproduccion asincrona sin tocar el player de Kodi (sin OSD ni "cargando")
try:
    import winsound
    HAS_WINSOUND = True
except Exception:
    HAS_WINSOUND = False
    import xbmcgui

if HAS_WINSOUND:
    player = None
else:
    player = xbmc.Player()


def log(msg):
    xbmc.log(f'[VanSiriusSounds] {msg}', xbmc.LOGINFO)


def play_sound(path):
    if HAS_WINSOUND:
        winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
    else:
        player.play(path)


def play_random():
    if not sounds:
        return
    path = os.path.join(SOUND_DIR, random.choice(sounds))
    try:
        play_sound(path)
        log(f'Reproduciendo: {os.path.basename(path)}')
    except Exception as e:
        log(f'Error al reproducir {path}: {e}')


def find_active_container():
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


def disable_kodi_ui_sounds(retries=5):
    for i in range(retries):
        try:
            xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Settings.SetSettingValue",'
                                '"params":{"setting":"lookandfeel.soundenabled","value":false}}')
            time.sleep(0.5)
        except Exception as e:
            log(f'Reintento silenciar tick {i + 1}: {e}')
    log('Sonidos de interfaz de Kodi desactivados (intentos de silenciar tick)')


if os.path.exists(LOCK_FILE):
    log('Ejecucion manual: reproduciendo sonido de prueba')
    play_random()
    xbmc.executebuiltin('Dialog.Close(all,true)')
    sys.exit(0)

with open(LOCK_FILE, 'w') as f:
    f.write('1')

log(f'Servicio iniciado. Sonidos disponibles: {len(sounds)} (modo {"winsound" if HAS_WINSOUND else "player"})')

# Silenciar el tick de Kodi con reintentos (esperar a que cargue el GUI)
monitor = xbmc.Monitor()
for _ in range(10):
    if monitor.abortRequested():
        break
    if monitor.waitForAbort(1):
        break
disable_kodi_ui_sounds()

last_key = (None, -1)
last_time = 0.0

try:
    while not monitor.abortRequested():
        if monitor.waitForAbort(0.15):
            break

        try:
            win = int(xbmc.getInfoLabel('System.CurrentWindowID'))
        except Exception:
            win = -1

        if win in NO_SOUND_WINDOWS:
            last_key = (None, -1)
            continue

        key = find_active_container()
        now = time.time()

        if key != last_key and key[0] is not None and last_key[0] is not None:
            if now - last_time >= 0.05:
                play_random()
                last_time = now

        last_key = key
finally:
    try:
        os.remove(LOCK_FILE)
    except Exception:
        pass

log('Servicio detenido')
