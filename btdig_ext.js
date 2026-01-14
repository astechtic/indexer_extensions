module.exports = {
  id: "btdig",
  siteTitle: "BTDig",
  version: "1.0.0",
  primarySource: "https://btdig.com",
  sources: ["https://btdig.com"],
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
      "/search?order=0&q=" +
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

      const items = Array.from(
        doc.querySelectorAll(
          'div.one_result[style*="display:table-row"][style*="background-color:#e8e8e8"]'
        )
      );

      if (!items.length) return [];

      const results = [];

      for (const item of items) {
        /* -------- NAME + URL -------- */
        const nameDiv =
          item.querySelector('div.torrent_name[style*="display:table-cell"]') ||
          item.querySelector("div.torrent_name");

        const aName = nameDiv?.querySelector("a[href]");
        const rawName = (nameDiv?.textContent || "").trim();
        const name = rawName.replace(/\s+/g, " ");

        const itemUrl = this._toAbs(aName?.getAttribute("href"));

        /* -------- SIZE -------- */
        const sizeSpan =
          item.querySelector('span.torrent_size[style*="padding-left:10px"]') ||
          item.querySelector("span.torrent_size");

        const size =
          (sizeSpan?.innerText || sizeSpan?.textContent || "").trim();

        /* -------- AGE -------- */
        const ageSpan =
          item.querySelector('span.torrent_age[style*="padding-left:10px"]') ||
          item.querySelector("span.torrent_age");

        const age =
          (ageSpan?.innerText || ageSpan?.textContent || "").trim();

        /* -------- MAGNET -------- */
        const magnetDiv =
          item.querySelector('div.torrent_magnet[style*="display:table-cell"]') ||
          item.querySelector("div.torrent_magnet");

        const magnetA = magnetDiv?.querySelector('a[href^="magnet:"]');
        const magnetLink = magnetA?.getAttribute("href") || "";

        const downloadUrls = magnetLink ? [magnetLink] : [];
        if (!name || !downloadUrls.length) continue;

        const description = this._buildDescription("", {
          Age: age || null
        });

        results.push({
          title: name,
          url: itemUrl || this.primarySource,
          info: age ? `Age: ${age}` : null,
          size: size || null,
          description: description || null,
          downloadUrls,
          category: "torrents",
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
      console.error("[BTDig Search Error]", e);
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
