import base64
import time
from datetime import datetime, timezone

import cv2
import face_recognition
import requests

SUPABASE_URL = "https://eizrkuqdqkeplksujdvq.supabase.co/rest/v1/recognition_events"
SUPABASE_KEY = "sb_publishable_PVlS09dpLqOVyQemVpu84Q_ChlDMxSQ"
DEVICE_ID = "familiar-laptop-01"
CAMERA_INDEX = 0
COOLDOWN_SECONDS = 5

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

cap = cv2.VideoCapture(CAMERA_INDEX)
if not cap.isOpened():
    raise SystemExit("Could not open webcam")

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
if face_cascade.empty():
    cap.release()
    raise SystemExit("Could not load face cascade")


def compute_face_embedding(face_crop):
    rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
    height, width = rgb.shape[:2]
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


last_sent_time = 0.0
print("Running face detect test. Press q to quit.")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

    for (x, y, w, h) in faces:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

    now = time.time()
    if len(faces) > 0 and (now - last_sent_time) >= COOLDOWN_SECONDS:
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_crop = frame[y:y + h, x:x + w]
        ok, buffer = cv2.imencode(".jpg", face_crop)

        if ok:
            # This file remains a simple baseline uploader.
            # Use face_identity_test.py for real embedding-based identity matching.
            embedding = compute_face_embedding(face_crop)
            if embedding is None:
                print("No embedding generated for selected face")
                continue

            payload = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "device_id": DEVICE_ID,
                "image_base64": base64.b64encode(buffer.tobytes()).decode("utf-8"),
                "embedding": embedding,
                "person_id": None,
                "match_score": None,
            }

            response = requests.post(SUPABASE_URL, headers=headers, json=payload, timeout=15)
            print("Status code:", response.status_code)
            print("Response text:", response.text)
            last_sent_time = now

    cv2.imshow("Face Detect Test", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
