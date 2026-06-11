# Vizor Solutions — Web

Corporate website for [Vizor Solutions](https://vizor-solutions.com) — premium architectural visualization studio.

## Stack

Static HTML / CSS / JS — no build, no framework. Designed to deploy as-is on any static host (Vercel, Netlify, GitHub Pages, S3, etc.).

- **Type**: Bebas Neue + DM Sans + DM Mono (Google Fonts)
- **Languages**: EN / ES via `assets/js/vizor-lang.js`
- **Mobile nav**: hamburger menu via `assets/js/vizor-nav.js`

## Pages

| File                | Section                |
| ------------------- | ---------------------- |
| `index.html`        | Home                   |
| `vz-credits.html`   | VZ Credits — pricing   |
| `sales-tool.html`   | Sales Tool product     |
| `services.html`     | Work / portfolio       |
| `process.html`      | How we work            |
| `about.html`        | About                  |

## Local preview

The site uses `fetch()` for some assets, so it needs to be served (not opened as `file://`).

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

## Deploy

Hosted on Vercel — auto-deploys from `main`.
