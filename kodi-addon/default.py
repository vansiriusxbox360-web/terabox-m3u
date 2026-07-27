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

ADDON = xbmcaddon.Addon()
HANDLE = int(sys.argv[1]) if len(sys.argv) > 1 else -1
BASE_URL = sys.argv[0] if sys.argv else ''
JSON_URL = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/lista.m3u'
ICON = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/detective_worried_street.png'
FANART = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/vaporwave_fine_grid.png'
CACHE_FILE = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'cache.json')
RAW_BASE = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main'

FOLDER_IMAGES = {
    '\u00aanime': f'{RAW_BASE}/img-anime.png',
    'Dibus que no son \u00aanime': f'{RAW_BASE}/img-dibus.png',
    'Tele5 / Club Disney / TPH / Megatrix': f'{RAW_BASE}/img-tele5.png',
    'en la 2 con mucha marcha y \u2bc9TPH,  en la 3 Megatrix o el Club Disney en Tele5': f'{RAW_BASE}/img-tele5.png',
    'Digital+': f'{RAW_BASE}/img-digital.png',
    'y si eras un ni\u00f1o afortunado y tus padres ten\u00edan Digital+': f'{RAW_BASE}/img-digital.png',
    'spin-off': f'{RAW_BASE}/img-spinoff.png',
    '(la carpeta spin-off que no te pillaba jamando)': f'{RAW_BASE}/img-spinoff.png',
    'VHS o tu madre': f'{RAW_BASE}/img-vhs.png',
    'las que te pon\u00edas en VHS o tu madre te dec\u00eda en mis tiempos habia cosas muy bonitas': f'{RAW_BASE}/img-vhs.png',
    'Sine': f'{RAW_BASE}/img-sine.png',
    'Sine malo y sine g\u00fceno': f'{RAW_BASE}/img-sine.png',
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

    cached = None
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cached = json.load(f)
        except Exception as e:
            log(f'Error leyendo cache: {e}', xbmc.LOGERROR)
            cached = None

    if cached:
        log(f'Usando cache local ({len(cached.get("groups", []))} grupos)')
        return cached

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


def build_url(action, path=''):
    params = urllib.parse.urlencode({'action': action, 'path': path})
    return f'{BASE_URL}?{params}'


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
        return node.get('_icon', ICON)
    return ICON


def list_root(data):
    tree = build_tree(data)
    top_keys = sorted(tree.keys())
    log(f'Root: {len(top_keys)} carpetas top-level: {top_keys[:5]}')
    for name in top_keys:
        node = tree[name]
        icon = resolve_icon(node, name)
        url = build_url('folder', name)
        li = xbmcgui.ListItem(name)
        if icon:
            li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
        ok = xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=True)
        log(f'  addDir({name}) -> {ok}')


def list_folder(data, path):
    tree = build_tree(data)
    parts = [p.strip() for p in path.split('/') if p.strip()]
    node = tree
    for part in parts:
        node = node.get(part, {})

    count = 0
    for group in node.get('_groups', []):
        for station in group.get('stations', []):
            name = station.get('name', 'Sin nombre')
            url = station.get('url', '')
            icon = station.get('image', ICON)
            if not url:
                continue
            li = xbmcgui.ListItem(name)
            if icon:
                li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
            li.setProperty('IsPlayable', 'true')
            li.setInfo('video', {'title': name})
            xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)
            count += 1

    subfolders = 0
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
        subfolders += 1

    log(f'Folder({path}): {count} videos, {subfolders} subcarpetas')


def play_video(url):
    li = xbmcgui.ListItem(path=url)
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def router(paramstring):
    log(f'sys.argv = {sys.argv}')
    log(f'HANDLE = {HANDLE}')
    log(f'BASE_URL = {BASE_URL}')

    data = get_json()
    if not data:
        log('No hay datos, saliendo', xbmc.LOGERROR)
        return

    params = dict(urllib.parse.parse_qsl(paramstring.lstrip('?')))
    action = params.get('action', 'root')
    path = params.get('path', '')

    log(f'Action: {action}, Path: "{path}"')
    xbmcplugin.setContent(HANDLE, 'tvshows')

    if action == 'root':
        list_root(data)
    elif action == 'folder':
        list_folder(data, path)
    elif action == 'play':
        play_video(path)

    xbmcplugin.endOfDirectory(HANDLE)


if __name__ == '__main__':
    try:
        paramstring = sys.argv[2] if len(sys.argv) > 2 else ''
        router(paramstring)
    except Exception as e:
        log('Error fatal: ' + str(e) + ' ' + traceback.format_exc(), xbmc.LOGERROR)
