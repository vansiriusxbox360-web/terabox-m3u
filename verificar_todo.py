import json, os, sys, io, time, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ndus = open("token.txt").read().strip()
cookie = "lang=en; ndus=" + ndus

def listdir(path):
    body = urllib.parse.urlencode({"dir": path, "num": 1000, "page": 1})
    req = urllib.request.Request("https://www.terabox.com/api/list", data=body.encode(),
        headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
        if r.get("errno") != 0:
            return None
        return [(it["server_filename"], it.get("isdir", 0)) for it in r.get("list", [])]
    except Exception:
        return None

dec = json.load(open("avi_decision.json", encoding="utf-8"))
u = json.load(open("avi_uploaded.json", encoding="utf-8"))
avi_por_base = {}
for p in dec:
    avi_por_base.setdefault(os.path.splitext(os.path.basename(p))[0], p)

por_carpeta = {}
for mkv_name in u:
    base = os.path.splitext(mkv_name)[0]
    p = avi_por_base.get(base)
    if p:
        folder = os.path.dirname(p)
        por_carpeta.setdefault(folder, []).append(os.path.basename(p))

print("carpetas distintas:", len(por_carpeta))
total_ok_mkv = 0
total_ok_avi = 0
total_fallo = []
fail_folders = 0
for folder, bases in por_carpeta.items():
    items = listdir(folder)
    if items is None:
        fail_folders += 1
        continue
    names = [f for f, isdir in items]
    for avi_name in bases:
        base = os.path.splitext(avi_name)[0]
        mkv = base + ".mkv"
        mkv2 = base + "(1).mkv"
        mkv_present = mkv in names or mkv2 in names
        avi_present = avi_name in names
        if mkv_present:
            total_ok_mkv += 1
        else:
            total_fallo.append(("MKV AUSENTE", base))
        if not avi_present:
            total_ok_avi += 1
        else:
            total_fallo.append(("AVI SIGUE", base))
    time.sleep(0.5)

print("MKVs presentes en nube:", total_ok_mkv, "/", len(u))
print("AVIs borrados de nube:", total_ok_avi, "/", len(u))
print("carpetas que fallaron:", fail_folders)
for t, b in total_fallo[:40]:
    print("  ", t, ":", b[:80])
