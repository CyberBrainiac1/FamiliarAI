import requests
from flask import Flask, render_template

SUPABASE_URL = "https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

app = Flask(__name__)


@app.route("/")
def index():
    error = None
    cards = []

    params = {
        "select": 'id,Name,Relation,Image,"Last Met"',
        "order": "id.desc",
        "limit": "50",
    }

    try:
        r = requests.get(SUPABASE_URL, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        rows = r.json()
        for row in rows:
            cards.append(
                {
                    "id": row.get("id"),
                    "name": row.get("Name"),
                    "relation": row.get("Relation"),
                    "image": row.get("Image"),
                    "last met": row.get("Last Met"),
                }
            )
    except Exception as exc:
        error = f"Supabase request failed: {exc}"

    return render_template("index.html", cards=cards, error_message=error)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
