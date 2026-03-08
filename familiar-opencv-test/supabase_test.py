import requests
from flask import Flask, render_template

SUPABASE_REST_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/recognition_events"
SUPABASE_KEY = "sb_publishable_PVlS09dpLqOVyQemVpu84Q_ChlDMxSQ"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

app = Flask(__name__)

def to_data_url(raw):
    if not raw:
        return None
    if raw.startswith("data:image/"):
        return raw
    return f"data:image/jpeg;base64,{raw}"

@app.route("/")
def index():
    params = {
        "select": "id,timestamp,device_id,image_base64,embedding,created_at",
        "order": "created_at.desc",
        "limit": "50",
    }

    error = None
    events = []

    try:
        r = requests.get(SUPABASE_REST_URL, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        rows = r.json()

        for row in rows:
            events.append({
                "id": row.get("id"),
                "timestamp": row.get("timestamp"),
                "device_id": row.get("device_id"),
                "created_at": row.get("created_at"),
                "embedding": row.get("embedding"),
                "image_url": to_data_url(row.get("image_base64")),
                "has_image": bool(row.get("image_base64")),
            })
    except Exception as e:
        error = f"Supabase request failed: {e}"

    return render_template("index.html", events=events, error=error)

if __name__ == "__main__":
    app.run(debug=True, port=5000)