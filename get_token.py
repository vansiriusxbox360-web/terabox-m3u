# get_token.py - Extrae la cookie ndus de Terabox del navegador (Firefox/Chrome/Edge)
# Uso: python get_token.py
# Salida: escribe el token en token.txt y lo imprime en stdout
import sqlite3
import os
import sys
import glob

TERABOX_HOST = '.terabox.com'
COOKIE_NAME = 'ndus'
OUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'token.txt')


def find_firefox_cookies():
    base = os.path.join(os.environ.get('APPDATA', ''), 'Mozilla', 'Firefox', 'Profiles')
    if not os.path.isdir(base):
        return []
    return glob.glob(os.path.join(base, '**', 'cookies.sqlite'), recursive=True)


def read_sqlite_cookie(db_path, host, name):
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=5)
        cur = conn.cursor()
        cur.execute("SELECT value FROM moz_cookies WHERE name=? AND host LIKE ?",
                    (name, '%' + host))
        row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def main():
    token = None
    for db in find_firefox_cookies():
        token = read_sqlite_cookie(db, TERABOX_HOST, COOKIE_NAME)
        if token:
            break
    if not token:
        print('ERROR: No se encontro la cookie ndus en Firefox. Abre terabox.com en Firefox con la sesion iniciada y vuelve a intentar.', file=sys.stderr)
        return 1
    # escribir con utf-8 puro, sin BOM
    with open(OUT_FILE, 'w', encoding='utf-8', newline='') as f:
        f.write(token.strip())
    sys.stdout.write(token.strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
