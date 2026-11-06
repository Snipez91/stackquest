import type { MissionInput } from "@/content/schema";

const okSample = `{
  "meta": {"status": "ok", "request_id": "req-81f2", "api_version": "2.3"},
  "data": {
    "shipment": {
      "id": "NL-558201",
      "reference": "LMN30110001",
      "state": "IN_TRANSIT",
      "eta": "2026-11-06T14:00:00Z"
    },
    "events": [
      {"ts": "2026-11-05T09:02:11Z", "type": "LABEL_CREATED"},
      {"ts": "2026-11-05T13:40:52Z", "type": "PICKED_UP", "location": {"code": "ATL", "name": "Atlanta hub"}},
      {"ts": "2026-11-05T22:18:07Z", "type": "ARRIVED", "location": {"code": "CLT", "name": "Charlotte cross-dock"}}
    ]
  }
}
`;

const noEtaSample = `{
  "meta": {"status": "ok", "request_id": "req-81f9", "api_version": "2.3"},
  "data": {
    "shipment": {
      "id": "NL-558377",
      "reference": "LMN30110002",
      "state": "LABEL_CREATED"
    },
    "events": []
  }
}
`;

const errorSample = `{
  "meta": {"status": "error", "request_id": "req-9a01", "api_version": "2.3"},
  "error": {"code": "NOT_FOUND", "message": "No shipment with reference LMN30119999"}
}
`;

const truncatedSample = `{"meta": {"status": "ok", "request_id": "req-9b44"}, "data": {"shipment": {"id": "NL-5590`;

const workerLog = `2026-11-05T23:00:04Z sync-worker INFO  polling Northline for 412 open shipments
2026-11-05T23:00:05Z sync-worker ERROR LMN30110002 KeyError: 'eta'
2026-11-05T23:00:05Z sync-worker ERROR LMN30119999 KeyError: 'data'
2026-11-05T23:00:06Z sync-worker ERROR LMN30110871 JSONDecodeError: Unterminated string starting at: line 1 column 82
2026-11-05T23:00:06Z sync-worker FATAL worker exited after 3 consecutive errors; 409 shipments not updated
`;

const starter = String.raw`# carrier_client.py - turns Northline API responses into our shipment records.
import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    payload = json.loads(body)
    shipment = payload["data"]["shipment"]
    events = payload["data"]["events"]
    return {
        "tracking_id": shipment["reference"],
        "status": shipment["state"],
        "eta": shipment["eta"],
        "last_location": events[-1]["location"]["code"],
        "event_count": len(events),
    }
`;

const solution = String.raw`# carrier_client.py - turns Northline API responses into our shipment records.
import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise CarrierAPIError(f"invalid JSON from carrier: {exc}") from exc

    meta = payload.get("meta", {})
    if meta.get("status") != "ok":
        error = payload.get("error") or {}
        code = error.get("code", "UNKNOWN")
        message = error.get("message", "no error details")
        raise CarrierAPIError(f"carrier error {code}: {message}")

    data = payload.get("data") or {}
    shipment = data.get("shipment")
    if not shipment or "reference" not in shipment:
        raise CarrierAPIError("response has no shipment reference")

    events = data.get("events") or []
    last_location = None
    for event in reversed(events):
        location = event.get("location")
        if location and location.get("code"):
            last_location = location["code"]
            break

    return {
        "tracking_id": shipment["reference"],
        "status": shipment.get("state"),
        "eta": shipment.get("eta"),
        "last_location": last_location,
        "event_count": len(events),
    }
`;

const swallowsErrors = String.raw`import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    try:
        payload = json.loads(body)
        shipment = payload["data"]["shipment"]
        events = payload["data"].get("events") or []
        located = [e["location"]["code"] for e in events if e.get("location")]
        return {
            "tracking_id": shipment["reference"],
            "status": shipment.get("state"),
            "eta": shipment.get("eta"),
            "last_location": located[-1] if located else None,
            "event_count": len(events),
        }
    except Exception:
        return None
`;

const getEverywhere = String.raw`import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise CarrierAPIError(f"invalid JSON: {exc}") from exc
    data = payload.get("data", {})
    shipment = data.get("shipment", {})
    events = data.get("events", [])
    located = [e["location"]["code"] for e in events if e.get("location")]
    return {
        "tracking_id": shipment.get("reference"),
        "status": shipment.get("state"),
        "eta": shipment.get("eta"),
        "last_location": located[-1] if located else None,
        "event_count": len(events),
    }
`;

const lastEventOnly = String.raw`import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise CarrierAPIError(f"invalid JSON: {exc}") from exc
    if payload.get("meta", {}).get("status") != "ok":
        error = payload.get("error") or {}
        raise CarrierAPIError(f"carrier error {error.get('code', 'UNKNOWN')}")
    shipment = (payload.get("data") or {}).get("shipment")
    if not shipment or "reference" not in shipment:
        raise CarrierAPIError("no shipment")
    events = payload["data"].get("events") or []
    last = events[-1] if events else {}
    return {
        "tracking_id": shipment["reference"],
        "status": shipment.get("state"),
        "eta": shipment.get("eta"),
        "last_location": (last.get("location") or {}).get("code"),
        "event_count": len(events),
    }
`;

const leaksDecodeError = String.raw`import json


class CarrierAPIError(Exception):
    """Raised when a carrier API response cannot be used."""


def parse_tracking_response(body):
    payload = json.loads(body)
    if payload.get("meta", {}).get("status") != "ok":
        error = payload.get("error") or {}
        raise CarrierAPIError(f"carrier error {error.get('code', 'UNKNOWN')}")
    shipment = (payload.get("data") or {}).get("shipment")
    if not shipment or "reference" not in shipment:
        raise CarrierAPIError("no shipment")
    events = payload["data"].get("events") or []
    located = [e["location"]["code"] for e in events if e.get("location")]
    return {
        "tracking_id": shipment["reference"],
        "status": shipment.get("state"),
        "eta": shipment.get("eta"),
        "last_location": located[-1] if located else None,
        "event_count": len(events),
    }
`;

const expectRaises = String.raw`
def expect_carrier_error(body, must_mention=None):
    try:
        r = main.parse_tracking_response(body)
    except main.CarrierAPIError as exc:
        if must_mention:
            assert must_mention in str(exc), f"CarrierAPIError message should mention {must_mention!r}, got {str(exc)!r}"
        return
    except Exception as exc:
        raise AssertionError(f"expected CarrierAPIError, but {type(exc).__name__} escaped: {exc}")
    raise AssertionError(f"expected CarrierAPIError, but parse_tracking_response returned {r!r}")
`;

export const mission: MissionInput = {
  slug: "py-carrier-api",
  version: 1,
  track: "python",
  tier: "advanced",
  order: 2,
  title: "The sync worker that died on its third KeyError",
  summary:
    "The carrier sync worker assumes every API response is a happy-path success. Parse JSON payloads defensively: optional fields, error statuses and truncated bodies.",
  minutes: 35,
  assessmentTypes: ["write-code", "investigate-logs", "interpret-output"],
  skills: ["py.json-apis"],
  appliesSkills: ["py.exceptions", "py.collections", "py.files"],
  prerequisites: ["py-log-crash"],
  brief: {
    from: "Marco Bellini, Backend engineer",
    channel: "#integrations",
    body: `Northline's tracking API knocked our sync worker over last night — \`worker.log\` has the story, and 409 shipments never got updated. \`parse_tracking_response\` was written against one sample response and assumes every field is always there.

Real responses (see \`samples/\`) vary:

- brand-new labels have **no \`eta\`** and an empty \`events\` list
- unknown references come back with \`meta.status = "error"\` and an \`error\` block instead of \`data\` — the HTTP status is still 200
- the proxy occasionally cuts a body short

The worker catches \`CarrierAPIError\` per shipment and moves on, so please make every *unusable* response raise that (with the error code in the message when Northline gives one). Usable responses should return the record with \`None\` for missing optional values. \`last_location\` is the code of the most recent event **that has a location** — label events don't.`,
  },
  objectives: [
    "Map JSON types to Python types and navigate nested dicts and lists safely",
    "Distinguish required fields (fail loudly) from optional fields (default to None)",
    "Check an API's own status field rather than assuming success",
    "Translate low-level parsing errors into one domain exception the caller can handle",
  ],
  concept: {
    title: "A JSON payload is just dicts and lists — with a contract",
    body: `\`json.loads(text)\` turns JSON into ordinary Python values: objects → \`dict\`, arrays → \`list\`, strings → \`str\`, numbers → \`int\`/\`float\`, \`true/false\` → \`True/False\`, \`null\` → \`None\`. From then on you're indexing nested dicts and lists.

The hard part is deciding what to do when the shape isn't what you hoped:

| Situation | Approach |
| --- | --- |
| **Required** field (\`reference\`) | index it, or check and raise a clear error |
| **Optional** field (\`eta\`) | \`d.get("eta")\` → \`None\` if absent |
| Optional list (\`events\`) | \`d.get("events") or []\` handles missing *and* \`null\` |
| API says it failed (\`meta.status\`) | check it **before** reading \`data\` |
| Body isn't JSON | catch \`json.JSONDecodeError\` |

\`.get()\` everywhere is not "defensive" — it turns a failed request into a record full of \`None\` that looks real. Be strict about what you can't work without.

Callers shouldn't have to know about \`KeyError\`, \`JSONDecodeError\` and \`TypeError\`. Define one domain exception and **translate** low-level failures into it:

\`\`\`python
try:
    payload = json.loads(body)
except json.JSONDecodeError as exc:
    raise CarrierAPIError("invalid JSON") from exc   # keeps the original as __cause__
\`\`\``,
  },
  workedExample: {
    title: "Worked example: a weather API for route planning",
    body: `The route planner calls a (simulated) weather service. Success looks like \`{"ok": true, "forecast": {"wind_kph": 42, "alerts": [...]}}\`; failure is \`{"ok": false, "reason": "RATE_LIMITED"}\`.

**Step 1 — define the contract.** \`wind_kph\` is required; \`alerts\` is optional; \`ok\` must be checked first.

**Step 2 — parse, check status, then read:**

\`\`\`python
import json

class WeatherError(Exception):
    pass

def parse_forecast(body):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise WeatherError(f"bad JSON: {exc}") from exc
    if payload.get("ok") is not True:
        raise WeatherError(f"weather API failed: {payload.get('reason', 'UNKNOWN')}")
    forecast = payload.get("forecast") or {}
    if "wind_kph" not in forecast:
        raise WeatherError("forecast has no wind_kph")
    alerts = forecast.get("alerts") or []
    severe = [a["title"] for a in alerts if a.get("severity") == "severe"]
    return {"wind_kph": forecast["wind_kph"], "severe_alerts": severe}
\`\`\`

**Step 3 — try each shape:** a good body, \`{"ok": false, "reason": "RATE_LIMITED"}\`, a body with \`"alerts": null\`, and \`'{"ok": tr'\`. Each either returns a full record or raises \`WeatherError\` — never \`KeyError\` and never a half-empty dict.`,
  },
  workspace: {
    kind: "python",
    entry: "carrier_client.py",
    files: [
      { path: "carrier_client.py", content: starter, editable: true },
      { path: "samples/ok_in_transit.json", content: okSample, editable: false },
      { path: "samples/no_eta.json", content: noEtaSample, editable: false },
      { path: "samples/error_not_found.json", content: errorSample, editable: false },
      { path: "samples/truncated.txt", content: truncatedSample, editable: false },
      { path: "worker.log", content: workerLog, editable: false },
    ],
    tests: [
      {
        id: "ok-response",
        name: "A complete response becomes a full record",
        code: String.raw`with open("samples/ok_in_transit.json") as f:
    r = main.parse_tracking_response(f.read())
want = {"tracking_id": "LMN30110001", "status": "IN_TRANSIT", "eta": "2026-11-06T14:00:00Z", "last_location": "CLT", "event_count": 3}
assert r == want, f"expected {want}, got {r}"`,
        feedback: {
          what: "The happy-path sample did not produce the expected record.",
          why: "This is the most common response; any change must keep it working exactly.",
          next: "tracking_id comes from data.shipment.reference, status from state, and last_location from the newest event's location.code.",
        },
      },
      {
        id: "optional-fields",
        name: "Missing optional fields become None, empty events are fine",
        code: String.raw`import json
with open("samples/no_eta.json") as f:
    r = main.parse_tracking_response(f.read())
assert r["tracking_id"] == "LMN30110002", f"tracking_id should be 'LMN30110002', got {r.get('tracking_id')!r}"
assert r["eta"] is None, f"eta should be None when absent, got {r['eta']!r}"
assert r["last_location"] is None, f"last_location should be None with no events, got {r['last_location']!r}"
assert r["event_count"] == 0, f"event_count should be 0, got {r['event_count']!r}"
body = json.dumps({"meta": {"status": "ok"}, "data": {"shipment": {"reference": "LMN30110003", "state": "PENDING", "eta": None}, "events": None}})
r = main.parse_tracking_response(body)
assert r["eta"] is None and r["event_count"] == 0 and r["last_location"] is None, f"null eta and null events should give eta=None, event_count=0, last_location=None; got {r}"`,
        feedback: {
          what: "A response without eta, or with no (or null) events, raised an error or gave the wrong defaults.",
          why: "New labels legitimately have no ETA or scan events yet — this was the KeyError: 'eta' in worker.log.",
          next: "Use shipment.get(\"eta\") for the optional value and data.get(\"events\") or [] for the list (that also covers null).",
        },
      },
      {
        id: "error-status",
        name: "An error response raises CarrierAPIError with the error code",
        code:
          expectRaises +
          String.raw`
with open("samples/error_not_found.json") as f:
    expect_carrier_error(f.read(), must_mention="NOT_FOUND")`,
        feedback: {
          what: "The error response did not raise CarrierAPIError mentioning NOT_FOUND (it raised something else, or returned a value).",
          why: "Northline signals failure in meta.status with HTTP 200. Reading data first gives KeyError: 'data' — the second error in worker.log — and kills the worker.",
          next: "Check payload[\"meta\"][\"status\"] before touching data; if it isn't \"ok\", raise CarrierAPIError including error.code.",
        },
      },
      {
        id: "truncated-body",
        name: "A truncated body raises CarrierAPIError, not JSONDecodeError",
        code:
          expectRaises +
          String.raw`
with open("samples/truncated.txt") as f:
    expect_carrier_error(f.read())
expect_carrier_error("")
expect_carrier_error("<html>502 Bad Gateway</html>")`,
        feedback: {
          what: "A body that isn't valid JSON let json.JSONDecodeError (or another error) escape.",
          why: "The worker only catches CarrierAPIError per shipment. Any other exception type stops the whole run.",
          next: "Wrap json.loads in try/except json.JSONDecodeError and raise CarrierAPIError(...) from the original exception.",
        },
      },
      {
        id: "malformed-shapes",
        name: "Error blocks without details, and OK responses without a shipment",
        hidden: true,
        code:
          expectRaises +
          String.raw`
import json
expect_carrier_error(json.dumps({"meta": {"status": "error"}}), must_mention="UNKNOWN")
expect_carrier_error(json.dumps({"meta": {"status": "ok"}, "data": {}}))
expect_carrier_error(json.dumps({"meta": {"status": "ok"}, "data": {"shipment": {"state": "IN_TRANSIT"}}}))`,
        feedback: {
          what: "An error with no details, or an \"ok\" response with no shipment reference, did not raise CarrierAPIError.",
          why: "A record without our tracking ID cannot be matched to anything; returning one with None would silently corrupt the shipments table.",
          next: "Use \"UNKNOWN\" as the code when the error block is missing, and raise when data.shipment or its reference is absent.",
        },
      },
      {
        id: "last-location-skips",
        name: "last_location uses the newest event that has a location",
        hidden: true,
        code: String.raw`import json
body = json.dumps({"meta": {"status": "ok"}, "data": {"shipment": {"reference": "LMN30110004", "state": "EXCEPTION"},
    "events": [
        {"type": "PICKED_UP", "location": {"code": "ATL"}},
        {"type": "ARRIVED", "location": {"code": "DEN"}},
        {"type": "CUSTOMER_CONTACTED"},
        {"type": "NOTE", "location": None},
    ]}})
r = main.parse_tracking_response(body)
assert r["last_location"] == "DEN", f"last_location should be 'DEN' (the newest event with a location), got {r['last_location']!r}"
assert r["event_count"] == 4, f"event_count should count all 4 events, got {r['event_count']!r}"`,
        feedback: {
          what: "last_location was None (or crashed) because the newest event had no location.",
          why: "Customer-contact and note events have no location. Dispatchers need the last place the parcel was physically seen.",
          next: "Walk the events from newest to oldest (reversed(events)) and take the first one whose location is a non-empty dict with a code.",
        },
      },
    ],
    solution: { "carrier_client.py": solution },
    wrongSolutions: [
      { label: "Catches every exception and returns None", files: { "carrier_client.py": swallowsErrors } },
      { label: "Uses .get() for everything, so error responses become empty records", files: { "carrier_client.py": getEverywhere } },
      { label: "Takes the location of the very last event only", files: { "carrier_client.py": lastEventOnly } },
      { label: "Lets JSONDecodeError escape", files: { "carrier_client.py": leaksDecodeError } },
    ],
  },
  successCriteria: [
    "The complete sample returns the full record with last_location CLT and 3 events",
    "Missing or null eta and events produce None / 0 instead of errors",
    "Error statuses, invalid JSON and responses without a shipment reference all raise CarrierAPIError, with the error code (or UNKNOWN) in the message",
    "last_location is the newest event that actually has a location",
  ],
  hints: [
    "Line up the three errors in `worker.log` with the files in `samples/`. Each error is a different assumption the starter makes about the payload.",
    "Sort the fields into *required* (`reference`, and the response actually being a success) and *optional* (`eta`, `events`, an event's `location`). Required → raise `CarrierAPIError`; optional → `None` or an empty list.",
    "Order matters: parse the JSON (translating `JSONDecodeError`), then check `meta.status`, then read `data`. `payload.get(\"error\") or {}` gives you something safe to call `.get(\"code\", \"UNKNOWN\")` on.",
    "For the location: `for event in reversed(events): loc = event.get(\"location\"); if loc and loc.get(\"code\"): last_location = loc[\"code\"]; break`. For events: `events = data.get(\"events\") or []`.",
  ],
  questions: [
    {
      id: "investigate-worker-log",
      kind: "mcq",
      prompt: "In `worker.log`, what does `KeyError: 'data'` for LMN30119999 tell you?",
      options: [
        "Northline's server crashed",
        "The response was an error payload (no data block), and the code read data before checking meta.status",
        "The JSON was truncated",
        "LMN30119999 has no ETA yet",
      ],
      answer: 1,
      explanation:
        "Error responses have meta and error but no data. The starter indexes payload[\"data\"] unconditionally, so the API's own error becomes a KeyError — which the worker doesn't handle.",
    },
    {
      id: "predict-json-types",
      kind: "short",
      prompt: "What does this print?",
      code: `import json
p = json.loads('{"eta": null, "events": [], "pieces": 2}')
print(p.get("eta"), len(p["events"]), p["pieces"] + 1)`,
      codeLanguage: "python",
      accept: ["None 0 3"],
      acceptPatterns: ["^None\\s*,?\\s*0\\s*,?\\s*3$"],
      explanation: "JSON null becomes None, [] becomes an empty list, and 2 becomes the int 2, so the output is `None 0 3`.",
    },
  ],
  debrief: {
    solution: `Parse, check the API's verdict, then read required and optional fields differently:

\`\`\`python
def parse_tracking_response(body):
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise CarrierAPIError(f"invalid JSON from carrier: {exc}") from exc

    if payload.get("meta", {}).get("status") != "ok":
        error = payload.get("error") or {}
        raise CarrierAPIError(f"carrier error {error.get('code', 'UNKNOWN')}: ...")

    data = payload.get("data") or {}
    shipment = data.get("shipment")
    if not shipment or "reference" not in shipment:
        raise CarrierAPIError("response has no shipment reference")

    events = data.get("events") or []
    last_location = None
    for event in reversed(events):
        location = event.get("location")
        if location and location.get("code"):
            last_location = location["code"]
            break
    ...
\`\`\`

Every failure the worker can recover from is now a \`CarrierAPIError\`; every optional gap is \`None\`; nothing silently invents a record.`,
    commonMistakes: [
      "Trusting HTTP 200 (or the presence of a body) instead of the API's own meta.status field.",
      "Using .get() for required fields, so an error response becomes a record with tracking_id None.",
      "Catching Exception and returning None, which the caller then stores or crashes on later.",
      "Letting json.JSONDecodeError escape when the caller only handles the domain exception.",
      "Using `data.get(\"events\", [])`, which still returns None when the API sends `\"events\": null`.",
    ],
    realWorld:
      "Third-party APIs change shape, return errors inside 200 responses, and get truncated by proxies. Production clients usually validate payloads against a schema (pydantic, jsonschema, or hand-written checks like these), raise one client-specific exception, and log the request_id so the provider can investigate. The same thinking applies to webhooks and message-queue payloads: decide what's required, default what's optional, and never invent data.",
  },
  review: [
    {
      id: "py-json-optional-keys",
      skill: "py.json-apis",
      variants: [
        {
          id: "py-json-optional-keys-a",
          kind: "mcq",
          prompt: "`stop = {\"id\": \"S1\"}` (parsed from JSON). What does `stop.get(\"window\")` return, and what does `stop[\"window\"]` do?",
          options: [
            "None; raises KeyError",
            "KeyError; returns None",
            "\"\"; returns \"\"",
            "None; returns None",
          ],
          answer: 0,
          explanation: ".get() returns None (or a default you pass) for a missing key; indexing raises KeyError.",
        },
        {
          id: "py-json-optional-keys-b",
          kind: "mcq",
          prompt: "A payload is `{\"alerts\": null}`. Which expression safely gives a list to loop over?",
          options: ['p.get("alerts", [])', 'p.get("alerts") or []', 'p["alerts"]', 'list(p)'],
          answer: 1,
          explanation: "The key exists with value None, so .get(\"alerts\", []) returns None. `or []` replaces both missing and null with an empty list.",
        },
        {
          id: "py-json-optional-keys-c",
          kind: "mcq",
          prompt: "A billing API response must contain `invoice_id`. It's missing in one response. What should the parser do?",
          options: [
            "Use invoice.get(\"invoice_id\") and store None",
            "Generate a placeholder ID",
            "Raise the client's domain error (e.g. BillingAPIError) with a clear message",
            "Skip the field and continue silently",
          ],
          answer: 2,
          explanation: "Required data that's missing means the response is unusable. Fail loudly with a specific error; don't invent or store a half-record.",
        },
      ],
    },
    {
      id: "py-json-types",
      skill: "py.json-apis",
      variants: [
        {
          id: "py-json-types-a",
          kind: "short",
          prompt: "What does this print?",
          code: `import json
print(json.loads('[1, "2", true, null]'))`,
          codeLanguage: "python",
          accept: ["[1, '2', True, None]"],
          acceptPatterns: ["^\\[\\s*1\\s*,\\s*'?2'?\\s*,\\s*True\\s*,\\s*None\\s*\\]$"],
          explanation: "JSON true → True, null → None; \"2\" stays a string and 1 is an int.",
        },
        {
          id: "py-json-types-b",
          kind: "mcq",
          prompt: "`p = json.loads('{\"status\": \"error\"}')` arrived with HTTP status 200. What is true?",
          options: [
            "HTTP 200 means the request succeeded, so read p[\"data\"]",
            "The API reported a failure in its own status field; check it before reading data",
            "json.loads raised an error",
            "p is a string",
          ],
          answer: 1,
          explanation: "Many APIs return errors inside a 200 response. Always check the payload's own status before using it.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Priya's script polls the (simulated) monitoring API on `api-01.lumen.internal` for active alerts. A response looks like `{\"status\": \"ok\", \"alerts\": [{\"host\": \"db-01\", \"severity\": \"critical\"}]}`. During a maintenance window the API returns `{\"status\": \"maintenance\"}`, and her script reports \"0 critical alerts\" — so on-call thinks everything is fine.",
    question: {
      id: "transfer-monitoring-status",
      kind: "mcq",
      prompt: "What is the best fix?",
      options: [
        "Use payload.get(\"alerts\", []) so the script never crashes",
        "Check payload[\"status\"] first; if it isn't \"ok\", raise or report \"alert data unavailable\" instead of a count",
        "Retry forever until alerts appear",
        "Treat maintenance as 0 alerts because nothing is broken",
      ],
      answer: 1,
      explanation:
        "\"No data\" is not \"no alerts\". The script already avoided crashing — that was the problem. It must check the API's status and surface the unknown state.",
    },
  },
  refresher: {
    body: `\`json.loads\` turns JSON text into dicts, lists, strings, numbers, \`True/False\` and \`None\`. Then:

- **Check the API's own status first** — errors often arrive with HTTP 200.
- **Required** fields: if missing, raise a clear error instead of guessing.
- **Optional** fields: \`d.get("eta")\` gives \`None\`; \`d.get("events") or []\` gives an empty list even for \`null\`.
- Wrap \`json.loads\` in \`try/except json.JSONDecodeError\` so a cut-off body becomes your own error type.`,
    practice: {
      id: "refresher-get-default",
      kind: "mcq",
      prompt: "`p = {\"id\": \"S9\"}`. What does `p.get(\"eta\")` return?",
      options: ["KeyError", "None", '""', "False"],
      answer: 1,
      explanation: ".get() returns None for a missing key (unless you pass another default).",
    },
  },
};
