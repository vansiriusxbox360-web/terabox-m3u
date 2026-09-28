import json, os, sys, io, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ndus = open("token.txt").read().strip()
cookie = "lang=en; ndus=" + ndus

folder = "/Ooooohh buenos días/Que bueno que vinihte/Pase, pase/Ah los zapatos en la puerta/La que esta cayendo por aqui/Te ofreceria un vasito de agua/Pero esta chungo/A ver donde puñetas la tengo/Pero si estaba aqui hace 25 años/Aaaaahhhquiestáaaa/Pera que lo limpie un poquito/Toma, echa un ojo/Menú del día dos puntos/El rinconcito dharmatico de Vishnu/Las cositas/Dibus que no son ªnime/las que te ponian comiendo/merendando o desayunando si tenías cerca el cole/Y que no haya dibus puede/o algo de ªnime puedes hallar/hoven padawan/las que te ponías en VHS o tu madre te decía en mis tiempos habia cosas muy bonitas/no como los Pokémon esos que el muñeco solo mueve la boca/Las Aventuras de Tintin"
target = folder + "/Tintin 1x18 Tintin en el Tibet(1).mkv"

# formato filemanager "op" de la API node (terabox-api) - delete con filelist + fast
body = urllib.parse.urlencode({"async": "1", "fast": "1", "filelist": json.dumps({"pathlist": [target]}, ensure_ascii=False)})
req = urllib.request.Request("https://www.terabox.com/api/filemanager", data=body.encode(),
    headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
r = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
print("delete v1:", json.dumps(r, ensure_ascii=False)[:250])

# variante 2: operacion delete con filelist plano
body2 = urllib.parse.urlencode({"async": 1, "filelist": json.dumps({"pathlist": [target]}, ensure_ascii=False), "opera": "delete"})
req2 = urllib.request.Request("https://www.terabox.com/api/filemanager", data=body2.encode(),
    headers={"User-Agent": "Mozilla/5.0", "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded"})
r2 = json.loads(urllib.request.urlopen(req2, timeout=30).read().decode())
print("delete v2:", json.dumps(r2, ensure_ascii=False)[:250])
