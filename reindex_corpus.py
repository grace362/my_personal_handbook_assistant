"""Load all programme corpus files into chunks.json and Chroma (run after adding documents)."""
from __future__ import annotations

import shutil
from pathlib import Path

from app import PROGRAMME_DIR, UPLOADS, extract, save_store, split_chunks
from retrieval import rebuild_vector_index

ALLOWED = {".txt", ".md", ".pdf", ".docx"}


DEMO_HANDBOOKS = (
    "people_handbook.txt",
    "it_security_policy.txt",
    "operations_guide.txt",
)


def corpus_paths(include_uploads: bool = False) -> list[Path]:
    """Index the three demo handbooks from programme_documents/ (stable demo)."""
    paths: list[Path] = []
    for name in DEMO_HANDBOOKS:
        path = PROGRAMME_DIR / name
        if path.is_file():
            paths.append(path)
    if include_uploads and UPLOADS.exists():
        programme_names = {p.name.lower() for p in paths}
        for path in sorted(UPLOADS.iterdir()):
            if path.is_file() and path.suffix.lower() in ALLOWED and path.name.lower() not in programme_names:
                paths.append(path)
    return paths


def main() -> None:
    PROGRAMME_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)

    chunks: list[dict] = []
    total_chars = 0
    for path in corpus_paths():
        text = extract(path)
        if not text.strip():
            print(f"SKIP (no text): {path.name}")
            continue
        total_chars += len(text)
        doc_chunks = split_chunks(text, path.name)
        chunks.extend(doc_chunks)
        print(f"Indexed {path.name}: {len(text):,} chars → {len(doc_chunks)} chunks")

    save_store(chunks)
    n = rebuild_vector_index(chunks)
    pages_est = max(1, total_chars // 3000)
    print(f"\nTotal: {len(chunks)} chunks, ~{total_chars:,} characters (~{pages_est} pages at 3k chars/page)")
    print(f"Chroma: {n} vectors embedded.")
    if pages_est < 20:
        print("NOTE: Assignment target is 20+ pages — add more PDFs/DOCX to programme_documents/ or data/documents/, then re-run.")


if __name__ == "__main__":
    main()
