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

sounds = [f for f in os.listdir(SOUND_DIR) if f.endswith('.ogg')] if os.path.isdir(SOUND_DIR) else []

player = xbmc.Player()

LOCK_FILE = os.path.join(ADDON_PATH, '.running')


def play_random():
    if not sounds:
        return
    path = os.path.join(SOUND_DIR, random.choice(sounds))
    try:
        player.play(path)
        xbmc.log(f'[VanSiriusSounds] Reproduciendo: {os.path.basename(path)}', xbmc.LOGINFO)
    except Exception as e:
        xbmc.log(f'[VanSiriusSounds] Error al reproducir {path}: {e}', xbmc.LOGERROR)


def find_active_container():
    """Devuelve (container_id, posicion) del primer contenedor con items activo."""
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


def log(msg):
    xbmc.log(f'[VanSiriusSounds] {msg}', xbmc.LOGINFO)


# Si ya hay una instancia del servicio corriendo, esta ejecucion es manual (abrir addon)
# -> reproducir un sonido de prueba para confirmar que la reproduccion funciona
if os.path.exists(LOCK_FILE):
    log('Ejecucion manual: reproduciendo sonido de prueba')
    play_random()
    xbmc.executebuiltin('Dialog.Close(all,true)')
    sys.exit(0)

# Crear lock (instancia servicio)
with open(LOCK_FILE, 'w') as f:
    f.write('1')

log(f'Servicio iniciado. Sonidos disponibles: {len(sounds)}')

last_key = (None, -1)
last_time = 0.0
monitor = xbmc.Monitor()

try:
    while not monitor.abortRequested():
        if monitor.waitForAbort(0.2):
            break

        try:
            win = int(xbmc.getInfoLabel('System.CurrentWindowID'))
        except Exception:
            win = -1

        if win in NO_SOUND_WINDOWS or player.isPlaying():
            last_key = (None, -1)
            continue

        key = find_active_container()
        now = time.time()

        if key != last_key and key[0] is not None and last_key[0] is not None:
            log(f'Navegacion detectada: container {key[0]} pos {key[1]} (antes {last_key[1]})')
            if now - last_time >= 0.15:
                play_random()
                last_time = now

        last_key = key
finally:
    try:
        os.remove(LOCK_FILE)
    except Exception:
        pass

log('Servicio detenido')
