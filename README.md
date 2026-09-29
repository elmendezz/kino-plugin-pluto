# FAST TV Plugin para Kino (Pluto TV, Samsung TV Plus, Roku TV, Tubi, Plex)

Plugin de canales FAST (*Free Ad-supported Streaming Television*) libres en vivo para la aplicación Kino. Integra **Pluto TV**, **Samsung TV Plus**, **Roku TV**, **Tubi TV** y **Plex TV** con stream directo y re-búsqueda activa ante errores 401 (No autorizado) o 403 (Prohibido/Token expirado).

## Características

- **Proveedores FAST incluidos**:
  - **Pluto TV Oficial**: Conexión a la API con más de 200 canales en vivo, con token JWT pre-generado, logos en alta resolución, números y sinopsis.
  - **Samsung TV Plus**: Emisiones en vivo por regiones (España, México/LATAM, EE.UU., UK).
  - **Roku TV**: Canales de transmisión libre de The Roku Channel.
  - **Tubi TV**: Gran catálogo de canales FAST temáticos y de noticias locales.
  - **Plex TV**: Canales en vivo gratuitos de la plataforma Plex.
- **Objeto `stream` poblado y reproducción instantánea**:
  - Cada canal incluye su propio objeto `stream: { url, expiresInSeconds: 300 }` para que Kino inicie la reproducción de inmediato sin retrasos ni `stream: null`.
  - Incluye `ref` como mecanismo de respaldo permanente.
- **Re-búsqueda y Renovación ante 401 / 403**:
  - Si un canal responde 401 o 403 (sesión o enlace caducado), Kino recurre automáticamente a `resolve(ref)`.
  - Para Pluto TV: Regenera una sesión limpia con UUID fresco y nuevo token JWT.
  - Para Samsung, Roku, Tubi y Plex: Invalida la caché y consulta la lista actualizada en tiempo real.
- **Pestaña "En vivo" (API v3 `channels`)**:
  - Categorías por proveedor (*Pluto TV, Samsung TV+, Roku TV, Tubi TV, Plex TV*).
  - Categorías temáticas (*Cine, Noticias, Entretenimiento, Infantil, Deportes*).
- **Pantalla Home y Búsqueda**: Filas en Inicio con badge "EN VIVO" y buscador rápido.
- **Ajustes de usuario**:
  - Filtro por región (España, México/LATAM, EE.UU., Todas).
  - Filtro por plataforma (Todas, Pluto, Samsung, Roku, Tubi, Plex).

## Instalación en Kino

En Kino ve a **Ajustes > Plugins** y agrega:

```
elmendezz/kino-plugin-pluto
```

## Pruebas y validación

```bash
# Validar contrato
node sdk/validate.mjs .

# Categorías
node sdk/run.mjs . liveCategories

# Canales por proveedor (ahora con stream directo)
node sdk/run.mjs . liveChannels pluto
node sdk/run.mjs . liveChannels samsung
node sdk/run.mjs . liveChannels roku
node sdk/run.mjs . liveChannels tubi
node sdk/run.mjs . liveChannels plex
```
