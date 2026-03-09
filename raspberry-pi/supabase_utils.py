import base64
from datetime import datetime, timezone
from typing import Any, Dict

import cv2
import requests


def build_rest_url(project_url: str, table_name: str) -> str:
    return f"{project_url}/rest/v1/{table_name}"


def build_headers(api_key: str, return_representation: bool = True) -> Dict[str, str]:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if return_representation:
        headers["Prefer"] = "return=representation"
    return headers


def build_auth_headers(api_key: str) -> Dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }


def utc_now_iso_z() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def frame_to_base64_jpeg(frame, jpeg_quality: int) -> str:
    ok, buffer = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality],
    )
    if not ok:
        raise RuntimeError("Failed to JPEG-encode frame")
    return base64.b64encode(buffer.tobytes()).decode("utf-8")


def fetch_cards(
    project_url: str,
    api_key: str,
    table_name: str,
    timeout_seconds: int = 20,
):
    url = build_rest_url(project_url, table_name)
    headers = build_auth_headers(api_key)
    params = {
        "select": "id,name,relation,picture,last_met,embedding,times_seen,updated_at",
        "order": "id.asc",
    }
    response = requests.get(url, headers=headers, params=params, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()


def insert_card(
    project_url: str,
    api_key: str,
    table_name: str,
    payload: dict,
    timeout_seconds: int = 20,
):
    url = build_rest_url(project_url, table_name)
    headers = build_headers(api_key, return_representation=True)
    response = requests.post(url, headers=headers, json=payload, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()
