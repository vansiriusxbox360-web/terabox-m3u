import json, os, sys, io, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ndus = open("token.txt").read().strip()
cookie = "lang=en; ndus=" + ndus

def listdir(path):
    body = urllib.parse.urlencode({"dir": path, "num": 1000, "page": 1})
    req = urllib.request.Request("https://www.terabox.com/api/list", data=body.encode(),
        headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    if r.get("errno") != 0:
        return None
    return [(it["server_filename"], it.get("isdir", 0)) for it in r.get("list", [])]

dec = json.load(open("avi_decision.json", encoding="utf-8"))
# coger el path completo de "Tintin 1x18" y listar su carpeta
for p in dec:
    if "Tintin 1x18" in os.path.basename(p):
        folder = os.path.dirname(p)
        print("carpeta:", folder)
        items = listdir(folder)
        if items:
            coinciden = [f for f, isdir in items if "Tintin 1x18" in f]
            print("archivos en carpeta con 'Tintin 1x18':", coinciden)
        else:
            print("list fallo/None")
        break
