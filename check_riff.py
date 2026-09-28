import json, sys, io, urllib.request, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

d = json.load(open('avi_analysis.json', encoding='utf-8'))
dl = json.load(open('avi_dlinks.json', encoding='utf-8'))

interr = [r for r in d if 'err' not in r and r['vcodec'] == '?']
print('Clasificando', len(interr), 'AVIs con codec ? (RIFF o no)...')

results = {}
if os.path.exists('avi_riff_check.json'):
    try:
        results = json.load(open('avi_riff_check.json', encoding='utf-8'))
    except Exception:
        results = {}
todo = [r for r in interr if r['path'] not in results]
print('Pendientes:', len(todo))

for i, r in enumerate(todo):
    try:
        req = urllib.request.Request(dl[r['path']], headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1023'})
        data = urllib.request.urlopen(req, timeout=20).read()
        is_riff = data[:4] == b'RIFF'
        # si es RIFF, probar con mas bytes para codec
        codec = None
        if is_riff:
            try:
                req2 = urllib.request.Request(dl[r['path']], headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-6291455'})
                data6 = urllib.request.urlopen(req2, timeout=30).read()
                # ffmpeg
                import subprocess
                headp = os.path.join(r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp', 'riff.avi')
                open(headp, 'wb').write(data6)
                p = subprocess.run([r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe', '-hide_banner', '-i', headp], capture_output=True, text=True)
                info = (p.stderr or '')
                import re
                vm = re.search(r'Video:\s*([^,]+)', info)
                if vm:
                    codec = vm.group(1).strip()
            except Exception:
                pass
        results[r['path']] = {'is_riff': is_riff, 'codec': codec, 'size': r['size']}
    except Exception as e:
        results[r['path']] = {'is_riff': False, 'codec': None, 'err': str(e)[:40], 'size': r['size']}
    if len(results) % 25 == 0:
        json.dump(results, open('avi_riff_check.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    time.sleep(0.1)

json.dump(results, open('avi_riff_check.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
riff = sum(1 for v in results.values() if v.get('is_riff'))
no_riff = sum(1 for v in results.values() if not v.get('is_riff'))
print('=== RESUMEN ===')
print('RIFF (AVI real):', riff)
print('NO RIFF (falso/basura):', no_riff)
print('Guardado en avi_riff_check.json')
