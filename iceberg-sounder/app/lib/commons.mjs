// Wikimedia Commons image search. Free and keyless, but Wikimedia's API etiquette
// requires a User-Agent with contact details, so this stays off until
// WIKIMEDIA_CONTACT (an email address or URL) is set.
const API = "https://commons.wikimedia.org/w/api.php";
const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function createCommons({ contact = process.env.WIKIMEDIA_CONTACT, fetchImpl = fetch } = {}) {
  return {
    configured: Boolean(contact),
    async searchImages(query, { limit = 12, signal } = {}) {
      if (!contact || !query) return [];
      const params = new URLSearchParams({
        action: "query", format: "json", formatversion: "2",
        generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: String(limit),
        prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "640",
        iiextmetadatafilter: "Artist|LicenseShortName|ImageDescription",
      });
      const res = await fetchImpl(`${API}?${params}`, {
        headers: { "user-agent": `IcebergSounder/1.0 (${contact})`, accept: "application/json" },
        signal,
      });
      if (!res.ok) throw new Error(`Wikimedia Commons returned ${res.status}`);
      const data = await res.json();
      const pages = data?.query?.pages || [];
      return pages
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((p) => {
          const ii = p.imageinfo?.[0];
          if (!ii || !/^image\/(jpeg|png|webp|gif|tiff|svg\+xml)$/.test(ii.mime || "")) return null;
          const m = ii.extmetadata || {};
          return {
            title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
            url: ii.descriptionurl,
            image: String(ii.thumburl || ii.url || "").split("?")[0],
            width: ii.thumbwidth || 0,
            height: ii.thumbheight || 0,
            author: stripTags(m.Artist?.value).slice(0, 120),
            license: stripTags(m.LicenseShortName?.value).slice(0, 60),
            text: stripTags(m.ImageDescription?.value).slice(0, 300),
          };
        })
        .filter((x) => x && x.url && x.image);
    },
  };
}
