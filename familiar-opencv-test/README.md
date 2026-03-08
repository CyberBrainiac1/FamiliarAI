# Familiar OpenCV + Supabase Identity MVP

This folder contains a hackathon-friendly same-person recognition pipeline.

It keeps the local webcam flow and adds real face embeddings so the same person can be recognized across multiple frames.

## What changed

- Added `people` identity table SQL and `recognition_events` updates in `db_schema.sql`.
- Added embedding/matching helpers in `matching_utils.py`.
- Added `face_identity_test.py` for webcam detection + embedding + match/create identity + event insert.
- Updated viewer (`view_supabase_images.py` and `templates/index.html`) to show:
  - `person_id`
  - `match_score`
  - new vs matched identity status
  - `display_name` when present
  - grouped events by person
- Kept `face_detect_test.py` as a simpler baseline uploader.

## How same-person recognition works

1. Open webcam and detect faces with OpenCV Haar cascade.
2. Choose the largest face in frame.
3. Generate a real face embedding using `face_recognition` (128D).
4. Pull all `people` rows from Supabase.
5. Compare current embedding to stored `primary_embedding` vectors.
6. If best score passes threshold, reuse that `person_id`.
7. If no score passes threshold, create a new `people` row.
8. Insert a `recognition_events` row with `person_id`, `match_score`, and image.
9. Show identity label directly on webcam preview.

## Current matching config

- Metric: cosine similarity
- Threshold: `0.80`
- Cooldown: `5` seconds

These are constants in `face_identity_test.py`.

## Limitations (expected for MVP)

- One primary embedding per person. This can split identities with major lighting/angle changes.
- Haar detection is basic and can miss side profiles.
- Matching runs against all people rows each cooldown cycle (fine for small hackathon scale).
- RLS policies in `db_schema.sql` are intentionally open for testing and are not production-safe.

## 1) Run schema setup in Supabase SQL Editor

Open Supabase dashboard -> SQL Editor -> paste and run `db_schema.sql`.

This creates/updates:

- `people`
- `recognition_events.person_id`
- `recognition_events.match_score`
- simple hackathon RLS policies for select/insert/update with publishable key

## 2) Install Python dependencies

From this folder:

```bash
pip install -r requirements.txt
```

## 3) Configure key

Set your publishable key in:

- `face_identity_test.py`
- `view_supabase_images.py`
- `supabase_rest_test.py`
- `face_detect_test.py` (if you still use baseline uploader)

Replace:

```python
SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE"
```

## 4) Run same-person identity test

```bash
python face_identity_test.py
```

Preview labels:

- Matched with name: `Name: <display_name> (<score>)`
- Matched without name: `Person ID: <person_id> (<score>)`
- New identity: `New Person: <person_id>`

## 5) Run viewer

```bash
python view_supabase_images.py
```

Open:

`http://127.0.0.1:5000`

You will see events grouped by person and labeled as matched/new.

## Threshold tuning guide

Tune `MATCH_THRESHOLD` in `face_identity_test.py`.

- If different people are being merged together:
  - increase threshold (for cosine, e.g. `0.80 -> 0.85`)
- If the same person keeps getting split into new identities:
  - decrease threshold (for cosine, e.g. `0.80 -> 0.75`)

Recommended quick test loop:

1. Start at `0.80`
2. Capture same person in different angles/light
3. Capture a clearly different person
4. Adjust by `0.02` to `0.05` until behavior is acceptable
