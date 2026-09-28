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

dec = json.load(open("avi_decision.json", encoding="utf-8"))
u = json.load(open("avi_uploaded.json", encoding="utf-8"))
por_base = {os.path.splitext(k)[0]: k for k in u}
n = 0
for base in list(por_base)[:10]:
    avi_path = None
    for p in dec:
        if os.path.splitext(os.path.basename(p))[0] == base:
            avi_path = p
            break
    mkv_path = avi_path[:-4] + ".mkv"
    st_mkv, sz = exists(mkv_path)
    st_avi, _ = exists(avi_path)
    print(base[:40].ljust(42), "| MKV:", st_mkv, "| AVI:", st_avi)
    time.sleep(1)
    n += 1
