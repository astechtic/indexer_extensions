module.exports = {
  id: "annasArchive",
  siteTitle: "Anna's Archive",
  version: "1.5.0",
  primarySource: "https://annas-archive.org",
  sources: ["https://annas-archive.org"],
  permissions: {
    network: true,
    cookies: false,
    storage: false
  },
  initFuntionWithHealthCheck: async function () {
    try {
      // Check if the bridge is available
      if (!window.flutter_inappwebview || !window.flutter_inappwebview.callHandler) {
        return {
          status: "unhealthy",
          uptime: false,
          message: "WebView bridge not initialized"
        };
      }

      const start = Date.now();

      let result;
      try {
        result = await window.flutter_inappwebview.callHandler("curlRequest", {
          url: this.primarySource,
          method: "HEAD",
          runInIsolate: true,
        });
      } catch (e) {
        const errorMsg = e?.message || e?.toString() || String(e);
        return {
          status: "unhealthy",
          uptime: false,
          message: `Network error: ${errorMsg}`
        };
      }

      if (!result) {
        return {
          status: "unhealthy",
          uptime: false,
          message: "No response from server"
        };
      }

      const statusCode = result.statusCode || 0;

      if (statusCode === 200) {
        return {
          status: "healthy",
          uptime: true,
          responseTime: Date.now() - start,
          message: "Reachable"
        };
      }

      if (statusCode === 403) {
        return {
          status: "blocked",
          uptime: false,
          message: "Access blocked (HTTP 403)"
        };
      }

      if (statusCode === 0) {
        return {
          status: "unhealthy",
          uptime: false,
          message: "Connection failed (no status code)"
        };
      }

      return {
        status: "unhealthy",
        uptime: false,
        message: "HTTP " + statusCode
      };
    } catch (e) {
      const errorMsg = e?.message || e?.toString() || String(e);
      return {
        status: "unhealthy",
        uptime: false,
        message: `Health check error: ${errorMsg}`
      };
    }
  },
  search: async function (query) {
    if (!query?.trim()) return [];

    const url =
      this.primarySource +
      "/search?index=&page=1&sort=&display=table&q=" +
      encodeURIComponent(query);

    try {
      let result;
      try {
        console.log('[Search] Calling curlRequest for URL:', url);
        result = await window.flutter_inappwebview.callHandler("curlRequest", {
          url,
          method: "GET",
          headers: { "Accept-Language": "en-US,en;q=0.9" },
          runInIsolate: true,
        });
        console.log('[Search] curlRequest returned:', result);
        console.log('[Search] Result type:', typeof result);
        console.log('[Search] Result statusCode:', result?.statusCode);
        console.log('[Search] Result has data:', !!result?.data);
      } catch (e) {
        console.error(`[Search] Network error calling curlRequest: ${e?.message || e}`);
        return [];
      }

      if (!result || result.statusCode !== 200 || !result.data) {
        console.warn(`[Search] Request failed or empty - statusCode: ${result?.statusCode}, hasData: ${!!result?.data}`);
        return [];
      }

      // Decode base64 response data
      console.log('[Search] Decoding base64 data...');
      const html = window.decodeBase64UTF8
        ? window.decodeBase64UTF8(result.data)
        : atob(result.data);
      console.log('[Search] HTML length:', html.length);

      console.log('[Search] Parsing HTML...');
      const doc = new DOMParser().parseFromString(html, "text/html");

      console.log('[Search] Looking for table...');
      const table = doc.querySelector("table.text-sm.w-full.mt-4.h-fit");
      if (!table) {
        console.warn('[Search] Table not found in HTML');
        return [];
      }
      console.log('[Search] Table found');

      const rows = Array.from(table.querySelectorAll("tr"));
      console.log('[Search] Found rows:', rows.length);
      const results = [];

      for (const tr of rows) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 11) continue;

        const linkEl = tds[0].querySelector("a[href]");
        const imgEl = tds[0].querySelector("img");

        const link = this._toAbs(linkEl?.getAttribute("href"));
        const title = this._txt(tds[1]);
        if (!link || !title) continue;

        const author = this._txt(tds[2]);
        const publisher = this._txt(tds[3]);
        const year = this._txt(tds[4]);
        const language = this._txt(tds[7]);
        const fileType = this._txt(tds[9]);
        const size = this._txt(tds[10]);

        const info = [
          year && `year: ${year}`,
          language && `language: ${language}`,
          fileType && `type: ${fileType}`,
          size && `size: ${size}`
        ]
          .filter(Boolean)
          .join(" · ");

        results.push({
          title,
          author: author || null,
          publisher: publisher || null,
          info: info || null,
          thumbnail: this._toAbs(imgEl?.getAttribute("src")),
          url: link,
          bookIdMD5: this._md5FromUrl(link),
          category: "books",
          nsfw: false,
          source: this.siteTitle,
          parentSite: this.primarySource
        });
      }

      console.log('[Search] Returning results:', results.length);
      return results;
    } catch (e) {
      console.error("[Search] Error:", e);
      return [];
    }
  },
  getDetails: async function (pageUrl) {
    if (!pageUrl) return null;

    try {
      let result;
      try {
        result = await window.flutter_inappwebview.callHandler("curlRequest", {
          url: pageUrl,
          method: "GET",
          headers: { "Accept-Language": "en-US,en;q=0.9" },
          runInIsolate: true,
        });
      } catch (e) {
        console.error(`Network error calling curlRequest: ${e?.message || e}`);
        return null;
      }

      if (!result || result.statusCode !== 200 || !result.data) {
        console.warn(`Request failed or empty: ${result?.statusCode}`);
        return null;
      }

      // Decode base64 response data
      const html = window.decodeBase64UTF8
        ? window.decodeBase64UTF8(result.data)
        : atob(result.data);

      const doc = new DOMParser().parseFromString(html, "text/html");

      const main = doc.querySelector(".main");
      if (!main) return null;

      const title =
        main.querySelector(".font-semibold.text-2xl")?.textContent || "";
      const author =
        main.querySelector(".icon-\\[mdi--user-edit\\]")?.textContent || "";
      const publisher =
        main.querySelector(".icon-\\[mdi--company\\]")?.textContent || "";
      const description =
        main.querySelector(".js-md5-top-box-description")?.textContent || "";

      const thumbnail = this._toAbs(
        main.querySelector("img")?.getAttribute("src")
      );

      const mirrors = new Set();
      main.querySelectorAll("ul.list-inside a").forEach(a => {
        let href = a.getAttribute("href");
        if (!href) return;

        if (href.startsWith("/")) {
          mirrors.add(
            this.primarySource + href.replace("/scidb?doi=", "/scidb/")
          );
        } else if (
          href.startsWith("http") &&
          !href.includes("amazon.com") &&
          !href.includes("cloudconvert.com")
        ) {
          mirrors.add(href);
        }
      });

      return {
        title: this._cleanText(title),
        author: this._cleanText(author),
        publisher: this._cleanText(publisher),
        description: this._cleanText(description),
        thumbnail,
        url: pageUrl,
        bookIdMD5: this._md5FromUrl(pageUrl),
        downloadUrls: [...mirrors],
        category: "books",
        nsfw: false,
        source: this.siteTitle,
        parentSite: this.primarySource
      };
    } catch (e) {
      console.error("Details error:", e);
      return null;
    }
  },
  _txt(el) {
    return el?.textContent?.trim() || "";
  },
  _toAbs(path) {
    try {
      return path ? new URL(path, this.primarySource).toString() : "";
    } catch {
      return "";
    }
  },
  _md5FromUrl(url) {
    try {
      const seg = new URL(url).pathname.split("/").filter(Boolean).pop();
      const m = seg.match(/[a-f0-9]{32}/i);
      return (m ? m[0] : seg).toLowerCase();
    } catch {
      return "";
    }
  },
  _cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
  }
};
