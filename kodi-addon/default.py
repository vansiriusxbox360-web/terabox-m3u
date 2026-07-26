import xbmcgui
import xbmcplugin
import xbmcaddon
import xbmc
import json
import urllib.request
import urllib.parse
import sys
import traceback

ADDON = xbmcaddon.Addon()
HANDLE = int(sys.argv[1]) if len(sys.argv) > 1 else -1
BASE_URL = sys.argv[0] if sys.argv else ''
JSON_URL = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/lista.m3u'
ICON = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/icon.png'


def log(msg, level=xbmc.LOGINFO):
    xbmc.log(f'[VanSirius] {msg}', level)


def get_json():
    try:
        req = urllib.request.Request(JSON_URL, headers={'User-Agent': 'Kodi-Addon'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        log(f'Error cargando JSON: {e}', xbmc.LOGERROR)
        xbmcgui.Dialog().ok('Error', f'No se pudo cargar la lista:\n{e}')
        return None


def build_url(action, path=''):
    params = urllib.parse.urlencode({'action': action, 'path': path})
    return f'{BASE_URL}?{params}'


def add_dir(name, url, icon='', is_folder=True):
    li = xbmcgui.ListItem(name)
    if icon:
        li.setArt({'icon': icon, 'thumb': icon, 'fanart': icon})
    xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=is_folder)


def list_root(data):
    groups = data.get('groups', [])
    tree = {}
    for group in groups:
        parts = group['name'].split('/')
        node = tree
        for part in parts:
            if part not in node:
                node[part] = {'__groups': [], '__icon': group.get('image', ICON)}
            node = node[part]
        node['__groups'].append(group)

    for name in sorted(tree.keys()):
        node = tree[name]
        icon = node.get('__icon', ICON)
        has_content = bool(node.get('__groups')) or len(node) > 2
        url = build_url('folder', name)
        add_dir(name, url, icon, has_content)


def list_folder(data, path):
    groups = data.get('groups', [])
    tree = {}
    for group in groups:
        parts = group['name'].split('/')
        node = tree
        for part in parts:
            if part not in node:
                node[part] = {'__groups': [], '__icon': group.get('image', ICON)}
            node = node[part]
        node['__groups'].append(group)

    parts = path.split('/')
    node = tree
    for part in parts:
        node = node.get(part, {})

    for group in node.get('__groups', []):
        for station in group.get('stations', []):
            name = station.get('name', 'Sin nombre')
            url = station.get('url', '')
            icon = station.get('image', ICON)
            if not url:
                continue
            li = xbmcgui.ListItem(name)
            li.setArt({'icon': icon, 'thumb': icon})
            li.setProperty('IsPlayable', 'true')
            li.setInfo('video', {'title': name})
            ok = xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)

    for name in sorted(node.keys()):
        if name.startswith('__'):
            continue
        child = node[name]
        icon = child.get('__icon', ICON)
        has_content = bool(child.get('__groups')) or len(child) > 2
        full_path = f'{path}/{name}'
        url = build_url('folder', full_path)
        add_dir(name, url, icon, has_content)


def play_video(url):
    li = xbmcgui.ListItem(path=url)
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def router(paramstring):
    data = get_json()
    if not data:
        return

    params = dict(urllib.parse.parse_qsl(paramstring.lstrip('?')))
    action = params.get('action', 'root')
    path = params.get('path', '')

    log(f'Action: {action}, Path: {path}')

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
