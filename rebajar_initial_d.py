import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
BASE = r'J:\Telegram Desktop\Initial D'
LOG = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\initial_d.log'
TARGETS = {'T1': 200, 'T2': 200, 'T4': 200, 'T5': 250, 'T6': 250}  # MB

def log(m):
    l = f'[{time.strftime("%H:%M:%S")}] {m}'
    print(l)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(l + '\n')
    except Exception:
        pass

def probe(path):
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, errors='replace', timeout=60)
        err = p.stderr or ''
        dur = None
        audio = 192
        for line in err.splitlines():
            if 'Duration:' in line and dur is None:
                d = line.split('Duration:')[1].split(',')[0].strip()
                h, m, s = d.split(':')
                dur = int(h)*3600 + int(m)*60 + float(s)
            if 'Audio:' in line and 'kb/s' in line:
                try:
                    audio = int(line.split('kb/s')[0].split()[-1])
                except Exception:
                    pass
        return dur, audio
    except Exception:
        return None, 192

def bitrate_for_target(path, target_mb):
    dur, audio = probe(path)
    if not dur or dur <= 0:
        return None
    total = target_mb * 8 * 1024 / dur
    return max(250, int(total - audio))

def valid(path):
    if not os.path.exists(path) or os.path.getsize(path) < 1024:
        return False
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, errors='replace', timeout=60)
        return 'Video:' in (p.stderr or '')
    except Exception:
        return False

def process(src, target_mb):
    base = os.path.splitext(src)[0]
    tmp = base + '.mkv.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    br = bitrate_for_target(src, target_mb)
    if br is None:
        return False, 'probe'
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', src,
                            '-map', '0:v:0', '-map', '0:a:0',
                            '-c:v', 'libx264', '-preset', 'faster',
                            '-b:v', f'{br}k', '-maxrate', f'{int(br*1.5)}k', '-bufsize', f'{int(br*2)}k',
                            '-c:a', 'copy', '-f', 'matroska', '-y', tmp],
                           capture_output=True, text=True, errors='replace', timeout=7200)
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
    for season, target in TARGETS.items():
        d = os.path.join(BASE, season)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith('.mkv'):
                continue
            src = os.path.join(d, f)
            # skip si ya esta cerca del objetivo
            if os.path.getsize(src) <= target * 1.15 * 1024 * 1024:
                continue
            tasks.append((src, target))
    log(f'=== Initial D: {len(tasks)} a rebajar ===')
    ok = 0
    fail = 0
    workers = int(os.environ.get('W', '2'))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(process, src, t): (src, t) for (src, t) in tasks}
        for fut in as_completed(futs):
            src, t = futs[fut]
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