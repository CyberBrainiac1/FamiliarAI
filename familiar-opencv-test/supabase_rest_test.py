import requests

SUPABASE_REST_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/recognition_events"
SUPABASE_KEY = "sb_publishable_PVlS09dpLqOVyQemVpu84Q_ChlDMxSQ"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

payload = {
    "timestamp": "2026-03-08T12:00:00Z",
    "device_id": "familiar-laptop-01",
    "image_base64": "base64stringhere",
    "embedding": [0.1, 0.2, 0.3],
    "person_id": None,
    "match_score": None,
}

response = requests.post(SUPABASE_REST_URL, headers=headers, json=payload, timeout=15)

print("Status code:", response.status_code)
print("Response text:", response.text)
