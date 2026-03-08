import base64
import time
from datetime import datetime, timezone

import cv2
import requests

SUPABASE_URL = "https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"

DEFAULT_NAME = "Unknown Person"
DEFAULT_RELATION = "unknown"
CAMERA_INDEX = 0
COOLDOWN_SECONDS = 5
JPEG_QUALITY = 90

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

last_sent_time = 0.0
print("Running face detect test (cards mode). Press q to quit.")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
    )

    for (x, y, w, h) in faces:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

    now = time.time()
    if len(faces) > 0 and (now - last_sent_time) >= COOLDOWN_SECONDS:
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_crop = frame[y:y + h, x:x + w]
        ok, buffer = cv2.imencode(
            ".jpg",
            face_crop,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
        )

        if ok:
            payload = {
                "Name": DEFAULT_NAME,
                "Relation": DEFAULT_RELATION,
                "Image": base64.b64encode(buffer.tobytes()).decode("utf-8"),
                "Last Met": datetime.now(timezone.utc).strftime("%H:%M:%S"),
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
