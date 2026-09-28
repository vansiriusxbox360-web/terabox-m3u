import os
import subprocess
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
BASE = r'K:\Seriespinda.com'
LOG = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\seriespinda_convert.log'

# Objetivo ~600MB para UPA T1-T3
UPA_TARGET_MB = 600
# Somebody (1080p): apuntar a ~600MB tambien (el 800k fijo dejaba ~200MB y pixelaba)
SOMEBODY_TARGET_MB = 600

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

def probe(path):
    """Devuelve (duracion_s, bitrate_audio_kbps) o (None, None)."""
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, timeout=60)
        err = p.stderr or ''
        dur = None
        audio_kbps = 0
        for line in err.splitlines():
            if 'Duration:' in line and dur is None:
                d = line.split('Duration:')[1].split(',')[0].strip()
                h, m, s = d.split(':')
                dur = int(h)*3600 + int(m)*60 + float(s)
            if 'Audio:' in line and 'kb/s' in line:
                try:
                    audio_kbps = int(line.split('kb/s')[0].split()[-1])
                except Exception:
                    pass
        return dur, audio_kbps
    except Exception:
        return None, None

def bitrate_for_target(path, target_mb):
    """Calcula bitrate de video (kbps) para alcanzar target_mb dado la duracion (restando audio)."""
    dur, audio_kbps = probe(path)
    if not dur or dur <= 0:
        return None
    total_kbps = target_mb * 8 * 1024 / dur
    return max(300, int(total_kbps - audio_kbps))

def convert(path, mode, out_path, target_mb=None, fixed_vbr=None):
    """mode: 'remux' | 'resize' | 'somebody'"""
    args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', path]
    if mode == 'remux':
        args += ['-map', '0', '-c', 'copy']
    elif mode == 'somebody':
        args += ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'faster',
                 '-b:v', SOMEBODY_VIDEO_BR, '-maxrate', '1200k', '-bufsize', '2000k', '-c:a', 'copy']
    elif mode == 'resize':
        br = fixed_vbr or bitrate_for_target(path, target_mb or UPA_TARGET_MB)
        if br is None:
            return False
        args += ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'faster',
                 '-b:v', f'{br}k', '-maxrate', f'{int(br*1.5)}k', '-bufsize', f'{int(br*2)}k',
                 '-c:a', 'copy']
    args += ['-f', 'matroska', '-y', out_path]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=5400)
        return p.returncode == 0
    except Exception as e:
        log(f'  ffmpeg error: {e}')
        return False

def valid_mkv(path):
    if not os.path.exists(path) or os.path.getsize(path) < 1024:
        return False
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, timeout=60)
        return 'Video:' in (p.stderr or '')
    except Exception:
        return False

def process_file(path, mode, target_mb=None, fixed_vbr=None):
    base, ext = os.path.splitext(path)
    tmp = base + '.mkv.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    log(f'  -> {os.path.basename(path)} [{mode}]')
    ok = convert(path, mode, tmp, target_mb=target_mb, fixed_vbr=fixed_vbr)
    if not ok or not valid_mkv(tmp):
        log(f'  !! fallo conversión {os.path.basename(path)}')
        if os.path.exists(tmp):
            os.remove(tmp)
        return False
    sz_tmp = os.path.getsize(tmp)
    sz_orig = os.path.getsize(path)
    if mode == 'remux':
        os.replace(tmp, base + '.mkv')
        log(f'  OK remux {os.path.basename(path)} -> mkv ({sz_tmp//1024//1024}MB)')
    else:
        # solo reemplazar si el mkv es mas pequeño
        if sz_tmp < sz_orig:
            os.replace(tmp, base + '.mkv')
            log(f'  OK {sz_orig//1024//1024}MB -> {sz_tmp//1024//1024}MB')
        else:
            log(f'  !! no mas pequeño ({sz_orig//1024//1024} vs {sz_tmp//1024//1024}), no se sustituye')
            if os.path.exists(tmp):
                os.remove(tmp)
    # si el archivo era .avi y el destino .mkv, borrar el avi
    if ext.lower() == '.avi' and os.path.exists(base + '.mkv') and os.path.exists(path):
        # solo borrar si la fuente avi y destino mkv son distintos archivos y el mkv es válido
        if valid_mkv(base + '.mkv'):
            os.remove(path)
            log(f'  borrado avi original: {os.path.basename(path)}')
    return True

def main():
    series = sys.argv[1] if len(sys.argv) > 1 else 'all'
    only = sys.argv[2] if len(sys.argv) > 2 else None  # p.ej. "T1"
    try:
        workers = int(os.environ.get('W', '2'))
    except Exception:
        workers = 2

    tasks = []  # (path, mode, target_mb, fixed_vbr)

    # Reanudación: se saltan los ya convertidos (size threshold) para no repetir
    # los que quedaron hechos antes de un corte.
    if series in ('all', 'somebody'):
        d = os.path.join(BASE, 'Somebody Somewhere')
        for f in sorted(os.listdir(d)):
            fp = os.path.join(d, f)
            if f.lower().endswith('.mkv'):
                sz = os.path.getsize(fp)
                # rehacer los que quedaron a ~200MB (pixelados) y el 1x06 grande:
                # apuntar a ~600MB (rango aceptado: 500-700MB)
                if sz < 500 * 1024 * 1024 or sz > 700 * 1024 * 1024:
                    tasks.append((fp, 'resize', SOMEBODY_TARGET_MB, None))

    if series in ('all', 'upa'):
        d = os.path.join(BASE, 'UPA')
        for t in sorted(os.listdir(d)):
            td = os.path.join(d, t)
            if not os.path.isdir(td):
                continue
            if only and t != only:
                continue
            for f in sorted(os.listdir(td)):
                fp = os.path.join(td, f)
                low = f.lower()
                if low.endswith('.mkv'):
                    # T1-T3: rebajar a 600MB solo los que sigan grandes (>680MB)
                    if t in ('T1', 'T2', 'T3') and os.path.getsize(fp) > 680 * 1024 * 1024:
                        tasks.append((fp, 'resize', UPA_TARGET_MB, None))
                elif low.endswith('.avi'):
                    base_mkv = os.path.join(td, os.path.splitext(f)[0] + '.mkv')
                    if not os.path.exists(base_mkv):
                        tasks.append((fp, 'remux', None, None))

    if series in ('all', 'wilfred'):
        d = os.path.join(BASE, 'wilfred')
        for t in sorted(os.listdir(d)):
            td = os.path.join(d, t)
            if not os.path.isdir(td):
                continue
            for f in sorted(os.listdir(td)):
                fp = os.path.join(td, f)
                if f.lower().endswith('.avi'):
                    base_mkv = os.path.join(td, os.path.splitext(f)[0] + '.mkv')
                    if not os.path.exists(base_mkv):
                        tasks.append((fp, 'remux', None, None))

    log(f'=== Seriespinda: {len(tasks)} tareas ({series}) con {workers} workers ===')
    from concurrent.futures import ThreadPoolExecutor, as_completed
    ok = 0
    if workers > 1 and len(tasks) > 1:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(process_file, path, mode, tm, fv): (path, mode, tm, fv)
                    for (path, mode, tm, fv) in tasks}
            for fut in as_completed(futs):
                try:
                    if fut.result():
                        ok += 1
                except Exception as e:
                    log(f'  !! worker error: {e}')
    else:
        for (path, mode, tm, fv) in tasks:
            try:
                if process_file(path, mode, target_mb=tm, fixed_vbr=fv):
                    ok += 1
            except Exception as e:
                log(f'  !! error procesando {os.path.basename(path)}: {e}')
    log(f'=== Fin: {ok}/{len(tasks)} OK ===')

if __name__ == '__main__':
    main()
