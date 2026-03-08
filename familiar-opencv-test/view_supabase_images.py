import base64
import binascii

import requests
from flask import Flask, render_template

SUPABASE_URL = "https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"

app = Flask(__name__)


def detect_mime_type(image_bytes):
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if image_bytes.startswith(b"BM"):
        return "image/bmp"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


def image_to_data_url(value):
    if not value:
        return None, "Missing image value"

    raw = value.strip()
    if raw.startswith("data:"):
        parts = raw.split(",", 1)
        if len(parts) != 2:
            return None, "Invalid data URL format"
        raw = parts[1]

    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None, "Invalid base64 image data"

    mime_type = detect_mime_type(image_bytes)
    if not mime_type:
        return None, "Unsupported or unknown image format"

    normalized_b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{normalized_b64}", None


def fetch_cards():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    params = {
        "select": 'id,Name,Relation,Image,"Last Met"',
        "order": "id.desc",
        "limit": "100",
    }

    response = requests.get(SUPABASE_URL, headers=headers, params=params, timeout=20)
    response.raise_for_status()
    rows = response.json()

    cards = []
    for row in rows:
        image_data_url, image_error = image_to_data_url(row.get("Image", ""))
        cards.append(
            {
                "id": row.get("id"),
                "name": row.get("Name"),
                "relation": row.get("Relation"),
                "last_met": row.get("Last Met"),
                "image_data_url": image_data_url,
                "image_error": image_error,
            }
        )
    return cards


@app.route("/")
def index():
    cards = []
    error_message = None

    try:
        cards = fetch_cards()
    except requests.RequestException as exc:
        error_message = f"Supabase request failed: {exc}"
    except ValueError as exc:
        error_message = f"Invalid Supabase response: {exc}"

    return render_template("index.html", cards=cards, error_message=error_message)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
