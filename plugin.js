// FAST TV Plugin for Kino (Pluto TV, Samsung TV Plus, Roku TV)
// Pluto: usa M3Us directos de github
// Samsung/Roku: M3Us ligeros de iptv-org (50 KB / 4 KB).
/// <reference path="./kino.d.ts" />

var PLUTO_M3U = {
  all: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_all.m3u",
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
  dk: "https://raw.githubusercontent.com/BuddyChewChew/pluto/main/pluto_dk.m3u"
};

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

// ---- M3U Parser (Samsung / Roku / Pluto) ----

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
  
  // Usar KinoPlaylist nativo de la API 3 para Pluto TV para que tenga la guia integrada!
  if (platform === "all" || platform === "pluto") {
    var region = String(kino.config.get("region") || "us");
    var plutoM3uUrl = PLUTO_M3U[region] || PLUTO_M3U.us;
    cats.push({
      playlist: {
        url: plutoM3uUrl,
        format: "m3u",
        epg: { url: "https://github.com/matthuisman/i.mjh.nz/raw/refs/heads/master/PlutoTV/all.xml.gz", format: "xmltv" }
      }
    });
  }

  if (platform === "all" || platform === "samsung") cats.push({ id: "samsung", title: "Samsung TV Plus" });
  if (platform === "all" || platform === "roku")    cats.push({ id: "roku",    title: "Roku TV" });
  return cats;
}

export async function liveChannels({ categoryId, cursor }) {
  var PAGE  = 300;
  var page  = cursor ? parseInt(cursor, 10) : 1;
  var start = (page - 1) * PAGE;
  var region = String(kino.config.get("region") || "us");

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

export async function resolve(ref) {
  if (!ref || typeof ref !== "string")
    throw kino.error("not_found", "ref invalida");

  // URL directa
  if (ref.indexOf("https://") === 0 || ref.indexOf("http://") === 0)
    return { url: ref, expiresInSeconds: 3600 };

  throw kino.error("not_found", "ref desconocida");
}