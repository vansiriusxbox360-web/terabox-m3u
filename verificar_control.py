import json, os, sys, io, time, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ndus = open("token.txt").read().strip()
cookie = "lang=en; ndus=" + ndus

def exists(path):
    body = urllib.parse.urlencode({"dlink": 1, "origin": "dlna", "target": json.dumps([path])})
    req = urllib.request.Request("https://www.terabox.com/api/filemetas", data=body.encode(),
        headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
        if r.get("errno") == 0 and r.get("info"):
            return "EXISTE", r["info"][0].get("size", 0)
        if r.get("errno") == -7:
            return "NO_EXISTE", None
        return "errno=%s" % r.get("errno"), None
    except Exception as e:
        return "ERROR %s" % e, None

# comprobacion control: rutas falsas
for fake in ["/mi_carpeta_no_existe_xyz/fake1.avi", "/fake_dir/otra_fake.mkv"]:
    print("control:", fake, "->", exists(fake))
time.sleep(2)
print("---")
# comprobacion control 2: una ruta real de la decision que NO se ha subido (los primeros AVIs no convertidos)
dec = json.load(open("avi_decision.json", encoding="utf-8"))
u = json.load(open("avi_uploaded.json", encoding="utf-8"))
u_bases = set(os.path.splitext(k)[0] for k in u)
control = None
for p in dec:
    if os.path.splitext(os.path.basename(p))[0] not in u_bases:
        control = p
        break
print("control(no subido):", control[:60])
print("  AVI:", exists(control))
