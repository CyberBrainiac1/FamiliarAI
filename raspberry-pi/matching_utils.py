from typing import Iterable, Optional

import numpy as np


def normalize_vector(vector: Iterable[float]) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float32)
    norm = np.linalg.norm(array)
    if norm == 0:
        return array
    return array / norm


def cosine_similarity(vector_a: Iterable[float], vector_b: Iterable[float]) -> float:
    a = normalize_vector(vector_a)
    b = normalize_vector(vector_b)
    if a.shape != b.shape:
        raise ValueError("Vector shape mismatch for cosine similarity")
    return float(np.dot(a, b))


def cosine_distance(vector_a: Iterable[float], vector_b: Iterable[float]) -> float:
    return 1.0 - cosine_similarity(vector_a, vector_b)


def _is_valid_embedding(candidate: object) -> bool:
    return isinstance(candidate, list) and len(candidate) > 0


def choose_best_match(
    query_embedding: Iterable[float],
    stored_people: list[dict],
    threshold: float,
    embedding_key: str = "embedding",
) -> Optional[dict]:
    best_person = None
    best_distance = None

    for person in stored_people:
        candidate_embedding = person.get(embedding_key)
        if not _is_valid_embedding(candidate_embedding):
            continue

        try:
            distance = cosine_distance(query_embedding, candidate_embedding)
        except ValueError:
            continue

        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_person = person

    if best_person is None or best_distance is None:
        return None

    matched = best_distance <= threshold
    return {
        "person": best_person,
        "distance": float(best_distance),
        "matched": matched,
        "threshold": threshold,
    }
