// FAST TV Plugin for Kino (Pluto TV, Samsung TV Plus, Roku TV)
// liveChannels descarga 1 M3U regional, firma JWT de Pluto, y pagina a 200 canales.
// liveStreamHosts: "any" requiere que no usemos KinoPlaylist.
/// <reference path="./kino.d.ts" />

const PLUTO_BOOT_API = "https://boot.pluto.tv/v4/start";

const PLUTO_M3U = {
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
};

const SAMSUNG_M3U = {
  us: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_samsung.m3u",
  es: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es_samsung.m3u",
  mx: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/mx_samsung.m3u",
  ca: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca_samsung.m3u",
  gb: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk_samsung.m3u",
  it: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/it_samsung.m3u",
  fr: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/fr_samsung.m3u",
  de: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/de_samsung.m3u",
};

const ROKU_M3U_URL = "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_roku.m3u";

// ---- Cache por proveedor ----
var channelCache = {};
var cacheTimes = {};
var CACHE_TTL = 25 * 60 * 1000;

function cleanId(raw) {
  return String(raw || "ch").replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, 120);
}

// ---- M3U Parser ----

function parseM3u(text) {
  var lines = text.split(/\r?\n/);
  var result = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.toUpperCase().indexOf("#EXTINF:") === 0) {
      var idM = line.match(/tvg-id="([^"]*)"/i);
      var logoM = line.match(/tvg-logo="([^"]*)"/i);
      var comma = line.lastIndexOf(",");
      cur = {
        tvgId: idM ? idM[1] : "",
        logo:  logoM ? logoM[1] : "",
        title: comma >= 0 ? line.slice(comma + 1).trim() : "Canal",
      };
    } else if (line.charAt(0) !== "#" && cur) {
      if (line.indexOf("http") === 0) {
        var chanM = line.match(/\/channel\/([a-f0-9]{24})\//i);
        result.push({
          channelId: chanM ? chanM[1] : (cur.tvgId || null),
          title: cur.title.replace(/\s*\(\d+p\)/gi, "").replace(/\s*\[Geo-blocked\]/gi, "").trim(),
          logo: cur.logo,
          url: line,
        });
      }
      cur = null;
    }
  }
  return result;
}

// Descarga y cachea M3U. kino.fetch tiene limite de 5 MB; las M3U regionales ~1-2 MB.
async function getChannels(cacheKey, m3uUrl) {
  var now = Date.now();
  if (channelCache[cacheKey] && (now - (cacheTimes[cacheKey] || 0)) < CACHE_TTL) {
    return channelCache[cacheKey];
  }
  try {
    var res = await kino.fetch(m3uUrl, { timeoutMs: 25000 });
    if (!res.ok) {
      kino.log("[" + cacheKey + "] HTTP " + res.status);
      return channelCache[cacheKey] || [];
    }
    var text = res.text(); // SINCRONO en Kino SDK
    var parsed = parseM3u(text);
    channelCache[cacheKey] = parsed;
    cacheTimes[cacheKey] = now;
    return parsed;
  } catch (e) {
    kino.log("[" + cacheKey + "] fetch error: " + e.message);
    return channelCache[cacheKey] || [];
  }
}

// ---- Pluto TV Boot ----

async function getPlutoSession() {
  var key = "pluto_boot_v5";
  try {
    var raw = kino.storage.get(key);
    if (raw) {
      var p = JSON.parse(raw);
      if (p && p.stitcher && p.sessionToken) return p;
    }
  } catch (e) { /* ignore */ }

  var clientId = kino.crypto.uuid();
  var url = PLUTO_BOOT_API +
    "?appName=web&appVersion=8.1.0&deviceVersion=133.0.0" +
    "&deviceModel=web&deviceMake=chrome&deviceType=web" +
    "&clientID=" + clientId + "&clientModelNumber=1.0.0";

  var res = await kino.fetch(url, { timeoutMs: 12000 });
  if (!res.ok) throw kino.error("unavailable", "Pluto Boot " + res.status);
  var data = res.json(); // SINCRONO

  var obj = {
    stitcher: (data.servers && data.servers.stitcher)
      ? data.servers.stitcher
      : "https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv",
    sessionToken:   data.sessionToken   || "",
    stitcherParams: data.stitcherParams || "",
    clientId: clientId,
  };
  try { kino.storage.set(key, JSON.stringify(obj), { ttlMs: 1500000 }); } catch (e) { /* ignore */ }
  return obj;
}

function buildPlutoUrl(session, channelId) {
  var base = session.stitcher + "/v2/stitch/hls/channel/" + encodeURIComponent(channelId) + "/master.m3u8";
  var params = [
    "appName=web", "appVersion=8.1.0", "deviceVersion=133.0.0",
    "deviceModel=web", "deviceMake=chrome", "deviceType=web",
    "clientModelNumber=1.0.0",
    "clientID=" + encodeURIComponent(session.clientId),
  ];
  if (session.stitcherParams) params.push(session.stitcherParams);
  if (session.sessionToken)   params.push("jwt=" + encodeURIComponent(session.sessionToken));
  return base + "?" + params.join("&");
}

// ======== KINO EXPORTS ========

// Solo 3 categorias fijas - sin KinoPlaylist (incompatible con liveStreamHosts:"any")
export async function liveCategories() {
  var platform = String(kino.config.get("platform") || "all");
  var cats = [];
  if (platform === "all" || platform === "pluto")   cats.push({ id: "pluto",   title: "Pluto TV" });
  if (platform === "all" || platform === "samsung") cats.push({ id: "samsung", title: "Samsung TV Plus" });
  if (platform === "all" || platform === "roku")    cats.push({ id: "roku",    title: "Roku TV" });
  return cats;
}

// Carga M3U regional + firma JWT Pluto. Max 500 items por pagina (contrato SDK).
export async function liveChannels({ categoryId, cursor }) {
  var region = String(kino.config.get("region") || "us");
  var PAGE   = 250;
  var page   = cursor ? parseInt(cursor, 10) : 1;
  var start  = (page - 1) * PAGE;

  if (categoryId === "pluto") {
    var m3uUrl = PLUTO_M3U[region] || PLUTO_M3U.us;
    var channels = await getChannels("pluto_" + region, m3uUrl);

    // Obtener sesion Pluto para JWT fresco
    var session = null;
    try { session = await getPlutoSession(); } catch (e) {
      kino.log("[pluto] session error:", e.message);
    }

    var slice = channels.slice(start, start + PAGE);
    var items = [];
    for (var i = 0; i < slice.length; i++) {
      var c = slice[i];
      var cid = c.channelId;
      var streamUrl = (session && cid) ? buildPlutoUrl(session, cid) : c.url;
      items.push({
        id:         cleanId("p_" + (cid || c.title)),
        title:      c.title,
        logo:       c.logo || undefined,
        categoryId: "pluto",
        ref:        cid ? ("pluto|" + cid) : undefined,
        stream:     { url: streamUrl, expiresInSeconds: 240 },
      });
    }
    return { items: items, next: (start + PAGE < channels.length) ? String(page + 1) : null };
  }

  if (categoryId === "samsung") {
    var m3uUrl = SAMSUNG_M3U[region] || SAMSUNG_M3U.us;
    var channels = await getChannels("samsung_" + region, m3uUrl);
    var slice = channels.slice(start, start + PAGE);
    var items = [];
    for (var i = 0; i < slice.length; i++) {
      var c = slice[i];
      items.push({
        id:         cleanId("s_" + c.title),
        title:      c.title,
        logo:       c.logo || undefined,
        categoryId: "samsung",
        stream:     { url: c.url, expiresInSeconds: 3600 },
      });
    }
    return { items: items, next: (start + PAGE < channels.length) ? String(page + 1) : null };
  }

  if (categoryId === "roku") {
    var channels = await getChannels("roku", ROKU_M3U_URL);
    var slice = channels.slice(start, start + PAGE);
    var items = [];
    for (var i = 0; i < slice.length; i++) {
      var c = slice[i];
      items.push({
        id:         cleanId("r_" + c.title),
        title:      c.title,
        logo:       c.logo || undefined,
        categoryId: "roku",
        stream:     { url: c.url, expiresInSeconds: 3600 },
      });
    }
    return { items: items, next: (start + PAGE < channels.length) ? String(page + 1) : null };
  }

  return { items: [], next: null };
}

export async function home() {
  return [{ id: "fast_home", title: "FAST TV en Vivo", items: [] }];
}

export async function browse(ref, cursor) {
  return { items: [], next: undefined };
}

export async function search(query) {
  return [];
}

// Renueva JWT de Pluto TV cuando stream expira (expiresInSeconds: 240).
export async function resolve(ref) {
  if (!ref || typeof ref !== "string")
    throw kino.error("not_found", "ref invalida");

  // pluto|<channelId> -> JWT fresco
  if (ref.indexOf("pluto|") === 0) {
    var channelId = ref.split("|")[1];
    if (!channelId) throw kino.error("not_found", "sin channelId");
    var session = await getPlutoSession();
    return { url: buildPlutoUrl(session, channelId), expiresInSeconds: 240 };
  }

  // URL directa
  if (ref.indexOf("https://") === 0 || ref.indexOf("http://") === 0) {
    return { url: ref, expiresInSeconds: 3600 };
  }

  throw kino.error("not_found", "ref desconocida");
}