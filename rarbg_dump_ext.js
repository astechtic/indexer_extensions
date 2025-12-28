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

        const magnet = [];
        if (magnetLink) magnet.push(magnetLink);
        if (itemUrl) magnet.push(itemUrl);

        if (!name || !magnet.length) continue;

        results.push({
          name,
          size: size || null,
          age: "",
          magnet,
          seeder: "",
          leecher: "",
          type: type || "",
          trusted: true,
          description: "",
          nsfw:
            typeof isNSFW === "function"
              ? !!isNSFW(name)
              : false,
          url: itemUrl,
          source: this.id,
          site: this.siteTitle,
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
  }
};
