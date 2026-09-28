import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
BASE = r'J:\Anime\Bleach 1080p'
LOG = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\bleach_mkv.log'
CRF = 25
SKIP_IF_LE = 350 * 1024 * 1024  # ya convertido (los originales pesan >700MB)

def log(m):
    l = f'[{time.strftime("%H:%M:%S")}] {m}'
    print(l)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(l + '\n')
    except Exception:
        pass

def valid(path):
    if not os.path.exists(path) or os.path.getsize(path) < 1024:
        return False
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, errors='replace', timeout=60)
        return 'Video:' in (p.stderr or '')
    except Exception:
        return False

def process(src):
    base = os.path.splitext(src)[0]
    tmp = base + '.mkv.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-i', src,
                            '-map', '0:v:0', '-map', '0:a:0', '-map', '0:s?',
                            '-c:v', 'libx265', '-preset', 'fast', '-crf', str(CRF), '-threads', '8',
                            '-c:a', 'copy', '-c:s', 'copy', '-f', 'matroska', '-y', tmp],
                           capture_output=True, text=True, errors='replace', timeout=14400)
        if p.returncode != 0 or not valid(tmp):
            if os.path.exists(tmp):
                os.remove(tmp)
            return False, 'ffmpeg'
    except Exception as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return False, str(e)
    sz_orig = os.path.getsize(src)
    sz_tmp = os.path.getsize(tmp)
    if sz_tmp < sz_orig:
        os.replace(tmp, base + '.mkv')
        return True, f'{sz_orig//1024//1024}MB->{sz_tmp//1024//1024}MB'
    else:
        if os.path.exists(tmp):
            os.remove(tmp)
        return False, f'no menor ({sz_orig//1024//1024} vs {sz_tmp//1024//1024})'

def main():
    tasks = []
    for f in sorted(os.listdir(BASE)):
        if not f.lower().endswith('.mkv'):
            continue
        src = os.path.join(BASE, f)
        if os.path.getsize(src) <= SKIP_IF_LE:
            continue
        tasks.append(src)
    log(f'=== Bleach: {len(tasks)} a x265 CRF{CRF} ===')
    ok = 0
    fail = 0
    workers = int(os.environ.get('W', '2'))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(process, t): t for t in tasks}
        for fut in as_completed(futs):
            src = futs[fut]
            try:
                res, info = fut.result()
                if res:
                    ok += 1
                    log(f'  OK {os.path.basename(src)} ({info})')
                else:
                    fail += 1
                    log(f'  !! {os.path.basename(src)} ({info})')
            except Exception as e:
                fail += 1
                log(f'  !! worker {os.path.basename(src)}: {e}')
    log(f'=== Fin: ok={ok} fail={fail} ===')

if __name__ == '__main__':
    main()