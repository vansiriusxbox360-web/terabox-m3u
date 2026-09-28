import json, sys, io, urllib.request, subprocess, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
riff = json.load(open('avi_riff_check.json', encoding='utf-8'))
dl = json.load(open('avi_dlinks.json', encoding='utf-8'))

# coger un no-riff de Campeones (329MB)
muestra = None
for path, v in riff.items():
    if not v.get('is_riff') and 'Campeones_096' in path:
        muestra = path
        break
print('Muestra:', muestra.split('/')[-1] if muestra else 'NO')
if not muestra:
    for path, v in riff.items():
        if not v.get('is_riff') and 'Campeones' in path:
            muestra = path
            break

dlink = dl[muestra]
req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-2097151'})
data = urllib.request.urlopen(req, timeout=30).read()
print('Primeros 16 bytes:', data[:16])
print('Es JSON:', data[:1] in (b'{', b'['))
head = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp\camp.avi'
open(head, 'wb').write(data)
p = subprocess.run([r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe', '-hide_banner', '-i', head], capture_output=True, text=True)
info = (p.stderr or '') + (p.stdout or '')
vm = re.search(r'Video:\s*([^,]+)', info)
am = re.search(r'Audio:\s*([^,]+),', info)
print('Video:', vm.group(1).strip() if vm else '?')
print('Audio:', am.group(1).strip() if am else '?')
