# AllManga source for AnymeX / Mangayomi

An unofficial JavaScript anime source for the Mangayomi-compatible extension runtime used by AnymeX.

## Current implementation

- Trending anime listing
- Latest updates listing
- Title search
- Anime details and genres
- Episode list
- Sub / dub / raw preference
- Direct video URLs only when the episode metadata exposes a direct `vidPath`

This source uses the GraphQL endpoint documented by an archived, unofficial AllManga API project:

- `https://api.allanime.day/api`
- `shows(...)` for catalogue/search results
- `show(_id: ...)` for details
- `episodeInfos(...)` for episode metadata

The API and its schema are third-party interfaces and may change without notice. Requests are spaced sequentially; avoid rapid refreshes because the service may rate-limit clients.

## Important playback limitation

The extension does **not** bypass CAPTCHA, collect browser cookies, defeat access controls, decrypt protected player payloads, or extract media from third-party embed players. It only hands the player a direct video URL when that URL is already present in the episode metadata. Some titles or episodes may therefore list successfully but have no playable direct stream in this implementation.

Use the extension only where you have the rights and permission to access the content, and follow the website's terms and applicable law.

## Repository layout

```text
allmanga-anymex-extension/
├── anime_index.json
├── javascript/
│   └── anime/
│       └── src/
│           └── en/
│               └── allmanga.js
└── README.md
```

## Publish your own repository

1. Create a public GitHub repository named `allmanga-anymex-extension`.
2. Upload the files while preserving the folder structure.
3. Replace `YOUR_GITHUB_USERNAME` in the `sourceCodeUrl` field in both `anime_index.json` and `javascript/anime/src/en/allmanga.js` with your GitHub username.
4. Commit and push the changes.
5. Open the raw catalogue URL:

   `https://raw.githubusercontent.com/fumioryoto/allmanga-anymex-extension/main/anime_index.json`

6. Add that URL under AnymeX's **Anime repository** settings.

## Local development and testing

The extension runs inside the Mangayomi-compatible JavaScript runtime, not ordinary Node.js. The `MProvider`, `Client`, and `SharedPreferences` objects are supplied by the app.

1. Use a recent Mangayomi desktop build or another compatible source editor/runtime.
2. Create a single-source anime extension with:
   - Name: `AllManga`
   - Base URL: `https://allmanga.to/anime`
   - API URL: `https://api.allanime.day/api`
   - Language: `en`
   - Is Manga: `false`
3. Paste the contents of `javascript/anime/src/en/allmanga.js` into the source editor.
4. Test `getPopular(1)`, `getLatestUpdates(1)`, `search("one piece", 1, [])`, `getDetail(<a returned result link>)`, and `getVideoList(<an episode URL returned by getDetail>)`.
5. Check the app console if the GraphQL schema or the site's direct-video metadata has changed.
6. Increment both source versions in the metadata/catalogue whenever you publish code changes.

## Notes

- `anime_index.json` is a template until you replace the GitHub username.
- The source ID `824761039` is a stable identifier for this personal repository. Change it only if you intentionally want AnymeX to treat it as a different source.
- `appMinVerReq` is set to `0.5.0`, matching current example anime catalogues. Adjust only after confirming the minimum version supported by your target app build.
