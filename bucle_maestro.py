# bucle_maestro.py - relanza conversion y subida hasta que todo este convertido
import subprocess, json, os, sys, io, time, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

os.chdir(r'C:\Users\VanSirius\terabox-m3u')
convs = set()
subs = set()
sin_fallo = 0

while True:
    # leer estado actual
    conv_done = set()
    if os.path.exists('avi_convert_done.json'):
        try:
            conv_done = set(json.load(open('avi_convert_done.json', encoding='utf-8')).keys())
        except Exception:
            conv_done = set()
    up_done = set()
    if os.path.exists('avi_uploaded.json'):
        try:
            up_done = set(json.load(open('avi_uploaded.json', encoding='utf-8')).keys())
        except Exception:
            up_done = set()

    decision = json.load(open('avi_decision.json', encoding='utf-8'))
    total = len(decision)
    n_conv = len(conv_done)
    n_up = len(up_done)
    pend_conv = total - n_conv
    print(f'[maestro] convertidos {n_conv}/{total} | subidos {n_up} | pend conv {pend_conv}')

    # actualizar conjuntos de procesos lanzados
    convs = convs | conv_done
    subs = subs | up_done

    if n_conv >= total:
        print('=== TODO CONVERTIDO ===')
        # ultima pasada de subida si quedan MKVs en salida
        if (len(glob.glob(r'J:\trabajo\salida\*.mkv')) > 0):
            print('[maestro] subiendo MKVs restantes...')
            subprocess.run(['node', 'subir_mkvs.js'], cwd=r'C:\Users\VanSirius\terabox-m3u')
        print('=== FIN ===')
        break

    # relanzar conversion si avanza y quedan pendientes
    if pend_conv > 0:
        r = subprocess.run(['python', 'convert_avis.py'], cwd=r'C:\Users\VanSirius\terabox-m3u',
                           env={**os.environ, 'CONV_LIMIT': '15'})
    # relanzar subida si hay MKVs en salida
    if len(glob.glob(r'J:\trabajo\salida\*.mkv')) > 0:
        subprocess.run(['node', 'subir_mkvs.js'], cwd=r'C:\Users\VanSirius\terabox-m3u')

    # comprobar espacio: si J: esta por debajo de 20GB, esperar a que suba libere
    import shutil
    libre = shutil.disk_usage('J:/').free / 1024 / 1024 / 1024
    if libre < 20:
        print('[maestro] poco espacio J: %.1fGB, esperando liberar...' % libre)
        time.sleep(600)
    else:
        time.sleep(5)
