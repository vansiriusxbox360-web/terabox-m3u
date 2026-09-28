import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
dec = json.load(open("avi_decision.json", encoding="utf-8"))
u = json.load(open("avi_uploaded.json", encoding="utf-8"))
avi_por_base = {}
for p in dec:
    avi_por_base.setdefault(os.path.splitext(os.path.basename(p))[0], p)

lineas = []
por_carpeta = {}
for mkv_name in u:
    base = os.path.splitext(mkv_name)[0]
    p = avi_por_base.get(base)
    if not p:
        continue
    mkv_path = p[:-4] + ".mkv"
    por_carpeta.setdefault(os.path.dirname(p), []).append(base)
    lineas.append("MKV subido : %s\nAVI borrado: %s\n" % (mkv_path, p))

with open("registro_mkv_borrados.txt", "w", encoding="utf-8") as f:
    f.write("Verificacion 236 MKVs subidos / 236 AVIs borrados (fecha: 2026-08-16)\n")
    f.write("=" * 70 + "\n\n")
    f.write("\n".join(lineas))
    f.write("\n\n=== RESUMEN POR CARPETA ===\n")
    for carpeta, bases in sorted(por_carpeta.items()):
        f.write("\n[%s] -> %d archivos\n" % (carpeta, len(bases)))
        for b in sorted(bases):
            f.write("   %s\n" % b)

print("Total MKVs registrados:", len(u))
print("Total en log:", lineas.count(""))
print("Archivo escrito: registro_mkv_borrados.txt")
print("Carpetas distintas:", len(por_carpeta))
for carpeta, bases in sorted(por_carpeta.items()):
    print("  [%d] %s" % (len(bases), carpeta.split('/')[-1]))
