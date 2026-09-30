// FAST TV Plugin for Kino (Pluto TV, Samsung TV Plus, Roku TV)
// Pluto: usa la API nativa de canales (499 KB) en vez de M3Us de 1.3 MB.
// Samsung/Roku: M3Us ligeros de iptv-org (50 KB / 4 KB).
/// <reference path="./kino.d.ts" />

// ---- URLs ----
var BOOT_URL = "https://boot.pluto.tv/v4/start";
var CHANNELS_URL = "https://service-channels.clusters.pluto.tv/v2/guide/channels";

var SAMSUNG_M3U = {
  us: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_samsung.m3u",
  es: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/es_samsung.m3u",
  mx: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/mx_samsung.m3u",
  ca: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca_samsung.m3u",
  gb: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk_samsung.m3u",
  it: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/it_samsung.m3u",
  fr: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/fr_samsung.m3u",
  de: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/de_samsung.m3u",
};

var ROKU_M3U_URL = "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_roku.m3u";

// ---- Cache ----
var _cache = {};
var _cacheTimes = {};
var CACHE_TTL = 20 * 60 * 1000;

function cleanId(raw) {
  return String(raw || "ch").replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, 120);
}

// ---- Pluto TV: Boot Session ----

function _getPlutoSessionFromStorage() {
  try {
    var raw = kino.storage.get("pb6");
    if (raw) {
      var p = JSON.parse(raw);
      if (p && p.sessionToken && p.stitcher) return p;
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function getPlutoSession() {
  var cached = _getPlutoSessionFromStorage();
  if (cached) return cached;

  var clientId = kino.crypto.uuid();
  var url = BOOT_URL +
    "?appName=web&appVersion=8.1.0&deviceVersion=133.0.0" +
    "&deviceModel=web&deviceMake=chrome&deviceType=web" +
    "&clientID=" + clientId + "&clientModelNumber=1.0.0";

  var res = await kino.fetch(url, { timeoutMs: 10000 });
  if (!res.ok) throw kino.error("unavailable", "Boot fallo: " + res.status);

  var data = res.json();
  var obj = {
    stitcher: (data.servers && data.servers.stitcher)
      ? data.servers.stitcher
      : "https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv",
    sessionToken:   data.sessionToken   || "",
    stitcherParams: data.stitcherParams || "",
    clientId:       clientId,
  };
  try { kino.storage.set("pb6", JSON.stringify(obj), { ttlMs: 1200000 }); } catch (e) { /* ignore */ }
  return obj;
}

function buildPlutoStreamUrl(session, stitchedPath) {
  var url = session.stitcher + stitchedPath;
  var sep = stitchedPath.indexOf("?") >= 0 ? "&" : "?";
  var params = [];
  if (session.stitcherParams) {
    params.push(session.stitcherParams);
  } else {
    params.push(
      "appName=web",
      "appVersion=8.1.0",
      "deviceVersion=133.0.0",
      "deviceModel=web",
      "deviceMake=chrome",
      "deviceType=web",
      "clientModelNumber=1.0.0",
      "clientID=" + encodeURIComponent(session.clientId)
    );
  }
  if (session.sessionToken)   params.push("jwt=" + encodeURIComponent(session.sessionToken));
  
  params.push(
    "quality=720p",
    "deviceMake=chrome",
    "deviceType=web",
    "deviceModel=web",
    "deviceVersion=133.0.0",
    "architecture=x86_64",
    "buildVersion=1.0.0",
    "includeExtendedEvents=true",
    "masterJWTPassthrough=true"
  );
  
  return url + sep + params.join("&");
}

// ---- Pluto TV: Channels API (499 KB, mucho mas rapido que M3U de 1.3 MB) ----

async function getPlutoChannels() {
  var now = Date.now();
  if (_cache.pluto && (now - (_cacheTimes.pluto || 0)) < CACHE_TTL) {
    return _cache.pluto;
  }

  var session = await getPlutoSession();

  var url = CHANNELS_URL +
    "?appName=web&appVersion=8.1.0&deviceType=web&deviceVersion=133.0.0";

  var res = await kino.fetch(url, {
    timeoutMs: 15000,
    headers: { "Authorization": "Bearer " + session.sessionToken },
  });

  if (!res.ok) {
    kino.log("[pluto] Channels API HTTP " + res.status);
    return _cache.pluto || [];
  }

  var body = res.json();
  var rawChannels = body.data || body || [];
  if (!Array.isArray(rawChannels)) {
    // Si body es un array directamente
    rawChannels = [];
  }

  var channels = [];
  for (var i = 0; i < rawChannels.length; i++) {
    var ch = rawChannels[i];
    if (!ch || !ch.id) continue;

    // Extraer logo de images[]
    var logo = "";
    if (ch.images && ch.images.length) {
      for (var j = 0; j < ch.images.length; j++) {
        if (ch.images[j].type === "colorLogoPNG") {
          logo = ch.images[j].url;
          break;
        }
      }
      if (!logo) logo = ch.images[0].url || "";
    }

    // stitched.path = "/stitch/hls/channel/<id>/master.m3u8"
    var stitchedPath = (ch.stitched && ch.stitched.path) ? ch.stitched.path : "";

    channels.push({
      id: ch.id,
      name: ch.name || ch.slug || "Canal",
      number: ch.number || undefined,
      logo: logo,
      stitchedPath: stitchedPath,
    });
  }

  _cache.pluto = channels;
  _cacheTimes.pluto = now;
  return channels;
}

// ---- M3U Parser (Samsung / Roku) ----

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
        result.push({
          title: cur.title,
          logo: cur.logo,
          url: line,
        });
      }
      cur = null;
    }
  }
  return result;
}

async function getM3uChannels(cacheKey, m3uUrl) {
  var now = Date.now();
  if (_cache[cacheKey] && (now - (_cacheTimes[cacheKey] || 0)) < CACHE_TTL) {
    return _cache[cacheKey];
  }
  try {
    var res = await kino.fetch(m3uUrl, { timeoutMs: 15000 });
    if (!res.ok) {
      kino.log("[" + cacheKey + "] HTTP " + res.status);
      return _cache[cacheKey] || [];
    }
    var text = res.text();
    var parsed = parseM3u(text);
    _cache[cacheKey] = parsed;
    _cacheTimes[cacheKey] = now;
    return parsed;
  } catch (e) {
    kino.log("[" + cacheKey + "] error: " + e.message);
    return _cache[cacheKey] || [];
  }
}

// ======== KINO EXPORTS ========

export async function liveCategories() {
  var platform = String(kino.config.get("platform") || "all");
  var cats = [];
  if (platform === "all" || platform === "pluto")   cats.push({ id: "pluto",   title: "Pluto TV" });
  if (platform === "all" || platform === "samsung") cats.push({ id: "samsung", title: "Samsung TV Plus" });
  if (platform === "all" || platform === "roku")    cats.push({ id: "roku",    title: "Roku TV" });
  return cats;
}

export async function liveChannels({ categoryId, cursor }) {
  var PAGE  = 300;
  var page  = cursor ? parseInt(cursor, 10) : 1;
  var start = (page - 1) * PAGE;
  var region = String(kino.config.get("region") || "us");

  // ---- PLUTO TV ----
  if (categoryId === "pluto") {
    var channels = await getPlutoChannels();
    var session  = _getPlutoSessionFromStorage();
    if (!session) {
      try { session = await getPlutoSession(); } catch (e) {
        kino.log("[pluto] session fail:", e.message);
      }
    }

    var slice = channels.slice(start, start + PAGE);
    var items = [];
    for (var i = 0; i < slice.length; i++) {
      var c = slice[i];
      var streamUrl = "";
      if (session && c.stitchedPath) {
        streamUrl = buildPlutoStreamUrl(session, c.stitchedPath);
      }

      items.push({
        id:         cleanId("p_" + c.id),
        title:      c.name,
        logo:       c.logo || undefined,
        number:     c.number || undefined,
        categoryId: "pluto",
        ref:        "pluto|" + c.id + "|" + encodeURIComponent(c.stitchedPath || ""),
        stream:     streamUrl ? { url: streamUrl, expiresInSeconds: 240 } : undefined,
      });
    }
    return { items: items, next: (start + PAGE < channels.length) ? String(page + 1) : null };
  }

  // ---- SAMSUNG TV PLUS ----
  if (categoryId === "samsung") {
    var m3uUrl = SAMSUNG_M3U[region] || SAMSUNG_M3U.us;
    var channels = await getM3uChannels("sam_" + region, m3uUrl);
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

  // ---- ROKU TV ----
  if (categoryId === "roku") {
    var channels = await getM3uChannels("roku", ROKU_M3U_URL);
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

// resolve: renueva JWT Pluto TV cuando stream expira
export async function resolve(ref) {
  if (!ref || typeof ref !== "string")
    throw kino.error("not_found", "ref invalida");

  // pluto|<channelId>|<encodedStitchedPath>
  if (ref.indexOf("pluto|") === 0) {
    var parts = ref.split("|");
    var channelId = parts[1] || "";
    var stitchedPath = parts[2] ? decodeURIComponent(parts[2]) : "";

    if (!stitchedPath && channelId) {
      stitchedPath = "/stitch/hls/channel/" + channelId + "/master.m3u8";
    }
    if (!stitchedPath) throw kino.error("not_found", "sin stitchedPath");

    var session = await getPlutoSession();
    return {
      url: buildPlutoStreamUrl(session, stitchedPath),
      expiresInSeconds: 240,
    };
  }

  // URL directa (Samsung/Roku)
  if (ref.indexOf("https://") === 0 || ref.indexOf("http://") === 0)
    return { url: ref, expiresInSeconds: 3600 };

  throw kino.error("not_found", "ref desconocida");
}