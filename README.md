# Hosted Pages — landing page + data tree

A self-contained landing page for a static host. It shows a collapsible **data tree**
and a searchable grid of **page cards**, all driven by a single `sites.json` manifest.
Built to run on **GitHub Pages** with no build tooling.

## Files

| File | What it is |
|------|------------|
| `index.html` | The landing page. Pure HTML/CSS/JS, no dependencies (just Google Fonts over CDN). |
| `sites.json` | The manifest the page reads on load — the source of truth for the tree. |
| `gen-index.py` | Regenerates `sites.json` from the repo's `.html` files. Preserves your descriptions, tags, custom names and the `server` block on re-runs. |
| `.github/workflows/build-index.yml` | GitHub Action: regenerates `sites.json` and deploys on every push. |
| `.nojekyll` | Tells Pages to serve files as-is (no Jekyll processing). |

## One-time setup

1. Create a repo and push these files (default branch `main` — if yours is `master`,
   change the branch name in `.github/workflows/build-index.yml`).
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push. The Action runs, regenerates `sites.json` from your files, and publishes to
   `https://<user>.github.io/<repo>/`.

## Day-to-day: adding / removing pages

Just add or delete `.html` files (e.g. `projects/new-thing/index.html`) and push.
The Action re-runs `gen-index.py`, which:

- adds new pages and drops removed ones automatically,
- names a folder's `index.html` after the folder (`projects/pi-camera/index.html` → "Pi Camera"),
- **keeps** any description, tags or renamed title you set, matched by URL.

To edit descriptions/tags/structure by hand: open the live page, click **Manage**,
make changes, hit **Export** to download the updated `sites.json`, and commit it.
Your edits survive the next auto-regeneration.

## Without the Action (plain "deploy from branch")

Prefer the classic flow? Set **Settings → Pages → Source = Deploy from a branch**,
run `python3 gen-index.py` locally before each commit, and push. Same result, manual trigger.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(Opening `index.html` via `file://` won't load `sites.json` because browsers block
`fetch` on local files — use the tiny server above, or just rely on the built-in
fallback sample that renders when no manifest is reachable.)
