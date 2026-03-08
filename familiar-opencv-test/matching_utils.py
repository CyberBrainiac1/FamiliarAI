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


def euclidean_distance(vector_a: Iterable[float], vector_b: Iterable[float]) -> float:
    a = np.asarray(vector_a, dtype=np.float32)
    b = np.asarray(vector_b, dtype=np.float32)
    if a.shape != b.shape:
        raise ValueError("Vector shape mismatch for euclidean distance")
    return float(np.linalg.norm(a - b))


def _is_valid_embedding(candidate: object) -> bool:
    return isinstance(candidate, list) and len(candidate) > 0


def choose_best_match(
    query_embedding: Iterable[float],
    stored_people: list[dict],
    threshold: float,
    metric: str = "cosine",
    embedding_key: str = "primary_embedding",
) -> Optional[dict]:
    best_person = None
    best_score = None

    for person in stored_people:
        candidate_embedding = person.get(embedding_key)
        if not _is_valid_embedding(candidate_embedding):
            continue

        try:
            if metric == "cosine":
                score = cosine_similarity(query_embedding, candidate_embedding)
                is_better = best_score is None or score > best_score
            elif metric == "euclidean":
                score = euclidean_distance(query_embedding, candidate_embedding)
                is_better = best_score is None or score < best_score
            else:
                raise ValueError(f"Unsupported metric: {metric}")
        except ValueError:
            continue

        if is_better:
            best_score = score
            best_person = person

    if best_person is None or best_score is None:
        return None

    matched = best_score >= threshold if metric == "cosine" else best_score <= threshold
    return {
        "person": best_person,
        "score": float(best_score),
        "matched": matched,
        "metric": metric,
        "threshold": threshold,
    }
