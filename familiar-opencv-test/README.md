# Familiar OpenCV + Supabase Cards MVP

This project is wired to the new Supabase project and the capitalized table/column schema:

- Table: `Cards`
- Columns: `id`, `Name`, `Relation`, `Image`, `Last Met`

## Supabase config

- Project URL: `https://pkpmvrjbtftufuyymofy.supabase.co`
- REST table URL used in scripts: `https://pkpmvrjbtftufuyymofy.supabase.co/rest/v1/Cards`
- Publishable key: `sb_publishable_z-tQJFTDfYdP8y4LSO02wA_ID4mYjTY`

## What each script does

- `supabase_rest_test.py`
  - Sends one test insert into `Cards`.
- `face_detect_test.py`
  - Uses webcam + OpenCV face detection.
  - Crops the largest face and inserts a new row into `Cards`.
- `face_identity_test.py`
  - Keeps optional same-person matching support.
  - If `face_recognition` is available, it tries to match against existing card images.
  - If not available (or no match), it inserts a new card.
- `view_supabase_images.py`
  - Reads from `Cards` and renders:
    - `id`
    - `Name`
    - `Relation`
    - `Last Met`
    - image preview from `Image`

## Install

```bash
pip install -r requirements.txt
```

## Run insert test

```bash
python supabase_rest_test.py
```

## Run webcam uploader

```bash
python face_detect_test.py
```

## Run identity flow

```bash
python face_identity_test.py
```

## Run viewer

```bash
python view_supabase_images.py
```

Open: `http://127.0.0.1:5000`

## Limitations with current cards-only schema

- `Cards` has no dedicated embedding columns.
- Matching in `face_identity_test.py` is simplified:
  - it derives embeddings from stored `Image` values on the fly.
- For stronger/faster matching, add explicit embedding columns later.
