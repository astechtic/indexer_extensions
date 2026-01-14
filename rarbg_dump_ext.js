module.exports = {
  id: "rarbgdump",
  siteTitle: "RARBG",
  version: "1.0.0",
  primarySource: "https://rarbgdump.com",
  sources: ["https://rarbgdump.com"],
  permissions: {
    network: true,
    cookies: false,
    storage: false
  },

  /* ---------------- HEALTH CHECK ---------------- */
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

      if (result?.statusCode === 200) {
        return {
          status: "healthy",
          uptime: true,
          responseTime: Date.now() - start,
          message: "Reachable"
        };
      }

      return {
        status: "unhealthy",
        uptime: false,
        message: `HTTP ${result?.statusCode || "unknown"}`
      };
    } catch (e) {
      return {
        status: "unhealthy",
        uptime: false,
        message: e?.message || "Health check failed"
      };
    }
  },

  /* ---------------- SEARCH ---------------- */
  search: async function (query) {
    if (!query?.trim()) return [];
    if (!window.flutter_inappwebview?.callHandler) return [];

    const url =
      this.primarySource +
      "/search/" +
      encodeURIComponent(query);

    try {
      const result = await window.flutter_inappwebview.callHandler(
        "curlRequest",
        {
          url,
          method: "GET",
          runInIsolate: true
        }
      );

      if (!result || result.statusCode !== 200 || !result.data) return [];

      const html = window.decodeBase64UTF8
        ? window.decodeBase64UTF8(result.data)
        : atob(result.data);

      if (!html) return [];

      const doc = new DOMParser().parseFromString(html, "text/html");

      const tbody =
        doc.querySelector('tbody[class*="border-0"]') ||
        doc.querySelector("tbody");

      if (!tbody) return [];

      const rows = Array.from(tbody.querySelectorAll("tr"));
      const results = [];

      for (const tr of rows) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 5) continue;

        /* -------- NAME + URL (2nd TD) -------- */
        const tdName = tds[1];
        const aName = tdName.querySelector("a[href]");
        const name = (tdName.textContent || "").trim();

        const itemUrl = this._toAbs(aName?.getAttribute("href"));

        /* -------- MAGNET (3rd TD) -------- */
        const magnetA = tds[2].querySelector('a[href^="magnet:"]');
        const magnetLink = magnetA?.getAttribute("href") || "";

        /* -------- SIZE (4th TD) -------- */
        const size = (tds[3].textContent || "").trim();

        /* -------- TYPE (5th TD) -------- */
        const type = (tds[4].textContent || "").trim();

        const downloadUrls = magnetLink ? [magnetLink] : [];
        if (!name || !downloadUrls.length) continue;

        const description = this._buildDescription("", {
          Type: type || null
        });

        results.push({
          title: name,
          url: itemUrl || this.primarySource,
          info: type || null,
          size: size || null,
          description: description || null,
          downloadUrls,
          category: type || "torrents",
          nsfw:
            typeof isNSFW === "function"
              ? !!isNSFW(name)
              : false,
          source: this.siteTitle,
          parentSite: this.primarySource
        });
      }

      return results;
    } catch (e) {
      console.error("[RARBGDump Search Error]", e);
      return [];
    }
  },

  /* ---------------- HELPERS ---------------- */
  _toAbs(path) {
    try {
      return path
        ? new URL(path, this.primarySource).toString()
        : "";
    } catch {
      return "";
    }
  },
  _buildDescription(base, extras) {
    const cleanBase = (base || "").trim();
    const lines = Object.entries(extras)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([label, value]) => {
        const text = typeof value === "string" ? value.trim() : value;
        return text ? `${label}: ${text}` : "";
      })
      .filter(Boolean);

    if (!lines.length) return cleanBase;
    if (!cleanBase) return lines.join("\n");
    return `${cleanBase}\n\n${lines.join("\n")}`;
  }
};
