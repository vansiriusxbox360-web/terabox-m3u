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
LINK_CACHE_FILE = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'link_cache.json')
LINK_CACHE_TTL = 2 * 3600


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

FOLDER_ICON_URLS = {
    'Dragon Ball trilog\u00eda + eplis': 'https://i.pinimg.com/736x/86/37/d4/8637d49f9329a827e93a306eda70e45f.jpg',
    'unuiverso chananut': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/unuiverso_chananut.jpg',
    'Muchachada Nui': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/muchachada_nui.jpg',
    'Pok\u00e9mon': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/pokemon_padre.jpg',
    'Avatar La Leyenda de Aang': 'https://m.media-amazon.com/images/M/MV5BZTZmMWU3ZTUtM2U4Ni00YmNhLTkwODktN2IzNzkyZmRlYjZjXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
    'chorris': ICON,
    'no chorris': ICON,
    'Martes y Trece': 'https://image.tmdb.org/t/p/w500/hb9cNE0FjxZBZocVNwvMDWXMP5J.jpg',
    'vicio': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/vicio.png',
    'Gantz': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/gantz.jpg',
    'High Score Girl': 'https://takamakiokerar.wordpress.com/wp-content/uploads/2018/12/tumblr_mfeera8z4r1qbfiiuo1_1280.jpg',
    'Itou Junji Collection': 'https://image.tmdb.org/t/p/original/umIn2MeNsJAvzb8ztRrv2nhfJ28.jpg',
    'Overlord': 'https://m.media-amazon.com/images/M/MV5BYjNjNDBmZjAtMGZiMS00ODBkLWFjYWItZWQ1ZjEwOGNmZDBjXkEyXkFqcGc@._V1_.jpg',
    'Steins;Gate': 'https://image.tmdb.org/t/p/w500/6lAKKvmyLDAMXPZ0uvCdT9UioVr.jpg',
}

FOLDER_ICON_BY_PATH_SUFFIX = {
    'Rick y Morty/\u00aanime': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/rick_y_morty_anime.jpg',
    'Mortadelo y Filem\u00f3n Estudios Vara': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/mortadelo_y_filemon_estudios_vara.jpg',
    'Festivales por capis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/festivales_por_capis.jpg',
    'Dragon Ball Z - Selecta Vision': 'https://wallpapercave.com/wp/wp11901987.jpg',
    'Disney/Cortos': 'https://cdn.artphotolimited.com/images/61a73c0dbd40b81766e77efb/1000x1000/walt-disney.jpg',
    'Disney': 'https://cdn.artphotolimited.com/images/61a73c0dbd40b81766e77efb/1000x1000/walt-disney.jpg',
    'BeyBlade': 'https://i.pinimg.com/1200x/79/ba/15/79ba1560a8ab6945e38447b0c762179e.jpg',
    'BeyBlade/1.BeyBlade 2000': 'https://i.pinimg.com/736x/cf/4d/84/cf4d8495233cddf795f5dea41a6dd398.jpg',
    'BeyBlade/2.BeyBalde V-Force': 'https://cdn2.steamgriddb.com/grid/87d7515a647f2f8ff7d92f38820dd8c7.png',
    'BeyBlade/3.BeyBlade G-Revolution': 'https://i.pinimg.com/736x/83/a3/fb/83a3fbb921271d1ca5a07f2e1903e1bc.jpg',
    # Subcarpetas de Martes y Trece heredan la imagen de la madre
    'Martes y Trece/chou y ehpesiale': 'https://image.tmdb.org/t/p/w500/hb9cNE0FjxZBZocVNwvMDWXMP5J.jpg',
    'Martes y Trece/Pelis': 'https://image.tmdb.org/t/p/w500/hb9cNE0FjxZBZocVNwvMDWXMP5J.jpg',
    # Carátulas definitivas por carpeta
    'Asterix': 'https://postersonline.co.za/wp-content/uploads/2026/05/GPE5727.jpg',
    'Beavis & Butt-Head': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4GaNJRLkGk6O_n-zP09b5k6hfvVoKmgWPcpCQPZ4zL_RCyA4RskSQ87PR&s=10',
    'Beavis & Butt-Head/eplis': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/beavis2.png',
    'Devil May Cry': 'https://m.media-amazon.com/images/M/MV5BMWZiMTVmMjEtYjQ4MS00YzE4LThmMGYtYTE3ZjhhZmQ2NmMwXkEyXkFqcGc@._V1_.jpg',
    'High Score Girl/s1': 'https://takamakiokerar.wordpress.com/wp-content/uploads/2018/12/tumblr_mfeera8z4r1qbfiiuo1_1280.jpg',
    'High Score Girl/s2': 'https://takamakiokerar.wordpress.com/wp-content/uploads/2018/12/tumblr_mfeera8z4r1qbfiiuo1_1280.jpg',
    'Mononoke Karakasa & Shou - Hinezumi (Netflix)': 'https://static.wikia.nocookie.net/wiki-doblaje-espana/images/3/3d/Mononoke_-_El_Fantasma_Bajo_La_Lluvia_-_Poster.jpg/revision/latest?cb=20241116234056&path-prefix=es',
    'Tenshi no Tamago': 'https://static.wikia.nocookie.net/wiki-doblaje-espana/images/3/3d/Mononoke_-_El_Fantasma_Bajo_La_Lluvia_-_Poster.jpg/revision/latest?cb=20241116234056&path-prefix=es',
    'Urotsukidoji - La leyenda del se\u00f1or del mal': 'https://m.media-amazon.com/images/I/61SNyC4jnmL._AC_UF894,1000_QL80_.jpg',
}

INHERIT_CHILD_ICONS = {
    'Pok\u00e9mon',
    'La banda del patio',
    'Campeones',
    'Bumpy',
    'Rick y Morty',
    'Una Navidad con Mickey',
    'Ed, Edd y Eddy',
    'Ed Edd y Eddy',
    'BeyBlade',
}

# Pósters individuales forzados por fragmento del nombre del capítulo
STATION_POSTER_OVERRIDES = {
    'Esto es un Atraco': 'https://image.tmdb.org/t/p/w500/gvAJfhqbZqAoaN4hzA9htk8QWq3.jpg',
    'La Corte del Faraon': 'https://image.tmdb.org/t/p/w500/7RPzwXMcYR0HzdEcd0VUIxdEwc2.jpg',
    'Ni Te Cases Ni Te Embarques': 'https://image.tmdb.org/t/p/w500/29tc1Mkv1f2gUmBYre6ZJhePJbl.jpg',
    'La Loca Historia de los Tres Mosqueteros': 'https://image.tmdb.org/t/p/w500/fBEeNB5Znt8N2fjjYBgNNvl9xC5.jpg',
    'Aqui Huele a Muerto': 'https://m.media-amazon.com/images/M/MV5BNGY0NmZiODctYTkzNC00YjI4LTliYTQtOTNmZTc0NjQ2ZTQ4XkEyXkFqcGdeQXVyODI2MDA4NQ@@._V1_SX300.jpg',
    'El Robobo de la Jojoya': 'https://m.media-amazon.com/images/M/MV5BMjcxNTE2NGEtOGVlNy00MWJjLTljYmItM2VjOGI0M2NiNzc1XkEyXkFqcGc@._V1_SX300.jpg',
    'Los chicos del maiz': 'https://es.web.img2.acsta.net/medias/nmedia/18/92/53/30/20204975.jpg',
    'Christine': 'https://images.justwatch.com/poster/9621681/s718/christine.jpg',
    'Maleficio': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/maleficio.png',
    'Tenk\u016b no Shiro Laputa': 'https://i.pinimg.com/736x/62/a4/5e/62a45e0d133af9fded1b20796f881f86.jpg',
    'Hocus': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/hocus_pocus.jpg',
    'Bio Menace': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/bio_menace.jpg',
    'Duke Nukem II': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/duke_nukem2.jpg',
    'Jazz': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/jazz.jpg',
    'Monster Bash': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/monster_bash.jpg',
    'Oscar': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/oscar.jpg',
    'Realms of Chaos': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/realms_of_chaos.jpg',
    'Secret Agent': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/secret_agent.png',
    'Trivia Whiz': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/trivia_whiz.webp',
    'Hollywood Trivia': 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/custom-posters/hollywood.png',
}

# Regiones/series de Pokémon cuyos capítulos heredan la imagen de su carpeta
POKEMON_ICON_REGIONS = (
    '1. Kanto',
    '2. Johto',
    '3. Hoenn',
    '4. Sinnoh',
    '5. Teselia',
    '6. Kalos',
    '7. Alola',
    '8. Galar (Viajes Pok\u00e9mon)',
    '9. Paldea (Pok\u00e9mon Horizontes)',
    'Cr\u00f3nicas Pok\u00e9mon',
    'La conserje Pok\u00e9mon',
    'Pok\u00e9mon Generations',
    'Pok\u00e9mon Megaevoluci\u00f3n',
    'Pok\u00e9mon Origin',
)


def station_inherits_group_icon(group_name):
    """True si los capítulos de este grupo deben usar la imagen de su carpeta (Pokémon)."""
    if 'Pok\u00e9mon' not in group_name:
        return False
    for region in POKEMON_ICON_REGIONS:
        if region in group_name:
            return True
    return False


def _all_stations_same_image(stations):
    """True si todos los stations con imagen comparten la misma (póster genérico erróneo)."""
    imgs = [s.get('image') for s in stations if s.get('image')]
    if not imgs or len(imgs) < 2:
        return False
    return len(set(imgs)) == 1


def _find_series_icon(tree, group_name):
    """Busca el icono de la serie anfitriona (ancestro en INHERIT_CHILD_ICONS) para el group_name."""
    parts = [p.strip() for p in group_name.split('/') if p.strip()]
    node = tree
    for i, part in enumerate(parts):
        node = node.get(part, {})
        if not isinstance(node, dict):
            return None
        if part in INHERIT_CHILD_ICONS:
            # Resolver el icono de la serie desde sus hijos (subcarpetas/stations)
            return resolve_icon(node, '/'.join(parts[:i + 1]), 0)
    return None


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

    def folder_icon_by_name(name):
        if name in FOLDER_IMAGES:
            return FOLDER_IMAGES[name]
        if name in FOLDER_ICON_URLS:
            return FOLDER_ICON_URLS[name]
        return None

    def inherit(parent_node, parent_name=''):
        parent_icon = parent_node.get('_icon')
        if parent_icon == ICON:
            parent_icon = None
        if not parent_icon and parent_name:
            parent_icon = folder_icon_by_name(parent_name)
        for key, child in parent_node.items():
            if key.startswith('_'):
                continue
            if child.get('_icon') == ICON and parent_icon:
                child['_icon'] = parent_icon
            inherit(child, key)

    for key, child in tree.items():
        if not key.startswith('_'):
            inherit(child, key)
    return tree


def resolve_icon(node, current_path='', sibling_idx=0):
    for suffix, url in FOLDER_ICON_BY_PATH_SUFFIX.items():
        if current_path == suffix or current_path.endswith('/' + suffix):
            return url
    leaf = current_path.rsplit('/', 1)[-1] if current_path else ''
    # Puertas forzadas por sufijo de ruta (antes de la imagen heredada)
    if leaf in DOOR_BY_PATH_SUFFIX and os.path.exists(DOOR_BY_PATH_SUFFIX[leaf]):
        return DOOR_BY_PATH_SUFFIX[leaf]
    if leaf in RANDOM_DOOR_BY_PATH_SUFFIX:
        rnd = folder_icon(current_path, sibling_idx)
        return rnd if rnd else ICON
    folder_img = get_folder_image(leaf)
    if folder_img:
        return folder_img
    folder_url = FOLDER_ICON_URLS.get(leaf) or FOLDER_ICON_URLS.get(leaf.lower())
    if folder_url:
        return folder_url
    if node.get('_groups'):
        icon = node.get('_icon')
        if icon and icon != ICON:
            return icon
        rnd = folder_icon(current_path, sibling_idx)
        return rnd if rnd else DETECTIVE
    child_keys = [k for k in node.keys() if not k.startswith('_')]
    if child_keys:
        if leaf in INHERIT_CHILD_ICONS:
            child_keys.sort(key=natural_sort_key)
            inherited = []
            for k in child_keys:
                child_path = f'{current_path}/{k}' if current_path else k
                icon = resolve_icon(node[k], child_path)
                if icon not in (ICON, DETECTIVE):
                    inherited.append(icon)
            if inherited:
                unique = set(inherited)
                if len(unique) == 1:
                    return unique.pop()
                counts = {}
                for icon in inherited:
                    counts[icon] = counts.get(icon, 0) + 1
                top_icon, top_count = max(counts.items(), key=lambda kv: kv[1])
                if top_count > 1:
                    return top_icon
                return inherited[0]
            rnd = folder_icon(current_path, sibling_idx)
            return rnd if rnd else ICON
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
        rnd = folder_icon(current_path, sibling_idx)
        return rnd if rnd else ICON
    rnd = folder_icon(current_path, sibling_idx)
    return rnd if rnd else DETECTIVE


def add_listitem(label, url, icon=None, isFolder=True):
    li = xbmcgui.ListItem(label)
    if icon:
        li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
    if not isFolder:
        li.setProperty('IsPlayable', 'true')
        li.setInfo('video', {'title': label})
    return xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=isFolder)


ALL_DOORS = [os.path.join(ADDON_PATH, 'resources', 'random', f)
             for f in (os.listdir(os.path.join(ADDON_PATH, 'resources', 'random'))
                       if os.path.isdir(os.path.join(ADDON_PATH, 'resources', 'random')) else [])
             if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))]

# Puertas fijas por sufijo de ruta (mapeo del usuario)
DOOR_MAIN = os.path.join(ADDON_PATH, 'resources', 'random', 'maindoor.gif')
DOOR_2 = os.path.join(ADDON_PATH, 'resources', 'random', 'door2.gif')
FIXED_DOORS = {
    'las que te ponian comiendo': DOOR_MAIN,
    'Que se divide eeeennn': DOOR_MAIN,
    'hoven padawan': DOOR_2,
    'Pelos': DOOR_2,
    'Seriales': DOOR_2,
}

# Puertas forzadas por sufijo de ruta (se aplican ANTES de la imagen heredada)
DOOR_BY_PATH_SUFFIX = {
    'Cortos': DOOR_2,
    'adultos': DOOR_2,
    'no adultos': DOOR_2,
    'chorris': DOOR_2,
    'no chorris': DOOR_2,
}

# Carpetas que fuerzan puerta aleatoria (ignoran la imagen heredada)
RANDOM_DOOR_BY_PATH_SUFFIX = {
    'Dibus',
    'No dibus',
}

# Pool de puertas aleatorias (excluye las fijas)
RANDOM_IMAGES = [d for d in ALL_DOORS
                 if os.path.basename(d).lower() not in ('maindoor.gif', 'door2.gif')]

_last_random = {}


def folder_icon(current_path='', sibling_idx=0):
    """Puerta fija si la carpeta esta en el mapa; si no, random estable por ruta e indice en lista."""
    if not ALL_DOORS:
        return None
    leaf = current_path.rsplit('/', 1)[-1] if current_path else ''
    if leaf in FIXED_DOORS and os.path.exists(FIXED_DOORS[leaf]):
        return FIXED_DOORS[leaf]
    if not RANDOM_IMAGES:
        return ALL_DOORS[0]
    # semilla estable: ruta + indice -> carpetas vecinas distintas y estables al recargar
    seed_src = current_path + '|' + str(sibling_idx)
    seed = 0
    for ch in seed_src:
        seed = (seed * 31 + ord(ch)) & 0xFFFFFFFF
    return RANDOM_IMAGES[seed % len(RANDOM_IMAGES)]


WELCOME_FLAG = os.path.join(xbmcvfs.translatePath('special://masterprofile/addon_data/plugin.video.vansirius'), '.welcome_shown')

# Tamaño de la caché de streaming en bytes (256 MB)
CACHE_SIZE_BYTES = 268435456


def _cache_activa():
    """True si advancedsettings.xml tiene configurada la caché de streaming."""
    try:
        advanced_xml = os.path.join(xbmcvfs.translatePath('special://masterprofile/'), 'advancedsettings.xml')
        if not os.path.exists(advanced_xml):
            return False
        with open(advanced_xml, 'r', encoding='utf-8') as f:
            return str(CACHE_SIZE_BYTES) in f.read()
    except Exception:
        return False


def show_welcome():
    """Bienvenida, aviso de caché y créditos (una vez por sesión de Kodi)."""
    try:
        if os.path.exists(WELCOME_FLAG):
            return
        os.makedirs(os.path.dirname(WELCOME_FLAG), exist_ok=True)
        frase = ('Ooohh buenas, mira quien anda por aquí!\n'
                 'Te ofrecería un vasito de agua, pero está chunga la cosa.\n'
                 'Toma, echa un ojo a la carta...\n'
                 '* Menú del día dos puntos *')
        xbmcgui.Dialog().ok('El Rincón Dharmatico de Vishnu', frase)
        if _cache_activa():
            xbmcgui.Dialog().ok(
                'Caché de streaming',
                'La caché de 256 MB está activada (mejor experiencia,\n'
                'sin cortes ni buffering).\n\n'
                'También tienes juegos MS-DOS disponibles:\n'
                'actívalos en Ajustes > "Juegos (DOSBox)".'
            )
        elif xbmcgui.Dialog().yesno(
            'Caché de streaming',
            'Para una mejor experiencia, se recomienda activar\n'
            'la caché de 256 MB (evita cortes y buffering).\n\n'
            'También tienes juegos MS-DOS disponibles:\n'
            'actívalos en Ajustes > "Juegos (DOSBox)".\n\n'
            '¿Activar la caché de 256 MB ahora?',
            yeslabel='Sí, activar',
            nolabel='Ahora no'
        ):
            try:
                contenido = f'''<advancedsettings>
  <cache>
    <buffermode>1</buffermode>
    <memorysize>{CACHE_SIZE_BYTES}</memorysize>
    <cachemembuffersize>{CACHE_SIZE_BYTES}</cachemembuffersize>
    <readfactor>20</readfactor>
  </cache>
</advancedsettings>'''
                with open(os.path.join(xbmcvfs.translatePath('special://masterprofile/'), 'advancedsettings.xml'), 'w', encoding='utf-8') as f:
                    f.write(contenido)
                xbmcgui.Dialog().ok('Hecho', 'Caché de 256 MB activada.\n\nReinicia Kodi para aplicar.')
            except Exception as e:
                log(f'Error escribiendo caché: {e}')
        try:
            version = ADDON.getAddonInfo('version')
        except Exception:
            version = '?'
        try:
            mtime = os.path.getmtime(os.path.join(ADDON_PATH, 'addon.xml'))
            fecha = time.strftime('%d/%m/%Y', time.localtime(mtime))
        except Exception:
            fecha = 'desconocida'
        xbmcgui.Dialog().ok('Créditos',
                            f'Creado por VanSirius\n\n'
                            f'Versión instalada: {version}\n'
                            f'Actualización del addon: {fecha}\n\n'
                            f'Que lo disfrutes.')
        try:
            with open(WELCOME_FLAG, 'w') as f:
                f.write('1')
        except Exception:
            pass
    except Exception as e:
        log(f'Error en bienvenida: {e}')


def _games_enabled():
    """True si el usuario tiene activado el switch de juegos (DOSBox)."""
    try:
        return ADDON.getSetting('enable_games') == 'true'
    except Exception:
        return False


def list_root(data):
    show_welcome()
    tree = build_tree(data)
    top_keys = sorted(tree.keys())
    if not _games_enabled():
        top_keys = [k for k in top_keys if k.lower() != 'vicio']

    updated = data.get('_last_updated_display') or data.get('_last_updated', '')
    if updated:
        if 'T' in updated:
            updated = updated[:10] + ' ' + updated[11:16]
        add_listitem(f'[ Actualizado: {updated} ]', build_url('updated'), ICON, isFolder=False)

    add_listitem('[ \u00datiles ]', build_url('utiles'), ICON, isFolder=True)
    add_listitem('[ Favoritos ]', build_url('favorites'), ICON, isFolder=True)
    add_listitem('[ Continuar viendo ]', build_url('continue_watching'), ICON, isFolder=True)

    for idx, name in enumerate(top_keys):
        node = tree[name]
        icon = resolve_icon(node, name, idx)
        url = build_url('folder', name)
        li = xbmcgui.ListItem(name)
        if icon:
            li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
        add_fav_context_menu(li, name)
        xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


def list_folder(data, path):
    tree = build_tree(data)
    parts = [p.strip() for p in path.split('/') if p.strip()]
    node = tree
    for part in parts:
        node = node.get(part, {})

    # En la sección de juegos (vicio), asegurar que DOSBox está instalado
    if parts and parts[0].lower() == 'vicio' and any(
        s.get('isGame') for g in node.get('_groups', []) for s in g.get('stations', [])
    ):
        ensure_dosbox()

    for group in node.get('_groups', []):
        group_icon = group.get('image')
        group_name = group.get('name', '')
        # Imagen de álbum por sufijo de ruta (p.ej. temporadas de BeyBlade) con prioridad
        for suffix, url in FOLDER_ICON_BY_PATH_SUFFIX.items():
            if group_name == suffix or group_name.endswith('/' + suffix):
                group_icon = url
                break
        # Si el grupo no tiene imagen, usar la de la carpeta (heredada en el árbol)
        if not group_icon:
            group_icon = node.get('_icon')
            if group_icon == ICON or group_icon in (FOLDER_IMAGES.get('Dibus que no son \u00aanime'), FOLDER_IMAGES.get('\u00aanime')):
                # Imagen genérica de contenedor: buscar la de la serie anfitriona
                series_icon = _find_series_icon(tree, group_name)
                if series_icon:
                    group_icon = series_icon
            if group_icon == ICON:
                group_icon = None
        stations = group.get('stations', [])

        for station in stations:
            name = station.get('name', 'Sin nombre')
            raw_url = station.get('url', '')
            fs_id = station.get('fs_id')
            icon = station.get('image', group_icon)
            # Póster individual forzado por fragmento del nombre
            for frag, poster_url in STATION_POSTER_OVERRIDES.items():
                if frag in name:
                    icon = poster_url
                    break
            # Regla del álbum: si todos los capítulos comparten la misma imagen individual,
            # es un póster genérico (erróneo) y heredan la imagen de su carpeta.
            if group_icon and _all_stations_same_image(stations):
                icon = group_icon
            # Pokémon (regiones/series sueltas): los capítulos heredan la imagen de su carpeta
            if station_inherits_group_icon(group_name):
                icon = group_icon
            # Si tenemos fs_id, pasamos por el addon para refrescar el enlace
            is_game = bool(station.get('isGame'))
            if fs_id:
                s_path = station.get('path', '')
                if s_path:
                    url = build_url('play', s_path, fs_id=str(fs_id), game='1' if is_game else '')
                else:
                    url = build_url('play', str(fs_id), game='1' if is_game else '')
            else:
                url = raw_url
            if not url:
                continue
            li = xbmcgui.ListItem(name)
            if icon:
                li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
            if is_game:
                # Los juegos se lanzan con DOSBox externo: NO marcarlos como
                # reproducibles o Kodi muestra "no se puede reproducir el contenido".
                try:
                    li.setInfo('game', {'title': name, 'platform': 'DOS'})
                except Exception:
                    li.setInfo('video', {'title': name})
            else:
                li.setProperty('IsPlayable', 'true')
                li.setInfo('video', {'title': name})
            add_fav_context_menu(li, name)
            xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)

    child_keys = [k for k in node.keys() if not k.startswith('_')]
    child_keys.sort(key=natural_sort_key)
    for idx, key in enumerate(child_keys):
        child = node[key]
        full_path = f'{path}/{key}'
        icon = resolve_icon(child, full_path, idx)
        url = build_url('folder', full_path)
        li = xbmcgui.ListItem(key)
        if icon:
            li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
        add_fav_context_menu(li, key)
        xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


def list_utiles(data):
    add_listitem('[ Buscar ]', build_url('search'), ICON, isFolder=True)
    add_listitem('[ Video aleatorio ]', build_url('random'), ICON, isFolder=False)
    add_listitem('[ Caché ]', build_url('cache_ajustes'), ICON, isFolder=True)
    add_listitem('[ Forzar regeneración remota ]', build_url('trigger_workflow'), ICON, isFolder=True)
    add_listitem('[ Ajustes ]', build_url('settings_utiles'), ICON, isFolder=True)
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


def list_search(data):
    search_term = xbmcgui.Dialog().input('Buscar...', type=xbmcgui.INPUT_ALPHANUM)
    if not search_term:
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
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
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return

    for full_path in sorted(found):
        parts = full_path.split('/')
        label = parts[-1]
        add_listitem(label, build_url('folder', full_path), ICON, isFolder=True)

    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


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


TERABOX_UA = 'terabox;1.40.0.132;PC;PC-Windows;10.0.26100;WindowsTeraBox'
TERABOX_WHOST = 'https://www.terabox.com'


def _terabox_post(url, data, cookie):
    body = urllib.parse.urlencode(data)
    req = urllib.request.Request(url, data=body.encode(), headers={
        'User-Agent': TERABOX_UA,
        'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    resp = urllib.request.urlopen(req, timeout=20)
    return json.loads(resp.read().decode())


def get_ndus():
    """Obtiene el token ndus: setting del addon, token.txt (dentro del addon o repo), o config.json."""
    ndus = ADDON.getSetting('ndus_token')
    if ndus:
        return ndus
    repo = ADDON.getSetting('repo_path') or r'C:\Users\VanSirius\terabox-m3u'
    # token.txt dentro del addon (incrustado en el zip que se distribuye)
    try:
        with open(os.path.join(ADDON_PATH, 'token.txt'), 'r', encoding='utf-8') as f:
            tok = f.read().strip()
            if tok:
                return tok
    except Exception:
        pass
    # token.txt generado por renovar_token.bat en el repo
    try:
        with open(os.path.join(repo, 'token.txt'), 'r', encoding='utf-8') as f:
            tok = f.read().strip()
            if tok:
                return tok
    except Exception:
        pass
    # config.json del repo
    try:
        with open(os.path.join(repo, 'config.json'), 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            if cfg.get('ndus'):
                return cfg['ndus']
    except Exception:
        pass
    return None


def _load_link_cache():
    try:
        with open(LINK_CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_link_cache(cache):
    try:
        os.makedirs(os.path.dirname(LINK_CACHE_FILE), exist_ok=True)
        with open(LINK_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f)
    except Exception as e:
        log(f'Error guardando caché de enlaces: {e}')


def refresh_link(path, fs_id=None, force=False):
    """Obtiene un dlink fresco de Terabox con caché (URLs valen 8h, reutilizamos 2h)."""
    if not path:
        log('Refresh: falta path')
        return None
    cache = _load_link_cache()
    cached = cache.get(path)
    if not force and cached and cached.get('ts', 0) > time.time() - LINK_CACHE_TTL and cached.get('url', '').startswith('http'):
        log('Refresh: usando enlace en caché', xbmc.LOGINFO)
        return cached['url']

    ndus = get_ndus()
    if not ndus:
        log('Refresh: falta ndus')
        return None
    cookie = 'lang=en; ndus=' + ndus
    t0 = time.time()
    try:
        res = _terabox_post(TERABOX_WHOST + '/api/filemetas', {
            'dlink': 1,
            'origin': 'dlna',
            'target': json.dumps([path]),
        }, cookie)
        log(f'Refresh: filemetas tardó {time.time()-t0:.2f}s', xbmc.LOGINFO)
        if res.get('errno') == 0 and isinstance(res.get('info'), list):
            for item in res['info']:
                if isinstance(item, dict) and item.get('dlink'):
                    cache[path] = {'url': item['dlink'], 'ts': time.time()}
                    _save_link_cache(cache)
                    return item['dlink']
        log(f'Refresh: sin dlink en filemetas errno={res.get("errno")}')
    except Exception as e:
        log(f'Refresh error: {e}')
    return None


def is_dosbox_installed():
    """True si existe DOSBox (portable del addon o externo de Windows)."""
    try:
        return bool(_find_dosbox_exe())
    except Exception:
        return False


def ensure_dosbox():
    """Comprueba DOSBox (portable incluido o del sistema). Sin instalar nada."""
    if is_dosbox_installed():
        return True
    xbmcgui.Dialog().ok('DOSBox',
                        'No se ha encontrado DOSBox.\n\n'
                        'El addon debería incluir un DOSBox portable en\n'
                        'resources/dosbox. Comprueba que el zip esté completo\n'
                        'o instala DOSBox 0.74 / D-Fend Reloaded en el sistema.')
    return False


def _download_game(url, filename):
    """Descarga un juego (zip), lo extrae y devuelve la ruta del .exe (DOSBox standalone lo monta)."""
    if not url:
        return None
    games_dir = os.path.join(xbmcvfs.translatePath(ADDON.getAddonInfo('profile')), 'games')
    try:
        os.makedirs(games_dir, exist_ok=True)
    except Exception:
        pass
    # nombre base seguro y extensión real
    safe = re.sub(r'[^\w.\-]+', '_', filename or 'juego.zip')
    ext_real = os.path.splitext(filename)[1].lower() if filename else '.zip'
    if ext_real not in ('.zip', '.7z', '.dosz', '.exe', '.com'):
        ext_real = '.zip'
    base = os.path.splitext(safe)[0]
    file_path = os.path.join(games_dir, base + ext_real)
    extract_to = os.path.join(games_dir, base)

    # si ya hay un .exe extraído, reutilizar (y asegurar el .sav precargado)
    exe = _find_game_exe(extract_to, game_hint=filename)
    if exe:
        _download_game_save(base, extract_to)
        return exe

    progress = xbmcgui.DialogProgress()
    progress.create('VanSirius', f'Descargando {filename}...')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Kodi-Addon/1.0'})
        resp = urllib.request.urlopen(req, timeout=300)
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
                progress.update(pct, f'{read // 1024}KB / {total // 1024}KB')
            else:
                progress.update(0, f'{read // 1024}KB')
            if progress.iscanceled():
                progress.close()
                return None
        progress.close()
        if not data:
            return None
        with open(file_path, 'wb') as f:
            f.write(data)
        # extraer y devolver el exe
        try:
            exe = _extract_game(file_path, extract_to)
            if exe:
                try:
                    os.remove(file_path)
                except Exception:
                    pass
                return exe
        except Exception as e:
            log(f'Error extrayendo juego: {e}')
        return file_path
    except Exception as e:
        log(f'Error descargando juego: {e}')
    progress.close()
    return None


# Ejecutable preferido por juego (fragmento de nombre -> nombre del exe). Evita
# que el ranking genérico coja instaladores/ayudas (DN2HELP, d1.exe, 3DRCAT, etc.)
GAME_EXE_MAP = {
    'duke nukem': 'NUKEM2.EXE',
    'hocus': 'HOCUS.EXE',
    'jazz': 'FILE0001.EXE',
    'oscar': 'OSCAR.EXE',
    'realms of chaos': 'ROC.EXE',
    'bio menace': 'BMENACE1.EXE',
    'monster bash': 'BASH1.EXE',
    'secret agent': 'SAM1.EXE',
    'trivia': 'HLWD.EXE',
    'hollywood': 'HLWD.EXE',
}


def _find_game_exe(extract_to, game_hint=''):
    """Busca el .exe del juego en la carpeta extraída.

    Si se indica el nombre del juego (game_hint), se prefiere el ejecutable
    de GAME_EXE_MAP; si no se encuentra, se usa el ranking genérico evitando
    setup/install/ayudas/etc.
    """
    if not os.path.isdir(extract_to):
        return None
    hint = (game_hint or '').lower().replace('_', ' ').replace('.7z', '').replace('.zip', '').strip()
    pref = None
    if hint:
        for frag, exe_name in GAME_EXE_MAP.items():
            if frag in hint:
                pref = exe_name.lower()
                break
    exes = []
    for root, dirs, files in os.walk(extract_to):
        for f in files:
            if f.lower().endswith('.exe'):
                exes.append(os.path.join(root, f))
    if pref:
        for p in exes:
            if os.path.basename(p).lower() == pref:
                return p
    def exe_rank(p):
        base_n = os.path.basename(p).lower()
        if any(k in base_n for k in ('setup', 'install', 'catalog', 'help', 'hint', 'dealers', 'order', 'ultramid', 'hp-', 'swc', 'license', 'readme', '__hpgrvs', 'browse')):
            return 2
        return 0
    exes.sort(key=exe_rank)
    return exes[0] if exes else None


GAME_SAVES_URL = 'https://raw.githubusercontent.com/vansiriusxbox360-web/terabox-m3u/main/game-saves'


def _extract_game(file_path, extract_to):
    """Extrae el juego (zip o 7z), sube una unica carpeta raiz, precarga el .sav, y devuelve el .exe."""
    import zipfile as _zf
    import shutil
    try:
        if file_path.lower().endswith('.7z'):
            # usar 7-Zip del sistema
            sevenzip = None
            for cand in [r'C:\Program Files\7-Zip\7z.exe', r'C:\Program Files (x86)\7-Zip\7z.exe']:
                if os.path.exists(cand):
                    sevenzip = cand
                    break
            if not sevenzip:
                log('7-Zip no encontrado para extraer .7z')
                return None
            import subprocess as _sp
            r = _sp.run([sevenzip, 'x', file_path, f'-o{extract_to}', '-y'],
                        capture_output=True, text=True, creationflags=0x08000000)
            if r.returncode != 0:
                log(f'7z error: {r.stderr[:100]}')
                return None
            root_dirs = set()
            for root, dirs, files in os.walk(extract_to):
                root_dirs.add(os.path.relpath(root, extract_to).split(os.sep)[0])
                break
        else:
            with _zf.ZipFile(file_path) as z:
                names = z.namelist()
                z.extractall(extract_to)
            root_dirs = set(n.split('/')[0] for n in names if '/' in n)
        # si hay una unica carpeta raiz, subir su contenido
        if len(root_dirs) == 1 and os.path.isdir(os.path.join(extract_to, next(iter(root_dirs)))):
            inner = os.path.join(extract_to, next(iter(root_dirs)))
            if os.listdir(extract_to) == [next(iter(root_dirs))]:
                for f in os.listdir(inner):
                    shutil.move(os.path.join(inner, f), os.path.join(extract_to, f))
                os.rmdir(inner)
        # precargar el .sav de configuracion desde el repo (evita el setup al usuario)
        base = os.path.basename(os.path.normpath(extract_to))
        _download_game_save(base, extract_to)
        return _find_game_exe(extract_to, game_hint=os.path.basename(file_path))
    except Exception as e:
        log(f'_extract_game error: {e}')
        return None


def _download_game_save(base, game_dir):
    """Descarga el .sav de configuracion del juego desde el repo y lo coloca en la carpeta (si existe)."""
    if not base or not os.path.isdir(game_dir):
        return
    sav_url = f'{GAME_SAVES_URL}/{urllib.parse.quote(base)}.sav'
    try:
        req = urllib.request.Request(sav_url, headers={'User-Agent': 'Kodi-Addon/1.0'})
        resp = urllib.request.urlopen(req, timeout=15)
        data = resp.read()
        if data:
            sav_path = os.path.join(game_dir, f'{base}.sav')
            with open(sav_path, 'wb') as f:
                f.write(data)
            log(f'Save precargado: {base}.sav')
    except urllib.error.HTTPError:
        pass  # no hay .sav para este juego
    except Exception as e:
        log(f'Error descargando save: {e}')


DOSBOX_EXE_CANDIDATES = [
    r'C:\Program Files\GR-lida\DOSBox\DOSBox.exe',
    r'C:\Program Files (x86)\D-Fend Reloaded\DOSBox\DOSBox.exe',
    r'C:\Program Files (x86)\DOSBox\DOSBox.exe',
    r'C:\Program Files\DOSBox\DOSBox.exe',
    r'C:\DOSBox\DOSBox.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\DOSBox\DOSBox.exe'),
]

# Ciclos de CPU por juego (por fragmento del nombre) para los que van lentos
GAME_CYCLES = {
    'realms of chaos': 30000,
    'oscar': 30000,
}


def _find_dosbox_exe():
    """Busca DOSBox.exe: primero el portable incluido en el addon, luego el del sistema."""
    bundled = os.path.join(ADDON_PATH, 'resources', 'dosbox', 'DOSBox.exe')
    if os.path.exists(bundled):
        return bundled
    for c in DOSBOX_EXE_CANDIDATES:
        if os.path.exists(c):
            return c
    # búsqueda por ruta
    try:
        import shutil
        p = shutil.which('dosbox') or shutil.which('DOSBox')
        if p:
            return p
    except Exception:
        pass
    return None


def _launch_game_external(exe_path, param):
    """Lanza DOSBox.exe externo con un .conf que monta y ejecuta el juego. Devuelve True si se lanzó."""
    import subprocess as _sp
    dosbox = _find_dosbox_exe()
    if not dosbox:
        log('DOSBox.exe no encontrado en el sistema')
        return False
    if not exe_path or not os.path.exists(exe_path):
        log(f'Juego no encontrado: {exe_path}')
        return False
    game_dir = os.path.dirname(exe_path)
    mount_root = game_dir
    # Ejecutar directamente el .exe del juego (evitar .BAT con protectores/CD
    # como HOCUSG.BAT que pedían "please run HOCUS to play")
    to_run = os.path.basename(exe_path)
    conf_path = game_dir + '.conf'
    try:
        game_name = (param or '') + ' ' + os.path.basename(game_dir)
        game_name = game_name.lower()
        cycles = next((c for frag, c in GAME_CYCLES.items() if frag in game_name), None)
        conf_lines = ['[sdl]', 'fullscreen=false', '']
        if cycles:
            conf_lines += ['[cpu]', f'cycles={cycles}', '']
        conf_lines += ['[autoexec]', f'mount c {mount_root.replace(chr(92), "/")}', 'c:']
        conf_lines.append(to_run)
        conf_text = '\n'.join(conf_lines) + '\n'
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(conf_text)
        _sp.Popen([dosbox, '-conf', conf_path],
                  stdout=_sp.DEVNULL, stderr=_sp.DEVNULL,
                  creationflags=0x08000000)
        log(f'DOSBox externo lanzado: {to_run} con -conf')
        # dar foco a DOSBox (que se abra encima, sin minimizar Kodi)
        try:
            import ctypes
            time.sleep(1.5)
            hwnd = ctypes.windll.user32.FindWindowW(None, 'DOSBox 0.74, Cpu speed:')
            if not hwnd:
                # ventana sin titulo: buscar por clase
                hwnd = ctypes.windll.user32.FindWindowW(None, 'DOSBox')
            if hwnd:
                ctypes.windll.user32.SetForegroundWindow(hwnd)
                ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        except Exception as e:
            log(f'Error foco DOSBox: {e}')
        return True
    except Exception as e:
        log(f'Error lanzando DOSBox: {e}')
        return False


def play_video(param, start=None, is_game=False):
    """Reproduce refrescando el enlace con el path, o directo si es URL. Los juegos se descargan a local."""
    url = param
    if param and not param.startswith('http'):
        fresh = refresh_link(param)
        if fresh:
            url = fresh
        else:
            xbmcgui.Dialog().notification('VanSirius', 'No se pudo refrescar el enlace', xbmcgui.NOTIFICATION_ERROR)
    if not is_game:
        # Avisar al servicio de seguimiento del path que se va a reproducir (solo videos)
        try:
            now_playing = os.path.join(os.path.dirname(CACHE_FILE), 'now_playing.json')
            name = param.rsplit('/', 1)[-1] if param else ''
            name = re.sub(r'\.(mkv|mp4|avi|wmv|flv|mov|m4v|mpg|mpeg|3gp|webm)$', '', name, flags=re.I)
            with open(now_playing, 'w', encoding='utf-8') as f:
                json.dump({'path': param if param and not param.startswith('http') else '', 'name': name, 'ts': time.time()}, f)
        except Exception as e:
            log(f'Error now_playing: {e}')
    else:
        # Juego: descargar/extraer a local y abrir con DOSBox
        filename = param.rsplit('/', 1)[-1] if param else 'juego.zip'
        local = _download_game(url, filename)
        if local:
            url = local
        else:
            xbmcgui.Dialog().notification('VanSirius', 'No se pudo descargar el juego', xbmcgui.NOTIFICATION_ERROR)
    if is_game:
        # Lanzar el juego con DOSBox externo de Windows (ventana nativa).
        # NO usar setResolvedUrl: Kodi intentaría abrir el .exe con RetroPlayer (savestates).
        # endOfDirectory cierra el spinner sin que Kodi reproduzca nada.
        launched = _launch_game_external(url, param)
        if not launched:
            xbmcgui.Dialog().notification('VanSirius', 'No se pudo lanzar DOSBox', xbmcgui.NOTIFICATION_ERROR)
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return
    li = xbmcgui.ListItem(path=url)
    li.setProperty('IsPlayable', 'true')
    # Reanudar desde donde se quedó (continuar viendo)
    if start and not is_game:
        try:
            start_sec = int(float(start))
            if start_sec > 0:
                li.setProperty('ResumeTime', str(start_sec))
                li.setProperty('resume', 'true')
        except Exception:
            pass
    xbmcplugin.setResolvedUrl(HANDLE, True, li)


FAVORITES_FILE = os.path.join(os.path.dirname(CACHE_FILE), 'favorites.json')


def _load_favorites():
    try:
        with open(FAVORITES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_favorites(fav):
    try:
        os.makedirs(os.path.dirname(FAVORITES_FILE), exist_ok=True)
        with open(FAVORITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(fav, f, ensure_ascii=False, indent=1)
    except Exception as e:
        log(f'Error guardando favoritos: {e}')


def favorite_key(label):
    return label.strip()


def toggle_favorite(label):
    """Añade o quita un elemento de favoritos. Devuelve True si quedó añadido."""
    fav = _load_favorites()
    key = favorite_key(label)
    if key in fav:
        del fav[key]
        _save_favorites(fav)
        xbmcgui.Dialog().notification('VanSirius', f'Quitado de favoritos: {label}', xbmcgui.NOTIFICATION_INFO)
        return False
    fav[key] = {'name': label, 'ts': time.time()}
    _save_favorites(fav)
    xbmcgui.Dialog().notification('VanSirius', f'Añadido a favoritos: {label}', xbmcgui.NOTIFICATION_INFO)
    return True


def is_favorite(label):
    return favorite_key(label) in _load_favorites()


def add_fav_context_menu(li, label):
    """Añade el menú contextual de favoritos a un ListItem."""
    if is_favorite(label):
        li.addContextMenuItems([('Quitar de favoritos', f'RunPlugin({build_url("toggle_fav", label)})')])
    else:
        li.addContextMenuItems([('Añadir a favoritos', f'RunPlugin({build_url("toggle_fav", label)})')])


def list_favorites(data):
    """Lista los favoritos guardados como carpetas enlazadas."""
    fav = _load_favorites()
    if not fav:
        xbmcgui.Dialog().ok('Favoritos', 'No tienes favoritos todavía.\n\n'
                             'Pulsa el menú contextual en un elemento\n'
                             '(tecla C) y elige "Añadir a favoritos".')
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return
    for key in sorted(fav.keys(), key=lambda k: fav[k].get('ts', 0), reverse=True):
        name = fav[key].get('name', key)
        add_listitem(name, build_url('folder', name), ICON, isFolder=True)
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


def toggle_fav_action(label):
    toggle_favorite(label)
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


WATCHED_FILE = os.path.join(os.path.dirname(CACHE_FILE), 'watched.json')


def _load_watched():
    try:
        with open(WATCHED_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def list_continue_watching(data):
    """Lista los capítulos con reproducción a medias (continuar viendo)."""
    watched = _load_watched()
    in_progress = {k: v for k, v in watched.items() if v.get('watched') is not True}
    if not in_progress:
        xbmcgui.Dialog().ok('Continuar viendo', 'No hay reproducciones a medias.\n\n'
                             'Cuando detengas un capítulo antes del final\n'
                             'aparecerá aquí para continuar desde donde lo dejaste.')
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return

    # Construir árbol para resolver los paths a carpetas
    tree = build_tree(data)

    def find_group(path):
        parts = [p.strip() for p in path.split('/') if p.strip()]
        node = tree
        for part in parts[:-1]:
            node = node.get(part, {})
        if not isinstance(node, dict):
            return None
        for g in node.get('_groups', []):
            for s in g.get('stations', []):
                if s.get('path') == path:
                    return g, s
        return None

    for path in sorted(in_progress.keys(), key=lambda p: in_progress[p].get('ts', 0), reverse=True):
        info = in_progress[path]
        name = info.get('name', path.split('/')[-1])
        pos = int(info.get('pos', 0))
        total = int(info.get('total', 0))
        res = find_group(path)
        icon = ICON
        label = name
        if res:
            g, s = res
            icon = s.get('image') or g.get('image') or ICON
        if total > 0:
            label = f'{name}  ⏱ {pos // 60}:{pos % 60:02d} / {total // 60}:{total % 60:02d}'
        url = build_url('play', path, start=str(int(pos)))
        li = xbmcgui.ListItem(label)
        li.setArt({'icon': icon, 'thumb': icon, 'fanart': FANART})
        li.setProperty('IsPlayable', 'true')
        li.setInfo('video', {'title': name})
        xbmcplugin.addDirectoryItem(handle=HANDLE, url=url, listitem=li, isFolder=False)
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


def trigger_workflow(data):
    if not xbmcgui.Dialog().yesno(
        'Forzar regeneración',
        '¿Lanzar regeneración remota en\nGitHub ahora?\n\n'
        'Tarda ~12 min en completarse.\nLos enlaces nuevos llegarán\ncon la próxima actualización\ndel addon (cada 6h).',
        yeslabel='Sí, lanzar',
        nolabel='No'
    ):
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
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
            xbmcgui.Dialog().ok('Hecho', 'Regeneración lanzada en GitHub.\n\nEspera ~12 min y entra al addon\npara recibir los datos nuevos.')
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
    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


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

    # play no necesita el índice completo: solo resuelve el enlace con el path que ya viene en la URL
    if action == 'play':
        t0 = time.time()
        start = params.get('start')
        is_game = params.get('game') == '1'
        play_video(path, start=start, is_game=is_game)
        log(f'Play resuelto en {time.time()-t0:.2f}s (tiempo del addon)', xbmc.LOGINFO)
        return

    if action == 'toggle_fav':
        toggle_fav_action(path)
        return

    data = get_json(force_download=force)
    if not data:
        log('No hay datos, saliendo', xbmc.LOGERROR)
        return

    log(f'Action: {action}, Path: "{path}"')
    # La sección de juegos (vicio) usa content type 'games' para que Kodi lo abra con RetroPlayer
    if action == 'folder' and path.strip().lower().split('/')[0] == 'vicio':
        xbmcplugin.setContent(HANDLE, 'games')
    else:
        xbmcplugin.setContent(HANDLE, 'tvshows')

    if action == 'root':
        list_root(data)
    elif action == 'folder':
        list_folder(data, path)
    elif action == 'favorites':
        list_favorites(data)
    elif action == 'continue_watching':
        list_continue_watching(data)
    elif action == 'search':
        list_search(data)
        return
    elif action == 'random':
        play_random(data)
        return
    elif action == 'utiles':
        list_utiles(data)
        return
    elif action == 'settings':
        ADDON.openSettings()
        return
    elif action == 'settings_utiles':
        ADDON.openSettings()
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return
    elif action == 'updated':
        updated = data.get('_last_updated_display') or data.get('_last_updated', '')
        if updated:
            xbmcgui.Dialog().ok(
                'Actualizado',
                f'Última actualización: {updated}\n\n'
                'GitHub Actions regenera el JSON\n'
                'automáticamente cada 8 horas.\n\n'
'Los enlaces tardan ~12 min\n'
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
                xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
                return
            elif opcion == 1:
                os.remove(advanced_xml)
                xbmcgui.Dialog().ok('Hecho', 'advancedsettings.xml eliminado.\nCaché por defecto restaurada.\n\nReinicia Kodi para aplicar.')
                xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
                return
            xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
            return
        else:
            if xbmcgui.Dialog().yesno(
                'Caché optimizado',
                '¿Activar caché de 256 MB para\nmejorar el streaming?\n\n'
                'Reduce cortes y buffering.\nSe creará advancedsettings.xml.\n\n'
                '¿Continuar?',
                yeslabel='Sí, activar',
                nolabel='No'
            ):
                contenido = f'''<advancedsettings>
  <cache>
    <buffermode>1</buffermode>
    <memorysize>{CACHE_SIZE_BYTES}</memorysize>
    <cachemembuffersize>{CACHE_SIZE_BYTES}</cachemembuffersize>
    <readfactor>20</readfactor>
  </cache>
</advancedsettings>'''
                try:
                    with open(advanced_xml, 'w', encoding='utf-8') as f:
                        f.write(contenido)
                    xbmcgui.Dialog().ok('Hecho', 'advancedsettings.xml creado con\ncaché de 256 MB optimizado.\n\nReinicia Kodi para aplicar.')
                except Exception as e:
                    xbmcgui.Dialog().ok('Error', f'No se pudo escribir:\n{e}')
            xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
            return
        xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)
        return

    xbmcplugin.endOfDirectory(HANDLE, cacheToDisc=False)


if __name__ == '__main__':
    try:
        t_start = time.time()
        paramstring = sys.argv[2] if len(sys.argv) > 2 else ''
        router(paramstring)
        log(f'Addon total: {time.time()-t_start:.2f}s', xbmc.LOGINFO)
    except Exception as e:
        log(f'Error: {e}\n{traceback.format_exc()}', xbmc.LOGERROR)
