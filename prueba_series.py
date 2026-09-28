import sys, os
sys.argv = ['convert_seriespinda.py', 'all']
import convert_seriespinda as c
tests = [
  (r'K:\Seriespinda.com\UPA\T1\Un paso adelante S01E02.mkv', 'resize', 600, None),
  (r'K:\Seriespinda.com\UPA\T4\Un paso adelante S04E01.avi', 'remux', None, None),
  (r'K:\Seriespinda.com\Somebody Somewhere\Somebody Somewhere 1x01 big fucking freaking deal (spanish english subs) web dl 1080p x264 ac3 (grupots).mkv', 'somebody', None, None),
]
for path, mode, tm, fv in tests:
    if os.path.exists(path):
        c.log(f'--- TEST {mode}: {os.path.basename(path)}')
        c.process_file(path, mode, target_mb=tm, fixed_vbr=fv)
