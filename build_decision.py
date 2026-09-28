import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# analisis original (los 2259 con codec de 1MB)
d = json.load(open('avi_analysis.json', encoding='utf-8'))
# analisis real de los que antes salieron "?"
real = json.load(open('avi_real_analysis.json', encoding='utf-8'))

def decide(vcodec, vbit, w, h):
    vc = (vcodec or '').lower()
    if not vc or vc == '?':
        return 'remux'  # no sabemos -> mejor remux (sin riesgo de subir peso)
    if 'mpeg2' in vc:
        return 'recodificar'
    # SOLO recodificar si el bitrate es alto (>2000k) y la resolucion no es 4k
    # (los Xvid a 900-1500k ya son eficientes; recodificarlos sale igual o mas)
    if vbit > 2000:
        return 'recodificar'
    return 'remux'

mapa = {}
for r in d:
    if 'err' in r:
        continue
    p = r['path']
    # usar el analisis real si existe (los 505 "?")
    if p in real and real[p].get('ok'):
        vc = real[p].get('vcodec', '?')
        vb = real[p].get('vbit', r.get('vbit', 0))
        ac = real[p].get('acodec', r.get('acodec', '?'))
    else:
        vc = r.get('vcodec', '?')
        vb = r.get('vbit', 0)
        ac = r.get('acodec', '?')
    # resolver resolucion desde r (w x h string)
    res = r.get('res', '?x?')
    parts = res.split('x')
    w = parts[0] if len(parts) == 2 else '?'
    h = parts[1] if len(parts) == 2 else '?'
    action = decide(vc, vb, w, h)
    mapa[p] = {'action': action, 'vcodec': vc, 'vbit': vb, 'acodec': ac, 'size': r.get('size', 0), 'res': res}

json.dump(mapa, open('avi_decision.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# resumen
from collections import Counter
acts = Counter(v['action'] for v in mapa.values())
print('Total archivos con decision:', len(mapa))
print('Por accion:', dict(acts))
remux_gb = sum(v['size'] for v in mapa.values() if v['action'] == 'remux') / 1024 / 1024 / 1024
rec_gb = sum(v['size'] for v in mapa.values() if v['action'] == 'recodificar') / 1024 / 1024 / 1024
print(f'Remux: {acts["remux"]} archivos ({round(remux_gb,1)} GB)')
print(f'Recodificar: {acts["recodificar"]} archivos ({round(rec_gb,1)} GB)')
print('Guardado en avi_decision.json')
