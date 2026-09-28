import json, sys, io, urllib.request, urllib.parse, subprocess, re, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ndus = open('token.txt').read().strip()
cookie = 'lang=en; ndus=' + ndus

def post(url, data):
    body = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=body.encode(), headers={'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

# los 505 que marque como no-riff
riff = json.load(open('avi_riff_check.json', encoding='utf-8'))
no_riff = [p for p, v in riff.items() if not v.get('is_riff')]
print('Re-analizando', len(no_riff), 'con filemetas + head de 8MB...')

results = {}
if os.path.exists('avi_real_analysis.json'):
    try:
        results = json.load(open('avi_real_analysis.json', encoding='utf-8'))
    except Exception:
        results = {}
todo = [p for p in no_riff if p not in results]
limit = int(os.environ.get('REAL_LIMIT', '0'))
if limit > 0:
    todo = todo[:limit]
print('Pendientes:', len(todo))

for i, p in enumerate(todo):
    if i % 25 == 0:
        print(f'  {i}/{len(todo)}')
    try:
        res = post('https://www.terabox.com/api/filemetas', {'dlink': 1, 'origin': 'dlna', 'target': json.dumps([p])})
        dlink = None
        if res.get('errno') == 0:
            for it in res.get('info', []):
                if isinstance(it, dict) and it.get('dlink'):
                    dlink = it['dlink']
                    break
        if not dlink:
            results[p] = {'ok': False, 'detail': 'no dlink'}
        else:
            ok_final = False
            detail = None
            vcodec = acodec = None
            vbit = 0
            for attempt in range(3):
                try:
                    req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1048575'})
                    data = urllib.request.urlopen(req, timeout=30).read()
                    if data[:4] == b'RIFF':
                        ok_final = True
                        headp = os.path.join(r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp', 'verify.avi')
                        open(headp, 'wb').write(data)
                        pr = subprocess.run([r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe', '-hide_banner', '-i', headp], capture_output=True, text=True)
                        info = (pr.stderr or '')
                        vm = re.search(r'Video:\s*([^,]+)', info)
                        am = re.search(r'Audio:\s*([^,]+),', info)
                        bm = re.search(r'bitrate:\s*(\d+)\s*kb/s', info)
                        vcodec = vm.group(1).strip() if vm else '?'
                        acodec = am.group(1).strip() if am else '?'
                        vbit = int(bm.group(1)) if bm else 0
                        break
                    else:
                        detail = str(data[:40])
                except Exception as e:
                    detail = 'ex:' + str(e)[:40]
                time.sleep(1.5)
            if ok_final:
                results[p] = {'ok': True, 'vcodec': vcodec, 'acodec': acodec, 'vbit': vbit}
            else:
                results[p] = {'ok': False, 'detail': detail}
    except Exception as e:
        results[p] = {'ok': False, 'detail': 'ex:' + str(e)[:40]}
    if len(results) % 25 == 0:
        json.dump(results, open('avi_real_analysis.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    time.sleep(0.12)

json.dump(results, open('avi_real_analysis.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
ok = sum(1 for v in results.values() if v.get('ok'))
bad = sum(1 for v in results.values() if not v.get('ok'))
print('=== RESUMEN ===')
print('OK (AVI real):', ok)
print('Fallo (verdadero roto):', bad)
print('Guardado en avi_real_analysis.json')
