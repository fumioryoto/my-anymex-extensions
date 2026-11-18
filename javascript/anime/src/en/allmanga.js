const mangayomiSources = [
  {
    name: "AllManga",
    id: 824761039,
    lang: "en",
    baseUrl: "https://allmanga.to/anime",
    apiUrl: "https://api.allanime.day/api",
    iconUrl: "https://www.google.com/s2/favicons?sz=256&domain=allmanga.to",
    typeSource: "single",
    itemType: 1,
    version: "0.1.0",
    pkgPath: "anime/src/en/allmanga.js",
    sourceCodeUrl: "https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/allmanga-anymex-extension/main/javascript/anime/src/en/allmanga.js",
    isManga: false,
    isNsfw: false,
    hasCloudflare: false,
    isFullData: false,
    appMinVerReq: "0.5.0",
    sourceCodeLanguage: 1,
    dateFormat: "",
    dateFormatLocale: "",
    additionalParams: "",
    notes: "Unofficial community source. Uses AllManga's publicly exposed catalogue/episode metadata API."
  }
];

const AM_SHOW_FIELDS =
  "_id name englishName nativeName thumbnail episodeCount score type status genres availableEpisodes season altNames countryOfOrigin";
const AM_DETAIL_FIELDS =
  "_id name englishName nativeName description thumbnail episodeCount score type status genres availableEpisodes season altNames countryOfOrigin tags studios airedStart airedEnd";
const AM_EPISODE_FIELDS =
  "_id episodeIdNum notes thumbnails vidInforssub vidInforsdub vidInforsraw";
const AM_CDN_BASE = "https://allanimenews.com";
const AM_PAGE_SIZE = 26;

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this._episodeCache = {};
  }

  get supportsLatest() {
    return true;
  }

  _headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Origin": "https://allmanga.to",
      "Referer": "https://allmanga.to/",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*"
    };
  }

  _safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _gqlString(value) {
    // JSON string literals are valid GraphQL string literals and safely escape quotes.
    return JSON.stringify(String(value == null ? "" : value));
  }

  async _graphql(query) {
    const endpoint = this.source.apiUrl || "https://api.allanime.day/api";
    const response = await this.client.post(endpoint, this._headers(), { query: query });
    let payload;
    try {
      payload = JSON.parse(response.body || "{}");
    } catch (error) {
      throw new Error("AllManga returned a non-JSON API response.");
    }

    if (payload.errors && payload.errors.length) {
      const message = payload.errors[0] && payload.errors[0].message;
      throw new Error("AllManga API: " + (message || "GraphQL request failed."));
    }
    if (!payload.data) {
      throw new Error("AllManga API returned no data.");
    }
    return payload.data;
  }

  _showsQuery(sort, page, searchTerm) {
    const term = searchTerm ? ",query:" + this._gqlString(searchTerm) : "";
    return "{shows(search:{sortBy:" + sort + term + "},limit:" + AM_PAGE_SIZE +
      ",page:" + page + "){edges{" + AM_SHOW_FIELDS + "}}}";
  }

  _showId(value) {
    const raw = String(value || "").trim();
    if (raw.indexOf("||") >= 0) return raw.split("||")[0];
    if (/^https?:\/\//i.test(raw)) {
      const clean = raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
      return clean.substring(clean.lastIndexOf("/") + 1);
    }
    return raw.replace(/^allmanga:\/\//i, "").replace(/^show\//, "");
  }

  _animeLink(id) {
    return "https://allmanga.to/anime/" + encodeURIComponent(String(id));
  }

  _toAnime(item) {
    const id = item && item._id ? String(item._id) : "";
    const title = item && (item.englishName || item.name || item.nativeName);
    if (!id || !title) return null;
    return {
      name: String(title),
      imageUrl: item.thumbnail || "",
      link: this._animeLink(id)
    };
  }

  async _listing(sort, page, query) {
    const currentPage = Math.max(1, Math.floor(this._safeNumber(page, 1)));
    const data = await this._graphql(this._showsQuery(sort, currentPage, query));
    const edges = data && data.shows && Array.isArray(data.shows.edges) ? data.shows.edges : [];
    const list = [];
    for (let i = 0; i < edges.length; i++) {
      const item = this._toAnime(edges[i]);
      if (item) list.push(item);
    }
    return { list: list, hasNextPage: edges.length >= AM_PAGE_SIZE };
  }

  async getPopular(page) {
    return await this._listing("Trending", page, "");
  }

  async getLatestUpdates(page) {
    return await this._listing("Latest_Update", page, "");
  }

  async search(query, page, filters) {
    const term = String(query || "").trim();
    if (!term) return await this.getPopular(page);
    return await this._listing("Latest_Update", page, term);
  }

  async _fetchShow(showId) {
    const query = "{show(_id:" + this._gqlString(showId) + "){" + AM_DETAIL_FIELDS + "}}";
    const data = await this._graphql(query);
    return data && data.show ? data.show : null;
  }

  async _fetchEpisodes(showId, start, end) {
    const from = this._safeNumber(start, 1);
    const to = this._safeNumber(end, 9999);
    const query = "{episodeInfos(showId:" + this._gqlString(showId) +
      ",episodeNumStart:" + from + ",episodeNumEnd:" + to +"){" +
      AM_EPISODE_FIELDS + "}}";
    const data = await this._graphql(query);
    const episodes = data && Array.isArray(data.episodeInfos) ? data.episodeInfos : [];
    this._episodeCache[showId] = episodes;
    return episodes;
  }

  _episodeNumber(episode) {
    return String(episode && episode.episodeIdNum != null ? episode.episodeIdNum : "");
  }

  _videoInfo(episode, audio) {
    if (!episode) return null;
    let info = episode["vidInfors" + audio];
    if (typeof info === "string") {
      try { info = JSON.parse(info); } catch (error) { return null; }
    }
    return info && typeof info === "object" ? info : null;
  }

  _hasDirectVideo(episode, audio) {
    const info = this._videoInfo(episode, audio);
    return !!(info && info.vidPath);
  }

  _normaliseVideoUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return AM_CDN_BASE.replace(/\/+$/, "") + "/" + value.replace(/^\/+/, "");
  }

  _statusCode(value) {
    const status = String(value || "").toLowerCase();
    if (status.indexOf("finished") >= 0 || status.indexOf("completed") >= 0) return 1;
    if (status.indexOf("airing") >= 0 || status.indexOf("releasing") >= 0 || status.indexOf("ongoing") >= 0) return 0;
    if (status.indexOf("upcoming") >= 0 || status.indexOf("not yet") >= 0) return 4;
    return 5;
  }

  _formatStudio(studios) {
    if (Array.isArray(studios)) return studios.join(", ");
    return studios == null ? "" : String(studios);
  }

  async getDetail(url) {
    const showId = this._showId(url);
    if (!showId) throw new Error("Could not determine the AllManga anime ID.");

    const show = await this._fetchShow(showId);
    if (!show) throw new Error("Anime not found on AllManga.");

    const episodes = await this._fetchEpisodes(showId, 1, 9999);
    episodes.sort((a, b) => this._safeNumber(a.episodeIdNum, 0) - this._safeNumber(b.episodeIdNum, 0));

    const chapters = [];
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      const number = this._episodeNumber(episode);
      if (!number) continue;

      const hasSub = this._hasDirectVideo(episode, "sub");
      const hasDub = this._hasDirectVideo(episode, "dub");
      const hasRaw = this._hasDirectVideo(episode, "raw");
      const audioLabels = [];
      if (hasSub) audioLabels.push("Sub");
      if (hasDub) audioLabels.push("Dub");
      if (hasRaw) audioLabels.push("Raw");

      chapters.push({
        name: "Episode " + number + (episode.notes ? " - " + String(episode.notes) : ""),
        url: showId + "||" + number,
        scanlator: audioLabels.join(" · ")
      });
    }
    chapters.reverse();

    const genres = Array.isArray(show.genres) ? show.genres : (Array.isArray(show.tags) ? show.tags : []);
    const title = show.englishName || show.name || show.nativeName || showId;

    return {
      name: String(title),
      imageUrl: show.thumbnail || "",
      description: show.description || "",
      author: this._formatStudio(show.studios),
      genre: genres.map(function (genre) { return String(genre); }),
      status: this._statusCode(show.status),
      link: this._animeLink(showId),
      chapters: chapters
    };
  }

  getSourcePreferences() {
    return [
      {
        key: "allmanga_audio_preference",
        listPreference: {
          title: "Preferred audio",
          summary: "Choose which audio track to show first. Other available tracks remain selectable.",
          valueIndex: 0,
          entries: ["Sub", "Dub", "Raw", "All available"],
          entryValues: ["sub", "dub", "raw", "all"]
        }
      }
    ];
  }

  _audioPreference() {
    try {
      const value = new SharedPreferences().get("allmanga_audio_preference");
      return value || "sub";
    } catch (error) {
      return "sub";
    }
  }

  async getVideoList(url) {
    const parts = String(url || "").split("||");
    const showId = parts[0] || "";
    const episodeNumber = parts[1] || "";
    if (!showId || !episodeNumber) return [];

    let episodes = this._episodeCache[showId];
    if (!Array.isArray(episodes) || !episodes.length) {
      // Query only the requested episode range first; if the backend does not
      // return it, fall back to the full episode range once.
      const n = this._safeNumber(episodeNumber, 1);
      episodes = await this._fetchEpisodes(showId, Math.max(0, n - 0.01), n + 0.01);
    }

    let episode = null;
    for (let i = 0; i < episodes.length; i++) {
      if (this._episodeNumber(episodes[i]) === episodeNumber) {
        episode = episodes[i];
        break;
      }
    }

    if (!episode) {
      episodes = await this._fetchEpisodes(showId, 1, 9999);
      for (let i = 0; i < episodes.length; i++) {
        if (this._episodeNumber(episodes[i]) === episodeNumber) {
          episode = episodes[i];
          break;
        }
      }
    }
    if (!episode) throw new Error("Could not find this episode in AllManga's episode data.");

    const preference = this._audioPreference();
    const order = preference === "all" ? ["sub", "dub", "raw"] : [preference, "sub", "dub", "raw"];
    const seen = {};
    const videos = [];

    for (let i = 0; i < order.length; i++) {
      const audio = order[i];
      if (seen[audio]) continue;
      seen[audio] = true;
      const info = this._videoInfo(episode, audio);
      if (!info || !info.vidPath) continue;

      const videoUrl = this._normaliseVideoUrl(info.vidPath);
      if (!videoUrl) continue;
      const rawQuality = String(info.vidResolution == null ? "" : info.vidResolution);
      const quality = rawQuality ? (rawQuality.match(/p$/i) ? rawQuality : rawQuality + "p") : "Auto";
      videos.push({
        url: videoUrl,
        originalUrl: videoUrl,
        quality: quality + " - " + audio.toUpperCase(),
        headers: {
          "Referer": AM_CDN_BASE + "/",
          "Origin": AM_CDN_BASE
        }
      });
      if (preference !== "all" && videos.length) break;
    }

    if (!videos.length) {
      throw new Error("No direct video URL was provided in the episode metadata. This source does not bypass CAPTCHA or decode protected third-party players.");
    }
    return videos;
  }
}
