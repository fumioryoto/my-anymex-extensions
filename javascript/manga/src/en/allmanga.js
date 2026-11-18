const mangayomiSources = [{
    "name": "AllManga",
    "lang": "en",
    "baseUrl": "https://allmanga.to",
    "apiUrl": "https://api.allanime.day/api",
    "iconUrl": "https://raw.githubusercontent.com/fumioryoto/my-anymex-extensions/main/javascript/icon/en.allmanga.png",
    "typeSource": "single",
    "itemType": 0,
    "version": "0.0.1",
    "pkgPath": "manga/src/en/allmanga.js"
}];

// ───────────── VERIFY THESE AGAINST DEVTOOLS (see testing guide) ─────────────
const IMG_BASE = "https://wp.youtube-anime.com/aln.youtube-anime.com/"; // prefix for relative thumbnails
const PAGE_SIZE = 26;

const Q_LIST = `query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  mangas(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges { _id name englishName thumbnail }
  }
}`;

const Q_DETAIL = `query($id: String!) {
  manga(_id: $id) {
    _id name englishName thumbnail description authors genres tags status availableChaptersDetail
  }
}`;

const Q_PAGES = `query($mangaId: String!, $translationType: VaildTranslationTypeEnumType!, $chapterString: String!) {
  chapterPages(mangaId: $mangaId, translationType: $translationType, chapterString: $chapterString) {
    edges { pictureUrls pictureUrlHead }
  }
}`;
// ──────────────────────────────────────────────────────────────────────────────

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return true;
    }

    getHeaders(url) {
        return {
            "Referer": "https://allmanga.to/",
            "Origin": "https://allmanga.to",
            "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
            "Accept": "application/json, text/plain, */*"
        };
    }

    // ───────── helpers ─────────
    get apiUrl() {
        return mangayomiSources[0].apiUrl;
    }

    get translationType() {
        const pref = new SharedPreferences().get("translation_type");
        return pref === "raw" ? "raw" : "sub";
    }

    async gql(query, variables) {
        const url = this.apiUrl
            + "?variables=" + encodeURIComponent(JSON.stringify(variables))
            + "&query=" + encodeURIComponent(query);
        const res = await this.client.get(url, this.getHeaders(url));
        const json = JSON.parse(res.body);
        if (json.errors && !json.data) {
            throw new Error("AllManga API error: " + JSON.stringify(json.errors).slice(0, 200));
        }
        return json.data;
    }

    img(path) {
        if (!path) return "";
        if (path.startsWith("http")) return path;
        return IMG_BASE + path.replace(/^\//, "");
    }

    toList(edges) {
        return (edges || []).map(m => ({
            name: m.englishName || m.name,
            imageUrl: this.img(m.thumbnail),
            link: `/manga/${m._id}`
        }));
    }

    async fetchList(search, page) {
        const data = await this.gql(Q_LIST, {
            search: search,
            limit: PAGE_SIZE,
            page: page,
            translationType: this.translationType,
            countryOrigin: "ALL"
        });
        const list = this.toList(data.mangas.edges);
        return { list, hasNextPage: list.length >= PAGE_SIZE };
    }

    // ───────── browse ─────────
    async getPopular(page) {
        // "size" + "sortBy" are accepted by the site's SearchInput
        return this.fetchList({ allowAdult: false, allowUnknown: false, sortBy: "Top" }, page);
    }

    async getLatestUpdates(page) {
        return this.fetchList({ allowAdult: false, allowUnknown: false, sortBy: "Latest_Update" }, page);
    }

    async search(query, page, filters) {
        return this.fetchList({ allowAdult: false, allowUnknown: false, query: query }, page);
    }

    // ───────── detail ─────────
    async getDetail(url) {
        // url: "/manga/<id>" or full URL
        const id = url.split("/manga/")[1].split("/")[0].split("?")[0];
        const data = await this.gql(Q_DETAIL, { id });
        const m = data.manga;

        const statusMap = { "Releasing": 0, "Finished": 1, "On Hiatus": 2, "Cancelled": 3 };
        const status = statusMap[m.status] !== undefined ? statusMap[m.status] : 5;

        const description = (m.description || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .trim();

        // availableChaptersDetail: { sub: ["1","2",...], raw: [...] }
        const detail = m.availableChaptersDetail || {};
        const type = this.translationType;
        let nums = detail[type] || [];
        if (nums.length === 0) nums = detail[type === "sub" ? "raw" : "sub"] || [];
        const usedType = (detail[type] && detail[type].length) ? type : (type === "sub" ? "raw" : "sub");

        const chapters = nums
            .slice()
            .sort((a, b) => parseFloat(b) - parseFloat(a)) // newest first
            .map(n => ({
                name: `Chapter ${n}`,
                url: `/manga/${id}/chapter-${n}-${usedType}`,
                dateUpload: null,
                scanlator: usedType === "raw" ? "RAW" : ""
            }));

        return {
            name: m.englishName || m.name,
            imageUrl: this.img(m.thumbnail),
            link: `/manga/${id}`,
            description: description,
            author: (m.authors || []).join(", "),
            status: status,
            genre: [].concat(m.genres || [], m.tags || []).filter((v, i, a) => v && a.indexOf(v) === i),
            chapters: chapters
        };
    }

    // ───────── reader ─────────
    async getPageList(url) {
        // e.g. /manga/jBAmoBMTfNQtAFNej/chapter-11-sub
        const match = url.match(/\/manga\/([^\/]+)\/chapter-(.+)-(sub|raw|dub)/);
        if (!match) throw new Error("Unrecognised chapter URL: " + url);
        const [, mangaId, chapterString, type] = match;

        const data = await this.gql(Q_PAGES, {
            mangaId: mangaId,
            translationType: type,
            chapterString: chapterString
        });

        const edge = (data.chapterPages.edges || [])[0];
        if (!edge) return [];

        let head = edge.pictureUrlHead || "";
        let pics = edge.pictureUrls || [];
        pics = pics.slice().sort((a, b) => (a.num || 0) - (b.num || 0));

        return pics.map(p => {
            const u = p.url.startsWith("http") ? p.url : head + p.url;
            return { url: u, headers: this.getHeaders(u) };
        });
    }

    // ───────── misc ─────────
    getFilterList() {
        return [];
    }

    getSourcePreferences() {
        return [{
            key: "translation_type",
            listPreference: {
                title: "Chapter language type",
                summary: "",
                valueIndex: 0,
                entries: ["Translated (sub)", "Raw"],
                entryValues: ["sub", "raw"]
            }
        }];
    }
}
