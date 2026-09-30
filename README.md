# Mendezino TV (Pluto TV, Samsung TV Plus, Roku TV)

Plugin de canales FAST (*Free Ad-supported Streaming Television*) libres en vivo para la aplicación Kino. Integra **Pluto TV** (con soporte oficial para las listas de BuddyChewChew por países), **Samsung TV Plus** y **Roku TV** con stream directo y re-búsqueda activa ante errores 401 (No autorizado) o 403 (Prohibido/Token expirado).

## Listas de Pluto TV integradas (BuddyChewChew)

El plugin lee y actualiza automáticamente los canales desde las listas oficiales de Pluto TV:
- 🌍 **Todas las regiones**: Carga agregada de canales libres.
- 🇪🇸 **España**: `pluto_es.m3u`
- 🇲🇽 **México**: `pluto_mx.m3u`
- 🇺🇸 **Estados Unidos**: `pluto_us.m3u`
- 🇦🇷 **Argentina**: `pluto_ar.m3u`
- 🇨🇱 **Chile**: `pluto_cl.m3u`
- 🇧🇷 **Brasil**: `pluto_br.m3u`
- 🇨🇦 **Canadá**: `pluto_ca.m3u`
- 🇬🇧 **Reino Unido**: `pluto_gb.m3u`
- 🇫🇷 **Francia**: `pluto_fr.m3u`
- 🇩🇪 **Alemania**: `pluto_de.m3u`
- 🇮🇹 **Italia**: `pluto_it.m3u`
- 🇳🇴 **Noruega**: `pluto_no.m3u`
- 🇸🇪 **Suecia**: `pluto_se.m3u`
- 🇩🇰 **Dinamarca**: `pluto_dk.m3u`

## Características y Auto-renovación ante 401 / 403

1. **Tokens JWT en listas estáticas**:
   Las listas M3U estáticas incluyen tokens de sesión (`jwt=...`) que expiran al poco tiempo provocando errores **401** o **403**.
2. **Re-búsqueda y generación dinámica**:
   El plugin extrae el identificador del canal (`channelId`) y, al resolverse o al detectar un error 401/403, solicita de inmediato un nuevo token de sesión a `boot.pluto.tv` con un nuevo identificador UUID.
3. **Reproducción directa sin `stream: null`**:
   Cada canal se entrega con su objeto `stream: { url, expiresInSeconds: 300 }` para que la app inicie el vídeo al instante.

## Instalación en Kino

En Kino ve a **Ajustes > Plugins** y agrega:

```
elmendezz/kino-plugin-pluto
```

Tambien puedes instalarlo mediante la tienda comunitaria de Kino Plugins como: "Mendezino TV" 
