# my-anymex-extensions

JavaScript extension for **AnymeX** and **Mangayomi**: AllManga (English, manga).

```
my-anymex-extensions/
├── index.json                         # repo manifest the app reads
├── README.md
├── docs/
│   └── capture-hook.js                # console helper to capture query hashes
└── javascript/
    ├── icon/
    │   └── en.allmanga.png
    └── manga/src/en/
        └── allmanga.js                # the extension
```

## Status

| Feature | State |
|---|---|
| Manga details + chapter list | Verified against the live API |
| Popular / Latest / Search | Needs the list hash (see below) |
| Chapter images | Needs the pages hash and image host (see below) |
| Cloudflare | `api.allanime.day` is behind an interactive challenge; depends on the app's WebView handling |

## Install

Repo URL to add in the app:

```
https://raw.githubusercontent.com/fumioryoto/my-anymex-extensions/main/index.json
```

- **Mangayomi:** More > Browse > Extensions > Manga > Manga extension repos > add the URL > install **AllManga**.
- **AnymeX:** Settings > Extensions > Manga > Add repo > paste the URL > install **AllManga**.

If the source shows a Cloudflare error, open it in the in-app WebView, solve the challenge, and retry.

## Capturing hashes

The site sends only a sha256 hash of each GraphQL query, and hashes change when the site redeploys.

1. Open `https://allmanga.to/manga` in Chrome, then DevTools > Console.
2. Paste `docs/capture-hook.js`.
3. Without reloading, use the search box, open a manga, then open a chapter.
4. Each printed line looks like `.../api?variables={...}&extensions={"persistedQuery":{..."sha256Hash":"<HASH>"}}`.
   - the one with `search` / `limit` / `page` is the **list** hash
   - the one fired when the reader opens is the **pages** hash
5. In the app, open the source's settings and paste the hashes into *Search/browse query hash* and *Chapter pages query hash*. Or put them in `DEFAULT_HASHES` in `allmanga.js` and push.

Also check that the `variables` in each captured line match what `fetchList` and `getPageList` send, and fix the code if they differ.

## Testing checklist

1. Browse > AllManga > Popular and Latest load with covers.
2. Search "Became the Lout First Prince" (id `jBAmoBMTfNQtAFNej`) and open it.
3. The chapter list has 61 entries (62 down to 0, with 45-47 missing; the site skips them).
4. Open Chapter 11 and confirm the pages load.
5. Switch the source setting between Translated and Raw and confirm the list changes.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Cloudflare challenge" error | Solve it in the WebView, then retry |
| "Missing 'list'/'pages' hash" | Capture and set the hash |
| `PERSISTED_QUERY_NOT_FOUND` | Site redeployed; recapture the hash |
| Covers or pages blank | Wrong image host; set *Image base URL* in settings |
| Install fails | `sourceCodeUrl` in `index.json` does not match a real file path |

Content availability on the site can change at any time. Make sure that publishing an extension for it is acceptable where you host it.
