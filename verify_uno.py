import json, sys, io, urllib.request, urllib.parse, subprocess, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ndus = open('token.txt').read().strip()
cookie = 'lang=en; ndus=' + ndus

def post(url, data):
    body = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=body.encode(), headers={'User-Agent': 'Mozilla/5.0', 'Cookie': cookie, 'Content-Type': 'application/x-www-form-urlencoded'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())

# coger uno de los "rotos" - Campeones_096
riff = json.load(open('avi_riff_check.json', encoding='utf-8'))
target = None
for p, v in riff.items():
    if not v.get('is_riff') and 'Campeones_096' in p:
        target = p
        break
if not target:
    for p, v in riff.items():
        if not v.get('is_riff') and 'Campeones' in p:
            target = p
            break
print('Probando:', target.split('/')[-1])

# METODO 1: filemetas con origin=dlna (como el addon)
res = post('https://www.terabox.com/api/filemetas', {'dlink': 1, 'origin': 'dlna', 'target': json.dumps([target])})
dlink = None
if res.get('errno') == 0:
    for it in res.get('info', []):
        if isinstance(it, dict) and it.get('dlink'):
            dlink = it['dlink']
            break
print('dlink filemetas:', 'OK' if dlink else 'NO (' + str(res.get('errno')) + ')')

if dlink:
    req = urllib.request.Request(dlink, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-1048575'})
    data = urllib.request.urlopen(req, timeout=30).read()
    print('Primeros 16 bytes:', data[:16])
    print('Es RIFF:', data[:4] == b'RIFF')
    print('Es JSON error:', data[:1] in (b'{', b'['))
    head = r'C:\Users\VanSirius\AppData\Local\Temp\opencode\head_tmp\verify.avi'
    open(head, 'wb').write(data)
    p = subprocess.run([r'C:\Users\VanSirius\Downloads\ffmpeg-win32-x64.exe', '-hide_banner', '-i', head], capture_output=True, text=True)
    info = (p.stderr or '')
    vm = re.search(r'Video:\s*([^,]+)', info)
    am = re.search(r'Audio:\s*([^,]+),', info)
    print('Video:', vm.group(1).strip() if vm else '?')
    print('Audio:', am.group(1).strip() if am else '?')
