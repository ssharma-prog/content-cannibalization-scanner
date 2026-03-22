# Content Cannibalization Scanner

Static single-page tool that finds overlapping blog posts competing for the same search queries. Enter any website URL, get a similarity report with heatmap visualization.

## Features

- **Automatic sitemap discovery** — tries standard paths, sitemap indexes, robots.txt
- **TF-IDF similarity analysis** — custom implementation, no dependencies
- **Interactive heatmap** — Plotly.js visualization, click cells to jump to pairs
- **Sortable results table** — with CSV export
- **Optional Gemini AI analysis** — semantic similarity + merge/differentiate recommendations
- **Dark mode UI** — clean, responsive design

## Usage

1. Open `index.html` in a browser (or visit the GitHub Pages URL)
2. Enter a website URL and click Scan
3. Optionally add a Gemini API key for AI-powered analysis
4. Review the heatmap and table for overlapping content
5. Export results as CSV

## Security

- Gemini API key held in memory only, cleared on page unload
- CSP restricts network requests to 3 origins (CORS proxies + Google API)
- No localStorage, cookies, or persistence

## Technical Details

- Zero build step, zero dependencies (except Plotly.js CDN)
- CORS proxy with automatic fallback
- Batched requests (5 concurrent) to avoid rate limiting
- Porter stemmer for term normalization
- Handles 200+ posts efficiently
