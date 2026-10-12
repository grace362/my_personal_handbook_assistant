# Handbook Assistant

Grounded Q&A over uploaded programme documents: **Chroma** vector retrieval, **Groq** for answers, and **source passages** shown on every response.

## Run it

1. Python 3.10+.
2. Create a venv, install dependencies, set Groq key in `.env`:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env   # add GROQ_API_KEY=
   ```

3. Index the programme corpus (see `programme_documents/`) and start the app:

   ```bash
   python reindex_corpus.py
   python app.py
   ```

   Open <http://127.0.0.1:5188>.

4. Evaluate the frozen test set:

   ```bash
   python evaluate.py --skip-llm    # retrieval only
   python evaluate.py               # retrieval + Groq answers
   ```

## Demo corpus (Northline Analytics)

Three company handbooks in `programme_documents/`: employee handbook, IT security, operations guide. Run `python reindex_corpus.py` to load exactly those three into the sidebar.

## Corpus (20+ pages for assignments)

- Add more PDFs to `programme_documents/` or use `reindex_corpus.py` with uploads when you extend the corpus.
- Optional uploads via the UI go to `data/documents/`.
- After adding files, run `python reindex_corpus.py` to rebuild chunks and Chroma embeddings.
- Check extraction previews in the UI before trusting PDFs; scanned pages need OCR first.

## Assignment checklist

| Requirement | Implementation |
|-------------|----------------|
| Chunking (~800 chars, 150 overlap, paragraphs) | `app.split_chunks` |
| Vector store | Chroma in `data/chroma/` |
| Embeddings | Chroma default (MiniLM via ONNX) |
| Top-3 retrieve → LLM | `/api/ask` |
| Sources beside answer | UI source cards + debug JSON |
| Abstention phrase | `test_questions.json` + prompts |
| 10 frozen test questions (7 + 3) | `test_questions.json` |
| Scores | `evaluate.py` |

Documents and vectors stay local under `data/`. Groq receives only retrieved passages for answers.
