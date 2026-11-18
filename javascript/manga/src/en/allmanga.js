const mangayomiSources = [{
    "name": "AllManga",
    "lang": "en",
    "baseUrl": "https://allmanga.to",
    "apiUrl": "https://api.allanime.day/api",
    "iconUrl": "https://raw.githubusercontent.com/fumioryoto/my-anymex-extensions/main/javascript/icon/en.allmanga.png",
    "typeSource": "single",
    "itemType": 0,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/allmanga.js"
}];

// ─────────────────────────────────────────────────────────────────────────────
// The site uses GraphQL *persisted queries*: only a sha256 hash is sent.
// Hashes change when the site redeploys. They can be overridden in the app
// (source settings) without editing this file. See README.md > "Capturing hashes".
//   VERIFIED  : H_DETAIL (tested in browser, HTTP 200)
//   UNVERIFIED: H_LIST, H_PAGES (empty until captured) and the variable shapes
//               marked "GUESS" below.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_HASHES = {
    detail: "d77781dcf964b97aea0be621dbde430e89e200b58526823ee6010dd11c3ca96a",
    list: "",
    pages: ""
};
// Prefix for relative paths like "mcovers/m_tbs/<id>/i3_001.webp". GUESS: verify.
const DEFAULT_IMG_BASE = "https://wp.youtube-anime.com/aln.youtube-anime.com/";
const PAGE_SIZE = 26;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return true;
    }

    getHeaders(url) {
        // No hard-coded User-Agent: cf_clearance is bound to the UA that solved the challenge.
        return {
            "Referer": "https://allmanga.to/",
            "Origin": "https://allmanga.to",
            "Accept": "application/json, text/plain, */*"
        };
    }

    // ───────── settings helpers ─────────
    pref(key, fallback) {
        const v = new SharedPreferences().get(key);
        return (v === undefined || v === null || String(v).trim() === "") ? fallback : String(v).trim();
    }

    get apiUrl() {
        return mangayomiSources[0].apiUrl;
    }

    get translationType() {
        return this.pref("translation_type", "sub") === "raw" ? "raw" : "sub";
    }

    hash(name) {
        return this.pref("hash_" + name, DEFAULT_HASHES[name]);
    }

    // ───────── networking ─────────
    async gql(hashName, variables) {
        const h = this.hash(hashName);
        if (!h) {
            throw new Error("Missing '" + hashName + "' hash. Set it in the source settings (see README > Capturing hashes).");
        }
        const url = this.apiUrl
            + "?variables=" + encodeURIComponent(JSON.stringify(variables))
            + "&extensions=" + encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: h } }));
        const res = await this.client.get(url, this.getHeaders(url));
        const body = (res.body || "").trim();
        if (body.startsWith("<")) {
            throw new Error("Cloudflare challenge: open the source in WebView, solve it, then retry.");
        }
        let json;
        try {
            json = JSON.parse(body);
        } catch (e) {
            throw new Error("Unexpected API response: " + body.slice(0, 120));
        }
        if (json.errors && !json.data) {
            throw new Error("AllManga API error: " + JSON.stringify(json.errors).slice(0, 200));
        }
        return json.data;
    }

    img(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return this.pref("img_base", DEFAULT_IMG_BASE).replace(/\/?$/, "/") + path.replace(/^\//, "");
    }

    // ───────── browse ─────────
    toList(edges) {
        return (edges || []).map(m => ({
            name: m.englishName || m.name,
            imageUrl: this.img(m.thumbnail),
            link: "/manga/" + m._id
        }));
    }

    async fetchList(search, page) {
        // GUESS: variable shape copied from the site's older search call; verify with captured request.
        const data = await this.gql("list", {
            search: Object.assign({ allowAdult: false, allowUnknown: false }, search),
            limit: PAGE_SIZE,
            page: page,
            translationType: this.translationType,
            countryOrigin: "ALL"
        });
        const list = this.toList(data.mangas.edges);
        return { list, hasNextPage: list.length >= PAGE_SIZE };
    }

    async getPopular(page) {
        return this.fetchList({ sortBy: "Top" }, page); // GUESS: sortBy value
    }

    async getLatestUpdates(page) {
        return this.fetchList({ sortBy: "Latest_Update" }, page); // GUESS: sortBy value
    }

    async search(query, page, filters) {
        return this.fetchList({ query: query }, page);
    }

    // ───────── detail ─────────  (VERIFIED against live response)
    async getDetail(url) {
        const id = url.split("/manga/")[1].split("/")[0].split("?")[0];
        const data = await this.gql("detail", { _id: id, search: { allowAdult: false, allowUnknown: false } });
        const m = data.manga;

        const statusMap = { "Releasing": 0, "Finished": 1, "On Hiatus": 2, "Cancelled": 3 };
        const status = statusMap[m.status] !== undefined ? statusMap[m.status] : 5;

        const description = (m.description || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
            .replace(/\\n/g, "\n")
            .trim();

        // availableChaptersDetail = { sub: ["62","61",...,"0"], raw: [] } (newest first, gaps are real)
        const detail = m.availableChaptersDetail || {};
        const pref = this.translationType;
        const usedType = (detail[pref] && detail[pref].length) ? pref : (pref === "sub" ? "raw" : "sub");
        const nums = detail[usedType] || [];

        const chapters = nums.map(n => ({
            name: "Chapter " + n,
            url: "/manga/" + id + "/chapter-" + n + "-" + usedType,
            dateUpload: null,
            scanlator: usedType === "raw" ? "RAW" : ""
        }));

        // tags look like "theme:reincarnation", "format:long_strip"; keep themes only
        const tags = (m.tags || [])
            .filter(t => t.startsWith("theme:"))
            .map(t => t.split(":")[1].replace(/_/g, " "));
        const genre = [].concat(m.genres || [], tags).filter((v, i, a) => v && a.indexOf(v) === i);

        // authors mixes Korean and Latin spellings; keep Latin-script ones
        const author = (m.authors || []).filter(a => /^[\x00-\x7F]+$/.test(a)).join(", ");

        return {
            name: m.englishName || m.name,
            imageUrl: this.img(m.thumbnail),
            link: "/manga/" + id,
            description: description,
            author: author,
            status: status,
            genre: genre,
            chapters: chapters
        };
    }

    // ───────── reader ─────────  (UNVERIFIED: needs the captured chapter-pages request)
    async getPageList(url) {
        // e.g. /manga/jBAmoBMTfNQtAFNej/chapter-11-sub
        const match = url.match(/\/manga\/([^\/]+)\/chapter-(.+)-(sub|raw|dub)/);
        if (!match) throw new Error("Unrecognised chapter URL: " + url);
        const mangaId = match[1], chapterString = match[2], type = match[3];

        // GUESS: variable names; replace with the captured ones.
        const data = await this.gql("pages", {
            mangaId: mangaId,
            translationType: type,
            chapterString: chapterString
        });

        const cp = data.chapterPages || {};
        const edge = (cp.edges || [])[0];
        if (!edge) return [];

        const head = edge.pictureUrlHead || "";
        const pics = (edge.pictureUrls || []).slice().sort((a, b) => (a.num || 0) - (b.num || 0));

        return pics.map(p => {
            const raw = typeof p === "string" ? p : p.url;
            const u = raw.startsWith("http") ? raw : head + raw;
            return { url: u, headers: this.getHeaders(u) };
        });
    }

    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [
            {
                key: "translation_type",
                listPreference: {
                    title: "Chapter language type",
                    summary: "",
                    valueIndex: 0,
                    entries: ["Translated (sub)", "Raw"],
                    entryValues: ["sub", "raw"]
                }
            },
            {
                key: "hash_detail",
                editTextPreference: {
                    title: "Detail query hash",
                    summary: "Leave empty to use the built-in hash",
                    value: "",
                    dialogTitle: "sha256 hash",
                    dialogMessage: ""
                }
            },
            {
                key: "hash_list",
                editTextPreference: {
                    title: "Search/browse query hash",
                    summary: "Required for Popular, Latest and Search",
                    value: "",
                    dialogTitle: "sha256 hash",
                    dialogMessage: ""
                }
            },
            {
                key: "hash_pages",
                editTextPreference: {
                    title: "Chapter pages query hash",
                    summary: "Required to read chapters",
                    value: "",
                    dialogTitle: "sha256 hash",
                    dialogMessage: ""
                }
            },
            {
                key: "img_base",
                editTextPreference: {
                    title: "Image base URL",
                    summary: "Prefix for relative cover paths",
                    value: "",
                    dialogTitle: "Image base URL",
                    dialogMessage: ""
                }
            }
        ];
    }
}
