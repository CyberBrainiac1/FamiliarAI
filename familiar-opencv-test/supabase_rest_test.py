import requests

SUPABASE_URL = "https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

payload = {
    "Name": "John",
    "Relation": "neighbor",
    "Image": "base64stringhere",
    "Last Met": "12:00:00",
}

response = requests.post(SUPABASE_URL, headers=headers, json=payload, timeout=15)

print("Status code:", response.status_code)
print("Response text:", response.text)
