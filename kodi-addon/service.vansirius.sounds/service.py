import xbmc
import xbmcaddon
import xbmcvfs
import os
import random
import subprocess

ADDON = xbmcaddon.Addon()
ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
SOUND_DIR = os.path.join(ADDON_PATH, 'resources', 'sounds')

sounds = [f for f in os.listdir(SOUND_DIR) if f.lower().endswith(('.wav', '.ogg'))] if os.path.isdir(SOUND_DIR) else []

POWERSHELL = r'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'


def log(msg):
    xbmc.log(f'[VanSiriusSounds] {msg}', xbmc.LOGINFO)


def play_external(path):
    """Reproduce el sonido fuera del player de Kodi: sin OSD y pudiendo solaparse."""
    # 1) winsound si el Python lo incluye (no suele en Kodi)
    try:
        import winsound
        winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
        return
    except Exception:
        pass
    # 2) PowerShell MediaPlayer: asincrono, fuera de Kodi, permite solape
    try:
        cmd = [POWERSHELL, '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
               "Add-Type -AssemblyName PresentationCore; $m=New-Object System.Windows.Media.MediaPlayer; "
               f"$m.Open('{path}'); $m.Play()"]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        return
    except Exception as e:
        log(f'PowerShell fallo: {e}')
    # 3) fallback: player de Kodi
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
    try:
        xbmc.executeJSONRPC('{"jsonrpc":"2.0","id":1,"method":"Settings.SetSettingValue",'
                            '"params":{"setting":"lookandfeel.soundenabled","value":false}}')
    except Exception:
        pass


def run():
    log(f'Servicio iniciado. Sonidos: {len(sounds)}')
    disable_kodi_ui_sounds()

    last_key = (None, -1)
    monitor = xbmc.Monitor()

    try:
        while not monitor.abortRequested():
            if monitor.waitForAbort(0.15):
                break

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
