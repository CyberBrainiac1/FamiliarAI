import time
import cv2

from camera_utils import PiCameraCapture
from config import (
    CAMERA_HEIGHT,
    CAMERA_WIDTH,
    CONVERT_RGB_TO_BGR,
    DEBUG_ANNOTATED_PATH,
    DEBUG_FACE_PATH,
    DEBUG_FRAME_PATH,
    DEFAULT_NAME,
    DEFAULT_RELATION,
    DETECT_NMS_THRESHOLD,
    DETECT_SCORE_THRESHOLD,
    DETECT_TOP_K,
    JPEG_QUALITY,
    MATCH_THRESHOLD,
    PICAMERA_FORMAT,
    RECENT_FACE_DISTANCE,
    REQUEST_TIMEOUT_SECONDS,
    SAVE_DEBUG_IMAGES,
    SFACE_MODEL_PATH,
    SKIP_SAME_FACE_SECONDS,
    SUPABASE_KEY,
    SUPABASE_PROJECT_URL,
    SUPABASE_TABLE_NAME,
    UPLOAD_COOLDOWN_SECONDS,
    YUNET_MODEL_PATH,
)
from matching_utils import choose_best_match, cosine_distance
from supabase_utils import fetch_cards, frame_to_base64_jpeg, insert_card, utc_now_iso_z


def get_face_models(frame_width: int, frame_height: int):
    if not hasattr(cv2, "FaceDetectorYN_create"):
        raise RuntimeError("This OpenCV build does not have FaceDetectorYN_create")
    if not hasattr(cv2, "FaceRecognizerSF_create"):
        raise RuntimeError("This OpenCV build does not have FaceRecognizerSF_create")

    detector = cv2.FaceDetectorYN_create(
        YUNET_MODEL_PATH,
        "",
        (frame_width, frame_height),
        DETECT_SCORE_THRESHOLD,
        DETECT_NMS_THRESHOLD,
        DETECT_TOP_K,
    )
    recognizer = cv2.FaceRecognizerSF_create(SFACE_MODEL_PATH, "")
    return detector, recognizer


def detect_main_face(detector, frame):
    h, w = frame.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(frame)
    if faces is None or len(faces) == 0:
        return None, None
    best = max(faces, key=lambda f: f[2] * f[3])
    return best, faces


def draw_faces(frame, faces, main_face, label):
    out = frame.copy()

    if faces is not None:
        for f in faces:
            x, y, w, h = map(int, f[:4])
            cv2.rectangle(out, (x, y), (x + w, y + h), (255, 0, 0), 1)

    if main_face is not None:
        x, y, w, h = map(int, main_face[:4])
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 255, 0), 2)

        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.7
        thickness = 2
        (tw, th), baseline = cv2.getTextSize(label, font, scale, thickness)

        box_top = max(0, y - th - baseline - 8)
        box_bottom = max(th + baseline + 8, y)
        box_right = x + tw + 14

        cv2.rectangle(out, (x, box_top), (box_right, box_bottom), (0, 0, 0), -1)
        cv2.putText(
            out,
            label,
            (x + 7, box_bottom - baseline - 3),
            font,
            scale,
            (0, 255, 0),
            thickness,
        )

    return out


def face_to_embedding(recognizer, frame, face):
    aligned = recognizer.alignCrop(frame, face)
    feat = recognizer.feature(aligned)
    return feat.flatten().tolist(), aligned


def main():
    print("[INFO] Starting add-only-new script")
    print(f"[INFO] Supabase table: {SUPABASE_TABLE_NAME}")
    print(f"[INFO] MATCH_THRESHOLD={MATCH_THRESHOLD}")

    camera = PiCameraCapture(
        CAMERA_WIDTH,
        CAMERA_HEIGHT,
        pixel_format=PICAMERA_FORMAT,
        convert_rgb_to_bgr=CONVERT_RGB_TO_BGR,
    )
    camera.start()
    print("[INFO] Camera initialized")

    detector, recognizer = get_face_models(CAMERA_WIDTH, CAMERA_HEIGHT)
    print("[INFO] YuNet + SFace models loaded")

    # anti-repeat memory so same face isn't checked/inserted over and over
    last_seen_embedding = None
    last_seen_time = 0.0

    while True:
        try:
            frame = camera.capture_frame()

            main_face, faces = detect_main_face(detector, frame)
            if main_face is None:
                print("[INFO] No face detected")
                time.sleep(UPLOAD_COOLDOWN_SECONDS)
                continue

            embedding, aligned_face = face_to_embedding(recognizer, frame, main_face)
            now_ts = time.time()
            now_iso = utc_now_iso_z()

            # skip immediate repeats of the same face in front of the camera
            if last_seen_embedding is not None:
                try:
                    recent_distance = cosine_distance(embedding, last_seen_embedding)
                except Exception:
                    recent_distance = 1.0

                if recent_distance <= RECENT_FACE_DISTANCE and (now_ts - last_seen_time) <= SKIP_SAME_FACE_SECONDS:
                    print(f"[INFO] Same face still present. Skipping. distance={recent_distance:.4f}")
                    annotated = draw_faces(frame, faces, main_face, "Same face - skipped")
                    if SAVE_DEBUG_IMAGES:
                        cv2.imwrite(DEBUG_FRAME_PATH, frame)
                        cv2.imwrite(DEBUG_ANNOTATED_PATH, annotated)
                        cv2.imwrite(DEBUG_FACE_PATH, aligned_face)
                    time.sleep(UPLOAD_COOLDOWN_SECONDS)
                    continue

            cards = fetch_cards(
                SUPABASE_PROJECT_URL,
                SUPABASE_KEY,
                SUPABASE_TABLE_NAME,
                REQUEST_TIMEOUT_SECONDS,
            )
            print(f"[INFO] Loaded {len(cards)} cards from Supabase")

            match = choose_best_match(embedding, cards, MATCH_THRESHOLD)

            if match and match["matched"]:
                card = match["card"]
                card_id = card["id"]
                distance = match["distance"]
                print(f"[INFO] Existing person detected. No insert. matched id={card_id} distance={distance:.4f}")

                label = f"Existing ID {card_id}"
                annotated = draw_faces(frame, faces, main_face, label)

                if SAVE_DEBUG_IMAGES:
                    cv2.imwrite(DEBUG_FRAME_PATH, frame)
                    cv2.imwrite(DEBUG_ANNOTATED_PATH, annotated)
                    cv2.imwrite(DEBUG_FACE_PATH, aligned_face)

                last_seen_embedding = embedding
                last_seen_time = now_ts

            else:
                picture_b64 = frame_to_base64_jpeg(aligned_face, JPEG_QUALITY)

                insert_payload = {
                    "name": DEFAULT_NAME,
                    "relation": DEFAULT_RELATION,
                    "picture": picture_b64,
                    "last_met": now_iso,
                    "embedding": embedding,
                    "times_seen": 1,
                    "updated_at": now_iso,
                }

                result = insert_card(
                    SUPABASE_PROJECT_URL,
                    SUPABASE_KEY,
                    SUPABASE_TABLE_NAME,
                    insert_payload,
                    REQUEST_TIMEOUT_SECONDS,
                )
                new_id = result[0]["id"] if result else "unknown"
                print(f"[INFO] New person inserted. id={new_id}")

                label = f"New ID {new_id}"
                annotated = draw_faces(frame, faces, main_face, label)

                if SAVE_DEBUG_IMAGES:
                    cv2.imwrite(DEBUG_FRAME_PATH, frame)
                    cv2.imwrite(DEBUG_ANNOTATED_PATH, annotated)
                    cv2.imwrite(DEBUG_FACE_PATH, aligned_face)

                last_seen_embedding = embedding
                last_seen_time = now_ts

            time.sleep(UPLOAD_COOLDOWN_SECONDS)

        except KeyboardInterrupt:
            print("\n[INFO] Stopped by user")
            break
        except Exception as exc:
            print(f"[ERROR] {exc}")
            time.sleep(UPLOAD_COOLDOWN_SECONDS)

    camera.stop()
    print("[INFO] Camera stopped")


if __name__ == "__main__":
    main()
