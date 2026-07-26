# Bookmarklet - Extraer ndus de Terabox

## Cómo usar

1. Abre Firefox y ve a **terabox.com** (inicia sesión si no lo has hecho)
2. Haz clic derecho en la barra de marcadores → **Añadir marca**
3. En "Nombre" pon: ` extraer-ndus `
4. En "URL" pega el siguiente código:

```
javascript:void(function(){var c=document.cookie.split(';');for(var i=0;i<c.length;i++){var t=c[i].trim();if(t.startsWith('ndus=')){var v=t.substring(5);navigator.clipboard.writeText(v).then(function(){alert('✅ ndus copiado al portapapeles!\n\nValor: '+v.substring(0,30)+'...\n\nPega en GitHub → Settings → Secrets → TERABOX_NDUS')});return}}alert('❌ Cookie ndus no encontrada.\n\nAsegurate de estar en terabox.com\ny haber iniciado sesion.')})()
```

5. Guarda el marcador

## Cuando necesites refrescar el token

1. Ve a **terabox.com** (asegúrate de tener sesión iniciada)
2. Haz clic en el marcador ` extraer-ndus `
3. Se copiará el token al portapapeles
4. Pégalo en GitHub → Settings → Secrets → `TERABOX_NDUS`

## Si el bookmarklet no funciona

Es probable que la cookie sea **HttpOnly** (no accesible por JavaScript). En ese caso usa el método manual:

1. Ve a **terabox.com** y abre **DevTools** (F12)
2. Ve a la pestaña **Application** (o **Almacenamiento**)
3. En el menú lateral, expande **Cookies** → `https://www.terabox.com`
4. Busca la cookie llamada **ndus**
5. Copia su valor
6. Pégalo en GitHub → Settings → Secrets → `TERABOX_NDUS`

**Nota:** La pestaña **Storage** de DevTools está bloqueada por Terabox. Usa solo **Application** o **Network**.
