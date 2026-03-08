import base64
import binascii
import hashlib
import time
from datetime import datetime, timezone

import cv2
import numpy as np
import requests

from matching_utils import choose_best_match

try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    face_recognition = None
    FACE_RECOGNITION_AVAILABLE = False

SUPABASE_URL = "https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"

CAMERA_INDEX = 0
COOLDOWN_SECONDS = 5
JPEG_QUALITY = 90
MATCH_THRESHOLD = 0.80
MATCH_METRIC = "cosine"
DEFAULT_RELATION = "unknown"


def build_headers(include_json=False, return_representation=False):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if include_json:
        headers["Content-Type"] = "application/json"
    if return_representation:
        headers["Prefer"] = "return=representation"
    return headers


def encode_crop_to_base64(face_crop):
    ok, buffer = cv2.imencode(
        ".jpg",
        face_crop,
        [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
    )
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("utf-8")


def compute_face_embedding(face_bgr):
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    rgb = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    if min(height, width) < 60:
        return None

    known_location = [(0, width, height, 0)]
    encodings = face_recognition.face_encodings(
        rgb,
        known_face_locations=known_location,
        num_jitters=1,
        model="small",
    )
    if not encodings:
        encodings = face_recognition.face_encodings(rgb, num_jitters=1, model="small")
    if not encodings:
        return None
    return encodings[0].tolist()


def decode_image_to_bgr(image_value):
    if not image_value:
        return None

    raw = image_value.strip()
    if raw.startswith("data:"):
        parts = raw.split(",", 1)
        if len(parts) != 2:
            return None
        raw = parts[1]

    try:
        image_bytes = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(image_array, cv2.IMREAD_COLOR)


def fetch_cards():
    params = {
        "select": 'id,Name,Relation,Image,"Last Met"',
        "order": "id.asc",
    }
    response = requests.get(
        SUPABASE_URL,
        headers=build_headers(),
        params=params,
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    cards = []
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
    return cards


def create_card(image_base64):
    payload = {
        "Name": f"Unknown {int(time.time())}",
        "Relation": DEFAULT_RELATION,
        "Image": image_base64,
        "Last Met": datetime.now(timezone.utc).strftime("%H:%M:%S"),
    }
    response = requests.post(
        SUPABASE_URL,
        headers=build_headers(include_json=True, return_representation=True),
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise RuntimeError("Card insert returned no row")
    return rows[0]


def update_card(card_id, image_base64):
    payload = {
        "Image": image_base64,
        "Last Met": datetime.now(timezone.utc).strftime("%H:%M:%S"),
    }
    response = requests.patch(
        SUPABASE_URL,
        headers=build_headers(include_json=True),
        params={"id": f"eq.{card_id}"},
        json=payload,
        timeout=20,
    )
    response.raise_for_status()


def get_card_embedding(card, embedding_cache):
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    card_id = card.get("id")
    image_value = card.get("image")
    if card_id is None or not image_value:
        return None

    fingerprint = hashlib.sha1(image_value.encode("utf-8")).hexdigest()
    cached = embedding_cache.get(card_id)
    if cached and cached["fingerprint"] == fingerprint:
        return cached["embedding"]

    image_bgr = decode_image_to_bgr(image_value)
    if image_bgr is None:
        return None

    embedding = compute_face_embedding(image_bgr)
    if embedding is None:
        return None

    embedding_cache[card_id] = {"fingerprint": fingerprint, "embedding": embedding}
    return embedding


def build_candidate_cards(cards, embedding_cache):
    candidates = []
    for card in cards:
        embedding = get_card_embedding(card, embedding_cache)
        if embedding is None:
            continue
        candidate = dict(card)
        candidate["embedding"] = embedding
        candidates.append(candidate)
    return candidates


def expand_face_box(x, y, w, h, frame_width, frame_height, margin_ratio=0.15):
    margin_x = int(w * margin_ratio)
    margin_y = int(h * margin_ratio)
    left = max(0, x - margin_x)
    top = max(0, y - margin_y)
    right = min(frame_width, x + w + margin_x)
    bottom = min(frame_height, y + h + margin_y)
    return left, top, right, bottom


def draw_label(frame, text, x, y, color):
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.6
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(text, font, scale, thickness)
    box_top = max(0, y - text_h - baseline - 6)
    box_bottom = max(text_h + baseline + 6, y)
    box_right = x + text_w + 10
    cv2.rectangle(frame, (x, box_top), (box_right, box_bottom), (0, 0, 0), -1)
    cv2.putText(frame, text, (x + 5, box_bottom - baseline - 2), font, scale, color, thickness)


def main():
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise SystemExit("Could not open webcam")

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if face_cascade.empty():
        cap.release()
        raise SystemExit("Could not load face cascade")

    embedding_cache = {}
    last_sent_time = 0.0
    active_label = "Face detected - waiting"
    active_color = (0, 255, 255)

    print("Running cards identity test. Press q to quit.")
    if not FACE_RECOGNITION_AVAILABLE:
        print("face_recognition not installed -> matching disabled, insert-only mode.")

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(60, 60),
        )

        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            frame_h, frame_w = frame.shape[:2]
            left, top, right, bottom = expand_face_box(x, y, w, h, frame_w, frame_h)
            face_crop = frame[top:bottom, left:right]

            now = time.time()
            if now - last_sent_time >= COOLDOWN_SECONDS:
                try:
                    image_base64 = encode_crop_to_base64(face_crop)
                    if not image_base64:
                        active_label = "Image encode failed"
                        active_color = (0, 0, 255)
                    elif not FACE_RECOGNITION_AVAILABLE:
                        new_card = create_card(image_base64)
                        active_label = f"New Card: {new_card.get('id')}"
                        active_color = (0, 200, 255)
                    else:
                        live_embedding = compute_face_embedding(face_crop)
                        if live_embedding is None:
                            new_card = create_card(image_base64)
                            active_label = f"New Card: {new_card.get('id')}"
                            active_color = (0, 200, 255)
                        else:
                            cards = fetch_cards()
                            candidates = build_candidate_cards(cards, embedding_cache)
                            match = choose_best_match(
                                query_embedding=live_embedding,
                                stored_records=candidates,
                                threshold=MATCH_THRESHOLD,
                                metric=MATCH_METRIC,
                                embedding_key="embedding",
                            )

                            if match and match["matched"]:
                                matched_card = match["record"]
                                score = float(match["score"])
                                update_card(matched_card["id"], image_base64)
                                card_name = matched_card.get("name")
                                if card_name:
                                    active_label = f"Name: {card_name} ({score:.2f})"
                                else:
                                    active_label = f"Card ID: {matched_card.get('id')} ({score:.2f})"
                                active_color = (0, 255, 0)
                            else:
                                new_card = create_card(image_base64)
                                active_label = f"New Card: {new_card.get('id')}"
                                active_color = (0, 200, 255)

                    last_sent_time = now
                except requests.RequestException as exc:
                    active_label = "Supabase request error"
                    active_color = (0, 0, 255)
                    print(f"Supabase request failed: {exc}")
                    last_sent_time = now
                except Exception as exc:
                    active_label = "Identity flow error"
                    active_color = (0, 0, 255)
                    print(f"Unexpected error: {exc}")
                    last_sent_time = now

            cv2.rectangle(frame, (left, top), (right, bottom), active_color, 2)
            draw_label(frame, active_label, left, max(20, top - 8), active_color)
        else:
            cv2.putText(
                frame,
                "No face detected",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 255),
                2,
            )

        cv2.imshow("Face Identity Test", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
