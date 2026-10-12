"""Store and retrieve handbook chunks with Chroma embeddings."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
CHROMA_PATH = ROOT / "data" / "chroma"
STORE = ROOT / "data" / "chunks.json"
COLLECTION_NAME = "handbook_chunks"

_lock = threading.RLock()
_chroma_client = None
_embedding_fn = None


def load_store():
    from app import load_store as _load_store

    return _load_store()


def get_embedding_function():
    global _embedding_fn
    if _embedding_fn is None:
        from chromadb.utils import embedding_functions

        _embedding_fn = embedding_functions.DefaultEmbeddingFunction()
    return _embedding_fn


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        import chromadb

        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    return _chroma_client


def get_collection():
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=get_embedding_function(),
        metadata={"hnsw:space": "cosine"},
    )


def _chunk_map() -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in load_store()}


def rebuild_vector_index(chunks: list[dict[str, Any]] | None = None) -> int:
    chunks = chunks if chunks is not None else load_store()
    client = get_chroma_client()
    with _lock:
        try:
            client.delete_collection(COLLECTION_NAME)
        except (ValueError, Exception):
            pass
        if not chunks:
            return 0
        collection = client.create_collection(
            name=COLLECTION_NAME,
            embedding_function=get_embedding_function(),
            metadata={"hnsw:space": "cosine"},
        )
        collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[{"source": c["source"]} for c in chunks],
        )
        return len(chunks)


def ensure_vector_index() -> None:
    collection = get_collection()
    if collection.count() == 0 and STORE.exists() and load_store():
        rebuild_vector_index()


def remove_source_from_index(source: str) -> None:
    with _lock:
        collection = get_collection()
        try:
            collection.delete(where={"source": source})
        except Exception:
            pass


def index_chunks(chunks: list[dict[str, Any]]) -> None:
    if not chunks:
        return
    source = chunks[0]["source"]
    remove_source_from_index(source)
    collection = get_collection()
    with _lock:
        collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[{"source": c["source"]} for c in chunks],
        )


def retrieve(question: str, limit: int = 3) -> list[dict[str, Any]]:
    chunks_by_id = _chunk_map()
    if not chunks_by_id:
        return []
    ensure_vector_index()
    collection = get_collection()
    count = collection.count()
    if count == 0:
        return []
    n = min(limit, count)
    result = collection.query(
        query_texts=[question],
        n_results=n,
        include=["distances", "metadatas"],
    )
    ids = (result.get("ids") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    ranked: list[dict[str, Any]] = []
    for chunk_id, distance in zip(ids, distances):
        base = chunks_by_id.get(chunk_id)
        if not base:
            continue
        score = round(max(0.0, 1.0 - float(distance)), 4)
        ranked.append({**base, "score": score})
    return ranked
