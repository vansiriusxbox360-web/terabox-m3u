import sys
import wave
import winsound
import time

if len(sys.argv) > 1:
    path = sys.argv[1]
    # Mantener vivo el proceso mientras suena el WAV (SND_ASYNC muere con el proceso)
    dur = 2.0
    try:
        with wave.open(path, 'rb') as w:
            dur = w.getnframes() / float(w.getframerate()) + 0.5
    except Exception:
        pass
    winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC)
    time.sleep(dur)
