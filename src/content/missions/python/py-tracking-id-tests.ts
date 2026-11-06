import type { MissionInput } from "@/content/schema";

const trackingStarter = String.raw`# tracking.py - validation for new-format Lumen tracking IDs.


def is_valid_tracking_id(value):
    return value.startswith("LMN") and len(value) == 11
`;

const testsStarter = String.raw`# test_tracking.py - checks for is_valid_tracking_id.
# Every function whose name starts with test_ is run. A test fails if it
# raises (for example an AssertionError from a failed assert).
from tracking import is_valid_tracking_id


def test_accepts_valid_id():
    assert is_valid_tracking_id("LMN12345678")
`;

const trackingSolution = String.raw`# tracking.py - validation for new-format Lumen tracking IDs.

PREFIX = "LMN"
ASCII_DIGITS = "0123456789"


def is_valid_tracking_id(value):
    if not isinstance(value, str):
        return False
    if len(value) != 11 or not value.startswith(PREFIX):
        return False
    digits = value[len(PREFIX):]
    if any(ch not in ASCII_DIGITS for ch in digits):
        return False
    body, check = digits[:7], digits[7]
    return sum(int(ch) for ch in body) % 10 == int(check)
`;

const testsSolution = String.raw`# test_tracking.py - checks for is_valid_tracking_id.
from tracking import is_valid_tracking_id


def test_accepts_valid_ids():
    # 1+2+3+4+5+6+7 = 28 -> check digit 8
    assert is_valid_tracking_id("LMN12345678")
    assert is_valid_tracking_id("LMN00000000")
    assert is_valid_tracking_id("LMN99999993")


def test_rejects_wrong_check_digit():
    assert not is_valid_tracking_id("LMN12345670")
    assert not is_valid_tracking_id("LMN12345679")


def test_rejects_wrong_length():
    assert not is_valid_tracking_id("LMN1234568")
    assert not is_valid_tracking_id("LMN123456788")
    assert not is_valid_tracking_id("")


def test_prefix_is_case_sensitive():
    assert not is_valid_tracking_id("lmn12345678")
    assert not is_valid_tracking_id("XYZ12345678")


def test_rejects_whitespace():
    assert not is_valid_tracking_id(" LMN12345678")
    assert not is_valid_tracking_id("LMN12345678\n")


def test_rejects_non_digits():
    # "LMN0000000A" would pass the check-digit rule if A were read as 0,
    # so it isolates the digits-only rule.
    assert not is_valid_tracking_id("LMN0000000A")
    assert not is_valid_tracking_id("LMN1234567A")


def test_non_strings_return_false():
    assert is_valid_tracking_id(None) is False
    assert is_valid_tracking_id(12345678) is False
`;

const happyPathTests = String.raw`from tracking import is_valid_tracking_id


def test_accepts_valid_id():
    assert is_valid_tracking_id("LMN12345678")


def test_accepts_other_valid_ids():
    assert is_valid_tracking_id("LMN00000000")
    assert is_valid_tracking_id("LMN99999993")


def test_accepts_id_from_scanner():
    assert is_valid_tracking_id("LMN30090013")


def test_returns_bool():
    assert isinstance(is_valid_tracking_id("LMN12345678"), bool)
`;

const wrongExpectationTests = testsSolution.replace(
  `def test_prefix_is_case_sensitive():
    assert not is_valid_tracking_id("lmn12345678")
    assert not is_valid_tracking_id("XYZ12345678")`,
  `def test_prefix_is_case_insensitive():
    assert is_valid_tracking_id("lmn12345678")
    assert not is_valid_tracking_id("XYZ12345678")`,
);

const unanchoredRegex = String.raw`import re


def is_valid_tracking_id(value):
    if not isinstance(value, str):
        return False
    m = re.match(r"LMN([0-9]{7})([0-9])", value)
    if not m:
        return False
    body, check = m.group(1), m.group(2)
    return sum(int(ch) for ch in body) % 10 == int(check)
`;

const unicodeDigits = String.raw`def is_valid_tracking_id(value):
    if not isinstance(value, str):
        return False
    if len(value) != 11 or not value.startswith("LMN"):
        return False
    digits = value[3:]
    if not digits.isdigit():
        return False
    return sum(int(ch) for ch in digits[:7]) % 10 == int(digits[7])
`;

const crashesOnNone = String.raw`def is_valid_tracking_id(value):
    if len(value) != 11 or not value.startswith("LMN"):
        return False
    digits = value[3:]
    if any(ch not in "0123456789" for ch in digits):
        return False
    return sum(int(ch) for ch in digits[:7]) % 10 == int(digits[7])
`;

/** Shared Python helper used by the suite-quality checks: runs the learner's test file against an implementation. */
const suiteRunner = String.raw`import sys, types

def reference(value):
    if not isinstance(value, str) or len(value) != 11 or not value.startswith("LMN"):
        return False
    digits = value[3:]
    if any(c not in "0123456789" for c in digits):
        return False
    return sum(int(c) for c in digits[:7]) % 10 == int(digits[7])

def run_suite(impl):
    with open("test_tracking.py") as fh:
        src = fh.read()
    fake = types.ModuleType("tracking")
    fake.is_valid_tracking_id = impl
    saved = sys.modules.get("tracking")
    sys.modules["tracking"] = fake
    try:
        ns = {"__name__": "test_tracking"}
        exec(compile(src, "test_tracking.py", "exec"), ns)
        tests = [(n, f) for n, f in ns.items() if n.startswith("test_") and callable(f)]
        failed = []
        for name, fn in tests:
            try:
                fn()
            except BaseException as exc:
                failed.append((name, type(exc).__name__))
        return [n for n, _ in tests], failed
    finally:
        if saved is not None:
            sys.modules["tracking"] = saved
        else:
            sys.modules.pop("tracking", None)
`;

export const mission: MissionInput = {
  slug: "py-tracking-id-tests",
  version: 1,
  track: "python",
  tier: "advanced",
  order: 1,
  title: "Tests that would have caught it",
  summary:
    "A validator that \"had tests\" let malformed tracking IDs into the label printers. Implement it to spec, then write a test suite good enough to catch deliberately broken versions.",
  minutes: 40,
  assessmentTypes: ["write-code", "order-steps", "interpret-output"],
  skills: ["py.testing"],
  appliesSkills: ["py.strings", "py.functions", "py.modules"],
  prerequisites: ["py-shared-units-module", "py-log-crash"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#label-printing",
    body: `The new label printers rolled out at DEN yesterday and printed 300 labels with IDs like \`lmn1234567\` and \`LMN12345670\`. The validator "had a test" — one happy-path assert — so nobody noticed it barely checks anything.

The spec for new-format IDs:

- a \`str\` of exactly 11 characters: \`LMN\` (upper case) followed by 8 ASCII digits \`0–9\`
- the last digit is a check digit: the sum of the first 7 digits, mod 10 (\`LMN1234567\` + \`8\`, because 1+…+7 = 28)
- no surrounding whitespace (callers normalise first); anything that isn't a \`str\` returns \`False\`, never an exception

Please fix \`is_valid_tracking_id\` in \`tracking.py\` **and** grow \`test_tracking.py\` into a suite that would catch the kinds of bugs we keep shipping. I'll run it against a few deliberately broken versions to see if it notices.`,
  },
  objectives: [
    "Translate a written specification into a list of concrete edge cases",
    "Write assert-based test functions that each pin down one rule",
    "Judge a test suite by whether it fails on broken implementations, not just whether it passes",
    "Make a predicate total: return False for unexpected input types instead of raising",
  ],
  concept: {
    title: "A test suite is a bug detector — measure it by what it catches",
    body: `A test is code that calls your function with a chosen input and **asserts** something about the result. \`assert condition, "message"\` does nothing when the condition is true and raises \`AssertionError("message")\` when it is false. Test runners such as pytest simply call every \`test_*\` function and report the ones that raise.

Passing tests prove very little on their own: \`assert is_valid("LMN12345678")\` also passes for \`return True\`. A suite earns its keep by **failing when the code is wrong**. A practical way to design one is to walk the spec rule by rule and ask, for each rule, *"what input would a buggy version get wrong?"*

| Rule | Inputs that probe it |
| --- | --- |
| exact length | 10 and 12 characters, empty string |
| upper-case prefix | \`lmn...\`, a different prefix |
| check digit | the right ID with the last digit changed |
| digits only | a letter in the digit part |
| no whitespace | leading space, trailing newline |
| total function | \`None\`, an \`int\` |

This idea is called **mutation testing**: deliberately break the code (a "mutant") and check that some test fails. Surviving mutants point at rules your suite never checks. Keep each test focused on one rule so a failure tells you *which* rule broke.`,
  },
  workedExample: {
    title: "Worked example: testing a dock-door code validator",
    body: `Spec: door codes look like \`D-07\` — the letter \`D\`, a hyphen, and two digits from \`01\` to \`40\`.

**Step 1 — list the rules and a probing input for each:**

| Rule | Valid | Invalid probe |
| --- | --- | --- |
| prefix \`D-\` | \`D-07\` | \`d-07\`, \`D07\` |
| exactly 2 digits | \`D-40\` | \`D-7\`, \`D-007\` |
| range 01–40 | \`D-01\` | \`D-00\`, \`D-41\` |

**Step 2 — one test function per rule:**

\`\`\`python
from doors import is_valid_door

def test_range_edges():
    assert is_valid_door("D-01")
    assert is_valid_door("D-40")
    assert not is_valid_door("D-00")
    assert not is_valid_door("D-41")

def test_needs_two_digits():
    assert not is_valid_door("D-7")
    assert not is_valid_door("D-007")
\`\`\`

**Step 3 — imagine mutants.** If someone writes \`1 <= n <= 41\`, does a test fail? Yes — \`D-41\`. If they forget the length check and use \`int(code[2:])\`, does \`D-007\` catch it? Yes. If the code crashes on \`None\`, is there a test? Not yet — add \`assert is_valid_door(None) is False\`.

Boundaries (\`01\`, \`40\`, \`00\`, \`41\`) catch far more bugs than "typical" values like \`D-17\`.`,
  },
  workspace: {
    kind: "python",
    entry: "tracking.py",
    files: [
      { path: "tracking.py", content: trackingStarter, editable: true },
      { path: "test_tracking.py", content: testsStarter, editable: true },
    ],
    tests: [
      {
        id: "impl-accepts-valid",
        name: "is_valid_tracking_id accepts well-formed IDs",
        code: String.raw`for v in ["LMN12345678", "LMN00000000", "LMN99999993", "LMN30090013"]:
    r = main.is_valid_tracking_id(v)
    assert r is True, f"is_valid_tracking_id({v!r}) should be True, got {r!r}"`,
        feedback: {
          what: "A well-formed ID with a correct check digit was rejected (or the result was not exactly True).",
          why: "Rejecting good IDs stops real parcels at the label station, which is as costly as letting bad ones through.",
          next: "Check the check-digit maths by hand: sum of the first 7 digits, mod 10, equals the 8th digit. Return a real bool.",
        },
      },
      {
        id: "impl-rejects-invalid",
        name: "is_valid_tracking_id rejects every spec violation without raising",
        code: String.raw`bad = ["LMN12345670", "lmn12345678", "LMN1234567", "LMN123456788", "", " LMN12345678",
       "LMN12345678\n", "LMN1234567A", "XYZ12345678", None, 12345678, ["LMN12345678"]]
for v in bad:
    try:
        r = main.is_valid_tracking_id(v)
    except Exception as exc:
        raise AssertionError(f"is_valid_tracking_id({v!r}) raised {type(exc).__name__}; it should return False")
    assert r is False, f"is_valid_tracking_id({v!r}) should be False, got {r!r}"`,
        feedback: {
          what: "An invalid value was accepted, or the function raised an exception instead of returning False.",
          why: "These are the exact shapes of the 300 bad DEN labels. A validator that crashes on None takes down the caller instead of rejecting the value.",
          next: "Check the type first, then the exact length and prefix, then that every character after LMN is a digit, then the check digit.",
        },
      },
      {
        id: "impl-ascii-only",
        name: "Only ASCII digits 0-9 count as digits",
        hidden: true,
        code: String.raw`for v in ["LMN1234567８", "LMN١٢٣٤٥٦٧٨", "LMN12345²78"]:
    try:
        r = main.is_valid_tracking_id(v)
    except Exception as exc:
        raise AssertionError(f"is_valid_tracking_id({v!r}) raised {type(exc).__name__}; it should return False")
    assert r is False, f"is_valid_tracking_id({v!r}) contains non-ASCII digits and should be False, got {r!r}"`,
        feedback: {
          what: "An ID containing a non-ASCII digit (a full-width ８, an Arabic-Indic digit, or a superscript ²) was accepted, or crashed the validator.",
          why: "str.isdigit() and the regex \\d both accept Unicode digits; the label printers and barcode format only support 0–9.",
          next: "Test each character against \"0123456789\" (or use a regex with re.ASCII / an explicit [0-9] class) instead of isdigit().",
        },
      },
      {
        id: "suite-is-correct",
        name: "Your test suite passes against a correct implementation",
        code:
          suiteRunner +
          String.raw`
names, failed = run_suite(reference)
assert len(names) >= 4, f"test_tracking.py should have at least 4 test_ functions (one per rule is a good start); found {len(names)}: {names}"
assert not failed, f"These tests fail against a CORRECT implementation, so their expectations disagree with the spec: {failed}"`,
        feedback: {
          what: "Your test suite has fewer than 4 tests, or some of its expectations contradict the spec.",
          why: "A test that fails on correct code is a false alarm; people learn to ignore it, and then it can't protect anything.",
          next: "Re-read the spec for the failing test (e.g. the prefix is upper-case only; non-strings return False). Split the suite into one test function per rule.",
        },
      },
      {
        id: "suite-catches-mutants",
        name: "Your test suite fails on each deliberately broken implementation",
        code:
          suiteRunner +
          String.raw`
def m_case(value):
    if not isinstance(value, str): return False
    return reference(value[:3].upper() + value[3:])

def m_no_check(value):
    if not isinstance(value, str) or len(value) != 11 or not value.startswith("LMN"): return False
    return all(c in "0123456789" for c in value[3:])

def m_prefix_match(value):
    if not isinstance(value, str) or len(value) < 11: return False
    return reference(value[:11])

def m_strips(value):
    if not isinstance(value, str): return False
    return reference(value.strip())

def m_crashes(value):
    return reference(value) if value.startswith("LMN") else False

def m_letters(value):
    if not isinstance(value, str) or len(value) != 11 or not value.startswith("LMN"): return False
    nums = [int(c) if c in "0123456789" else 0 for c in value[3:]]
    return sum(nums[:7]) % 10 == nums[7]

mutants = {
    "accepts a lower-case prefix": m_case,
    "never checks the check digit": m_no_check,
    "accepts extra characters after 11": m_prefix_match,
    "strips surrounding whitespace": m_strips,
    "crashes on non-string input": m_crashes,
    "treats letters in the digits as 0": m_letters,
}
survivors = [desc for desc, impl in mutants.items() if not run_suite(impl)[1]]
assert not survivors, f"Your suite passed against these broken versions, so it would not catch them: {survivors}"`,
        feedback: {
          what: "At least one deliberately broken implementation passed your whole test suite.",
          why: "Each surviving mutant is a bug that could ship today without any test going red — just like the DEN labels.",
          next: "For each surviving description, add an assert with an input that the broken version gets wrong (e.g. \"lmn12345678\", \"LMN123456788\", \" LMN12345678\", None, \"LMN1234567A\", a wrong last digit).",
        },
      },
    ],
    solution: { "tracking.py": trackingSolution, "test_tracking.py": testsSolution },
    wrongSolutions: [
      { label: "Correct validator, happy-path-only tests", files: { "tracking.py": trackingSolution, "test_tracking.py": happyPathTests } },
      { label: "Tests assume the prefix is case-insensitive", files: { "tracking.py": trackingSolution, "test_tracking.py": wrongExpectationTests } },
      { label: "Regex without an end anchor accepts 12+ characters", files: { "tracking.py": unanchoredRegex, "test_tracking.py": testsSolution } },
      { label: "Uses isdigit(), which accepts Unicode digits", files: { "tracking.py": unicodeDigits, "test_tracking.py": testsSolution } },
      { label: "Crashes on None instead of returning False", files: { "tracking.py": crashesOnNone, "test_tracking.py": testsSolution } },
    ],
  },
  successCriteria: [
    "is_valid_tracking_id returns True for spec-compliant IDs and False (never an exception) for everything else, including non-ASCII digits",
    "test_tracking.py has at least 4 test functions, all of which pass against a correct implementation",
    "test_tracking.py fails against each of six deliberately broken implementations",
  ],
  hints: [
    "Turn the spec into a table: one row per rule, with one valid input and at least one input that breaks only that rule. The concept table is a good template.",
    "Implementation order matters: check `isinstance(value, str)` before calling string methods, then exact length and prefix, then the digits, then the check digit.",
    "For the suite, think like a saboteur. If someone \"simplified\" the code by deleting one check, which of your asserts would fail? If none would, add one. Remember `None` and a trailing `\\n`.",
    "Good probes: `\"LMN12345670\"` (bad check digit), `\"lmn12345678\"`, `\"LMN123456788\"` (12 chars), `\" LMN12345678\"`, `\"LMN0000000A\"` (a letter where the check-digit maths would otherwise pass), and `is_valid_tracking_id(None) is False`. For ASCII-only digits, compare each character with `\"0123456789\"` instead of using `isdigit()`.",
  ],
  questions: [
    {
      id: "order-bugfix-workflow",
      kind: "order",
      prompt: "A new bad ID shape is reported from DEN. Put the steps of a test-first bug fix in order.",
      items: [
        "Write a test that uses the reported ID and asserts the correct result",
        "Run the test and confirm it fails for the reason you expect",
        "Change the validator to handle the case",
        "Run the whole suite and confirm everything passes",
        "Commit the test together with the fix",
      ],
      explanation:
        "Seeing the new test fail first proves it actually exercises the bug. Running the whole suite afterwards checks you didn't break another rule, and committing them together keeps the bug from coming back.",
    },
    {
      id: "predict-surviving-mutant",
      kind: "mcq",
      prompt: "A suite contains only the test below. Which broken implementation would it NOT catch?",
      code: `def test_rejects_bad_check_digit():
    assert not is_valid_tracking_id("LMN12345670")`,
      codeLanguage: "python",
      options: [
        "One that never checks the check digit",
        "One that always returns False",
        "One that returns True for every string",
        "One that compares the check digit with sum % 9",
      ],
      answer: 1,
      explanation:
        "\"Always False\" passes a suite that only checks rejection. You also need at least one assert that a valid ID is accepted — rejection-only and acceptance-only suites both let trivial mutants survive.",
    },
    {
      id: "predict-assert",
      kind: "mcq",
      prompt: "What happens when this line runs and the function returns False?",
      code: `assert is_valid_tracking_id("LMN12345678"), "valid ID was rejected"`,
      codeLanguage: "python",
      options: [
        "Nothing; assert only prints a warning",
        "It raises AssertionError with the message \"valid ID was rejected\"",
        "It returns False",
        "It raises ValueError",
      ],
      answer: 1,
      explanation: "A false assert condition raises AssertionError carrying the message, which is what test runners report.",
    },
  ],
  debrief: {
    solution: `**Implementation** — guard the type, then check each rule in turn:

\`\`\`python
def is_valid_tracking_id(value):
    if not isinstance(value, str):
        return False
    if len(value) != 11 or not value.startswith("LMN"):
        return False
    digits = value[3:]
    if any(ch not in "0123456789" for ch in digits):
        return False
    return sum(int(ch) for ch in digits[:7]) % 10 == int(digits[7])
\`\`\`

**Suite** — one test per rule, each with a probe that only that rule rejects: wrong check digit (\`LMN12345670\`), length 10/12/0, lower-case prefix, leading space / trailing newline, a letter in the digits, and \`None\`/\`int\` returning \`False\`. Plus a few valid IDs, so "always False" can't pass.

The mutants were: lower-case accepted, check digit ignored, prefix-only match, whitespace stripped, crash on non-strings, and letters treated as 0. Each one is a real bug pattern from validators in the wild.`,
    commonMistakes: [
      "Writing only happy-path tests: they pass for `return True` and catch nothing.",
      "Writing only rejection tests: they pass for `return False`.",
    "Using a probe that breaks two rules at once (e.g. \"LMN1234567A\" also has a wrong check digit), so a mutant that ignores one rule is still rejected for the other reason and survives.",
      "Encoding a misreading of the spec in a test (e.g. case-insensitive prefix), so the test fails on correct code.",
      "Using str.isdigit() or \\d, which accept Unicode digits such as full-width ８.",
      "Using re.match without an end anchor (or fullmatch), which accepts extra trailing characters.",
      "Calling value.startswith before checking the type, so None raises AttributeError.",
    ],
    realWorld:
      "Tools like mutmut and cosmic-ray automate exactly what the hidden checks did: they mutate your code and report surviving mutants. Coverage only tells you which lines ran; mutation testing tells you whether your asserts would notice a change. For validators, parsers and pricing rules — code whose bugs are silent — that distinction matters most. In pytest, the same suite would run unchanged with `pytest test_tracking.py`.",
  },
  review: [
    {
      id: "py-edge-case-tests",
      skill: "py.testing",
      variants: [
        {
          id: "py-edge-case-tests-a",
          kind: "mcq",
          prompt: "Spec: a pallet weight is valid from 1 to 1000 kg inclusive. Which set of test inputs best probes the boundaries?",
          options: ["500", "1, 1000, 0, 1001", "250, 500, 750", "-5, 5000"],
          answer: 1,
          explanation: "Boundary bugs (< vs <=) only show at the edges: the smallest and largest valid values and the first invalid value on each side.",
        },
        {
          id: "py-edge-case-tests-b",
          kind: "mcq",
          prompt: "A validator for hub codes (exactly 3 upper-case letters) is implemented as `return code.isupper()`. Which test catches it?",
          options: [
            'assert is_hub("ATL")',
            'assert not is_hub("ATLX")',
            'assert is_hub("ORD")',
            'assert isinstance(is_hub("DEN"), bool)',
          ],
          answer: 1,
          explanation: "\"ATLX\".isupper() is True, so the buggy version accepts a 4-letter code; only the length probe fails it. The other tests pass for the bug.",
        },
        {
          id: "py-edge-case-tests-c",
          kind: "mcq",
          prompt: "Your suite passes against `def is_valid(x): return True`. What does that tell you?",
          options: [
            "The implementation is correct",
            "The suite has no test asserting that some input is rejected",
            "The suite has too many tests",
            "The tests are too slow",
          ],
          answer: 1,
          explanation: "If \"accept everything\" survives, nothing in the suite checks rejection. Add a probe for each rule that should reject.",
        },
      ],
    },
    {
      id: "py-assert-semantics",
      skill: "py.testing",
      variants: [
        {
          id: "py-assert-semantics-a",
          kind: "mcq",
          prompt: "What does `assert 2 + 2 == 5, \"maths broke\"` do?",
          options: ["Prints maths broke", "Raises AssertionError(\"maths broke\")", "Returns False", "Nothing"],
          answer: 1,
          explanation: "A false condition raises AssertionError with the message; a true one does nothing.",
        },
        {
          id: "py-assert-semantics-b",
          kind: "mcq",
          prompt: "Which assert correctly checks that `parse(None)` returns exactly False (not None, not 0)?",
          options: ["assert not parse(None)", "assert parse(None) is False", "assert parse(None) == 0", "assert parse(None) != True"],
          answer: 1,
          explanation: "`not x` passes for None, 0 and \"\" as well. `is False` pins down the exact value.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Aiko's team adds a Python helper `is_valid_postcode(code)` for the customer portal: 5 ASCII digits, optionally followed by a hyphen and 4 more digits (`30301` or `30301-1234`). The current suite is:\n\n```python\ndef test_valid():\n    assert is_valid_postcode(\"30301\")\n    assert is_valid_postcode(\"30301-1234\")\n\ndef test_invalid():\n    assert not is_valid_postcode(\"3030\")\n```",
    question: {
      id: "transfer-postcode-mutant",
      kind: "mcq",
      prompt: "Which buggy implementation would this suite still let through?",
      options: [
        "One that rejects every postcode with a hyphen",
        "One that accepts \"30301-12\" (a short extension)",
        "One that rejects \"30301\"",
        "One that accepts \"3030\"",
      ],
      answer: 1,
      explanation:
        "No test probes the extension's length, so a version that accepts any number of digits after the hyphen survives. Add `assert not is_valid_postcode(\"30301-12\")` (and a 5-digit extension).",
    },
  },
  refresher: {
    body: `A test calls your code with a chosen input and uses \`assert\` to check the result; a false assert raises \`AssertionError\` and the test fails. Good tests are chosen to **fail when the code is wrong**.

Go through the rules one at a time and, for each, pick an input that breaks only that rule: too short, too long, wrong case, a wrong check digit, \`None\`. Include a couple of valid inputs too, so a function that rejects everything can't pass.`,
    practice: {
      id: "refresher-which-probe",
      kind: "mcq",
      prompt: "Rule: \"the ID must be exactly 11 characters\". Which input probes this rule?",
      options: ['"LMN12345678"', '"LMN123456789"', '"lmn12345678"', "None"],
      answer: 1,
      explanation: "\"LMN123456789\" is 12 characters but otherwise looks right, so only the length rule should reject it.",
    },
  },
};
