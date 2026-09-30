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

function parseM3u(text, defaultLogoUrl) {
  var lines = text.split(/\r?\n/);
  var result = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.toUpperCase().indexOf("#EXTINF:") === 0) {
      var idM = line.match(/tvg-id="([^"]*)"/i);
      var logoM = line.match(/tvg-logo="([^"]*)"/i);
      var chnoM = line.match(/tvg-chno="([^"]*)"/i);
      var comma = line.lastIndexOf(",");
      
      var logo = logoM ? logoM[1] : "";
      // Fallback para iconos rotos en Samsung/Roku usando logos genericos de iptv-org
      if (!logo && idM && idM[1]) {
         logo = "https://iptv-org.github.io/logo/" + idM[1] + ".png";
      }
      
      cur = {
        tvgId: idM ? idM[1] : "",
        logo:  logo || defaultLogoUrl || "",
        number: chnoM ? parseInt(chnoM[1], 10) : undefined,
        title: comma >= 0 ? line.slice(comma + 1).trim() : "Canal",
      };
    } else if (line.charAt(0) !== "#" && cur) {
      if (line.indexOf("http") === 0) {
        result.push({
          title: cur.title,
          logo: cur.logo,
          number: cur.number,
          url: line,
        });
      }
      cur = null;
    }
  }
  return result;
}

async function getM3uChannels(cacheKey, m3uUrl, defaultLogoUrl) {
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
    var parsed = parseM3u(text, defaultLogoUrl);
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
  
  if (platform === "all") {
    cats.push({ id: "all_channels", title: "Todos los Canales" });
  }
  
  // Usar KinoPlaylist nativo de la API 3 para Pluto TV para que tenga la guia integrada!
  if (platform === "all" || platform === "pluto") {
    var region = String(kino.config.get("region") || "all");
    var plutoM3uUrl = PLUTO_M3U[region] || PLUTO_M3U.us;
    cats.push({
      playlist: {
        url: plutoM3uUrl,
        format: "m3u",
        epg: { url: "https://github.com/matthuisman/i.mjh.nz/raw/refs/heads/master/PlutoTV/all.xml.gz", format: "xmltv" },
        resolve: true // Redirige cada stream de pluto a la funcion resolve() para inyectar la calidad
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
  var region = String(kino.config.get("region") || "all");
  var fetchRegion = region === "all" ? "us" : region;

  var items = [];
  var totalChannels = [];
  
  if (categoryId === "all_channels" || categoryId === "pluto") {
    var plutoUrl = PLUTO_M3U[region] || PLUTO_M3U.us;
    var pluto = await getM3uChannels("pluto_" + region, plutoUrl, "https://pluto.tv/favicon.ico");
    for (var i = 0; i < pluto.length; i++) {
      totalChannels.push({
        id:         cleanId("p_" + pluto[i].title),
        title:      pluto[i].title,
        logo:       pluto[i].logo || undefined,
        number:     pluto[i].number || undefined,
        categoryId: categoryId,
        ref:        pluto[i].url, // Resolve le inyectara la resolucion si aplica
      });
    }
  }

  if (categoryId === "all_channels" || categoryId === "samsung") {
    var samUrl = SAMSUNG_M3U[fetchRegion] || SAMSUNG_M3U.us;
    var sam = await getM3uChannels("sam_" + fetchRegion, samUrl, "https://www.samsung.com/favicon.ico");
    for (var i = 0; i < sam.length; i++) {
      totalChannels.push({
        id:         cleanId("s_" + sam[i].title),
        title:      sam[i].title,
        logo:       sam[i].logo || undefined,
        number:     sam[i].number || undefined,
        categoryId: categoryId,
        stream:     { url: sam[i].url, expiresInSeconds: 3600 },
      });
    }
  }

  if (categoryId === "all_channels" || categoryId === "roku") {
    var roku = await getM3uChannels("roku", ROKU_M3U_URL, "https://www.roku.com/favicon.ico");
    for (var i = 0; i < roku.length; i++) {
      totalChannels.push({
        id:         cleanId("r_" + roku[i].title),
        title:      roku[i].title,
        logo:       roku[i].logo || undefined,
        number:     roku[i].number || undefined,
        categoryId: categoryId,
        stream:     { url: roku[i].url, expiresInSeconds: 3600 },
      });
    }
  }

  var slice = totalChannels.slice(start, start + PAGE);
  return { items: slice, next: (start + PAGE < totalChannels.length) ? String(page + 1) : null };
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

  // URL directa, inyectamos quality en el query string si es Pluto TV
  if (ref.indexOf("https://") === 0 || ref.indexOf("http://") === 0) {
    var url = ref;
    // BuddyChewChew m3u list devuelve URLs apuntando a pluto
    if (url.indexOf("pluto.tv") >= 0) {
      var quality = String(kino.config.get("quality") || "720p");
      // Si la URL ya tiene query, la reemplazamos o agregamos, pero estas de buddy suelen tener
      // ?... asi que agregamos "&quality=X"
      var sep = url.indexOf("?") >= 0 ? "&" : "?";
      
      // Remover param quality existente si lo hubiera (algunas M3Us ya lo traen como quality=0)
      url = url.replace(/(&|\?)quality=[^&]+/gi, "$1");
      if (url.endsWith("&") || url.endsWith("?")) {
        url += "quality=" + quality;
      } else {
        url += sep + "quality=" + quality;
      }
    }
    return { url: url, expiresInSeconds: 3600 };
  }

  throw kino.error("not_found", "ref desconocida");
}