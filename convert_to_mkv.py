import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
BASE = sys.argv[1] if len(sys.argv) > 1 else r'J:\Anime\y si eras un niño afortunado y tus padres tenían Digital+\ya sabes, Cartoon Network, FoxKids, Disney Channel y Nickelodeon básicamente'
LOG = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\anime_mkv.log'
VIDEO_EXT = ('.mp4', '.avi', '.mpg', '.mpeg', '.wmv', '.mov', '.m4v', '.flv', '.webm', '.3gp')

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

def convert(src):
    base = os.path.splitext(src)[0]
    tmp = base + '.mkv.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', src,
                            '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-f', 'matroska', '-y', tmp],
                           capture_output=True, text=True, errors='replace', timeout=7200)
        if p.returncode != 0 or not valid(tmp):
            if os.path.exists(tmp):
                os.remove(tmp)
            return False, 'ffmpeg'
        os.replace(tmp, base + '.mkv')
        if os.path.abspath(src) != os.path.abspath(base + '.mkv'):
            os.remove(src)
        return True, os.path.basename(base + '.mkv')
    except Exception as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return False, str(e)

def main():
    tasks = []
    for root, dirs, files in os.walk(BASE):
        for f in files:
            if f.lower().endswith(VIDEO_EXT):
                tasks.append(os.path.join(root, f))
    tasks.sort()
    log(f'=== {BASE} : {len(tasks)} videos a mkv ===')
    ok = 0
    fail = 0
    workers = int(os.environ.get('W', '2'))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(convert, t): t for t in tasks}
        for fut in as_completed(futs):
            src = futs[fut]
            try:
                res, info = fut.result()
                if res:
                    ok += 1
                    log(f'  OK {info}')
                else:
                    fail += 1
                    log(f'  !! FALLO {os.path.basename(src)} ({info})')
            except Exception as e:
                fail += 1
                log(f'  !! worker error {os.path.basename(src)}: {e}')
    log(f'=== Fin: ok={ok} fail={fail} ===')

if __name__ == '__main__':
    main()