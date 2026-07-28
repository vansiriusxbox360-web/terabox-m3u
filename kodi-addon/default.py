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


def get_json():
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cached = json.load(f)
            log(f'Usando cache local ({len(cached.get("groups", []))} grupos)')
            return cached
        except Exception as e:
            log(f'Error leyendo cache: {e}', xbmc.LOGERROR)

    progress = xbmcgui.DialogProgress()
    progress.create('VanSirius', 'Descargando coleccion...')

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
                progress.update(pct, f'Descargando... {read // 1024}KB / {total // 1024}KB')
            else:
                progress.update(0, f'Descargando... {read // 1024}KB')
            if progress.iscanceled():
                progress.close()
                return None

        progress.update(100, 'Procesando...')
        result = json.loads(data.decode('utf-8'))

        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            f.write(data.decode('utf-8'))

        progress.close()
        log(f'JSON descargado: {len(result.get("groups", []))} grupos')
        return result
    except Exception as e:
        progress.close()
        log(f'Error descargando JSON: {e}', xbmc.LOGERROR)
        xbmcgui.Dialog().ok('Error', f'No se pudo cargar la lista:\n{e}')
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
            for k in child_keys:
                icon = node[k].get('_icon')
                if icon and icon not in (ICON, DETECTIVE):
                    return icon
            for k in child_keys:
                icon = node[k].get('_icon')
                if icon:
                    return icon
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

    add_listitem('\U0001f50d Buscar', build_url('search'), ICON, isFolder=True)
    add_listitem('\U0001f3b2 Video aleatorio', build_url('random'), ICON, isFolder=False)
    add_listitem('\u2699\ufe0f Ajustes', build_url('settings'), ICON, isFolder=False)

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


def list_search(data):
    search_term = xbmcgui.Dialog().input('Buscar...', type=xbmcgui.INPUT_ALPHANUM)
    if not search_term:
        xbmcplugin.endOfDirectory(HANDLE)
        return

    term = search_term.lower().strip()
    found_groups = set()
    found_stations = []

    for group in data.get('groups', []):
        gname = group.get('name', '').lower()
        if term in gname:
            found_groups.add(group.get('name', ''))
        for station in group.get('stations', []):
            sname = station.get('name', '').lower()
            if term in sname:
                found_stations.append((group, station))

    if not found_groups and not found_stations:
        xbmcgui.Dialog().ok('Buscar', f'No se encontraron resultados para "{search_term}"')
        xbmcplugin.endOfDirectory(HANDLE)
        return

    seen = set()
    for full_path in sorted(found_groups):
        if full_path in seen:
            continue
        seen.add(full_path)
        parts = full_path.split('/')
        label = f'\U0001f4c1 {parts[-1]}'
        add_listitem(label, build_url('folder', full_path), ICON, isFolder=True)

    for group, station in found_stations:
        label = f'\U0001f3ac {station["name"]}  ({group["name"]})'
        icon = station.get('image', group.get('image', ICON))
        url = station['url']
        add_listitem(label, build_url('play', url), icon, isFolder=False)

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

    data = get_json()
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
    elif action == 'settings':
        ADDON.openSettings()
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
