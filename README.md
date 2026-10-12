# Handbook Assistant

A local conversational handbook assistant built with Python, HTML, CSS, and JavaScript. Groq handles natural conversation and general questions. For questions about uploaded handbooks or workplace policies, the app retrieves the three best passages locally and asks Groq to summarize only that evidence; the answer appears beside the exact source passages.

## Run it

1. Install Python 3.10 or newer.
2. In this folder, create and activate a virtual environment, then install dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. Create a Groq API key at [console.groq.ai/keys](https://console.groq.ai/keys). Set it in the same terminal (keep it private):

   ```powershell
   $env:GROQ_API_KEY = "your-key"
   ```

   The default model is `openai/gpt-oss-120b`. You can select another model available to your Groq project with `$env:GROQ_MODEL = "model-id"`.

4. Start the app with `python app.py` and visit <http://127.0.0.1:5188>.

To try the included sample policy set, run `python seed_demo.py` before starting the app. To score retrieval against the included ten-question set, run `python evaluate.py` after seeding.

Documents are stored locally under `data/`. Each chat turn and up to the last twelve conversation messages are sent to Groq. When relevant, the top three retrieved passages are included as evidence for handbook answers. Chat history stays in the browser tab and is not saved by the app. Do not expose the key in frontend code or commit it. For a scanned PDF, run OCR first; this app intentionally reports an empty extraction rather than pretending it can read image-only pages.

## Included behavior

- Upload multiple PDF, DOCX, TXT, and Markdown documents.
- Extracted text preview is shown immediately after upload, before indexing; click a document's magnifier to inspect its stored extracted text.
- Paragraph-aware chunks target 800 characters with 150 characters of overlap.
- In-memory TF-IDF retrieval ranks chunks locally and supplies the top three to Groq. No external vector database is required.
- Answers cite filenames in the visible source cards; the full retrieved passage, chunk ID, and match score are always shown.
- Groq can respond naturally to greetings, help requests, follow-ups, and general questions; it distinguishes those from handbook questions and labels no general answer as handbook policy.
- For handbook questions, Groq must use retrieved document text only and abstain with “That is not covered in the documents I have.” when the evidence is missing.
- If retrieval finds no relevant passage, the assistant responds: “That is not covered in the documents I have.” The Groq grounding prompt also requires that response when context lacks the answer.
- Remove uploaded documents from the library with the × button.

This starter has no authentication and binds only to localhost. Keep it local unless you add suitable access controls.
