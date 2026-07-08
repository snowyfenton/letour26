#!/usr/bin/env python3
"""Fetch one stage-pinned procyclingstats page for the TdF 2026 companion.

Usage: python scripts/fetch-pcs.py <page>
  <page> must match: stage-N, stage-N-gc, stage-N-points, stage-N-kom,
  stage-N-youth, or stage-N-complementary-results (N = 1..21).

Prints the page reduced to readable text (headings, lists, and tables as
pipe-separated rows) on stdout. Exits non-zero with a stderr message if the
page can't be fetched or looks like a bot-challenge page.

Fetch strategy: direct curl with a browser UA first (PCS serves curl fine but
blocks some proxy/datacenter IPs), then the markdown.new proxy as fallback.

Spoiler safety: the page argument is strictly validated so only stage-pinned
URLs can ever be requested — never the race homepage or live pages.
"""
import html
import re
import subprocess
import sys
from html.parser import HTMLParser

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
PAGE_RE = re.compile(r"^stage-([1-9]|1[0-9]|2[01])(-gc|-points|-kom|-youth|-complementary-results)?$")
CHALLENGE_MARKERS = ("Just a moment", "cf-challenge", "security verification",
                     "Checking your browser", "Attention Required")


def curl(url: str) -> str:
    out = subprocess.run(
        ["curl", "-sL", "--max-time", "40", "-A", UA, "-H", "Accept: text/html", url],
        capture_output=True, check=True,
    ).stdout.decode("utf-8", "ignore")
    if len(out) < 2000:
        raise ValueError(f"suspiciously short response ({len(out)} bytes) from {url}")
    if any(m.lower() in out.lower() for m in CHALLENGE_MARKERS):
        raise ValueError(f"bot-challenge page returned from {url}")
    return out


class TextExtractor(HTMLParser):
    """Reduce PCS HTML to headings, list items, and pipe-separated table rows."""
    SKIP = {"script", "style", "noscript", "iframe", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines = []
        self._skip_depth = 0
        self._cell = []       # text fragments of the current td/th
        self._row = None      # list of cell strings, or None outside a tr
        self._buf = []        # text fragments outside tables

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip_depth += 1
        elif tag == "tr":
            self._flush_buf()
            self._row = []
        elif tag in ("td", "th"):
            self._cell = []
        elif tag in ("h1", "h2", "h3", "h4", "li", "table", "div", "p", "ul", "br"):
            self._flush_buf()

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in ("td", "th"):
            if self._row is not None:
                self._row.append(" ".join("".join(self._cell).split()))
            self._cell = []
        elif tag == "tr":
            if self._row:
                self.lines.append(" | ".join(self._row))
            self._row = None
        elif tag in ("h1", "h2", "h3", "h4", "li", "table", "div", "p", "ul"):
            self._flush_buf()

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._row is not None:
            self._cell.append(data)
        else:
            self._buf.append(data)

    def _flush_buf(self):
        text = " ".join("".join(self._buf).split())
        self._buf = []
        if text:
            self.lines.append(text)


def extract(raw: str) -> str:
    p = TextExtractor()
    p.feed(raw)
    lines, prev = [], None
    for ln in p.lines:
        if ln != prev:
            lines.append(ln)
        prev = ln
    return "\n".join(lines)


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
    if len(sys.argv) != 2 or not PAGE_RE.match(sys.argv[1]):
        print("usage: fetch-pcs.py stage-N[-gc|-points|-kom|-youth|-complementary-results]",
              file=sys.stderr)
        sys.exit(2)
    page = sys.argv[1]
    pcs_url = f"https://www.procyclingstats.com/race/tour-de-france/2026/{page}"
    errors = []
    for url in (pcs_url, f"https://markdown.new/{pcs_url}"):
        try:
            raw = curl(url)
        except Exception as e:
            errors.append(str(e))
            continue
        # markdown.new output is already text; only strip HTML from a direct fetch
        body = extract(raw) if "<html" in raw[:2000].lower() else raw
        print(html.unescape(body))
        return
    print("fetch failed: " + " ; ".join(errors), file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
