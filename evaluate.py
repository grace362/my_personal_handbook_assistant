"""Score retrieval and answers on the frozen test_questions.json set."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app import ABSTENTION, groq_answer
from retrieval import retrieve

ROOT = Path(__file__).resolve().parent
TEST_FILE = ROOT / "test_questions.json"


def load_cases() -> tuple[str, list[dict]]:
    data = json.loads(TEST_FILE.read_text(encoding="utf-8"))
    abstention = data.get("abstention_phrase", ABSTENTION)
    questions = data["questions"]
    if len(questions) != 10:
        raise SystemExit(f"Expected 10 frozen questions, found {len(questions)}.")
    unanswerable = sum(1 for q in questions if not q.get("answerable"))
    if unanswerable != 3:
        raise SystemExit(f"Expected 3 unanswerable questions, found {unanswerable}.")
    return abstention, questions


def keyword_hit(text: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    lower = text.lower()
    return all(k.lower() in lower for k in keywords)


def retrieval_pass(case: dict, ranked: list[dict]) -> tuple[bool, bool]:
    if not case.get("answerable"):
        # Semantic retrieval may still return loosely related chunks; abstention is scored on the answer.
        return (True, True)
    expected = case.get("expected_source")
    source_hit = any(c["source"] == expected for c in ranked)
    passage = next((c["text"] for c in ranked if c["source"] == expected), "")
    content_hit = keyword_hit(passage, case.get("keywords") or [])
    return source_hit, content_hit


def answer_pass(case: dict, answer: str, abstention: str) -> bool:
    if not case.get("answerable"):
        return abstention.lower() in answer.lower()
    if abstention.lower() in answer.lower():
        return False
    return keyword_hit(answer, case.get("keywords") or [])


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate handbook Q&A on frozen test questions.")
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Score retrieval only (no Groq calls).",
    )
    args = parser.parse_args()
    abstention, questions = load_cases()

    retrieval_source_hits = retrieval_content_hits = answer_hits = 0
    answerable_count = sum(1 for q in questions if q.get("answerable"))

    for case in questions:
        qid = case["id"]
        question = case["question"]
        ranked = retrieve(question, 3)
        print(f"\n{qid:02d}. {question}")
        for i, chunk in enumerate(ranked, 1):
            preview = chunk["text"][:100].replace("\n", " ")
            print(f"    retrieve {i}: {chunk['source']} ({chunk['id']}) score={chunk.get('score')} :: {preview}…")

        src_ok, content_ok = retrieval_pass(case, ranked)
        retrieval_source_hits += int(src_ok)
        if case.get("answerable"):
            retrieval_content_hits += int(content_ok)

        if args.skip_llm:
            ans_ok = False
            print(f"    retrieval source={'PASS' if src_ok else 'FAIL'} content={'PASS' if content_ok else 'FAIL'}")
            continue

        if not ranked and case.get("answerable"):
            answer = abstention
        elif not ranked:
            answer = abstention
        else:
            try:
                answer = groq_answer(question, ranked)
            except RuntimeError as exc:
                print(f"    answer ERROR: {exc}")
                answer = ""
        ans_ok = answer_pass(case, answer, abstention)
        answer_hits += int(ans_ok)
        print(f"    retrieval source={'PASS' if src_ok else 'FAIL'} content={'PASS' if content_ok else 'FAIL'}")
        print(f"    answer {'PASS' if ans_ok else 'FAIL'}: {answer[:200]}{'…' if len(answer) > 200 else ''}")

    print("\n--- Summary ---")
    print(f"Retrieval (correct source in top 3): {retrieval_source_hits}/{len(questions)}")
    print(f"Retrieval (keywords in matched source): {retrieval_content_hits}/{answerable_count}")
    if not args.skip_llm:
        print(f"Answer quality: {answer_hits}/{len(questions)}")

    target_retrieval = len(questions)
    target_content = answerable_count
    ok = retrieval_source_hits == target_retrieval and retrieval_content_hits == target_content
    if not args.skip_llm:
        ok = ok and answer_hits == len(questions)
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
