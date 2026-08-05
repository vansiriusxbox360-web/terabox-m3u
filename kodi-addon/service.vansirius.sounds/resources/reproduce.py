import sys, winsound

if len(sys.argv) > 1:
    winsound.PlaySound(sys.argv[1], winsound.SND_FILENAME | winsound.SND_ASYNC)
