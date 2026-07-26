import xbmcgui
import xbmcplugin
import xbmcaddon
import xbmc
import json
import urllib.request
import sys

ADDON = xbmcaddon.Addon()
HANDLE = int(sys.argv[1])
BASE_URL = sys.argv[0]
JSON_URL = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/lista.m3u'
ICON = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/icon.png'


def get_json():
    req = urllib.request.Request(JSON_URL)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def build_tree_structure(data):
    tree = {}
    for group in data.get('groups', []):
        parts = group['name'].split('/')
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {'_groups': [], '_icon': group.get('image', ICON)}
            current = current[part]
        current['_groups'].append(group)
    return tree


def add_dir(name, url, icon='', is_folder=True, info=None):
    li = xbmcgui.ListItem(name)
    if icon:
        li.setArt({'icon': icon, 'thumb': icon})
    if info:
        li.setInfo('video', info)
    xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=is_folder)


def build_url(action, **params):
    query = '&'.join(f'{k}={v}' for k, v in params.items())
    return f'{BASE_URL}?action={action}&{query}'


def list_root(data):
    add_dir('📺 La Colección de VanSirius', '', ICON, True)
    tree = build_tree_structure(data)
    for name, node in sorted(tree.items()):
        icon = node.get('_icon', ICON)
        has_groups = bool(node.get('_groups'))
        has_children = any(k != '_groups' and k != '_icon' for k in node)
        is_folder = has_groups or has_children
        url = build_url('list_node', path=name)
        add_dir(name, url, icon, is_folder)


def list_node(data, path):
    tree = build_tree_structure(data)
    parts = path.split('/')
    current = tree
    for part in parts:
        current = current.get(part, {})

    for group in current.get('_groups', []):
        for station in group.get('stations', []):
            name = station.get('name', 'Sin nombre')
            url = station.get('url', '')
            icon = station.get('image', ICON)
            if url:
                li = xbmcgui.ListItem(name)
                li.setArt({'icon': icon, 'thumb': icon})
                li.setProperty('IsPlayable', 'true')
                li.setInfo('video', {'title': name})
                xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)

    for name, node in sorted(current.items()):
        if name in ('_groups', '_icon'):
            continue
        icon = node.get('_icon', ICON)
        has_groups = bool(node.get('_groups'))
        has_children = any(k != '_groups' and k != '_icon' for k in node)
        is_folder = has_groups or has_children
        full_path = f'{path}/{name}'
        url = build_url('list_node', path=full_path)
        add_dir(name, url, icon, is_folder)


def play_video(url):
    li = xbmcgui.ListItem(path=url)
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


def router(paramstring):
    data = get_json()
    params = {}
    if paramstring:
        for pair in paramstring.split('&'):
            k, v = pair.split('=')
            params[k] = v

    action = params.get('action', 'root')

    if action == 'root':
        list_root(data)
    elif action == 'list_node':
        list_node(data, params.get('path', ''))
    elif action == 'play':
        play_video(params.get('url', ''))

    xbmcplugin.endOfDirectory(HANDLE)


if __name__ == '__main__':
    router(sys.argv[2][1:])
