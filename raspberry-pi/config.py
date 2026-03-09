SUPABASE_PROJECT_URL = "https://pkpmvrjbtftufuyymofy.supabase.co"
SUPABASE_KEY = "sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY"
SUPABASE_TABLE_NAME = "cards"

# Camera
CAMERA_WIDTH = 1640
CAMERA_HEIGHT = 1232
PICAMERA_FORMAT = "RGB888"
CONVERT_RGB_TO_BGR = False

# Request / upload
JPEG_QUALITY = 90
REQUEST_TIMEOUT_SECONDS = 20
UPLOAD_COOLDOWN_SECONDS = 10

# Duplicate suppression
MATCH_THRESHOLD = 0.65
SKIP_SAME_FACE_SECONDS = 45
RECENT_FACE_DISTANCE = 0.25
CACHE_REFRESH_SECONDS = 5

# Debug outputs
SAVE_DEBUG_IMAGES = True
DEBUG_FRAME_PATH = "latest_frame.jpg"
DEBUG_FACE_PATH = "latest_face.jpg"
DEBUG_ANNOTATED_PATH = "latest_annotated.jpg"

# OpenCV DNN models
YUNET_MODEL_PATH = "models/face_detection_yunet_2023mar.onnx"
SFACE_MODEL_PATH = "models/face_recognition_sface_2021dec.onnx"

# Detector tuning
DETECT_SCORE_THRESHOLD = 0.35
DETECT_NMS_THRESHOLD = 0.3
DETECT_TOP_K = 5000

# Default DB fields for new people
DEFAULT_NAME = None
DEFAULT_RELATION = None
