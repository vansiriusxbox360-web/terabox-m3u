import json, os, subprocess, urllib.request, urllib.parse, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FFMPEG = r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe'
TMP = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp'
os.makedirs(TMP, exist_ok=True)

ndus = open('token.txt').read().strip()
cookie = 'lang=en; ndus=' + ndus

def post(url, data):
    body = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=body.encode(), headers={'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

avi = json.load(open('avi_scan.json', encoding='utf-8'))
dlinks = json.load(open('avi_dlinks.json', encoding='utf-8'))
limit = int(os.environ.get('AVI_LIMIT', '0'))
subset = avi[:limit] if limit > 0 else avi

# reanudar: cargar resultados previos y saltar los ya analizados
results = []
if os.path.exists('avi_analysis.json'):
    try:
        results = json.load(open('avi_analysis.json', encoding='utf-8'))
    except Exception:
        results = []
done_paths = set()
for r in results:
    if 'path' in r:
        done_paths.add(r['path'])
print('Resumen previo:', len(results), '- saltando', len(done_paths))
to_do = [a for a in subset if a['path'] not in done_paths]
print('Analizando', len(to_do), 'AVIs nuevos...')

err = 0
for i, a in enumerate(to_do):
    if i % 50 == 0:
        print(f'  {i}/{len(to_do)} (err:{err})')
    try:
        dlink = dlinks.get(a['path'])
        if not dlink:
            results.append({'path': a['path'], 'err': 'no dlink'})
            err += 1
            continue
        # descargar primeros 1MB con Range (timeout corto)
        req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1048575'})
        try:
            data = urllib.request.urlopen(req, timeout=25).read()
        except Exception:
            # reintentar una vez
            time.sleep(1)
            req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1048575'})
            data = urllib.request.urlopen(req, timeout=25).read()
        head_path = os.path.join(TMP, 'head.avi')
        with open(head_path, 'wb') as f:
            f.write(data)
        # analizar
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', head_path], capture_output=True, text=True, creationflags=0x08000000)
        info = (p.stderr or '') + (p.stdout or '')
        vmatch = __import__('re').search(r'Video:\s*([^,]+).*?(\d{2,4})x(\d{2,4})', info)
        amatch = __import__('re').search(r'Audio:\s*([^,]+),', info)
        bmatch = __import__('re').search(r'bitrate:\s*(\d+)\s*kb/s', info)
        vcodec = vmatch.group(1).strip() if vmatch else '?'
        w = vmatch.group(2) if vmatch else '?'
        h = vmatch.group(3) if vmatch else '?'
        vbit = int(bmatch.group(1)) if bmatch else 0
        acodec = amatch.group(1).strip() if amatch else '?'
        vc = vcodec.lower()
        if 'mpeg2' in vc:
            action = 'recodificar'
        elif 'mpeg4' in vc and (vbit > 1500 or (w != '?' and h != '?' and int(w) >= 1280 and vbit > 1200)):
            action = 'recodificar'
        elif 'h264' in vc and vbit > 2500:
            action = 'recodificar'
        else:
            action = 'remux'
        results.append({'path': a['path'], 'vcodec': vcodec, 'res': f'{w}x{h}', 'vbit': vbit, 'acodec': acodec, 'action': action, 'size': a['size']})
        if len(results) % 25 == 0:
            json.dump(results, open('avi_analysis.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    except Exception as e:
        results.append({'path': a['path'], 'err': str(e)[:60]})
        err += 1
    time.sleep(0.15)

json.dump(results, open('avi_analysis.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('=== RESUMEN ===')
byAction = {}
byCodec = {}
for r in results:
    if 'err' in r:
        byAction['error'] = byAction.get('error', 0) + 1
        continue
    byAction[r['action']] = byAction.get(r['action'], 0) + 1
    byCodec[r['vcodec']] = byCodec.get(r['vcodec'], 0) + 1
print('Por accion:', byAction)
print('Por codec:', byCodec)
print('Guardado en avi_analysis.json')
