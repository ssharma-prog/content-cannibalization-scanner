# Content Cannibalization Scanner

Static single-page tool that finds overlapping blog posts competing for the same search queries. Upload a WordPress export or scan any public URL — get a similarity report with cluster analysis.

**Live:** [ssharma-prog.github.io/content-cannibalization-scanner](https://ssharma-prog.github.io/content-cannibalization-scanner/)

## Features

- **WordPress XML import** (recommended) — upload your export file, zero network requests, bypasses Cloudflare
- **URL scanning** — automatic sitemap discovery with CORS proxy fallback
- **TF-IDF similarity analysis** — custom implementation, no external libraries
- **N-gram phrase overlap** — finds shared 4-6 word phrases between posts via Web Worker
- **Cluster analysis** — network graph + per-post breakdown showing cannibalization groups
- **Sortable results table** — with CSV export
- **Cloudflare/WAF detection** — skips blocked pages instead of analyzing them
- **Login page detection** — skips pages that require authentication
- **Content deduplication** — detects duplicate URLs returning identical content
- **Dark mode UI** — clean, responsive design

## Usage

### Upload Mode (Recommended)
1. Export your posts from WordPress ([how to export](https://wordpress.org/documentation/article/tools-export-screen/))
2. Upload the XML file and click Analyze
3. Review the similarity table
4. Run Phrase Overlap Analysis for deeper comparison
5. Run Cluster Analysis to identify problem post groups
6. Export results as CSV

### URL Scan Mode
1. Enter a website URL and click Scan
2. Results may vary due to Cloudflare/CORS proxy limitations
3. Add slug exceptions to filter out non-post pages

## Privacy

- **No data leaves the browser** — all analysis runs client-side
- **No cookies, localStorage, or persistence** — data is gone on refresh
- **No analytics or tracking** — zero third-party scripts
- **No backend** — static files hosted on GitHub Pages
- **Clear All Data button** — wipes everything from memory instantly
- **GDPR compliant** — nothing to comply with when no data is collected

## Technical Details

- Zero build step, zero external dependencies
- CORS proxy with automatic fallback (corsproxy.io + allorigins.win)
- Custom TF-IDF with Porter stemmer
- N-gram analysis runs in a Web Worker (falls back to main thread)
- Force-directed network graph rendered on canvas
- Handles 200+ posts efficiently
