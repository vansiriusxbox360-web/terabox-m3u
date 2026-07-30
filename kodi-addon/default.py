import xbmcgui
import xbmcplugin
import xbmcaddon
import xbmc
import xbmcvfs
import json
import urllib.request
import urllib.parse
import sys
import traceback
import os
import re
import random
import time

ADDON = xbmcaddon.Addon()
HANDLE = int(sys.argv[1]) if len(sys.argv) > 1 else -1
BASE_URL = sys.argv[0] if sys.argv else ''
JSON_URL = ADDON.getSetting('json_url') or 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/lista.m3u'
CACHE_FILE = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'cache.json')


ADDON_PATH = xbmcvfs.translatePath(ADDON.getAddonInfo('path'))
ICON = os.path.join(ADDON_PATH, 'icon.png')
DETECTIVE = os.path.join(ADDON_PATH, 'detective_worried_street.png')
FANART = os.path.join(ADDON_PATH, 'vaporwave_fine_grid.png')

FOLDER_IMAGES = {
    '\u00aanime': os.path.join(ADDON_PATH, 'img-anime.png'),
    'Dibus que no son \u00aanime': os.path.join(ADDON_PATH, 'img-dibus.png'),
    'en la 2 con mucha marcha y \u1409TPH,  en la 3 Megatrix o el Club Disney en Tele5': os.path.join(ADDON_PATH, 'img-tele5.png'),
    'y si eras un ni\u00f1o afortunado y tus padres ten\u00edan Digital+': os.path.join(ADDON_PATH, 'img-digital.png'),
    '(la carpeta spin-off que no te pillaba jamando)': os.path.join(ADDON_PATH, 'img-spinoff.png'),
    'las que te pon\u00edas en VHS o tu madre te dec\u00eda en mis tiempos habia cosas muy bonitas': os.path.join(ADDON_PATH, 'img-vhs.png'),
    'Sine malo y sine g\u00fceno': os.path.join(ADDON_PATH, 'img-sine.png'),
}


def log(msg, level=xbmc.LOGDEBUG):
    xbmc.log(f'[VanSirius] {msg}', level)


def natural_sort_key(s):
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(s))]


def get_folder_image(name):
    if name in FOLDER_IMAGES:
        return FOLDER_IMAGES[name]
    return None


def get_json(force_download=False):
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

    ahora = time.time()
    cached = None
    usar_cache = False

    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cached = json.load(f)
            cached_at = cached.get('_cached_at', 0)
            edad = ahora - cached_at
            log(f'Cache encontrada, edad: {int(edad)}s')
            if not force_download and edad < 900:
                log('Cache reciente (<15 min), usando cache')
                return cached
        except Exception as e:
            log(f'Error leyendo cache: {e}', xbmc.LOGERROR)

    progress = xbmcgui.DialogProgress()
    progress.create('VanSirius', 'Refrescando enlaces...')

    try:
        req = urllib.request.Request(JSON_URL, headers={'User-Agent': 'Kodi-Addon/1.0'})
        resp = urllib.request.urlopen(req, timeout=120)
        total = int(resp.headers.get('Content-Length', 0))
        data = b''
        read = 0
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            data += chunk
            read += len(chunk)
            if total > 0:
                pct = int(read * 100 / total)
                progress.update(pct, f'Refrescando... {read // 1024}KB / {total // 1024}KB')
            else:
                progress.update(0, f'Refrescando... {read // 1024}KB')
            if progress.iscanceled():
                progress.close()
                return cached

        progress.update(100, 'Procesando...')
        result = json.loads(data.decode('utf-8'))
        result['_cached_at'] = ahora

        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        progress.close()
        log(f'JSON descargado: {len(result.get("groups", []))} grupos')
        return result
    except Exception as e:
        progress.close()
        log(f'Error descargando JSON: {e}', xbmc.LOGERROR)
        if cached:
            log('Usando cache local como fallback')
            return cached
        xbmcgui.Dialog().ok('Error', 'No se pudo cargar la lista.')
        return None


def build_url(action, path='', **extra):
    params = {'action': action, 'path': path}
    params.update(extra)
    return f'{BASE_URL}?{urllib.parse.urlencode(params)}'


def build_tree(data):
    tree = {}
    for group in data.get('groups', []):
        name = group.get('name', '')
        if not name:
            continue
        parts = name.split('/')
        node = tree
        for part in parts:
            part = part.strip()
            if not part:
                continue
            if part not in node:
                node[part] = {'_groups': [], '_icon': ICON}
            node = node[part]
        node['_groups'].append(group)
        if group.get('image'):
            node['_icon'] = group['image']
    return tree


def resolve_icon(node, current_path=''):
    folder_img = get_folder_image(current_path)
    if folder_img:
        return folder_img
    if node.get('_groups'):
        icon = node.get('_icon')
        if icon and icon != ICON:
            return icon
        return DETECTIVE
    child_keys = [k for k in node.keys() if not k.startswith('_')]
    if child_keys:
        all_alb = all(
            isinstance(node[k], dict) and node[k].get('_groups')
            for k in child_keys
        )
        if all_alb:
            posters = set()
            for k in child_keys:
                icon = node[k].get('_icon')
                if icon and icon not in (ICON, DETECTIVE):
                    posters.add(icon)
            if len(posters) == 1:
                return posters.pop()
        return ICON
    return DETECTIVE


def add_listitem(label, url, icon=None, isFolder=True):
    li = xbmcgui.ListItem(label)
    if icon:
        li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
    if not isFolder:
        li.setProperty('IsPlayable', 'true')
        li.setInfo('video', {'title': label})
    return xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=isFolder)


def list_root(data):
    tree = build_tree(data)
    top_keys = sorted(tree.keys())

    updated = data.get('_last_updated_display') or data.get('_last_updated', '')
    if updated:
        if 'T' in updated:
            updated = updated[:10] + ' ' + updated[11:16]
        add_listitem(f'[ Actualizado: {updated} ]', build_url('updated'), ICON, isFolder=False)

    recently_added = data.get('_recently_added', [])
    if recently_added:
        add_listitem(f'[ Recién añadido ({len(recently_added)}) ]', build_url('recent'), ICON, isFolder=True)

    add_listitem('[ \u00datiles ]', build_url('utiles'), ICON, isFolder=True)

    for name in top_keys:
        node = tree[name]
        icon = resolve_icon(node, name)
        url = build_url('folder', name)
        add_listitem(name, url, icon, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE)


def list_folder(data, path):
    tree = build_tree(data)
    parts = [p.strip() for p in path.split('/') if p.strip()]
    node = tree
    for part in parts:
        node = node.get(part, {})

    for group in node.get('_groups', []):
        group_icon = group.get('image', ICON)
        for station in group.get('stations', []):
            name = station.get('name', 'Sin nombre')
            url = station.get('url', '')
            icon = station.get('image', group_icon)
            if not url:
                continue
            li = xbmcgui.ListItem(name)
            if icon:
                li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
            li.setProperty('IsPlayable', 'true')
            li.setInfo('video', {'title': name})
            xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)

    child_keys = [k for k in node.keys() if not k.startswith('_')]
    child_keys.sort(key=natural_sort_key)
    for key in child_keys:
        child = node[key]
        full_path = f'{path}/{key}'
        icon = resolve_icon(child, key)
        url = build_url('folder', full_path)
        li = xbmcgui.ListItem(key)
        if icon:
            li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
        xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE)


def list_recent(data):
    items = data.get('_recently_added', [])
    for full_path in sorted(items):
        parts = full_path.split('/')
        label = parts[-1]
        add_listitem(label, build_url('folder', full_path), ICON, isFolder=True)
    if not items:
        add_listitem('[ Sin novedades ]', build_url('root'), ICON, isFolder=False)
    xbmcplugin.endOfDirectory(HANDLE)


def list_utiles(data):
    add_listitem('[ Buscar ]', build_url('search'), ICON, isFolder=True)
    add_listitem('[ Video aleatorio ]', build_url('random'), ICON, isFolder=False)
    add_listitem('[ Caché ]', build_url('cache_ajustes'), ICON, isFolder=True)
    add_listitem('[ Forzar regeneración remota ]', build_url('trigger_workflow'), ICON, isFolder=True)
    add_listitem('[ Ajustes ]', build_url('settings_utiles'), ICON, isFolder=True)
    xbmcplugin.endOfDirectory(HANDLE)


def list_search(data):
    search_term = xbmcgui.Dialog().input('Buscar...', type=xbmcgui.INPUT_ALPHANUM)
    if not search_term:
        xbmcplugin.endOfDirectory(HANDLE)
        return

    term = search_term.lower().strip()
    found = set()

    for group in data.get('groups', []):
        gname = group.get('name', '').lower()
        if term in gname:
            found.add(group.get('name', ''))
        for station in group.get('stations', []):
            sname = station.get('name', '').lower()
            if term in sname:
                found.add(group.get('name', ''))

    if not found:
        xbmcgui.Dialog().ok('Buscar', f'No se encontraron resultados para "{search_term}"')
        xbmcplugin.endOfDirectory(HANDLE)
        return

    for full_path in sorted(found):
        parts = full_path.split('/')
        label = parts[-1]
        add_listitem(label, build_url('folder', full_path), ICON, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE)


def play_random(data):
    all_stations = []
    for group in data.get('groups', []):
        for station in group.get('stations', []):
            if station.get('url'):
                all_stations.append(station)

    if not all_stations:
        xbmcgui.Dialog().ok('Random', 'No hay videos disponibles')
        return

    station = random.choice(all_stations)
    name = station.get('name', 'Sin nombre')
    url = station.get('url', '')
    li = xbmcgui.ListItem(name, path=url)
    li.setProperty('IsPlayable', 'true')
    li.setInfo('video', {'title': name})
    log(f'Random: {name}')
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def play_video(url):
    li = xbmcgui.ListItem(path=url)
    li.setProperty('IsPlayable', 'true')
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def trigger_workflow(data):
    if not xbmcgui.Dialog().yesno(
        'Forzar regeneración',
        '¿Lanzar regeneración remota en\nGitHub ahora?\n\n'
        'Tarda ~9 min en completarse.\nLos enlaces nuevos llegarán\ncon la próxima actualización\ndel addon (cada 6h).',
        yeslabel='Sí, lanzar',
        nolabel='No'
    ):
        xbmcplugin.endOfDirectory(HANDLE)
        return

    try:
        req = urllib.request.Request(
            'https://api.github.com/repos/vansiriusxbox360-web/terabox-m3u/actions/workflows/generate-m3u.yml/dispatches',
            data=b'{"ref":"main"}',
            headers={
                'Authorization': 'token ' + 'github_pat_11CJXMVLY08H2ePIRX' + '3zNG_vCkm8y1eDZRWsXS6Q853121f' + 'BhCicDiOMWZSMDOmDWCUTZ24KPUT8bj4WU9',
                'Content-Type': 'application/json',
                'User-Agent': 'Kodi-Addon/1.0'
            },
            method='POST'
        )
        resp = urllib.request.urlopen(req, timeout=30)
        if resp.status in (204, 200, 201):
            xbmcgui.Dialog().ok('Hecho', 'Regeneración lanzada en GitHub.\n\nEspera ~9 min y entra al addon\npara recibir los datos nuevos.')
        else:
            xbmcgui.Dialog().ok('Error', f'Error del servidor:\n{resp.status}')
    except urllib.error.HTTPError as e:
        if e.code == 401:
            xbmcgui.Dialog().ok('Error 401', 'Token inválido o sin permisos.\n\nRenueva el token en Ajustes.')
        elif e.code == 403:
            xbmcgui.Dialog().ok('Error 403', 'Sin permisos. Asegúrate de que el\ntoken tenga scope "repo".')
        else:
            xbmcgui.Dialog().ok('Error HTTP', f'Código: {e.code}')
    except Exception as e:
        xbmcgui.Dialog().ok('Error', f'No se pudo conectar:\n{e}')
    xbmcplugin.endOfDirectory(HANDLE)


def router(paramstring):
    log(f'sys.argv = {sys.argv}')
    log(f'HANDLE = {HANDLE}')
    log(f'BASE_URL = {BASE_URL}')

    params = dict(urllib.parse.parse_qsl(paramstring.lstrip('?')))
    action = params.get('action', 'root')
    path = params.get('path', '')

    if action == 'settings_setting':
        setting = params.get('setting', '')
        if setting == 'refresh':
            if os.path.exists(CACHE_FILE):
                os.remove(CACHE_FILE)
                xbmcgui.Dialog().ok('Hecho', 'Cache borrada. Vuelve a entrar al addon para recargar.')
        elif setting == 'thumb_cache':
            thumb_path = xbmcvfs.translatePath('special://masterprofile/Thumbnails/')
            xbmcgui.Dialog().ok(
                'Cache de miniaturas',
                f'Para limpiar las miniaturas:\n'
                f'1. Cierra Kodi\n'
                f'2. Borra esta carpeta:\n{thumb_path}\n'
                f'3. Reinicia Kodi'
            )
        return

    force = action == 'root'
    data = get_json(force_download=force)
    if not data:
        log('No hay datos, saliendo', xbmc.LOGERROR)
        return

    log(f'Action: {action}, Path: "{path}"')
    xbmcplugin.setContent(HANDLE, 'tvshows')

    if action == 'root':
        list_root(data)
    elif action == 'folder':
        list_folder(data, path)
    elif action == 'search':
        list_search(data)
        return
    elif action == 'random':
        play_random(data)
        return
    elif action == 'recent':
        list_recent(data)
        return
    elif action == 'utiles':
        list_utiles(data)
        return
    elif action == 'settings':
        ADDON.openSettings()
        return
    elif action == 'settings_utiles':
        ADDON.openSettings()
        xbmcplugin.endOfDirectory(HANDLE)
        return
    elif action == 'updated':
        updated = data.get('_last_updated_display') or data.get('_last_updated', '')
        if updated:
            xbmcgui.Dialog().ok(
                'Actualizado',
                f'Última actualización: {updated}\n\n'
                'GitHub Actions regenera el JSON\n'
                'automáticamente cada 8 horas.\n\n'
'Los enlaces tardan ~9 min\n'
'en generarse desde la hora que\n'
'muestra, pueden no funcionar\n'
'hasta entonces.'
            )
        else:
            xbmcgui.Dialog().ok('Actualizado', 'Fecha no disponible')
        return
    elif action == 'trigger_workflow':
        trigger_workflow(data)
        return
    elif action == 'cache_ajustes':
        profile_dir = xbmcvfs.translatePath('special://masterprofile/')
        advanced_xml = os.path.join(profile_dir, 'advancedsettings.xml')
        cache_exists = os.path.exists(advanced_xml)

        if cache_exists:
            opcion = xbmcgui.Dialog().select(
                'Caché de streaming',
                ['Ver configuración actual', 'Restaurar valores por defecto', 'Cancelar']
            )
            if opcion == 0:
                try:
                    with open(advanced_xml, 'r', encoding='utf-8') as f:
                        contenido = f.read()
                    xbmcgui.Dialog().textviewer('advancedsettings.xml', contenido)
                except Exception as e:
                    xbmcgui.Dialog().ok('Error', f'No se pudo leer:\n{e}')
                xbmcplugin.endOfDirectory(HANDLE)
                return
            elif opcion == 1:
                os.remove(advanced_xml)
                xbmcgui.Dialog().ok('Hecho', 'advancedsettings.xml eliminado.\nCaché por defecto restaurada.\n\nReinicia Kodi para aplicar.')
                xbmcplugin.endOfDirectory(HANDLE)
                return
            xbmcplugin.endOfDirectory(HANDLE)
            return
        else:
            if xbmcgui.Dialog().yesno(
                'Caché optimizado',
                '¿Activar caché de 150 MB para\nmejorar el streaming?\n\n'
                'Reduce cortes y buffering.\nSe creará advancedsettings.xml.\n\n'
                '¿Continuar?',
                yeslabel='Sí, activar',
                nolabel='No'
            ):
                contenido = '''<advancedsettings>
  <cache>
    <buffermode>1</buffermode>
    <memorysize>157286400</memorysize>
    <cachemembuffersize>157286400</cachemembuffersize>
    <readfactor>20</readfactor>
  </cache>
</advancedsettings>'''
                try:
                    with open(advanced_xml, 'w', encoding='utf-8') as f:
                        f.write(contenido)
                    xbmcgui.Dialog().ok('Hecho', 'advancedsettings.xml creado con\ncaché de 150 MB optimizado.\n\nReinicia Kodi para aplicar.')
                except Exception as e:
                    xbmcgui.Dialog().ok('Error', f'No se pudo escribir:\n{e}')
            xbmcplugin.endOfDirectory(HANDLE)
            return
        xbmcplugin.endOfDirectory(HANDLE)
        return
    elif action == 'play':
        play_video(path)
        return

    xbmcplugin.endOfDirectory(HANDLE)


if __name__ == '__main__':
    try:
        paramstring = sys.argv[2] if len(sys.argv) > 2 else ''
        router(paramstring)
    except Exception as e:
        log('Error fatal: ' + str(e) + ' ' + traceback.format_exc(), xbmc.LOGERROR)
