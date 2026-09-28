import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
riff = json.load(open('avi_riff_check.json', encoding='utf-8'))
d = json.load(open('avi_analysis.json', encoding='utf-8'))
no_riff = [{'path': r['path'], 'size': r['size']} for r in d if r['path'] in riff and not riff[r['path']].get('is_riff')]
json.dump(no_riff, open('avis_falsos.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('Guardados en avis_falsos.json:', len(no_riff))
gb = sum(x['size'] for x in no_riff) / 1024 / 1024 / 1024
print('Peso total:', round(gb, 2), 'GB')
print()
print('=== Rutas (primeras 15) ===')
for x in no_riff[:15]:
    short = x['path'].split('Las cositas/')[-1]
    mb = round(x['size'] / 1024 / 1024)
    print(' [' + str(mb) + 'MB] ' + short)
