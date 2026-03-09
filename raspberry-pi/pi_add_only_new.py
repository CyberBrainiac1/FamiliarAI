import time

import cv2

from camera_utils import PiCameraCapture, draw_faces
from config import (
    CACHE_REFRESH_SECONDS,
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


def face_to_embedding(recognizer, frame, face):
    aligned = recognizer.alignCrop(frame, face)
    feat = recognizer.feature(aligned)
    return feat.flatten().tolist(), aligned


def main():
    print("[INFO] Starting add-only-new script")
    print(f"[INFO] Supabase table: {SUPABASE_TABLE_NAME}")
    print(f"[INFO] MATCH_THRESHOLD={MATCH_THRESHOLD}")

    try:
        cards_cache = fetch_cards(
            SUPABASE_PROJECT_URL,
            SUPABASE_KEY,
            SUPABASE_TABLE_NAME,
            REQUEST_TIMEOUT_SECONDS,
        )
        print(f"[INFO] Startup fetch succeeded. Loaded {len(cards_cache)} existing cards.")
    except Exception as exc:
        print(f"[ERROR] Could not load existing cards from Supabase at startup: {exc}")
        print("[ERROR] Refusing to continue, because that could create duplicate people.")
        return

    last_cache_refresh = time.time()
    last_seen_embedding = None
    last_seen_time = 0.0

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

    while True:
        try:
            now_ts = time.time()

            if now_ts - last_cache_refresh >= CACHE_REFRESH_SECONDS:
                try:
                    cards_cache = fetch_cards(
                        SUPABASE_PROJECT_URL,
                        SUPABASE_KEY,
                        SUPABASE_TABLE_NAME,
                        REQUEST_TIMEOUT_SECONDS,
                    )
                    last_cache_refresh = now_ts
                    print(f"[INFO] Periodic cache refresh loaded {len(cards_cache)} cards.")
                except Exception as exc:
                    print(f"[WARN] Periodic cache refresh failed: {exc}")

            frame = camera.capture_frame()

            main_face, faces = detect_main_face(detector, frame)
            if main_face is None:
                print("[INFO] No face detected")
                time.sleep(UPLOAD_COOLDOWN_SECONDS)
                continue

            embedding, aligned_face = face_to_embedding(recognizer, frame, main_face)
            now_iso = utc_now_iso_z()

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

            print(f"[INFO] Checking against cached DB with {len(cards_cache)} cards...")
            match = choose_best_match(embedding, cards_cache, MATCH_THRESHOLD)

            if match and match["matched"]:
                card_id = match["person"]["id"]
                distance = match["distance"]
                print(f"[INFO] Existing person detected. No insert. matched id={card_id} distance={distance:.4f}")

                annotated = draw_faces(frame, faces, main_face, f"Existing ID {card_id}")

                if SAVE_DEBUG_IMAGES:
                    cv2.imwrite(DEBUG_FRAME_PATH, frame)
                    cv2.imwrite(DEBUG_ANNOTATED_PATH, annotated)
                    cv2.imwrite(DEBUG_FACE_PATH, aligned_face)

                last_seen_embedding = embedding
                last_seen_time = now_ts
                time.sleep(UPLOAD_COOLDOWN_SECONDS)
                continue

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

            cards_cache.append(
                {
                    "id": new_id,
                    "name": DEFAULT_NAME,
                    "relation": DEFAULT_RELATION,
                    "picture": picture_b64,
                    "last_met": now_iso,
                    "embedding": embedding,
                    "times_seen": 1,
                    "updated_at": now_iso,
                }
            )

            annotated = draw_faces(frame, faces, main_face, f"New ID {new_id}")

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
