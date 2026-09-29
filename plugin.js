// FAST TV Plugin for Kino (Pluto TV, Samsung TV Plus, Roku TV)
// Canales libres en vivo con listas BuddyChewChew y re-búsqueda activa ante errores 403 / 401.
/// <reference path="./kino.d.ts" />

const PLUTO_CHANNELS_API = "https://api.pluto.tv/v2/channels";
const PLUTO_BOOT_API = "https://boot.pluto.tv/v4/start";

// Listas M3U directas de Pluto TV por país
const PLUTO_SOURCES = {
  us: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_us.m3u",
  ca: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_ca.m3u",
  gb: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_gb.m3u",
  fr: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_fr.m3u",
  de: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_de.m3u",
  es: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_es.m3u",
  it: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_it.m3u",
  mx: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_mx.m3u",
  br: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_br.m3u",
  ar: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_ar.m3u",
  cl: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_cl.m3u",
  no: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_no.m3u",
  se: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_se.m3u",
  dk: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_dk.m3u",
};

const SAMSUNG_SOURCES = {
  es: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es_samsung.m3u",
  mx: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/mx_samsung.m3u",
  us: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_samsung.m3u",
  uk: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk_samsung.m3u",
  ca: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca_samsung.m3u",
  it: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/it_samsung.m3u",
  fr: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/fr_samsung.m3u",
  de: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/de_samsung.m3u",
};

const ROKU_SOURCES = {
  us: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_roku.m3u",
};

const LOGO_FALLBACKS = {
  pluto: "https://images.pluto.tv/channels/5dcb62e63d4d8f0009f36881/colorLogoPNG_1760378798093.png",
  samsung: "https://tvpnlogopus.samsungcloud.tv/platform/image/sourcelogo/vc/00/02/34/US2400013TO_20260929T044439SQUARE.png",
  roku: "https://raw.githubusercontent.com/iptv-org/iptv/master/images/roku.png",
};

const PROVIDER_NAMES = {
  pluto: "Pluto TV",
  samsung: "Samsung TV+",
  roku: "Roku TV",
};

// IDs conformes a contrato: ^[A-Za-z0-9._~-]{1,128}$
function cleanId(raw) {
  return String(raw || "chan")
    .replace(/[^A-Za-z0-9._~-]/g, "_")
    .slice(0, 120);
}

// In-memory cache
let memoryChannels = null;
let memoryChannelsTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 mins

// ----------------- PLUTO TV BOOT & SESSION -----------------

async function fetchPlutoBoot(forceNew = false) {
  const cacheKey = "pluto_boot_data";
  if (!forceNew) {
    try {
      const cached = kino.storage.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.stitcher && parsed.sessionToken) {
          return parsed;
        }
      }
    } catch {
      // Ignorar error de storage
    }
  }

  const clientId = kino.crypto.uuid();
  const url =
    PLUTO_BOOT_API +
    "?appName=web&appVersion=7.9.0&deviceVersion=120.0&deviceModel=web&deviceMake=Chrome&deviceType=web&clientID=" +
    clientId +
    "&clientModelNumber=1.0.0";

  const res = await kino.fetch(url);
  if (!res.ok) {
    throw kino.error("unavailable", "Pluto TV no responde (status " + res.status + ")");
  }

  const data = res.json();
  const stitcher = data.servers && data.servers.stitcher ? data.servers.stitcher : "https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv";
  const sessionToken = data.sessionToken || "";
  const stitcherParams = data.stitcherParams || "";

  const sessionObj = {
    stitcher,
    sessionToken,
    stitcherParams,
    clientId,
    createdAt: Date.now(),
  };

  try {
    kino.storage.set(cacheKey, JSON.stringify(sessionObj), { ttlMs: 1800000 });
  } catch {
    // Ignorar si storage está lleno
  }

  return sessionObj;
}

function buildPlutoUrl(session, channelId) {
  let url = session.stitcher + "/stitch/hls/channel/" + encodeURIComponent(channelId) + "/master.m3u8";
  const params = [];
  if (session.stitcherParams) params.push(session.stitcherParams);
  if (session.sessionToken) params.push("jwt=" + encodeURIComponent(session.sessionToken));
  if (params.length > 0) url += "?" + params.join("&");
  return url;
}

// ----------------- PLAYLIST PARSERS -----------------

function parseM3u(text, provider) {
  const lines = text.split(/\r\n|\n|\r/);
  const result = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.toUpperCase().startsWith("#EXTINF:")) {
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(",");
      const rawTitle = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : provider;

      current = {
        tvgId: idMatch ? idMatch[1] : "",
        logo: logoMatch ? logoMatch[1] : "",
        group: groupMatch ? groupMatch[1] : "General",
        title: rawTitle.replace(/\s*\(\d+p\)/gi, "").replace(/\s*\[Geo-blocked\]/gi, "").trim(),
      };
    } else if (!line.startsWith("#") && current) {
      if (line.startsWith("http://") || line.startsWith("https://")) {
        // En listas de Pluto (BuddyChewChew), extraer el ID real de canal del URL o de tvg-id
        let channelId = current.tvgId;
        const chanMatch = line.match(/\/channel\/([a-f0-9]{24})/i);
        if (chanMatch) channelId = chanMatch[1];

        result.push({
          id: cleanId(provider + "_" + (channelId || current.title)),
          channelId: channelId || undefined,
          title: current.title,
          logo: current.logo || LOGO_FALLBACKS[provider] || "",
          group: current.group,
          url: line,
          provider,
        });
      }
      current = null;
    }
  }
  return result;
}

// ----------------- CHANNEL FETCHING & AGGREGATION -----------------

async function loadPlutoChannels(preferredRegion = "all") {
  // Determinar qué archivos descargar de BuddyChewChew según la región configurada
  let urls = [];
  if (preferredRegion !== "all" && PLUTO_SOURCES[preferredRegion]) {
    urls = [PLUTO_SOURCES[preferredRegion]];
  } else {
    // Si es "all", cargamos las principales regiones en español e inglés respetando el límite de 5 MB de fetch
    urls = [PLUTO_SOURCES.es, PLUTO_SOURCES.mx, PLUTO_SOURCES.us, PLUTO_SOURCES.ar, PLUTO_SOURCES.cl];
  }

  const allChannels = [];
  for (const u of urls) {
    try {
      const res = await kino.fetch(u);
      if (res.ok) {
        const text = res.text();
        const parsed = parseM3u(text, "pluto");
        allChannels.push(...parsed);
      }
    } catch (e) {
      kino.log("Error descargando lista Pluto:", u, e.message);
    }
  }

  // Si fallara GitHub, usar como respaldo la API directa de Pluto TV
  if (allChannels.length === 0) {
    try {
      const res = await kino.fetch(PLUTO_CHANNELS_API);
      if (res.ok) {
        const list = res.json();
        if (Array.isArray(list)) {
          allChannels.push(
            ...list
              .filter((c) => c && c._id && c.name)
              .map((c) => ({
                id: cleanId("pluto_" + c._id),
                channelId: c._id,
                title: String(c.name).trim(),
                number: Number.isInteger(c.number) && c.number > 0 ? c.number : undefined,
                group: c.category || "General",
                logo: (c.colorLogoPNG && c.colorLogoPNG.path) || LOGO_FALLBACKS.pluto,
                provider: "pluto",
              }))
          );
        }
      }
    } catch (e) {
      kino.log("Error en Pluto API fallback:", e.message);
    }
  }

  // Deduplicar por título
  const seen = new Set();
  const deduped = [];
  for (const c of allChannels) {
    const key = (c.channelId || c.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

async function loadPlaylistChannels(provider, sources, preferredRegion = "all") {
  let urls = [];
  if (preferredRegion !== "all" && sources[preferredRegion]) {
    urls = [sources[preferredRegion]];
  } else {
    urls = Object.values(sources);
  }

  const allChannels = [];
  for (const u of urls) {
    try {
      const res = await kino.fetch(u);
      if (res.ok) {
        const text = res.text();
        const parsed = parseM3u(text, provider);
        allChannels.push(...parsed);
      }
    } catch (e) {
      kino.log("Error descargando lista", provider, u, e.message);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const c of allChannels) {
    const key = c.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

async function getAllChannels(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && memoryChannels && now - memoryChannelsTimestamp < CACHE_TTL_MS) {
    return memoryChannels;
  }

  const region = String(kino.config.get("region") || "all");
  const platform = String(kino.config.get("platform") || "all");

  const tasks = [];
  if (platform === "all" || platform === "pluto") {
    tasks.push(loadPlutoChannels(region));
  }
  if (platform === "all" || platform === "samsung") {
    tasks.push(loadPlaylistChannels("samsung", SAMSUNG_SOURCES, region));
  }
  if (platform === "all" || platform === "roku") {
    tasks.push(loadPlaylistChannels("roku", ROKU_SOURCES, region));
  }

  const results = await Promise.all(tasks);
  const channels = results.flat();

  memoryChannels = channels;
  memoryChannelsTimestamp = now;
  return channels;
}

function channelToItem(c) {
  let ref = "";
  if (c.provider === "pluto") {
    ref = "pluto|" + (c.channelId || c.id) + "|" + encodeURIComponent(c.url || "");
  } else {
    ref = c.provider + "|" + c.id + "|" + encodeURIComponent(c.url || "");
  }

  const providerName = PROVIDER_NAMES[c.provider] || c.provider;

  return {
    id: c.id,
    ref,
    title: c.title,
    kind: "live",
    poster: c.logo || undefined,
    backdrop: c.backdrop || undefined,
    overview: c.summary || ("Canal en vivo de " + providerName),
    badges: [providerName || "FAST"],
  };
}

// ----------------- KINO EXPORTS -----------------

// 1. Live Categories para pestaña "En vivo"
export async function liveCategories() {
  await null;
  return [
    { id: "all", title: "Todos los Canales" },
    { id: "pluto", title: "Pluto TV" },
    { id: "samsung", title: "Samsung TV Plus" },
    { id: "roku", title: "Roku TV" },
    { id: "cine", title: "Cine y Películas" },
    { id: "noticias", title: "Noticias" },
    { id: "entretenimiento", title: "Entretenimiento y Series" },
    { id: "infantil", title: "Infantil y Animación" },
    { id: "deportes", title: "Deportes" },
  ];
}

// 2. Canales para una categoría en vivo (con stream directo + ref de respaldo)
export async function liveChannels({ categoryId, cursor }) {
  await null;
  const channels = await getAllChannels();
  const cat = String(categoryId || "all").toLowerCase();

  let filtered = channels;
  if (cat === "pluto") {
    filtered = channels.filter((c) => c.provider === "pluto");
  } else if (cat === "samsung") {
    filtered = channels.filter((c) => c.provider === "samsung");
  } else if (cat === "roku") {
    filtered = channels.filter((c) => c.provider === "roku");
  } else if (cat === "cine") {
    filtered = channels.filter((c) => /cine|película|movie|film|cinema/i.test(c.group + " " + c.title));
  } else if (cat === "noticias") {
    filtered = channels.filter((c) => /noticia|news|info|weather|clima/i.test(c.group + " " + c.title));
  } else if (cat === "entretenimiento") {
    filtered = channels.filter((c) => /entretenimiento|series|drama|comedia|reality/i.test(c.group + " " + c.title));
  } else if (cat === "infantil") {
    filtered = channels.filter((c) => /infantil|kids|dibujos|anime|junior/i.test(c.group + " " + c.title));
  } else if (cat === "deportes") {
    filtered = channels.filter((c) => /deporte|sport|futbol|fight|racing|wrestling/i.test(c.group + " " + c.title));
  }

  const page = cursor ? parseInt(cursor, 10) : 1;
  const pageSize = 100;
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  // Precargar boot de Pluto para generar URLs con tokens activos de inmediato
  let plutoBoot = null;
  if (slice.some((c) => c.provider === "pluto")) {
    try {
      plutoBoot = await fetchPlutoBoot(false);
    } catch {
      // Ignorar si falla precarga; se resolverá bajo demanda
    }
  }

  const items = slice.map((c) => {
    let ref = "";
    let stream = null;

    if (c.provider === "pluto") {
      ref = "pluto|" + (c.channelId || c.id) + "|" + encodeURIComponent(c.url || "");
      // Si tenemos boot activo y channelId, creamos un stream con JWT renovado
      if (plutoBoot && c.channelId) {
        stream = {
          url: buildPlutoUrl(plutoBoot, c.channelId),
          expiresInSeconds: 300,
        };
      } else if (c.url) {
        stream = {
          url: c.url,
          expiresInSeconds: 300,
        };
      }
    } else {
      ref = c.provider + "|" + c.id + "|" + encodeURIComponent(c.url || "");
      if (c.url) {
        stream = {
          url: c.url,
          expiresInSeconds: 300,
        };
      }
    }

    return {
      id: c.id,
      title: c.title,
      ref,
      stream,
      logo: c.logo || undefined,
      number: c.number || undefined,
      categoryId: cat,
    };
  });

  const next = start + pageSize < filtered.length ? String(page + 1) : null;
  return { items, next };
}

// 3. Filas de la pantalla Home
export async function home() {
  await null;
  const channels = await getAllChannels();

  const plutoSample = channels.filter((c) => c.provider === "pluto").slice(0, 30);
  const samsungSample = channels.filter((c) => c.provider === "samsung").slice(0, 30);
  const rokuSample = channels.filter((c) => c.provider === "roku").slice(0, 30);
  const newsSample = channels.filter((c) => /noticia|news|clima/i.test(c.group + " " + c.title)).slice(0, 30);

  const rows = [];
  if (plutoSample.length > 0) {
    rows.push({
      id: "pluto_featured",
      ref: "pluto_featured",
      title: "Pluto TV Canales en Vivo",
      items: plutoSample.map(channelToItem),
    });
  }
  if (samsungSample.length > 0) {
    rows.push({
      id: "samsung_featured",
      ref: "samsung_featured",
      title: "Samsung TV Plus",
      items: samsungSample.map(channelToItem),
    });
  }
  if (rokuSample.length > 0) {
    rows.push({
      id: "roku_featured",
      ref: "roku_featured",
      title: "Roku TV Canales Libres",
      items: rokuSample.map(channelToItem),
    });
  }
  if (newsSample.length > 0) {
    rows.push({
      id: "news_live",
      ref: "news_live",
      title: "Noticias en Vivo",
      items: newsSample.map(channelToItem),
    });
  }

  return rows;
}

// 4. "Ver más" en filas Home
export async function browse(ref, cursor) {
  await null;
  const channels = await getAllChannels();
  let filtered = [];

  if (ref === "pluto_featured") {
    filtered = channels.filter((c) => c.provider === "pluto");
  } else if (ref === "samsung_featured") {
    filtered = channels.filter((c) => c.provider === "samsung");
  } else if (ref === "roku_featured") {
    filtered = channels.filter((c) => c.provider === "roku");
  } else if (ref === "news_live") {
    filtered = channels.filter((c) => /noticia|news|clima/i.test(c.group + " " + c.title));
  } else {
    filtered = channels;
  }

  const page = cursor ? parseInt(cursor, 10) : 1;
  const pageSize = 50;
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  const items = slice.map(channelToItem);
  const next = start + pageSize < filtered.length ? String(page + 1) : undefined;
  return { items, next };
}

// 5. Búsqueda de canales
export async function search(query) {
  await null;
  const q = String(query.q || "").trim();
  if (!q) return [];

  const channels = await getAllChannels();
  const relevant = kino.rank.filterRelevant(channels, q, (c) => c.title);
  const sorted = kino.rank.sortBySimilarity(relevant.length > 0 ? relevant : channels, q, (c) => c.title);

  return sorted.slice(0, 40).map(channelToItem);
}

// 6. Resolución de streaming con auto-renovación ante 401 / 403 ("re busque")
export async function resolve(ref) {
  await null;
  if (!ref || typeof ref !== "string") {
    throw kino.error("not_found", "Referencia de canal inválida");
  }

  const parts = ref.split("|");
  const provider = parts[0];

  // Caso A: Pluto TV
  if (provider === "pluto") {
    const channelId = parts[1];
    const initialUrl = parts[2] ? decodeURIComponent(parts[2]) : "";

    // Siempre intentamos obtener una sesión activa con JWT fresco
    let session = await fetchPlutoBoot(false);
    let streamUrl = channelId ? buildPlutoUrl(session, channelId) : initialUrl;

    // Verificar si el stream responde 401 o 403 (token JWT expirado en la lista M3U estática)
    try {
      const probe = await kino.fetch(streamUrl, { method: "GET", headers: { Range: "bytes=0-100" }, timeoutMs: 3500 });
      if (probe.status === 401 || probe.status === 403) {
        kino.log("[Pluto TV] Token expirado (" + probe.status + "). Re-buscando y generando sesión limpia con JWT nuevo...");
        session = await fetchPlutoBoot(true); // Forzar nuevo boot y nuevo JWT
        if (channelId) streamUrl = buildPlutoUrl(session, channelId);
      }
    } catch (e) {
      kino.log("[Pluto TV] Probe notice:", e.message);
    }

    return {
      url: streamUrl,
      // 300 s (5 min): si el token vence o la reproducción falla, Kino vuelve a llamar resolve() automáticamente
      expiresInSeconds: 300,
    };
  }

  // Caso B: Samsung TV Plus o Roku TV (M3U streams)
  if (provider === "samsung" || provider === "roku") {
    const chanId = parts[1];
    let streamUrl = decodeURIComponent(parts[2] || "");

    if (!streamUrl) {
      throw kino.error("not_found", "URL de transmisión no disponible");
    }

    // Verificar si responde 401 o 403 (token de CDN vencido o geo-bloqueo)
    try {
      const probe = await kino.fetch(streamUrl, { method: "HEAD", timeoutMs: 3500 });
      if (probe.status === 401 || probe.status === 403 || probe.status === 404) {
        kino.log("[" + provider + "] Error " + probe.status + " en enlace. Re-buscando en lista actualizada...");

        // Re-buscar en la lista fresca del repositorio
        const freshChannels = await getAllChannels(true);
        const match = freshChannels.find((c) => c.id === chanId || c.title.toLowerCase().includes(chanId.toLowerCase()));

        if (match && match.url && match.url !== streamUrl) {
          kino.log("[" + provider + "] Nueva URL encontrada tras re-búsqueda:", match.url);
          streamUrl = match.url;
        }
      }
    } catch (e) {
      kino.log("[" + provider + "] Probe notice:", e.message);
    }

    return {
      url: streamUrl,
      expiresInSeconds: 300,
    };
  }

  // Fallback si es URL directa
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return {
      url: ref,
      expiresInSeconds: 300,
    };
  }

  throw kino.error("not_found", "Proveedor no reconocido: " + provider);
}
