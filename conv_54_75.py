import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import rebajar_bleach as r
for name in ['Bleach - 54.mkv', 'Bleach - 75.mkv']:
    src = r'J:\Anime\Bleach 1080p' + '\\' + name
    res, info = r.process(src)
    r.log(f'  {name}: {info} ({"OK" if res else "FALLO"})')
r.log('=== Fin 54/75 ===')
