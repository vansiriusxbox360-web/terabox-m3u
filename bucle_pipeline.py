# bucle_pipeline.py - flujo completo: convierte AVIs locales + sube MKVs + borra AVIs de Terabox
import subprocess, json, os, sys, io, time, glob, shutil
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
os.chdir(r'C:\Users\VanSirius\terabox-m3u')

while True:
    # cuantos AVIs hay en descarga (lo que baja la app)
    desc = [f for f in os.listdir(r'J:\trabajo\descarga') if f.lower().endswith('.avi')] if os.path.isdir(r'J:\trabajo\descarga') else []
    mkvs = glob.glob(r'J:\trabajo\salida\*.mkv')
    libre = shutil.disk_usage('J:/').free / 1024 / 1024 / 1024
    print(f'[pipeline] AVIs en descarga: {len(desc)} | MKVs en salida: {len(mkvs)} | espacio J: {round(libre,1)}GB')

    # 1. SUBIR los MKVs ya listos (aunque sigan llegando AVIs) - libera espacio
    if len(mkvs) > 0:
        print('[pipeline] subiendo MKVs a Terabox (y borrando AVI de la nube tras verificar)...')
        subprocess.run(['node', 'subir_mkvs.js'], cwd=r'C:\Users\VanSirius\terabox-m3u')
        continue

    # 2. si hay AVIs locales (de la app), convertirlos
    if len(desc) > 0:
        # limpiar los AVIs locales cuyo MKV YA se subio (evitar reconvertir en bucle)
        up = {}
        if os.path.exists('avi_uploaded.json'):
            try: up = json.load(open('avi_uploaded.json', encoding='utf-8'))
            except Exception: up = {}
        subidos_bases = set(os.path.splitext(k)[0] for k in up.keys())
        for f in list(desc):
            base = os.path.splitext(f)[0]
            if base in subidos_bases:
                try:
                    os.remove(os.path.join(r'J:\trabajo\descarga', f))
                    print(f'[pipeline] AVI ya subido como MKV, borrado local: {f[:50]}')
                except Exception:
                    pass
        print('[pipeline] convirtiendo AVIs locales...')
        subprocess.run(['python', 'convert_avis.py'], cwd=r'C:\Users\VanSirius\terabox-m3u')
        continue

    # 2. nada pendiente: comprobar si quedan pequenos por script
    decision = json.load(open('avi_decision.json', encoding='utf-8'))
    done = {}
    if os.path.exists('avi_convert_done.json'):
        try: done = json.load(open('avi_convert_done.json', encoding='utf-8'))
        except Exception: done = {}
    total_peq = sum(1 for p, v in decision.items() if v['size'] <= 200 * 1024 * 1024)
    n_done = len(done)
    if n_done < total_peq:
        print('[pipeline] convirtiendo pequenos por script...')
        subprocess.run(['python', 'convert_avis.py'], cwd=r'C:\Users\VanSirius\terabox-m3u',
                       env={**os.environ, 'CONV_LIMIT': '3'})
        continue

    # 3. todo convertido y subido
    print('=== PIPELINE COMPLETO ===')
    break
