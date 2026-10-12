"""Score top-3 source retrieval on the included ten-question demo set."""
from app import retrieve

CASES = [
    ("How many days before vacation should I apply?", "people_handbook.txt", ["ten calendar days"]),
    ("What is the meal reimbursement limit per day?", "people_handbook.txt", ["$60 per day"]),
    ("How much paid parental leave is available?", "people_handbook.txt", ["twelve weeks"]),
    ("When are payroll deposits made?", "people_handbook.txt", ["fifteenth", "final business day"]),
    ("How quickly must I report a lost laptop?", "it_security_policy.txt", ["immediately"]),
    ("What should I do after clicking a suspicious link?", "it_security_policy.txt", ["IT Help Desk", "immediately"]),
    ("How often are access rights reviewed?", "it_security_policy.txt", ["quarterly"]),
    ("What approval is needed for a purchase over $5,000?", "operations_guide.txt", ["two competitive vendor quotes"]),
    ("How soon should I acknowledge a standard customer request?", "operations_guide.txt", ["one business day"]),
    ("What is the company's annual bonus target?", None, []),
]

hits = correct_passages = answered = 0
for i, (question, expected_source, keywords) in enumerate(CASES, 1):
    ranked = retrieve(question, 3)
    source_hit = expected_source is None and not ranked or any(c["source"] == expected_source for c in ranked)
    passage = next((c["text"].lower() for c in ranked if c["source"] == expected_source), "")
    answerable = expected_source is not None
    content_hit = answerable and all(k.lower() in passage for k in keywords)
    hits += bool(source_hit)
    correct_passages += bool(content_hit)
    answered += bool(answerable and content_hit)
    print(f"{i:02d}. {'PASS' if source_hit and (content_hit if answerable else True) else 'FAIL'} | {question}")
print(f"\nSource retrieval: {hits}/{len(CASES)}")
print(f"Expected fact present in retrieved source: {correct_passages}/{len(CASES)-1}")
if hits != len(CASES) or correct_passages != len(CASES) - 1:
    raise SystemExit(1)
