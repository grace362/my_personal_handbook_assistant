"""Index the included example handbook documents for a quick first run."""
from app import ROOT, UPLOADS, extract, load_store, save_store, split_chunks

sample_dir = ROOT / "sample_documents"
UPLOADS.mkdir(parents=True, exist_ok=True)
chunks = []
for path in sorted(sample_dir.glob("*.txt")):
    chunks.extend(split_chunks(extract(path), path.name))
save_store(chunks)
print(f"Indexed {len(chunks)} chunks from {len(list(sample_dir.glob('*.txt')))} demo documents.")
