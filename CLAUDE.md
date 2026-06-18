# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A zero-build static site for **GitHub Pages**: a landing page (`index.html`) that renders a
collapsible data tree + searchable card grid of hosted pages, driven by a single `sites.json`
manifest. The hosted pages themselves are self-contained `.html` files under `projects/` and `other/`.
There is no package manager, no build step, and no test suite.

## Commands

```bash
python3 gen-index.py            # regenerate sites.json from the repo's .html files
python3 -m http.server 8000     # local preview at http://localhost:8000
```

Open via `http://localhost:8000`, not `file://` — browsers block `fetch('sites.json')` on local
files, so over `file://` the page silently falls back to built-in sample data.

## How it fits together

- **`gen-index.py`** walks the repo, builds the folder/page tree, and **merges** with the existing
  `sites.json` so hand-edited `name`/`desc`/`tags` and the `server` block survive regeneration
  (matched by `url`). New `.html` files are added; deleted ones drop out. It skips `index.html`
  (the landing page), dotfiles, and `.git`/`.github`/`node_modules`. A folder's `index.html` is
  titled after the folder, not "Index". If no pages are found it leaves an existing `sites.json`
  untouched rather than wiping it.
- **`index.html`** is one self-contained file (HTML/CSS/JS, only Google Fonts over CDN). It fetches
  `sites.json` on load. "Manage" mode edits live **in memory only** — changes persist only by
  clicking **Export**, which downloads a new `sites.json` to commit.
- **`.github/workflows/build-index.yml`** runs on push to `main` (and manual dispatch): it runs
  `gen-index.py`, then deploys the whole repo to Pages via GitHub Actions. The branch name `main`
  is hardcoded here.

`sites.json` is generated and may not exist in a fresh checkout — run `gen-index.py` to create it.

## Adding or changing hosted pages

Add or delete `.html` files (e.g. `projects/new-thing/index.html`) and push — the Action
regenerates `sites.json`. To edit descriptions/tags/titles, either edit `sites.json` by hand, or
use the live page's **Manage → Export** flow and commit the downloaded file. Two source-of-truth
rules to respect: the tree structure comes from the actual files (via `gen-index.py`), while
descriptions/tags/custom titles live in `sites.json` and are preserved by the merge.
