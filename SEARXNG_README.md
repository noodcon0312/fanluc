# SearXNG — OPTIONAL (self-hosted version)

> This version **does not need SearXNG anymore**: web search uses Bing +
> DuckDuckGo + Mojeek + Yahoo directly from the server.
> Only install SearXNG if you want one more source (set `SEARXNG_URL` in
> `.env`). The rest of this file is a guide for that case.

Prompt #3 set the default: **self-hosted SearXNG is the default, old
Yahoo works as fallback**.

## Why SearXNG?

- Free, unlimited, no API key needed.
- Has both images and news.
- Other free tiers are dead: Brave free dropped since 2/2026, Bing API
  stopped 8/2025, Google Custom Search will charge.

## Install with Docker (recommended)

```bash
cd searxng
docker compose up -d
```

Check: `http://localhost:8888/search?q=test&format=json`.

Formats not enabled in `settings.yml` return **403**. A sample file is
in `searxng/settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

Mount it to `/etc/searxng/settings.yml` in the container (already
configured in docker-compose.yml).

## How the server uses it

1. `GET /api/search?q=...` tries SearXNG first (if `SEARXNG_URL` set).
2. On failure or 0 results, falls back to Yahoo JP + DuckDuckGo + Bing
   as before.

## Image search

Same endpoint, only the category changes:

```
GET {SEARXNG_URL}/search?q=cats&categories=images&format=json
```

Response fields (check with console.log of one result to be sure):

- `img_src` — direct image URL
- `thumbnail_src` — thumbnail
- `url` — page containing the image
- `title` — title

Notes:

- Tool `image_search(query)`: the server returns an image list; the UI
  renders it as a grid (like MapEmbedCard).
- Broken-image protection: use thumbnail_src for the grid, open img_src
  only on click, onError hides broken images, optional proxy.
- Safety: SearXNG has a safe-search filter, keep it on.

## Troubleshooting

| Error | What to do |
| ----- | ---------- |
| `No results` | Check SearXNG logs with `docker logs searxng`; fallback runs automatically |
| `403` | Enable the `json` format in `settings.yml` |
| Slow | Lower timeout, the other engines still answer in parallel |
