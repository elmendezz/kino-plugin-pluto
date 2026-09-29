// FAST TV Plugin for Kino (Pluto TV, Samsung TV Plus, Roku TV)
// Usa KinoPlaylist para que Kino descargue las M3U directamente.
// resolve() firma tokens de sesion de Pluto TV para evitar "where-to-watch".
/// <reference path="./kino.d.ts" />

const PLUTO_BOOT_API = "https://boot.pluto.tv/v4/start";

// M3Us regionales de Pluto TV (BuddyChewChew)
const PLUTO_M3U_URLS = {
  all: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_us.m3u",
  us:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_us.m3u",
  ca:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_ca.m3u",
  gb:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_gb.m3u",
  fr:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_fr.m3u",
  de:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_de.m3u",
  es:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_es.m3u",
  it:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_it.m3u",
  mx:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_mx.m3u",
  br:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_br.m3u",
  ar:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_ar.m3u",
  cl:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_cl.m3u",
  no:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_no.m3u",
  se:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_se.m3u",
  dk:  "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_dk.m3u",
};

// EPG de Pluto TV por region (i.mjh.nz esta en hosts)
const PLUTO_EPG = {
  us: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/us.xml.gz",
  ca: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/ca.xml.gz",
  gb: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/gb.xml.gz",
  de: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/de.xml.gz",
  es: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/es.xml.gz",
  mx: "https://github.com/matthuisman/i.mjh.nz/raw/master/PlutoTV/mx.xml.gz",
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

// ----------------- PLUTO TV BOOT & SESSION -----------------

async function fetchPlutoBoot(forceNew) {
  const cacheKey = "pluto_boot_v2";
  if (!forceNew) {
    try {
      const cached = kino.storage.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.stitcher && parsed.sessionToken) return parsed;
      }
    } catch { /* ignorar */ }
  }

  const clientId = kino.crypto.uuid();
  const url = PLUTO_BOOT_API +
    "?appName=web&appVersion=8.1.0&deviceVersion=133.0.0" +
    "&deviceModel=web&deviceMake=chrome&deviceType=web" +
    "&clientID=" + clientId + "&clientModelNumber=1.0.0";

  const res = await kino.fetch(url);
  if (!res.ok) throw kino.error("unavailable", "Boot Pluto TV fallo: " + res.status);

  const data = res.json(); // SINCRONO en Kino SDK
  const stitcher = (data.servers && data.servers.stitcher)
    ? data.servers.stitcher
    : "https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv";
  const sessionToken = data.sessionToken || "";
  const stitcherParams = data.stitcherParams || "";

  const obj = { stitcher, sessionToken, stitcherParams, clientId };
  try { kino.storage.set(cacheKey, JSON.stringify(obj), { ttlMs: 1800000 }); } catch { /* ignorar */ }
  return obj;
}

function buildPlutoUrl(session, channelId) {
  let url = session.stitcher + "/v2/stitch/hls/channel/" + encodeURIComponent(channelId) + "/master.m3u8";
  const params = [];
  if (session.stitcherParams) params.push(session.stitcherParams);
  params.push("appName=web&appVersion=8.1.0&deviceVersion=133.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientModelNumber=1.0.0");
  params.push("clientID=" + encodeURIComponent(session.clientId));
  if (session.sessionToken) params.push("jwt=" + encodeURIComponent(session.sessionToken));
  url += "?" + params.join("&");
  return url;
}

// ----------------- KINO EXPORTS -----------------

/**
 * liveCategories:
 * Devuelve KinoPlaylist para que Kino descargue las M3Us el mismo (nunca cuelga).
 * Kino usa los group-title del M3U como categorias internas.
 *
 * @returns {Promise<Array<KinoPlaylist>>}
 */
export async function liveCategories() {
  const region = String(kino.config.get("region") || "us");
  const platform = String(kino.config.get("platform") || "all");
  const result = [];

  // Pluto TV – playlist + EPG
  if (platform === "all" || platform === "pluto") {
    const plutoUrl = PLUTO_M3U_URLS[region] || PLUTO_M3U_URLS.us;
    const epgUrl   = PLUTO_EPG[region] || PLUTO_EPG.us;

    result.push({
      playlist: {
        url: plutoUrl,
        format: "m3u",
        refreshHours: 6,
        resolve: true, // cada URL de canal pasa por resolve() para firmar JWT fresco
        epg: { url: epgUrl, format: "xmltv" },
      },
    });
  }

  // Samsung TV Plus
  if (platform === "all" || platform === "samsung") {
    const samsungUrl = SAMSUNG_SOURCES[region] || SAMSUNG_SOURCES.us;
    result.push({
      playlist: {
        url: samsungUrl,
        format: "m3u",
        refreshHours: 12,
      },
    });
  }

  // Roku TV
  if (platform === "all" || platform === "roku") {
    result.push({
      playlist: {
        url: ROKU_SOURCES.us,
        format: "m3u",
        refreshHours: 12,
      },
    });
  }

  return result;
}

/**
 * liveChannels: requerido por capability "channels".
 * Con KinoPlaylist Kino los carga el mismo; aqui respondemos pagina vacia.
 */
export async function liveChannels({ categoryId, cursor }) {
  return { items: [], next: null };
}

// Home – filas de bienvenida (sin items; los canales estan en la pestana En vivo)
export async function home() {
  return [
    { id: "fast_tv", title: "FAST TV – Canales Gratuitos en Vivo", items: [] },
  ];
}

export async function browse(ref, cursor) {
  return { items: [], next: undefined };
}

export async function search(query) {
  return [];
}

/**
 * resolve: firma JWT de sesion de Pluto TV o hace pass-through para Samsung/Roku.
 *
 * Con resolve:true en KinoPlaylist, Kino pasa la URL del entry del M3U como ref.
 * Las URLs de Pluto tienen el formato:
 *   https://*.pluto.tv/v2/stitch/hls/channel/<24hex>/master.m3u8?...
 */
export async function resolve(ref) {
  if (!ref || typeof ref !== "string") {
    throw kino.error("not_found", "ref invalida");
  }

  // Caso A: URL de Pluto TV con channelId de 24 hex en la ruta
  const plutoMatch = ref.match(/\/channel\/([a-f0-9]{24})\//i);
  if (plutoMatch) {
    const channelId = plutoMatch[1];
    try {
      const session = await fetchPlutoBoot(false);
      return { url: buildPlutoUrl(session, channelId), expiresInSeconds: 300 };
    } catch (e) {
      kino.log("[pluto] fallo firmado JWT, usando URL original:", e.message);
      return { url: ref, expiresInSeconds: 60 };
    }
  }

  // Caso B: ref pipe-separada legacy (pluto|<channelId>|<url>)
  if (ref.startsWith("pluto|")) {
    const parts = ref.split("|");
    const channelId = parts[1];
    const fallbackUrl = parts[2] ? decodeURIComponent(parts[2]) : "";
    try {
      const session = await fetchPlutoBoot(false);
      const url = channelId ? buildPlutoUrl(session, channelId) : fallbackUrl;
      if (!url) throw kino.error("unavailable", "sin URL");
      return { url, expiresInSeconds: 300 };
    } catch (e) {
      if (fallbackUrl) return { url: fallbackUrl, expiresInSeconds: 60 };
      throw e;
    }
  }

  // Caso C: URL directa https:// (Samsung / Roku via KinoPlaylist sin resolve)
  if (ref.startsWith("https://") || ref.startsWith("http://")) {
    return { url: ref, expiresInSeconds: 300 };
  }

  // Caso D: ref pipe-separada de Samsung/Roku
  if (ref.startsWith("samsung|") || ref.startsWith("roku|")) {
    const url = decodeURIComponent(ref.split("|")[2] || "");
    if (!url) throw kino.error("not_found", "sin URL en ref");
    return { url, expiresInSeconds: 300 };
  }

  throw kino.error("not_found", "proveedor desconocido: " + ref.slice(0, 40));
}
