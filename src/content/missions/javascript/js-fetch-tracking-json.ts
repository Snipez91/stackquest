import type { MissionInput } from "@/content/schema";

const F = "```";

const apiDoc = `# Tracking API (api-01.lumen.internal) — v3

All paths are relative to the dashboard origin; the dashboard proxies /api to api-01.

## GET /api/shipments/:id
Path segment must be URL-encoded (manual bookings can contain spaces and slashes).

200  { "id": "LUM-4410", "status": "out_for_delivery", "depot": "LDS", "eta": "2026-11-05T16:30:00Z" }
404  { "error": "Shipment not found" }          <- unknown id; not an outage
5xx  JSON or plain text, e.g. "Bad Gateway"     <- outage; body format not guaranteed

## POST /api/shipments/:id/notes
Request headers: Content-Type: application/json
Request body:    { "text": "Left with neighbour at no. 12" }

201  { "id": "N-981", "shipmentId": "LUM-4410", "text": "Left with neighbour at no. 12" }
422  { "error": "Note text must be 500 characters or fewer" }   <- show this message to the user
5xx  JSON or plain text
`;

const starter = `// Lumen Logistics — tracking API client used by the shipment detail drawer.
// See docs/tracking-api.md for the contract.
//
// getShipment(id)   -> the shipment object; null if the API says 404;
//                      throws an Error mentioning the HTTP status for any other failure.
// addNote(id, text) -> the created note object (201);
//                      on 422 throws an Error whose message is the API's "error" text;
//                      on any other failure throws an Error mentioning the HTTP status.

async function getShipment(id) {
  const response = await fetch("/api/shipments/" + id);
  return response.json();
}

async function addNote(id, text) {
  const response = await fetch("/api/shipments/" + id + "/notes", {
    method: "POST",
    body: { text },
  });
  return response.json();
}
`;

const solution = `// Lumen Logistics — tracking API client used by the shipment detail drawer.

function shipmentPath(id) {
  return "/api/shipments/" + encodeURIComponent(id);
}

// Read { error } from a failed response if the body is JSON; otherwise undefined.
async function errorDetail(response) {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : undefined;
  } catch {
    return undefined; // plain-text error page
  }
}

async function getShipment(id) {
  const response = await fetch(shipmentPath(id));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("Loading shipment " + id + " failed: HTTP " + response.status);
  }
  return response.json();
}

async function addNote(id, text) {
  const response = await fetch(shipmentPath(id) + "/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const detail = response.status === 422 ? await errorDetail(response) : undefined;
    throw new Error(detail ?? "Adding note to " + id + " failed: HTTP " + response.status);
  }
  return response.json();
}
`;

const shipment = `const shipment = { id: "LUM-4410", status: "out_for_delivery", depot: "LDS", eta: "2026-11-05T16:30:00Z" };`;

const rejectsWith = `async function rejection(promiseFn) {
  try {
    const value = await promiseFn();
    return { resolved: value };
  } catch (e) {
    return { error: e };
  }
}`;

export const jsFetchTrackingJson: MissionInput = {
  slug: "js-fetch-tracking-json",
  version: 1,
  track: "javascript",
  tier: "advanced",
  order: 1,
  title: "Write a tracking API client that respects HTTP status codes",
  summary:
    "The shipment drawer shows \"Shipment not found\" as data and saves notes as \"[object Object]\". Build GET and JSON POST calls with fetch that check status before parsing.",
  minutes: 35,
  assessmentTypes: ["repair-code", "write-code", "interpret-output"],
  skills: ["js.fetch"],
  appliesSkills: ["js.promises", "js.async", "js.objects"],
  prerequisites: ["js-depot-status-allsettled"],
  brief: {
    from: "Marco Bellini, backend engineer",
    channel: "#dispatch-dashboard",
    body: `From the api-01 side I can see three problems with the dashboard's tracking client:

1. For unknown IDs we return 404 with \`{ "error": "Shipment not found" }\` — the drawer renders that object as if it were a shipment, with blank fields.
2. During yesterday's gateway blip (502, plain-text body) the drawer threw \`SyntaxError: Unexpected token\` instead of saying the API was down.
3. Every note saved since Tuesday is literally \`"[object Object]"\`, and our logs show no Content-Type header.

Also, manual bookings like \`LUM 77/B\` 404 because the slash isn't encoded. The contract is in \`docs/tracking-api.md\`; the client is \`tracking-client.js\`. In the sandbox, \`fetch\` talks to a simulated api-01.`,
  },
  objectives: [
    "Explain that fetch resolves for HTTP error statuses and only rejects for network failures",
    "Check response.ok / response.status before parsing the body",
    "Send a JSON POST with JSON.stringify and a Content-Type header",
    "Map status codes to return values (404 → null) or errors with useful messages",
    "Encode user-supplied path segments with encodeURIComponent",
  ],
  concept: {
    title: "fetch gives you a Response, not your data",
    body: `\`await fetch(url)\` resolves as soon as response **headers** arrive — for *any* HTTP status, including 404 and 500. It only rejects when no response arrives at all (DNS failure, connection refused, CORS, offline). The status lives on the Response:

${F}js
const res = await fetch("/api/shipments/LUM-4410");
res.status;   // 200, 404, 500 …
res.ok;       // true only for 200–299
await res.json();  // reads the body and parses it — throws SyntaxError if it isn't JSON
${F}

So the order is: **fetch → check status → read the body**. Decide per status what the caller should get: data for 2xx; a meaningful value (like \`null\`) for expected outcomes such as 404; an \`Error\` with the status for outages. Error bodies are not guaranteed to be JSON, so parse them defensively.

Sending JSON requires two things. \`body\` must be a **string** — passing an object makes the browser call \`String(obj)\`, which is \`"[object Object]"\` — so use \`JSON.stringify\`. And the server needs \`Content-Type: application/json\` to know how to parse it.

${F}js
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
${F}

Finally, values inserted into a URL path must be encoded: \`encodeURIComponent("LUM 77/B")\` is \`"LUM%2077%2FB"\`, so a slash cannot be mistaken for a path separator.`,
  },
  workedExample: {
    title: "Worked example: a depot opening-hours client",
    body: `Contract: \`GET /api/depots/:code/hours\` → 200 \`{ open, close }\`, 404 for unknown depots, 5xx for outages. \`PUT\` the same path with JSON to change hours; 400 returns \`{ error }\`.

**Step 1 — status before body.**

${F}js
async function getHours(code) {
  const res = await fetch("/api/depots/" + encodeURIComponent(code) + "/hours");
  if (res.status === 404) return null;                 // expected: unknown depot
  if (!res.ok) throw new Error("Hours for " + code + ": HTTP " + res.status);
  return res.json();
}
${F}

**Step 2 — JSON request body.**

${F}js
async function setHours(code, hours) {
  const res = await fetch("/api/depots/" + encodeURIComponent(code) + "/hours", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hours),
  });
${F}

**Step 3 — defensive error bodies.**

${F}js
  if (!res.ok) {
    let message = "HTTP " + res.status;
    if (res.status === 400) {
      try { message = (await res.json()).error ?? message; } catch {}
    }
    throw new Error(message);
  }
  return res.json();
}
${F}

Each status has a deliberate outcome, and a plain-text 503 produces "HTTP 503" rather than a confusing SyntaxError.`,
  },
  simulationNote:
    "fetch is replaced by a simulated api-01. Responses have status, ok, headers.get, json() and text(); the simulator records each request's method, URL, body and headers so checks can verify what you sent.",
  workspace: {
    kind: "javascript",
    entry: "tracking-client.js",
    exports: ["getShipment", "addNote"],
    files: [
      { path: "tracking-client.js", content: starter, editable: true },
      { path: "docs/tracking-api.md", content: apiDoc, editable: false },
    ],
    tests: [
      {
        id: "get-ok",
        name: "getShipment returns the shipment on 200",
        code: `${shipment}
mockFetch({ "GET /api/shipments/LUM-4410": { status: 200, json: shipment } });
assertDeepEqual(await module.getShipment("LUM-4410"), shipment);`,
        feedback: {
          what: "getShipment did not resolve to the parsed shipment for a 200 response.",
          why: "The drawer renders whatever getShipment resolves to.",
          next: "Request /api/shipments/<id> and return await response.json() when response.ok is true.",
        },
      },
      {
        id: "get-404-null",
        name: "getShipment returns null for an unknown shipment (404)",
        code: `mockFetch({ "GET /api/shipments/LUM-0000": { status: 404, json: { error: "Shipment not found" } } });
const got = await module.getShipment("LUM-0000");
assertEqual(got, null, "a 404 should resolve to null, got " + JSON.stringify(got));`,
        feedback: {
          what: "For a 404, getShipment returned the error body (or threw) instead of null.",
          why: "fetch resolves normally for 404; unless you check the status, the error body is treated as a shipment. An unknown ID is an expected answer, not an outage.",
          next: "Check response.status === 404 before parsing, and return null.",
        },
      },
      {
        id: "get-outage-throws",
        name: "getShipment throws an Error naming the status on server failures",
        code: `${rejectsWith}
mockFetch({
  "GET /api/shipments/LUM-4410": { status: 500, json: { error: "db-01 timeout" } },
  "GET /api/shipments/LUM-4411": { status: 502, text: "Bad Gateway" },
});
const a = await rejection(() => module.getShipment("LUM-4410"));
assert(a.error, "a 500 should make getShipment reject, but it resolved with " + JSON.stringify(a.resolved));
assert(String(a.error.message).includes("500"), "the error should mention HTTP 500, got: " + a.error.message);
const b = await rejection(() => module.getShipment("LUM-4411"));
assert(b.error, "a 502 should make getShipment reject, but it resolved with " + JSON.stringify(b.resolved));
assert(String(b.error.message).includes("502"), "the error for a plain-text 502 should mention 502, got: " + b.error.name + ": " + b.error.message);`,
        feedback: {
          what: "A 500 or 502 response resolved as data, or failed with an error that does not mention the status (for example a SyntaxError from parsing \"Bad Gateway\").",
          why: "On-call needs to see \"HTTP 502\" to recognise an outage; a SyntaxError points everyone at the wrong code.",
          next: "After handling 404, check !response.ok and throw new Error(\"… HTTP \" + response.status) before calling response.json().",
        },
      },
      {
        id: "note-json-post",
        name: "addNote sends a JSON POST and returns the created note",
        code: `const created = { id: "N-981", shipmentId: "LUM-4410", text: "Left with neighbour at no. 12" };
const api = mockFetch({ "POST /api/shipments/LUM-4410/notes": { status: 201, json: created } });
const got = await module.addNote("LUM-4410", "Left with neighbour at no. 12");
assertDeepEqual(got, created, "addNote should resolve to the created note");
const call = api.calls[0];
assert(call, "addNote made no request");
assertEqual(call.method, "POST", "the request method should be POST");
assertEqual(typeof call.rawBody, "string", "body must be a JSON string; an object is sent as \\"[object Object]\\"");
assertDeepEqual(JSON.parse(call.rawBody), { text: "Left with neighbour at no. 12" }, "body should be the JSON { text }");
const h = call.headers;
let ct = null;
if (h && typeof h.get === "function") ct = h.get("content-type");
else if (Array.isArray(h)) ct = (h.find(([k]) => String(k).toLowerCase() === "content-type") || [])[1];
else if (h) ct = (Object.entries(h).find(([k]) => k.toLowerCase() === "content-type") || [])[1];
assert(ct && String(ct).includes("application/json"), "send a Content-Type: application/json header, got " + JSON.stringify(ct));`,
        feedback: {
          what: "The note request was not a POST with a JSON string body and a JSON Content-Type header, or the created note was not returned.",
          why: "fetch converts an object body with String(), producing \"[object Object]\"; without the header, api-01 does not parse the body as JSON.",
          next: "Pass { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ text }) }.",
        },
      },
      {
        id: "note-validation-error",
        name: "addNote surfaces the API's validation message on 422",
        code: `${rejectsWith}
mockFetch({ "POST /api/shipments/LUM-4410/notes": { status: 422, json: { error: "Note text must be 500 characters or fewer" } } });
const r = await rejection(() => module.addNote("LUM-4410", "x".repeat(600)));
assert(r.error, "a 422 should make addNote reject, but it resolved with " + JSON.stringify(r.resolved));
assert(String(r.error.message).includes("Note text must be 500 characters or fewer"), "the error message should be the API's validation text, got: " + r.error.message);`,
        feedback: {
          what: "On a 422, addNote resolved, or rejected without the API's validation message.",
          why: "422 means the user can fix their input; the drawer shows err.message next to the note box.",
          next: "When !response.ok and the status is 422, read (await response.json()).error and throw new Error(thatMessage).",
        },
      },
      {
        id: "encoding-and-text-errors",
        name: "IDs are URL-encoded and plain-text failures still report the status",
        hidden: true,
        code: `${rejectsWith}
const manual = { id: "LUM 77/B", status: "booked", depot: "MAN", eta: null };
mockFetch({
  "GET /api/shipments/LUM%2077%2FB": { status: 200, json: manual },
  "POST /api/shipments/LUM-4410/notes": { status: 503, text: "Service Unavailable" },
});
assertDeepEqual(await module.getShipment("LUM 77/B"), manual, "the id should be encoded with encodeURIComponent in the path");
const r = await rejection(() => module.addNote("LUM-4410", "Gate code 4471"));
assert(r.error && String(r.error.message).includes("503"), "a plain-text 503 should reject with an error mentioning 503, got: " + (r.error ? r.error.name + ": " + r.error.message : "resolved"));`,
        feedback: {
          what: "An ID with a space and slash was not URL-encoded, or a plain-text 503 from the notes endpoint did not produce an error mentioning 503.",
          why: "An unencoded \"/\" changes the path, so manual bookings 404; error bodies are not guaranteed to be JSON.",
          next: "Build paths with encodeURIComponent(id). Only parse an error body as JSON inside try/catch (or only for 422), and fall back to a status message.",
        },
      },
    ],
    solution: { "tracking-client.js": solution },
    wrongSolutions: [
      {
        label: "checks the status but sends the note body as an object",
        files: {
          "tracking-client.js": `async function getShipment(id) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function addNote(id, text) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id) + "/notes", { method: "POST", body: { text } });
  if (!res.ok) throw new Error(res.status === 422 ? (await res.json()).error : "HTTP " + res.status);
  return res.json();
}
`,
        },
      },
      {
        label: "treats every non-2xx, including 404, as an error",
        files: {
          "tracking-client.js": `async function getShipment(id) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id));
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function addNote(id, text) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id) + "/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(res.status === 422 ? (await res.json()).error : "HTTP " + res.status);
  return res.json();
}
`,
        },
      },
      {
        label: "parses the body before checking the status",
        files: {
          "tracking-client.js": `async function getShipment(id) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id));
  const data = await res.json();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(data.error);
  return data;
}
async function addNote(id, text) {
  const res = await fetch("/api/shipments/" + encodeURIComponent(id) + "/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
`,
        },
      },
    ],
  },
  successCriteria: [
    "getShipment returns the shipment on 200 and null on 404",
    "Any other failure rejects with an Error that mentions the HTTP status, even when the error body is plain text",
    "addNote sends a POST with a JSON string body and a Content-Type: application/json header",
    "A 422 from the notes endpoint rejects with the API's validation message",
    "Shipment IDs are URL-encoded in the path",
  ],
  hints: [
    "Compare each status in docs/tracking-api.md with what the current code does for it. What does fetch do when the server answers 404?",
    "fetch only rejects when there is no response. For HTTP errors you must look at response.ok or response.status yourself — before calling response.json().",
    "For the note: `body` must be a string and the server needs to be told it is JSON. Look at the request headers in the contract.",
    "Shape: `if (res.status === 404) return null; if (!res.ok) throw new Error(\"… HTTP \" + res.status); return res.json();`. For addNote add `headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ text })`, and on 422 throw `new Error((await res.json()).error)`. Wrap ids in encodeURIComponent.",
  ],
  questions: [
    {
      id: "predict-fetch-404",
      kind: "mcq",
      prompt: "The server answers this request with 404. What happens?",
      code: `try {
  const res = await fetch("/api/shipments/LUM-0000");
  console.log("resolved", res.ok, res.status);
} catch (e) {
  console.log("rejected", e.name);
}`,
      codeLanguage: "javascript",
      options: ["resolved false 404", "rejected TypeError", "rejected HTTPError", "resolved true 404"],
      answer: 0,
      explanation: "fetch resolves for every HTTP response. ok is false because 404 is outside 200–299.",
    },
    {
      id: "predict-object-body",
      kind: "short",
      prompt: "What string does the server receive as the request body here?",
      code: `fetch("/api/notes", { method: "POST", body: { text: "hello" } });`,
      codeLanguage: "javascript",
      accept: ["[object Object]", "\"[object Object]\"", "object Object"],
      explanation: "A non-string body is converted with String(), which gives \"[object Object]\". Use JSON.stringify.",
    },
    {
      id: "interpret-syntax-error",
      kind: "mcq",
      prompt: "During the outage the console showed `SyntaxError: Unexpected token 'B', \"Bad Gateway\" is not valid JSON`. What does this tell you?",
      options: [
        "The client called response.json() on a non-JSON error page before checking the status",
        "The dashboard's JavaScript file has a syntax error",
        "The network request never reached the server",
        "api-01 sent malformed JSON for a successful response",
      ],
      answer: 0,
      explanation: "A 502 from the gateway came back as plain text. The status check must come first so the user sees \"HTTP 502\".",
    },
  ],
  debrief: {
    solution: `- **Status first.** \`getShipment\` returns \`null\` for 404, throws \`Error("… HTTP " + status)\` for any other non-ok response, and only then calls \`response.json()\`.
- **JSON POST.** \`addNote\` sends \`method: "POST"\`, a \`Content-Type: application/json\` header and \`JSON.stringify({ text })\`.
- **Useful errors.** For 422 the API's \`error\` text becomes the Error message so the drawer can show it; for everything else the status is in the message. Error bodies are parsed inside \`try/catch\` because a gateway may send HTML or plain text.
- **Encoding.** \`encodeURIComponent(id)\` makes \`LUM 77/B\` a single path segment.`,
    commonMistakes: [
      "Wrapping fetch in try/catch and assuming that catches 404 and 500 — it only catches network failures.",
      "Calling response.json() before checking the status, which throws SyntaxError on HTML or text error pages.",
      "Passing an object as body, which sends \"[object Object]\".",
      "Treating 404 as an outage; for a lookup it is a normal answer the UI should present as \"not found\".",
      "Concatenating raw IDs into URLs without encodeURIComponent.",
    ],
    realWorld:
      "Most teams wrap fetch in a small client (like this one) or use a library that rejects on non-2xx. Either way someone must decide what each status means for the UI. Logging the status and request path in error messages is what makes outages diagnosable from a single browser console screenshot.",
  },
  review: [
    {
      id: "js-fetch-ok-check",
      skill: "js.fetch",
      variants: [
        {
          id: "js-fetch-ok-check-a",
          kind: "mcq",
          prompt: "Which status codes make `response.ok` true?",
          options: ["Only 200", "200–299", "200–399", "Anything except 5xx"],
          answer: 1,
          explanation: "ok is true exactly for the 2xx range.",
        },
        {
          id: "js-fetch-ok-check-b",
          kind: "mcq",
          prompt: "When does `await fetch(url)` reject?",
          options: [
            "When the server returns 500",
            "When the server returns 404",
            "When no response is received, e.g. the network is down or the request is blocked",
            "When the body is not JSON",
          ],
          answer: 2,
          explanation: "fetch rejects only for network-level failures. HTTP error statuses resolve with ok: false; body parsing errors come later from json().",
        },
      ],
    },
    {
      id: "js-fetch-json-body",
      skill: "js.fetch",
      variants: [
        {
          id: "js-fetch-json-body-a",
          kind: "mcq",
          prompt: "Which request sends `{ depot: \"LDS\" }` as JSON correctly?",
          options: [
            "fetch(url, { method: \"POST\", body: { depot: \"LDS\" } })",
            "fetch(url, { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ depot: \"LDS\" }) })",
            "fetch(url, { method: \"POST\", json: { depot: \"LDS\" } })",
            "fetch(url + \"?body=\" + { depot: \"LDS\" })",
          ],
          answer: 1,
          explanation: "The body must be a JSON string, and the Content-Type header tells the server how to parse it.",
        },
        {
          id: "js-fetch-json-body-b",
          kind: "short",
          prompt: "Which function converts an object to the string you pass as a JSON request body?",
          accept: ["JSON.stringify", "JSON.stringify()", "stringify"],
          explanation: "JSON.stringify(obj) produces the JSON text; JSON.parse does the reverse.",
        },
      ],
    },
    {
      id: "js-fetch-status-mapping",
      skill: "js.fetch",
      variants: [
        {
          id: "js-fetch-status-mapping-a",
          kind: "mcq",
          prompt: "A lookup client should treat \"no such record\" as a normal result. Which code is right?",
          options: [
            "if (!res.ok) throw new Error(\"HTTP \" + res.status); return res.json();",
            "if (res.status === 404) return null; if (!res.ok) throw new Error(\"HTTP \" + res.status); return res.json();",
            "const data = await res.json(); return res.ok ? data : null;",
            "return res.ok ? res.json() : null;",
          ],
          answer: 1,
          explanation: "Handle the expected 404 explicitly, throw for real failures, and parse only successful bodies. Returning null for every failure hides outages.",
        },
        {
          id: "js-fetch-status-mapping-b",
          kind: "mcq",
          prompt: "A form submit gets 422 with `{ \"error\": \"Postcode is invalid\" }`. What should the client do?",
          options: [
            "Retry the request automatically",
            "Throw an Error with \"Postcode is invalid\" so the form can show it",
            "Ignore it; 4xx responses are not errors",
            "Parse the body as the saved record",
          ],
          answer: 1,
          explanation: "422 is a validation failure the user can fix, so surface the server's message.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "Dev is writing a script on ops-ws that calls `GET https://dns-01.lumen.internal/api/zones/lumen.test`. It returns 200 with zone JSON, 404 for unknown zones, and 401 with an HTML login page when the token has expired. The script currently does `const zone = await (await fetch(url)).json();`.",
    question: {
      id: "transfer-dns-api-401",
      kind: "mcq",
      prompt: "With an expired token, what does the current script do, and what should it do?",
      options: [
        "It throws a SyntaxError parsing the HTML; it should check res.status first and report \"HTTP 401: token expired\"",
        "fetch rejects with a 401 error, which is fine",
        "It returns null, which is fine",
        "It returns the login page as zone data; nothing can be done",
      ],
      answer: 0,
      explanation:
        "fetch resolves for 401; calling json() on HTML throws SyntaxError, a misleading message. Checking status first lets the script say what actually went wrong.",
    },
  },
  refresher: {
    body: `\`fetch\` gives you a **Response** whenever the server answers, whatever the status. Look at \`response.ok\` (true for 200–299) or \`response.status\` first, and only parse the body with \`response.json()\` when you know what kind of body to expect. fetch itself only fails (rejects) when there is no answer at all. To send JSON, set \`headers: { "Content-Type": "application/json" }\` and \`body: JSON.stringify(data)\`.`,
    practice: {
      id: "refresher-fetch-500",
      kind: "mcq",
      prompt: "The server replies 500. Is `response.ok` true or false?",
      options: ["false", "true", "undefined", "fetch rejects, so there is no response"],
      answer: 0,
      explanation: "500 is outside 200–299, so ok is false — but fetch still resolved with the Response.",
    },
  },
};
