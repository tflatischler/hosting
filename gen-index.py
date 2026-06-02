#!/usr/bin/env python3
"""gen-index.py — regenerate sites.json from the HTML files in this repo.

Walks the site root, builds the folder/page tree, and MERGES with any existing
sites.json so manually-added descriptions, tags, renamed titles and the server
block all survive. New files are added, removed files drop out.

Run locally before committing, or let the GitHub Action run it on every push.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
MANIFEST = ROOT / "sites.json"
ROOT_INDEX = ROOT / "index.html"                   # the landing page itself — never list it
SKIP_DIRS = {".git", ".github", "node_modules"}    # never descend into these


def load_existing():
    """Return (url -> page metadata) and the server block from any existing manifest."""
    meta, server = {}, None
    if MANIFEST.exists():
        try:
            data = json.loads(MANIFEST.read_text())
            server = data.get("server")

            def walk(nodes):
                for n in nodes:
                    if n.get("type") == "page" and n.get("url"):
                        meta[n["url"]] = n
                    elif n.get("type") == "folder":
                        walk(n.get("children", []))

            walk(data.get("tree", []))
        except Exception:
            pass
    return meta, server


def title_from(stem):
    return stem.replace("-", " ").replace("_", " ").strip().title()


def walk_dir(d, meta):
    nodes = []
    # folders first, then files, each alphabetically
    for p in sorted(d.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        if p.name.startswith(".") or p.name in SKIP_DIRS:
            continue
        if p.is_dir():
            kids = walk_dir(p, meta)
            if kids:  # only list folders that actually contain pages
                nodes.append({"type": "folder", "name": p.name, "children": kids})
        elif p.suffix.lower() in (".html", ".htm"):
            if p == ROOT_INDEX:                    # skip the landing page itself
                continue
            url = str(p.relative_to(ROOT)).replace("\\", "/")
            prev = meta.get(url, {})
            # a folder's index.html should be named after the folder, not "Index"
            label_src = p.parent.name if p.stem.lower() == "index" else p.stem
            nodes.append({
                "type": "page",
                "name": prev.get("name") or title_from(label_src),
                "url": url,
                "desc": prev.get("desc", ""),
                "tags": prev.get("tags", []),
            })
    return nodes


def count_pages(nodes):
    return sum(1 if n.get("type") == "page" else count_pages(n.get("children", []))
               for n in nodes)


def main():
    meta, server = load_existing()
    tree = walk_dir(ROOT, meta)

    if count_pages(tree) == 0 and MANIFEST.exists():
        print("No HTML pages found — leaving existing sites.json untouched.")
        return

    data = {
        "server": server or {"name": "My Server", "tagline": "self-hosted · github pages"},
        "tree": tree,
    }
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote sites.json — {count_pages(tree)} pages.")


if __name__ == "__main__":
    main()
