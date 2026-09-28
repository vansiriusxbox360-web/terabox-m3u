import os
import re
import subprocess
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
SRC = r'C:\Users\VanSirius\Downloads\eMule\Incoming'
DST = r'K:\Seriespinda.com\Somebody Somewhere'
REG = r'C:\Users\VanSirius\terabox-m3u\somebody_redo_done.txt'
LOG = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\seriespinda_convert.log'
TARGET_MB = 600

def log(msg):
    line = f'[{time.strftime("%H:%M:%S")}] {msg}'
    try:
        print(line)
    except Exception:
        pass
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass

def ep_token(name):
    m = re.search(r'(?i)(?:s(\d+)[ex](\d+))|(?:(\d+)[x](\d+))', name)
    if m:
        if m.group(1):
            return f'{int(m.group(1))}x{int(m.group(2)):02d}'
        return f'{int(m.group(3))}x{int(m.group(4)):02d}'
    return None

def probe(path):
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, timeout=60)
        err = p.stderr or ''
        dur = None
        audio = 0
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
        return None, None

def bitrate_for_target(path, target_mb):
    dur, audio = probe(path)
    if not dur or dur <= 0:
        return None
    total = target_mb * 8 * 1024 / dur
    return max(300, int(total - audio))

def convert(src, out):
    br = bitrate_for_target(src, TARGET_MB)
    if br is None:
        return False
    args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', src,
            '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'faster',
            '-b:v', f'{br}k', '-maxrate', f'{int(br*1.5)}k', '-bufsize', f'{int(br*2)}k',
            '-c:a', 'copy', '-f', 'matroska', '-y', out]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=5400)
        return p.returncode == 0
    except Exception as e:
        log(f'  error ffmpeg: {e}')
        return False

def valid(path):
    if not os.path.exists(path) or os.path.getsize(path) < 1024:
        return False
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, timeout=60)
        return 'Video:' in (p.stderr or '')
    except Exception:
        return False

def load_done():
    if not os.path.exists(REG):
        return set()
    with open(REG, 'r', encoding='utf-8') as f:
        return set(line.strip() for line in f if line.strip())

def save_done(tokens):
    with open(REG, 'w', encoding='utf-8') as f:
        for t in sorted(tokens):
            f.write(t + '\n')

def clean_name(name):
    """Convierte el nombre de eMule (puntos/tags) en un nombre limpio."""
    base = os.path.splitext(name)[0]
    base = re.sub(r'\[[^\]]*\]', '', base)
    base = re.sub(r'\([^)]*\)', '', base)
    base = base.replace('_', ' ').replace('.', ' ').replace('-', '-')
    base = re.sub(r'\s+', ' ', base).strip()
    base = base.strip(' -')
    return base + '.mkv'

def main():
    done = load_done()
    # targets actuales en K:\ por token (si existen)
    targets = {}
    for f in os.listdir(DST):
        if f.lower().endswith('.mkv'):
            t = ep_token(f)
            if t:
                targets[t] = os.path.join(DST, f)
    # fuentes en eMule
    sources = []
    for f in os.listdir(SRC):
        if 'somebody' in f.lower() and f.lower().endswith('.mkv'):
            t = ep_token(f)
            if t:
                sources.append((t, os.path.join(SRC, f)))
    sources.sort()
    pending = [(t, s) for (t, s) in sources if t not in done]
    log(f'=== Redo Somebody a {TARGET_MB}MB: {len(sources)} fuentes, {len(pending)} pendientes ===')
    for (t, src) in pending:
        out = targets.get(t) or os.path.join(DST, clean_name(os.path.basename(src)))
        if os.path.abspath(src).lower() == os.path.abspath(out).lower():
            continue
        tmp = out + '.tmp'
        log(f'  {t}: {os.path.basename(src)} -> {os.path.basename(out)}')
        if os.path.exists(tmp):
            os.remove(tmp)
        ok = convert(src, tmp)
        if not ok or not valid(tmp):
            log(f'  !! fallo {t}')
            if os.path.exists(tmp):
                os.remove(tmp)
            continue
        sz = os.path.getsize(tmp)
        os.replace(tmp, out)
        done.add(t)
        save_done(done)
        log(f'  OK {t}: {sz//1024//1024}MB (original intacto en eMule)')
    log(f'=== Redo: {len(pending)} procesadas, {len(done)} hechas en total ===')

if __name__ == '__main__':
    main()