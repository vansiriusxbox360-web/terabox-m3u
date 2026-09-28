import json, os, sys, io, urllib.request, urllib.parse, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ndus = open("token.txt").read().strip()
cookie = "lang=en; ndus=" + ndus

def filemetas(path):
    body = urllib.parse.urlencode({"dlink": 1, "origin": "x", "target": json.dumps([path])})
    req = urllib.request.Request("https://www.terabox.com/api/filemetas", data=body.encode(),
        headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
    r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    if r.get("errno") == 0 and r.get("info"):
        return r["info"][0]
    return None

folder = "/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Dibus que no son ªnime/las que te ponian comiendo/merendando o desayunando si tenías cerca el cole/Y que no haya dibus puede/o algo de ªnime puedes hallar/hoven padawan/las que te ponías en VHS o tu madre te decía en mis tiempos habia cosas muy bonitas/no como los Pokémon esos que el muñeco solo mueve la boca/Las Aventuras de Tintin"

for name in ["Tintin 1x18 Tintin en el Tibet.mkv", "Tintin 1x18 Tintin en el Tibet(1).mkv"]:
    p = folder + "/" + name
    it = filemetas(p)
    if it:
        print(name)
        print("   size:", it.get("size"), "| md5:", it.get("md5", "?"), "| fs_id:", it.get("fs_id"))
    else:
        print(name, "-> no encontrado")
