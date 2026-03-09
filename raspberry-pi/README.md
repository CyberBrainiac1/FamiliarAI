# Familiar AI — Raspberry Pi Side

This folder contains the Raspberry Pi face add-only-new pipeline.

## What it does

- Loads existing people/cards from Supabase at startup
- Uses Raspberry Pi camera input
- Detects faces with OpenCV YuNet
- Computes face embeddings with OpenCV SFace
- Matches against cached embeddings from Supabase
- Does not insert if the face already exists
- Inserts only truly new faces
- Periodically refreshes the local cache
- Skips obvious repeated detections of the same person

## Files

- `config.py` — config values (Supabase URL, thresholds, camera settings)
- `camera_utils.py` — camera wrapper and drawing helper
- `matching_utils.py` — cosine matching helpers
- `supabase_utils.py` — Supabase REST helpers
- `pi_add_only_new.py` — main script
- `requirements.txt` — Python dependencies

## Setup

From this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Model files

Place these files in `raspberry-pi/models/`:

- `face_detection_yunet_2023mar.onnx`
- `face_recognition_sface_2021dec.onnx`

Download links:
- YuNet: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- SFace: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface

## Run

```bash
source .venv/bin/activate
python3 pi_add_only_new.py
```

## Notes

- Only run one camera-using script at a time.
- If the camera is busy, stop other Pi camera processes first.
- If needed, tune `MATCH_THRESHOLD` in `config.py`.
- Debug images (`latest_frame.jpg`, `latest_face.jpg`, `latest_annotated.jpg`) are written to the `raspberry-pi/` folder when `SAVE_DEBUG_IMAGES = True`.
