import base64
import binascii

import requests
from flask import Flask, render_template

SUPABASE_REST_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/recognition_events"
SUPABASE_KEY = "sb_publishable_PVlS09dpLqOVyQemVpu84Q_ChlDMxSQ"

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


def base64_to_data_url(image_base64):
    if not image_base64:
        return None, "Missing image_base64 value"

    raw_value = image_base64.strip()
    if raw_value.startswith("data:"):
        parts = raw_value.split(",", 1)
        if len(parts) != 2:
            return None, "Invalid data URL format"
        raw_value = parts[1]

    try:
        image_bytes = base64.b64decode(raw_value, validate=True)
    except (binascii.Error, ValueError):
        return None, "Invalid base64 image data"

    mime_type = detect_mime_type(image_bytes)
    if not mime_type:
        return None, "Unsupported or unknown image format"

    normalized_b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{normalized_b64}", None


def fetch_events():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    params = {
        "select": "id,timestamp,device_id,image_base64,embedding,created_at",
        "order": "created_at.desc",
    }

    response = requests.get(SUPABASE_REST_URL, headers=headers, params=params, timeout=20)
    response.raise_for_status()
    rows = response.json()

    events = []
    for row in rows:
        image_data_url, image_error = base64_to_data_url(row.get("image_base64", ""))
        events.append(
            {
                "id": row.get("id"),
                "timestamp": row.get("timestamp"),
                "device_id": row.get("device_id"),
                "created_at": row.get("created_at"),
                "embedding": row.get("embedding"),
                "image_data_url": image_data_url,
                "image_error": image_error,
            }
        )
    return events


@app.route("/")
def index():
    events = []
    error_message = None

    try:
        events = fetch_events()
    except requests.RequestException as exc:
        error_message = f"Supabase request failed: {exc}"
    except ValueError as exc:
        error_message = f"Invalid Supabase response: {exc}"

    return render_template("index.html", events=events, error_message=error_message)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
