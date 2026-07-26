# Cómo refrescar el token de Terabox

El token `ndus` es lo que le da acceso a tu cuenta de Terabox. Cuando caduque, el script dejará de funcionar y recibirás un email de GitHub notificándote el fallo.

## Método rápido: Bookmarklet (recomendado)

Sigue las instrucciones en [bookmarklet.md](bookmarklet.md) para configurar un marcador que copia el token al portapapeles con un solo clic.

## Método manual: DevTools

1. Abre **Firefox** y ve a [terabox.com](https://www.terabox.com)
2. Inicia sesión si no lo has hecho
3. Abre las **DevTools** (F12)
4. Ve a la pestaña **Application** (o **Almacenamiento**)
5. En el menú lateral izquierdo, expande **Cookies** → `https://www.terabox.com`
6. Busca la cookie llamada **ndus**
7. Haz clic en su valor y cópialo (Ctrl+C)
8. Ve a tu repositorio en GitHub
9. Ve a **Settings** → **Secrets and variables** → **Actions**
10. Busca **TERABOX_NDUS**, haz clic en **Edit**
11. Pega el nuevo valor (Ctrl+V) y haz clic en **Update secret**

**Importante:** La pestaña **Storage** de DevTools está bloqueada por Terabox. Usa solo **Application** o **Network**.

## Método alternativo: Script PowerShell

Si tienes el repositorio clonado localmente:

```powershell
.\get-ndus.ps1
```

Esto copiará el token al portapapeles. Luego pégalo en GitHub.

## ¿Cada cuánto caduca?

Los tokens `ndus` suelen durar **varias semanas o meses**. No es algo que pase frecuentemente.

## ¿Cómo sé si caducó?

- El workflow de GitHub Actions fallará
- Recibirás un email de GitHub notificándote el fallo
- Si miras los logs, verás un error de autenticación

## ¿Puedo evitar que caduque?

No. Terabox controla la duración del token. Lo único que puedes hacer es:
1. Mantener la sesión activa en Terabox (iniciar periódicamente)
2. Cuando caduque, seguir estos pasos para refrescarlo
