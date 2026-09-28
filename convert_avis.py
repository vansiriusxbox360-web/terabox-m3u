import json, os, sys, io, subprocess, urllib.request, urllib.parse, time, hashlib, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
DIR_DESC = r'J:\trabajo\descarga'
DIR_SALIDA = r'J:\trabajo\salida'
os.makedirs(DIR_DESC, exist_ok=True)
os.makedirs(DIR_SALIDA, exist_ok=True)

ndus = open('token.txt').read().strip()
cookie = 'lang=en; ndus=' + ndus

def post(url, data):
    body = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=body.encode(), headers={'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

decision = json.load(open('avi_decision.json', encoding='utf-8'))

def descargar(path, destino, tamano_esperado=None):
    """Descarga un archivo completo de Terabox a destino.

    SIN resume/append: siempre a archivo temporal nuevo para evitar corrupcion.
    Terabox puede ignorar la cabecera Range y devolver desde el inicio, lo que
    con 'ab' duplicaba contenido y corrompia el archivo a mitad. Ahora se descarga
    limpio, se verifica el tamano y si no coincide se borra y reintenta.
    """
    tmp = destino + '.tmp'
    for intento in range(12):
        if os.path.exists(tmp):
            os.remove(tmp)
        res = post('https://www.terabox.com/api/filemetas', {'dlink': 1, 'origin': 'dlna', 'target': json.dumps([path])})
        dlink = None
        if res.get('errno') == 0:
            for it in res.get('info', []):
                if isinstance(it, dict) and it.get('dlink'):
                    dlink = it['dlink']
                    break
        if not dlink:
            time.sleep(5)
            continue
        try:
            req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0'})
            resp = urllib.request.urlopen(req, timeout=300)
            with open(tmp, 'wb') as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
            sz = os.path.getsize(tmp)
            # si devolvio JSON de error (need verify 400141), reintentar con espera
            with open(tmp, 'rb') as f:
                cab = f.read(8)
            if cab[:1] in (b'{', b'['):
                log_local(f'Respuesta no-valida ({cab[:8]}), esperando 30s antes de reintentar')
                if os.path.exists(tmp):
                    os.remove(tmp)
                time.sleep(30)
                continue
            # verificar tamano
            if tamano_esperado and abs(sz - tamano_esperado) > 100000:
                log_local(f'Descarga tamano incorrecto {sz}/{tamano_esperado}, reintento')
                if os.path.exists(tmp):
                    os.remove(tmp)
                time.sleep(10)
                continue
            os.replace(tmp, destino)
            return sz
        except Exception as e:
            log_local(f'Descarga error intento {intento}: {e}')
            if os.path.exists(tmp):
                os.remove(tmp)
            time.sleep(5)
    if os.path.exists(tmp):
        os.remove(tmp)
    return os.path.getsize(destino) if os.path.exists(destino) else 0

def log_local(msg):
    try:
        with open(r'C:\Users\VanSirius\AppData\Local\Temp\opencode\convert_log.txt', 'a', encoding='utf-8') as f:
            f.write(msg + '\n')
    except Exception:
        pass

def convertir(origen, destino, action):
    """Convierte/remux el AVI a MKV en destino. Devuelve True si el MKV esta bien."""
    args = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', origen]
    if action == 'remux':
        args += ['-map', '0', '-c', 'copy']
    else:
        # recodificar a H.264 con BITRATE OBJETIVO para garantizar que baje de peso
        # (CRF 19 salia igual o mas pesado que el Xvid original). 800k es bueno
        # para 640x480/720x404; audio copia (sin perdida).
        args += ['-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'medium', '-b:v', '800k', '-maxrate', '1200k', '-bufsize', '2000k', '-c:a', 'copy']
    args += ['-y', destino]
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=3600)
    except subprocess.TimeoutExpired:
        return False
    # verificar: existe y ffmpeg lo lee
    if not os.path.exists(destino) or os.path.getsize(destino) < 1024:
        return False
    check = subprocess.run([FFMPEG, '-hide_banner', '-i', destino], capture_output=True, text=True)
    info = (check.stderr or '')
    if 'Video:' not in info:
        return False
    return True

def procesar(path, info):
    """Procesa un AVI: descarga, convierte, verifica. Devuelve (True, mkv_abs) o (False, error)."""
    # Archivos >200MB: Terabox los bloquea para descarga por script (errno -9).
    # Van por la app de Windows de Terabox a J:/trabajo/descarga manualmente.
    if info.get('size', 0) > 200 * 1024 * 1024:
        return False, 'grande-manual'
    name = path.split('/')[-1]
    base = os.path.splitext(name)[0]
    avi_local = os.path.join(DIR_DESC, base + '.avi')
    mkv_local = os.path.join(DIR_SALIDA, base + '.mkv')
    # si ya hay MKV verificado de antes, lo omitimos (se sube aparte)
    if os.path.exists(mkv_local) and os.path.getsize(mkv_local) > 1024:
        return True, mkv_local
    # 1. descargar AVI (con tamaño esperado para reintentos)
    expected = info.get('size', 0)
    sz = descargar(path, avi_local, expected)
    if not sz or sz < 1024:
        return False, 'descarga fallo'
    # 2. convertir (remux o recodificar)
    ok = convertir(avi_local, mkv_local, info['action'])
    if not ok:
        return False, 'conversion fallo'
    # el AVI descargado por script ya no hace falta en disco (el MKV esta en salida)
    try:
        os.remove(avi_local)
        log_local('AVI remoto convertido, liberado del disco: ' + base)
    except Exception as e:
        log_local('no se pudo borrar AVI remoto local: ' + base + ' ' + str(e))
    return True, mkv_local

def procesar_local(path, info, avi_local):
    """Convierte un AVI que YA esta en J:/trabajo/descarga (lo bajo la app de Terabox).
    Devuelve (True, mkv_abs) o (False, error). El AVI local se borra tras convertir."""
    name = path.split('/')[-1]
    base = os.path.splitext(name)[0]
    mkv_local = os.path.join(DIR_SALIDA, base + '.mkv')
    if not os.path.exists(avi_local) or os.path.getsize(avi_local) < 1024:
        return False, 'avi-local no existe'
    ok = convertir(avi_local, mkv_local, info['action'])
    if not ok:
        return False, 'conversion fallo'
    # AVI convertido: borrarlo del disco para liberar espacio
    try:
        os.remove(avi_local)
        log_local(f'AVI local eliminado tras convertir: {base}.avi')
    except Exception as e:
        log_local(f'no se pudo borrar AVI local: {e}')
    return True, mkv_local

if __name__ == '__main__':

    # MODO LOCAL: procesar los AVIs que la app de Terabox ha descargado a J:/trabajo/descarga
    if os.path.isdir(DIR_DESC) and os.listdir(DIR_DESC):
        decision = json.load(open('avi_decision.json', encoding='utf-8'))
        por_base = {os.path.splitext(os.path.basename(p))[0]: (p, v) for p, v in decision.items()}
        done_file = 'avi_convert_done.json'
        done = {}
        if os.path.exists(done_file):
            try:
                done = json.load(open(done_file, encoding='utf-8'))
            except Exception:
                done = {}
        # procesar los AVIs locales (los de la app, incluyendo grandes)
        locales = [f for f in os.listdir(DIR_DESC) if f.lower().endswith('.avi')]
        # limitar a 3 por tanda para que el bucle alterne conversion/subida seguido
        locales = locales[:3]
        print('AVIs locales a convertir (max 3):', len(locales))
        for f in locales:
            base = os.path.splitext(f)[0]
            mkv_local = os.path.join(DIR_SALIDA, base + '.mkv')
            if os.path.exists(mkv_local) and os.path.getsize(mkv_local) > 1024:
                continue  # ya convertido
            entry = por_base.get(base)
            if not entry:
                log_local(f'AVI local sin path remoto (no esta en decision): {f}')
                continue
            p, info = entry
            avi_local = os.path.join(DIR_DESC, f)
            ok, res = procesar_local(p, info, avi_local)
            done[p] = {'ok': ok, 'res': res, 'action': info['action']}
            json.dump(done, open(done_file, 'w', encoding='utf-8'), ensure_ascii=False)
            if ok:
                print('  OK:', f[:50])
            else:
                print('  FALLO:', f[:50], res)
        print('=== FIN modo local ===')
        import sys as _s
        _s.exit(0)

    # MODO REMOTO: descargar pequenos (<=200MB) por script
    limit = int(os.environ.get('CONV_LIMIT', '0'))
    # excluir los >200MB (van por la app de Terabox manualmente)
    paths = [p for p, v in decision.items() if v.get('size', 0) <= 200 * 1024 * 1024]
    # procesar en orden
    done_file = 'avi_convert_done.json'
    done = {}
    if os.path.exists(done_file):
        try:
            done = json.load(open(done_file, encoding='utf-8'))
        except Exception:
            done = {}
    todo = [p for p in paths if p not in done]
    # AVIs que ya estan en J:/trabajo/descarga (los bajo la app) -> procesar primero
    locales = set()
    if os.path.isdir(DIR_DESC):
        for f in os.listdir(DIR_DESC):
            if f.lower().endswith('.avi'):
                locales.add(f[:-4])
    todo.sort(key=lambda p: (0 if os.path.splitext(os.path.basename(p))[0] in locales else 1,
                             0 if decision[p]['action'] == 'remux' else 1))
    if limit > 0:
        todo = todo[:limit]
    print('Pendientes:', len(todo))
    for i, p in enumerate(todo):
        info = decision[p]
        ok, res = procesar(p, info)
        done[p] = {'ok': ok, 'res': res, 'action': info['action']}
        if (i + 1) % 5 == 0:
            json.dump(done, open(done_file, 'w', encoding='utf-8'), ensure_ascii=False)
            okn = sum(1 for v in done.values() if v['ok'])
            print(f'  {i+1}/{len(todo)} ok={okn}')
    json.dump(done, open(done_file, 'w', encoding='utf-8'), ensure_ascii=False)
    okn = sum(1 for v in done.values() if v['ok'])
    print('=== FIN === ok:', okn, 'de', len(done))
