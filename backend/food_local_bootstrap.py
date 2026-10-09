"""Embed the approved local food reference catalogue in the prototype page.

This replaces a second, latency-prone HTTP round trip on a fresh browser.
No external food APIs or production database are involved. Escape HTML script
terminators even inside JSON text before putting it in an inert script tag.
"""
import json
import re

BOOTSTRAP_ID = "eplan-local-food-catalog-bootstrap"
_SCRIPT_RE = re.compile(
    r'<script\s+src="/static/calculator-prototype\.js\?v=\d+"\s+defer></script>'
)


def embed_food_catalog(document, items, query_replacements, english_aliases):
    if not isinstance(document, str):
        raise ValueError("Prototype HTML must be a string")
    if not isinstance(items, list) or len(items) < 26:
        raise ValueError("Approved plus approximate food catalogue is missing")
    if document.count('id="' + BOOTSTRAP_ID + '"'):
        raise ValueError("HTML already contains a food catalogue bootstrap")
    matches = list(_SCRIPT_RE.finditer(document))
    if len(matches) != 1:
        raise ValueError("Expected exactly one versioned food search script")
    payload = {
        "items": items,
        "query_replacements": query_replacements,
        "english_aliases": english_aliases,
        "preliminary": True,
    }
    json_text = json.dumps(
        payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    )
    json_text = (json_text.replace("&", "\\u0026")
                          .replace("<", "\\u003c")
                          .replace(">", "\\u003e")
                          .replace("\u2028", "\\u2028")
                          .replace("\u2029", "\\u2029"))
    bootstrap = (
        '<script id="' + BOOTSTRAP_ID +
        '" type="application/json">' + json_text + '</script>'
    )
    match = matches[0]
    return document[:match.start()] + bootstrap + document[match.start():]
