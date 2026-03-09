import time
from typing import Optional, Tuple

import cv2
import numpy as np


class PiCameraCapture:
    def __init__(
        self,
        width: int,
        height: int,
        pixel_format: str = "RGB888",
        convert_rgb_to_bgr: bool = False,
    ):
        self.width = width
        self.height = height
        self.pixel_format = pixel_format
        self.convert_rgb_to_bgr = convert_rgb_to_bgr
        self.picam2 = None

    def start(self) -> None:
        from picamera2 import Picamera2

        self.picam2 = Picamera2()
        config = self.picam2.create_preview_configuration(
            main={"size": (self.width, self.height), "format": self.pixel_format}
        )
        self.picam2.configure(config)
        self.picam2.start()
        time.sleep(1.5)

    def capture_frame(self) -> np.ndarray:
        if self.picam2 is None:
            raise RuntimeError("Camera not started")

        frame = self.picam2.capture_array()

        if self.convert_rgb_to_bgr:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        return frame

    def stop(self) -> None:
        if self.picam2 is not None:
            self.picam2.stop()
            self.picam2 = None


def draw_faces(frame: np.ndarray, faces, main_face, label: str) -> np.ndarray:
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
