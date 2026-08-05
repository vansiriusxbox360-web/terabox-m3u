import xbmc
import xbmcaddon
import xbmcvfs
import os
import random
import time

ADDON = xbmcaddon.Addon()
ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
SOUND_DIR = os.path.join(ADDON_PATH, 'resources', 'sounds')

# Ventanas donde NO debe sonar (video a pantalla completa, pvr, etc.)
NO_SOUND_WINDOWS = {12005, 12006, 12010, 12012}

sounds = [f for f in os.listdir(SOUND_DIR) if f.endswith('.ogg')] if os.path.isdir(SOUND_DIR) else []
if not sounds:
    xbmc.log('[VanSiriusSounds] No hay sonidos en resources/sounds', xbmc.LOGERROR)

player = xbmc.Player()

last_pos = -1
last_time = 0.0


def play_random():
    if not sounds:
        return
    path = os.path.join(SOUND_DIR, random.choice(sounds))
    try:
        player.play(path)
    except Exception as e:
        xbmc.log(f'[VanSiriusSounds] Error al reproducir: {e}', xbmc.LOGERROR)


monitor = xbmc.Monitor()

while not monitor.abortRequested():
    if monitor.waitForAbort(0.25):
        break

    try:
        win = int(xbmc.getInfoLabel('System.CurrentWindowID'))
    except Exception:
        win = -1

    if win in NO_SOUND_WINDOWS or player.isPlaying():
        last_pos = -1
        continue

    try:
        pos = int(xbmc.getInfoLabel('Container(1).Position'))
    except Exception:
        pos = -1

    now = time.time()
    if pos != last_pos and pos >= 0 and last_pos >= 0:
        if now - last_time >= 0.15:
            play_random()
            last_time = now

    last_pos = pos

xbmc.log('[VanSiriusSounds] Servicio detenido', xbmc.LOGDEBUG)
