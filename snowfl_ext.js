// Basic name-based NSFW heuristic
function isNSFW(name) {
  if (!name) return false;

  const s = String(name).toLowerCase().trim();
  const keywords = [
    "porn",
    "xxx",
    "sex",
    "hentai",
    "nsfw",
    "adult",
    "erotic",
    "hardcore",
    "xvideos",
    "xnxx",
    "jav",
    "idol",
    "brazzers",
    "bangbros",
    "pornhub",
    "masturbate",
    "fuck",
    "fucking",
    "shag",
    "shagged",
    "screw",
    "slut",
    "whore",
    "milf",
    "creampie",
    "blowjob",
    "handjob",
    "gangbang",
    "anal",
    "deepthroat",
    "cumshot",
    "nude",
    "strip",
    "hookup",
    "booty",
    "pussy",
    "cock",
    "dick",
    "tits",
    "boobs"
  ];

  const nsfwRegex = new RegExp(`\\b(?:${keywords.join("|")})\\b|18\\+`, "i");
  return nsfwRegex.test(s);
}

function normalizeBase64(b64) {
  if (typeof b64 !== "string") return "";
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return s;
}

function decodeBase64UTF8(base64String) {
  const s = normalizeBase64(base64String);
  const binaryString = atob(s);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function base64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function substringBetween(text, startDelimiter, endDelimiter) {
  if (typeof text !== "string") return "";
  const startIndex = text.indexOf(startDelimiter);
  if (startIndex === -1) return "";
  const endIndex = text.indexOf(
    endDelimiter,
    startIndex + startDelimiter.length
  );
  if (endIndex === -1) return "";
  return text.substring(startIndex + startDelimiter.length, endIndex);
}

function generateRandomString(length) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const values = new Uint32Array(length);
    cryptoObj.getRandomValues(values);
    return Array.from(values)
      .map(value => charset[value % charset.length])
      .join("");
  }
  return Array.from({ length }, () =>
    charset[Math.floor(Math.random() * charset.length)]
  ).join("");
}

async function getCachedToken() {
  try {
    if (!window.flutter_inappwebview?.callHandler) return "";
    const token = await window.flutter_inappwebview.callHandler(
      "getVariable",
      "snowflToken"
    );
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
}

async function setCachedToken(token) {
  try {
    if (!window.flutter_inappwebview?.callHandler) return;
    await window.flutter_inappwebview.callHandler("setVariable", {
      variableName: "snowflToken",
      variableValue: token || ""
    });
  } catch {
    return;
  }
}

async function fetchApiToken(baseUrl) {
  try {
    if (!baseUrl) throw new Error("baseUrl is required");
    if (!window.flutter_inappwebview?.callHandler) {
      throw new Error("flutter_inappwebview not available");
    }

    const jsUrl = new URL("b.min.js", baseUrl).toString();
    const raw = await window.flutter_inappwebview.callHandler("curlRequest", {
      url: jsUrl,
      method: "GET",
      runInIsolate: true
    });

    const data = decodeBase64UTF8(raw?.data || "");
    if (!data) return "";

    let variableName = substringBetween(data, 'x="/"+', "+");
    if (!variableName) {
      const m = data.match(/([$_A-Za-z][$_A-Za-z0-9]*)\s*=\s*"([^"]+)";/);
      if (m) variableName = m[1];
    }

    let apiTokenForSnowFl = "";
    if (variableName) {
      apiTokenForSnowFl = substringBetween(data, `${variableName}="`, '";');
    }
    if (!apiTokenForSnowFl) {
      const m2 = data.match(/=["']([A-Za-z0-9._-]{8,})["'];?/);
      if (m2) apiTokenForSnowFl = m2[1];
    }

    return apiTokenForSnowFl || "";
  } catch {
    return "";
  }
}

function normalizeDownloadUrls(item) {
  const urls = [];
  if (typeof item.magnet === "string") {
    urls.push(item.magnet);
  } else if (Array.isArray(item.magnet)) {
    urls.push(...item.magnet.filter(Boolean));
  }
  if (typeof item.url === "string" && item.url) {
    urls.push(item.url);
  }
  return urls;
}

module.exports = {
  id: "snowfl",
  siteTitle: "Snowfl",
  version: "1.0.0",
  primarySource: "https://snowfl.com",
  sources: ["https://snowfl.com"],
  permissions: {
    network: true,
    cookies: false,
    storage: false
  },

  initFuntionWithHealthCheck: async function () {
    try {
      if (!window.flutter_inappwebview?.callHandler) {
        return {
          status: "unhealthy",
          uptime: false,
          message: "WebView bridge not available"
        };
      }

      const start = Date.now();
      const result = await window.flutter_inappwebview.callHandler(
        "curlRequest",
        {
          url: this.primarySource,
          method: "HEAD",
          runInIsolate: true
        }
      );

      if (result?.statusCode === 403) {
        return {
          status: "blocked",
          uptime: false,
          message: "Access blocked (HTTP 403)"
        };
      }

      if (result?.statusCode !== 200) {
        return {
          status: "unhealthy",
          uptime: false,
          message: `HTTP ${result?.statusCode || "unknown"}`
        };
      }

      const cachedToken = await getCachedToken();
      if (!cachedToken) {
        const token = await fetchApiToken(this.primarySource);
        if (token) {
          await setCachedToken(token);
        }
      }

      return {
        status: "healthy",
        uptime: true,
        responseTime: Date.now() - start,
        message: "Reachable"
      };
    } catch (e) {
      return {
        status: "unhealthy",
        uptime: false,
        message: e?.message || "Health check failed"
      };
    }
  },

  search: async function (query, filters) {
    if (!query?.trim()) return [];
    if (!window.flutter_inappwebview?.callHandler) return [];

    try {
      let apiToken = await getCachedToken();
      if (!apiToken) {
        apiToken = await fetchApiToken(this.primarySource);
        if (apiToken) {
          await setCachedToken(apiToken);
        }
      }
      if (!apiToken) return [];

      const randomTail = `${generateRandomString(8)}/0/DATE/NONE/1`;
      const path =
        encodeURIComponent(apiToken) +
        "/" +
        encodeURIComponent(query) +
        "/" +
        randomTail;

      const baseWithSlash = this.primarySource.endsWith("/")
        ? this.primarySource
        : `${this.primarySource}/`;
      let urlStr = new URL(path, baseWithSlash).toString();
      urlStr += (urlStr.includes("?") ? "&" : "?") + "_=" + Date.now();

      const result = await window.flutter_inappwebview.callHandler(
        "curlRequest",
        {
          url: urlStr,
          method: "GET",
          runInIsolate: true
        }
      );

      const decodedText = decodeBase64UTF8(result?.data || "");
      if (!decodedText) return [];

      const raw = JSON.parse(decodedText);
      if (!Array.isArray(raw)) return [];

      const includeNsfw = filters?.includeNsfw === true;
      const results = [];

      for (const item of raw) {
        const title =
          item?.name ||
          item?.title ||
          item?.filename ||
          item?.file ||
          "";
        if (!title) continue;

        const nsfw = item?.nsfw === true || isNSFW(title);
        if (!includeNsfw && nsfw) continue;

        const downloadUrls = normalizeDownloadUrls(item);
        const size = item?.size || item?.size_str || item?.filesize || null;
        const seeders = item?.seeders ?? item?.seeds ?? item?.seed;
        const leechers = item?.leechers ?? item?.leeches ?? item?.leech;
        const age = item?.age || item?.time || item?.date || null;
        const site = item?.site || item?.source || null;

        const infoParts = [];
        if (site) infoParts.push(`Site: ${site}`);
        if (seeders !== undefined && seeders !== null) {
          infoParts.push(`Seeders ${seeders}`);
        }
        if (leechers !== undefined && leechers !== null) {
          infoParts.push(`Leechers ${leechers}`);
        }
        if (age) infoParts.push(`Age ${age}`);

        results.push({
          title,
          url: item?.url || this.primarySource,
          info: infoParts.length ? infoParts.join(" | ") : null,
          size,
          description: null,
          downloadUrls,
          category: "torrents",
          nsfw,
          source: this.siteTitle,
          parentSite: this.primarySource,
          attributes: {
            site: site || undefined,
            seeders: seeders ?? undefined,
            leechers: leechers ?? undefined
          }
        });
      }

      return results;
    } catch (e) {
      console.error("[Snowfl Search Error]", e);
      return [];
    }
  },

  getDetails: async function () {
    return null;
  }
};
