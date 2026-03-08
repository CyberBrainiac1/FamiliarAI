import base64
import time
from datetime import datetime, timezone

import cv2
import face_recognition
import requests

from matching_utils import choose_best_match

SUPABASE_PEOPLE_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/people"
SUPABASE_EVENTS_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/recognition_events"
SUPABASE_KEY = "sb_publishable_PVlS09dpLqOVyQemVpu84Q_ChlDMxSQ"

DEVICE_ID = "familiar-laptop-01"
CAMERA_INDEX = 0
COOLDOWN_SECONDS = 5
JPEG_QUALITY = 90
MATCH_METRIC = "cosine"
MATCH_THRESHOLD = 0.80


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


def compute_face_embedding(face_crop):
    rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
    if min(height, width) < 60:
        return None

    # Crop is already just the selected face, so use one full-image location.
    known_location = [(0, width, height, 0)]
    encodings = face_recognition.face_encodings(
        rgb,
        known_face_locations=known_location,
        num_jitters=1,
        model="small",
    )
    if not encodings:
        return None
    return encodings[0].tolist()


def fetch_people():
    params = {
        "select": "id,display_name,primary_embedding,created_at",
        "order": "id.asc",
    }
    response = requests.get(
        SUPABASE_PEOPLE_URL,
        headers=build_headers(),
        params=params,
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def create_person(primary_embedding, preview_image_base64):
    payload = {
        "primary_embedding": primary_embedding,
        "preview_image_base64": preview_image_base64,
    }
    response = requests.post(
        SUPABASE_PEOPLE_URL,
        headers=build_headers(include_json=True, return_representation=True),
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise RuntimeError("Person insert returned no row")
    return rows[0]


def create_recognition_event(image_base64, embedding, person_id, match_score):
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "device_id": DEVICE_ID,
        "image_base64": image_base64,
        "embedding": embedding,
        "person_id": person_id,
        "match_score": match_score,
    }
    response = requests.post(
        SUPABASE_EVENTS_URL,
        headers=build_headers(include_json=True, return_representation=True),
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        raise RuntimeError("Event insert returned no row")
    return rows[0]


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


def build_identity_label(person, score):
    person_id = person.get("id")
    display_name = person.get("display_name")
    if display_name:
        return f"Name: {display_name} ({score:.2f})"
    return f"Person ID: {person_id} ({score:.2f})"


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

    last_sent_time = 0.0
    active_label = "Face detected - waiting for recognition"
    active_color = (0, 255, 255)

    print("Running same-person recognition test. Press q to quit.")
    print(f"Metric: {MATCH_METRIC}, Threshold: {MATCH_THRESHOLD}")

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

        best_face = None
        if len(faces) > 0:
            best_face = max(faces, key=lambda f: f[2] * f[3])
            x, y, w, h = best_face
            frame_h, frame_w = frame.shape[:2]
            left, top, right, bottom = expand_face_box(x, y, w, h, frame_w, frame_h)
            face_crop = frame[top:bottom, left:right]

            now = time.time()
            if now - last_sent_time >= COOLDOWN_SECONDS:
                try:
                    embedding = compute_face_embedding(face_crop)
                    if embedding is None:
                        active_label = "Embedding failed"
                        active_color = (0, 0, 255)
                        print("No embedding returned for selected face")
                    else:
                        face_base64 = encode_crop_to_base64(face_crop)
                        if not face_base64:
                            active_label = "Image encode failed"
                            active_color = (0, 0, 255)
                            print("Failed to encode selected face crop")
                        else:
                            people = fetch_people()
                            match = choose_best_match(
                                query_embedding=embedding,
                                stored_people=people,
                                threshold=MATCH_THRESHOLD,
                                metric=MATCH_METRIC,
                            )

                            if match and match["matched"]:
                                person = match["person"]
                                score = float(match["score"])
                                person_id = person.get("id")
                                create_recognition_event(
                                    image_base64=face_base64,
                                    embedding=embedding,
                                    person_id=person_id,
                                    match_score=score,
                                )
                                active_label = build_identity_label(person, score)
                                active_color = (0, 255, 0)
                                print(
                                    f"Matched existing person_id={person_id} "
                                    f"score={score:.3f}"
                                )
                            else:
                                new_person = create_person(
                                    primary_embedding=embedding,
                                    preview_image_base64=face_base64,
                                )
                                new_person_id = new_person.get("id")
                                create_recognition_event(
                                    image_base64=face_base64,
                                    embedding=embedding,
                                    person_id=new_person_id,
                                    match_score=None,
                                )
                                active_label = f"New Person: {new_person_id}"
                                active_color = (0, 200, 255)
                                print(f"Created new person_id={new_person_id}")

                    last_sent_time = now
                except requests.RequestException as exc:
                    active_label = "Supabase request error"
                    active_color = (0, 0, 255)
                    print(f"Supabase request failed: {exc}")
                    last_sent_time = now
                except Exception as exc:
                    active_label = "Recognition error"
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
