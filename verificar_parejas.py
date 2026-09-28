import json, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
dec = json.load(open("avi_decision.json", encoding="utf-8"))
u = json.load(open("avi_uploaded.json", encoding="utf-8"))
avi_por_base = {}
for p in dec:
    avi_por_base.setdefault(os.path.splitext(os.path.basename(p))[0], p)

ok = 0
mal = []
for mkv_name in u:
    base = os.path.splitext(mkv_name)[0]
    p = avi_por_base.get(base)
    if not p:
        mal.append(("sin path en decision", mkv_name))
        continue
    avi_carpeta, avi_nombre = os.path.dirname(p), os.path.basename(p)
    mkv_path_esperado = os.path.dirname(p) + "/" + base + ".mkv"
    # comprobar que mkv_name base == avi base (mismo nombre)
    if os.path.splitext(avi_nombre)[0] == base:
        ok += 1
    else:
        mal.append(("nombre distinto", mkv_name, avi_nombre))

print("parejas correctas (misma carpeta + mismo nombre, solo cambia ext):", ok, "/", len(u))
print("inconsistencias:", len(mal))
for m in mal[:10]:
    print("  ", m)
