import json, sys, io, urllib.request, subprocess, re, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
riff = json.load(open('avi_riff_check.json', encoding='utf-8'))
dl = json.load(open('avi_dlinks.json', encoding='utf-8'))

# los que marcamos como no-riff
no_riff = [p for p, v in riff.items() if not v.get('is_riff')]
print('Re-verificando', len(no_riff), 'con head de 8MB y 2 reintentos...')

results = {}
if os.path.exists('avi_rerecheck.json'):
    try:
        results = json.load(open('avi_rerecheck.json', encoding='utf-8'))
    except Exception:
        results = {}
todo = [p for p in no_riff if p not in results]
print('Pendientes:', len(todo))

for i, p in enumerate(todo):
    real = False
    detail = None
    for attempt in range(2):
        try:
            dlink = dl.get(p)
            if not dlink:
                detail = 'no dlink'
                break
            req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-8388607'})
            data = urllib.request.urlopen(req, timeout=30).read()
            if data[:4] == b'RIFF':
                # es un AVI real con firma retrasada? probar codec con ffmpeg
                headp = os.path.join(r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp', 're.avi')
                open(headp, 'wb').write(data)
                pr = subprocess.run([r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe', '-hide_banner', '-i', headp], capture_output=True, text=True)
                info = (pr.stderr or '') + (pr.stdout or '')
                vm = re.search(r'Video:\s*([^,]+)', info)
                real = True
                detail = vm.group(1).strip() if vm else 'riff-sin-video'
            else:
                # JSON de error?
                try:
                    j = json.loads(data[:200])
                    detail = 'error:' + str(j.get('errno', '?'))
                except Exception:
                    detail = 'no-riff:' + str(data[:16])
            break
        except Exception as e:
            detail = 'ex:' + str(e)[:40]
            time.sleep(2)
    results[p] = {'real': real, 'detail': detail}
    if len(results) % 25 == 0:
        json.dump(results, open('avi_rerecheck.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    time.sleep(0.1)

json.dump(results, open('avi_rerecheck.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
reales = sum(1 for v in results.values() if v.get('real'))
rotos = sum(1 for v in results.values() if not v.get('real'))
print('=== RESUMEN ===')
print('AVIs reales (se salvan):', reales)
print('Rotos/errores:', rotos)
print('Guardado en avi_rerecheck.json')
