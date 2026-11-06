import type { MissionInput } from "@/content/schema";

const F = "```";

const html = `<main id="dispatch">
  <form id="assign-form">
    <label>Tracking number <input id="tracking" name="tracking"></label>
    <label>Driver <input id="driver" name="driver"></label>
    <button id="assign" type="submit">Assign</button>
    <p id="form-error" class="error" hidden></p>
  </form>
  <ul id="assignments">
    <li data-tracking="LUM-100200">LUM-100200 — Ana Costa <button class="unassign">Unassign</button></li>
  </ul>
</main>`;

const starter = `// Lumen Logistics — driver assignment panel (see index.html).
//
// Required behaviour:
// 1. Handle the form's submit event (pressing Enter submits too) and prevent the
//    browser's default submit, which reloads the page and loses the dispatcher's work.
// 2. Trim both inputs and upper-case the tracking number. It must look like
//    LUM-123456 (LUM- plus six digits), and the driver must not be blank.
//    If invalid: show a message in #form-error (un-hide it) and add nothing.
// 3. If valid: append <li data-tracking="LUM-123456">LUM-123456 — Driver Name
//    <button class="unassign">Unassign</button></li> to #assignments, hide the error,
//    and clear both inputs. Driver names are shown as text, never as HTML.
// 4. Clicking any .unassign button removes its row — including rows added later and
//    rows rendered by the live feed, which replaces #assignments.innerHTML every 30 s.

const form = document.getElementById("assign-form");
const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const assignButton = document.getElementById("assign");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");

const TRACKING_PATTERN = /^LUM-\\d{6}$/;

function addAssignment(tracking, driver) {
  list.innerHTML +=
    '<li data-tracking="' + tracking + '">' + tracking + " — " + driver +
    ' <button class="unassign">Unassign</button></li>';
}

assignButton.addEventListener("click", () => {
  addAssignment(trackingInput.value, driverInput.value);
});

for (const button of document.querySelectorAll(".unassign")) {
  button.addEventListener("click", () => button.closest("li").remove());
}
`;

const solution = `// Lumen Logistics — driver assignment panel (see index.html).

const form = document.getElementById("assign-form");
const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");

const TRACKING_PATTERN = /^LUM-\\d{6}$/;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

function addAssignment(tracking, driver) {
  const li = document.createElement("li");
  li.dataset.tracking = tracking;
  const button = document.createElement("button");
  button.className = "unassign";
  button.textContent = "Unassign";
  li.append(tracking + " — " + driver + " ", button); // strings are inserted as text, not HTML
  list.appendChild(li);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const tracking = trackingInput.value.trim().toUpperCase();
  const driver = driverInput.value.trim();

  if (!TRACKING_PATTERN.test(tracking)) {
    showError("Tracking numbers look like LUM-123456.");
    return;
  }
  if (driver === "") {
    showError("Choose a driver for " + tracking + ".");
    return;
  }

  addAssignment(tracking, driver);
  clearError();
  trackingInput.value = "";
  driverInput.value = "";
});

// One listener on the list handles every Unassign button, present or future (event delegation).
list.addEventListener("click", (event) => {
  const button = event.target.closest(".unassign");
  if (!button) return;
  button.closest("li").remove();
});
`;

const rows = `const rows = () => document.querySelectorAll("#assignments li");`;

export const jsDispatchFormEvents: MissionInput = {
  slug: "js-dispatch-form-events",
  version: 1,
  track: "javascript",
  tier: "intermediate",
  order: 2,
  title: "Wire the driver assignment form with submit and delegated events",
  summary:
    "Pressing Enter reloads the page, bad tracking numbers get assigned, and Unassign stops working after the live feed refreshes. Handle submit properly and delegate list clicks.",
  minutes: 35,
  assessmentTypes: ["repair-code", "write-code", "explain-root-cause"],
  skills: ["js.dom-events"],
  appliesSkills: ["js.functions", "js.scope"],
  prerequisites: ["js-rate-limiter-closure"],
  brief: {
    from: "Aiko Tanaka, frontend engineer",
    channel: "#dispatch-dashboard",
    body: `Dispatchers on the night shift reported three problems with the driver assignment panel:

- Typing a tracking number and pressing **Enter** reloads the page and wipes the form.
- \`12345\` and blank drivers get assigned without complaint.
- **Unassign** works on the first row but does nothing for rows added during the shift, and nothing at all after the live feed refreshes the list (it replaces \`#assignments.innerHTML\` every 30 seconds).

QA also flagged that a driver named \`<b>Eve</b>\` renders in bold. The required behaviour is written at the top of \`assign.js\`; the markup is in \`index.html\`. The simulated DOM supports createElement, append, textContent, dataset, hidden, addEventListener with bubbling, event.target and closest — but not FormData.`,
  },
  objectives: [
    "Handle a form's submit event and prevent the default page reload",
    "Validate and normalise input before changing the DOM",
    "Build elements with createElement and textContent so user input is never parsed as HTML",
    "Use event delegation so one listener handles current and future list items",
  ],
  concept: {
    title: "Events bubble, and listeners belong to elements",
    body: `When the user acts, the browser dispatches an **event** at the target element, then **bubbles** it up through every ancestor to the document. A listener attached to any ancestor sees it, and \`event.target\` says which element was actually clicked.

A **form submit** is an event on the \`<form>\`, fired by clicking a submit button *or* pressing Enter in a field. Its default action is to navigate (reload). \`event.preventDefault()\` cancels that default; the rest of your handler still runs. Listening to the button's \`click\` misses Enter and does not stop the reload.

Listeners are attached to **specific element objects**. \`innerHTML = …\` (including \`+=\`) parses text into brand-new elements and discards the old ones — with their listeners. Two consequences:

1. Per-row listeners vanish whenever a list is re-rendered. **Event delegation** fixes this: put one listener on the stable parent and inspect the target.

${F}js
list.addEventListener("click", (event) => {
  const button = event.target.closest(".unassign");
  if (button) button.closest("li").remove();
});
${F}

2. Strings passed to \`innerHTML\` are interpreted as markup, so user input can inject elements (or scripts in a real browser). Build nodes with \`createElement\` and put user text in \`textContent\` / \`append("text")\`, which never parse HTML.`,
  },
  workedExample: {
    title: "Worked example: a delegated depot filter bar",
    body: `The depot page has \`<div id="filters">\` with a button per depot, and the buttons are re-rendered whenever depots change.

**Step 1 — one listener on the stable container.**

${F}js
const filters = document.getElementById("filters");
filters.addEventListener("click", (event) => {
  const chip = event.target.closest("button[data-depot]");
  if (!chip) return;                    // click landed on padding, not a chip
  showDepot(chip.dataset.depot);
});
${F}

**Step 2 — render with elements and text, not HTML strings.**

${F}js
function renderChips(depots) {
  filters.replaceChildren();            // old chips go; the listener stays on #filters
  for (const name of depots) {
    const chip = document.createElement("button");
    chip.dataset.depot = name;
    chip.textContent = name;            // "<i>LDS</i>" would show literally
    filters.append(chip);
  }
}
${F}

**Step 3 — a search form that does not reload.**

${F}js
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (q === "") return showHint("Type a depot code");
  renderChips(allDepots.filter((d) => d.startsWith(q.toUpperCase())));
});
${F}

The chips can be re-rendered any number of times and clicking still works, because the listener was never on them.`,
  },
  simulationNote:
    "The page runs in a small simulated DOM: elements, attributes, classList, dataset, hidden, value, textContent, innerHTML (simple parser), createElement/append/remove, and events with bubbling, target, closest and preventDefault. There is no layout, CSS or FormData; the event model behaves like a browser's for these features.",
  workspace: {
    kind: "javascript",
    entry: "assign.js",
    exports: ["addAssignment"],
    html,
    files: [
      { path: "assign.js", content: starter, editable: true },
      { path: "index.html", content: html, editable: false },
    ],
    tests: [
      {
        id: "submit-prevented",
        name: "Submitting the form prevents the page reload",
        code: `dom.type("#tracking", "LUM-123456");
dom.type("#driver", "Ben Okoro");
const notCancelled = dom.submit("#assign-form");
assertEqual(notCancelled, false, "the submit event's default action was not prevented, so the page would reload");`,
        feedback: {
          what: "Dispatching a submit event on #assign-form was not cancelled.",
          why: "Pressing Enter fires submit on the form, not click on the button; without preventDefault the browser reloads and the dispatcher's input is lost.",
          next: "Listen for \"submit\" on the form and call event.preventDefault() at the start of the handler.",
        },
      },
      {
        id: "valid-assignment-added",
        name: "A valid submission adds a normalised row and clears the form",
        code: `${rows}
dom.type("#tracking", "  lum-123456 ");
dom.type("#driver", " Ben Okoro ");
dom.submit("#assign-form");
assertEqual(rows().length, 2, "expected the new row to be added (2 rows), found " + rows().length);
const li = rows()[1];
assertEqual(li.dataset.tracking, "LUM-123456", "the new row's data-tracking should be the trimmed, upper-cased number");
assert(li.textContent.includes("LUM-123456") && li.textContent.includes("Ben Okoro"), "the row text should show the tracking number and driver, got: " + li.textContent);
assert(li.querySelector(".unassign"), "the new row needs an Unassign button with class unassign");
assertEqual(document.getElementById("tracking").value, "", "the tracking input should be cleared");
assertEqual(document.getElementById("driver").value, "", "the driver input should be cleared");`,
        feedback: {
          what: "After a valid submission the row was missing, malformed, or the inputs were not cleared.",
          why: "Dispatchers enter dozens of assignments per hour; the form must be ready for the next one and data-tracking is used by the live feed.",
          next: "In the submit handler, trim and upper-case the tracking number, create the li with dataset.tracking, append it, then set both inputs' value to \"\".",
        },
      },
      {
        id: "invalid-shows-error",
        name: "Invalid input shows an error, adds nothing, and the error clears on success",
        code: `${rows}
const err = document.getElementById("form-error");
dom.type("#tracking", "12345");
dom.type("#driver", "Ben Okoro");
assertEqual(dom.submit("#assign-form"), false, "invalid submissions must also prevent the reload");
assertEqual(rows().length, 1, "an invalid tracking number must not be added");
assert(!err.hidden && err.textContent.trim().length > 0, "#form-error should be visible with a message");
dom.type("#tracking", "LUM-222333");
dom.type("#driver", "   ");
dom.submit("#assign-form");
assertEqual(rows().length, 1, "a blank driver must not be added");
assert(!err.hidden, "#form-error should be visible for a blank driver");
dom.type("#driver", "Chen Wu");
dom.submit("#assign-form");
assertEqual(rows().length, 2, "after correcting the driver the row should be added");
assert(err.hidden, "#form-error should be hidden again after a successful submission");`,
        feedback: {
          what: "Invalid input was added, no visible error appeared, the reload was not prevented, or the error stayed visible after a successful submit.",
          why: "Bad tracking numbers create orphan assignments that drivers cannot scan; a stale error message confuses the next entry.",
          next: "Call preventDefault before any early return. Validate with TRACKING_PATTERN.test(...) and a blank check, set errorBox.textContent and errorBox.hidden = false on failure, and hide it on success.",
        },
      },
      {
        id: "unassign-new-rows",
        name: "Unassign works for the original row and for rows added later",
        code: `${rows}
dom.type("#tracking", "LUM-123456");
dom.type("#driver", "Ben Okoro");
dom.submit("#assign-form");
assertEqual(rows().length, 2, "setup: the new row should have been added");
dom.click('#assignments [data-tracking="LUM-123456"] .unassign');
assertEqual(rows().length, 1, "clicking Unassign on the new row should remove it");
dom.click('#assignments [data-tracking="LUM-100200"] .unassign');
assertEqual(rows().length, 0, "clicking Unassign on the original row should remove it");`,
        feedback: {
          what: "Clicking an Unassign button did not remove its row (usually the row that was added after the page loaded).",
          why: "Listeners attached in a loop at startup only exist on the buttons that existed then; innerHTML += also recreates every row and drops their listeners.",
          next: "Attach one click listener to #assignments and use event.target.closest(\".unassign\") to find the button that was clicked.",
        },
      },
      {
        id: "unassign-after-feed-rerender",
        name: "Unassign still works after the live feed re-renders the list",
        hidden: true,
        code: `${rows}
document.getElementById("assignments").innerHTML =
  '<li data-tracking="LUM-555555">LUM-555555 — Dee Patel <button class="unassign">Unassign</button></li>' +
  '<li data-tracking="LUM-666666">LUM-666666 — Ola Nowak <button class="unassign">Unassign</button></li>';
dom.click('#assignments [data-tracking="LUM-555555"] .unassign');
assertEqual(rows().length, 1, "after a feed refresh, Unassign should still remove the clicked row");
assertEqual(rows()[0].dataset.tracking, "LUM-666666", "only the clicked row should be removed");`,
        feedback: {
          what: "After the list's innerHTML was replaced, clicking Unassign did nothing.",
          why: "Re-rendering creates new button elements without listeners. Only a listener on an element that survives (the ul) keeps working.",
          next: "Use event delegation on #assignments rather than per-button listeners.",
        },
      },
      {
        id: "driver-name-is-text",
        name: "Driver names are displayed as text, not parsed as HTML",
        hidden: true,
        code: `${rows}
dom.type("#tracking", "LUM-777888");
dom.type("#driver", "<b>Eve</b>");
dom.submit("#assign-form");
const li = rows()[rows().length - 1];
assert(li && li.dataset.tracking === "LUM-777888", "setup: the row should have been added");
assert(!li.querySelector("b"), "the driver name was parsed as HTML and created a <b> element");
assert(li.textContent.includes("<b>Eve</b>"), "the driver name should appear literally as text, got: " + li.textContent);`,
        feedback: {
          what: "A driver name containing markup created real elements in the row.",
          why: "Building rows from strings with innerHTML lets any input inject markup; in a real browser that is a cross-site scripting hole.",
          next: "Create the li and button with document.createElement and add the text with append(\"…\") or textContent.",
        },
      },
    ],
    solution: { "assign.js": solution },
    wrongSolutions: [
      {
        label: "prevents submit, but builds rows with innerHTML += and per-button listeners",
        files: {
          "assign.js": `const form = document.getElementById("assign-form");
const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");
function wire() {
  for (const b of document.querySelectorAll(".unassign")) b.addEventListener("click", () => b.closest("li").remove());
}
function addAssignment(tracking, driver) {
  list.innerHTML += '<li data-tracking="' + tracking + '">' + tracking + " — " + driver + ' <button class="unassign">Unassign</button></li>';
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const tracking = trackingInput.value.trim().toUpperCase();
  const driver = driverInput.value.trim();
  if (!/^LUM-\\d{6}$/.test(tracking) || !driver) { errorBox.textContent = "Invalid"; errorBox.hidden = false; return; }
  addAssignment(tracking, driver);
  errorBox.hidden = true;
  trackingInput.value = "";
  driverInput.value = "";
});
wire();
`,
        },
      },
      {
        label: "listens to the button's click instead of the form's submit",
        files: {
          "assign.js": `const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");
function addAssignment(tracking, driver) {
  const li = document.createElement("li");
  li.dataset.tracking = tracking;
  const b = document.createElement("button");
  b.className = "unassign";
  b.textContent = "Unassign";
  li.append(tracking + " — " + driver + " ", b);
  list.appendChild(li);
}
document.getElementById("assign").addEventListener("click", (event) => {
  event.preventDefault();
  const tracking = trackingInput.value.trim().toUpperCase();
  const driver = driverInput.value.trim();
  if (!/^LUM-\\d{6}$/.test(tracking) || !driver) { errorBox.textContent = "Invalid"; errorBox.hidden = false; return; }
  addAssignment(tracking, driver);
  errorBox.hidden = true;
  trackingInput.value = "";
  driverInput.value = "";
});
list.addEventListener("click", (event) => {
  const b = event.target.closest(".unassign");
  if (b) b.closest("li").remove();
});
`,
        },
      },
      {
        label: "validates before calling preventDefault",
        files: {
          "assign.js": `const form = document.getElementById("assign-form");
const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");
function addAssignment(tracking, driver) {
  const li = document.createElement("li");
  li.dataset.tracking = tracking;
  const b = document.createElement("button");
  b.className = "unassign";
  b.textContent = "Unassign";
  li.append(tracking + " — " + driver + " ", b);
  list.appendChild(li);
}
form.addEventListener("submit", (event) => {
  const tracking = trackingInput.value.trim().toUpperCase();
  const driver = driverInput.value.trim();
  if (!/^LUM-\\d{6}$/.test(tracking) || !driver) { errorBox.textContent = "Invalid"; errorBox.hidden = false; return; }
  event.preventDefault();
  addAssignment(tracking, driver);
  errorBox.hidden = true;
  trackingInput.value = "";
  driverInput.value = "";
});
list.addEventListener("click", (event) => {
  const b = event.target.closest(".unassign");
  if (b) b.closest("li").remove();
});
`,
        },
      },
      {
        label: "delegation and submit correct, but rows built from an HTML string",
        files: {
          "assign.js": `const form = document.getElementById("assign-form");
const trackingInput = document.getElementById("tracking");
const driverInput = document.getElementById("driver");
const errorBox = document.getElementById("form-error");
const list = document.getElementById("assignments");
function addAssignment(tracking, driver) {
  const li = document.createElement("li");
  li.dataset.tracking = tracking;
  li.innerHTML = tracking + " — " + driver + ' <button class="unassign">Unassign</button>';
  list.appendChild(li);
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const tracking = trackingInput.value.trim().toUpperCase();
  const driver = driverInput.value.trim();
  if (!/^LUM-\\d{6}$/.test(tracking) || !driver) { errorBox.textContent = "Invalid"; errorBox.hidden = false; return; }
  addAssignment(tracking, driver);
  errorBox.hidden = true;
  trackingInput.value = "";
  driverInput.value = "";
});
list.addEventListener("click", (event) => {
  const b = event.target.closest(".unassign");
  if (b) b.closest("li").remove();
});
`,
        },
      },
    ],
  },
  successCriteria: [
    "Submitting the form (button or Enter) never reloads the page",
    "Invalid tracking numbers or blank drivers show a visible error and add nothing",
    "Valid submissions add a row with data-tracking, show the driver as text, and clear the inputs",
    "Unassign removes the clicked row for original rows, new rows and rows re-rendered by the live feed",
  ],
  hints: [
    "Two different events are involved: which element fires submit, and which element should own the click listener for Unassign?",
    "Pressing Enter in a field fires submit on the form, not click on the button. Listeners attached in a startup loop only exist on the buttons present at startup — and innerHTML += replaces those too.",
    "Start the submit handler with event.preventDefault(). Build rows with document.createElement(\"li\"), li.dataset.tracking = …, and li.append(text, button) so the driver name stays text.",
    "Replace the per-button loop with one listener: `list.addEventListener(\"click\", (event) => { const b = event.target.closest(\".unassign\"); if (b) b.closest(\"li\").remove(); })`.",
  ],
  questions: [
    {
      id: "predict-prevent-default",
      kind: "mcq",
      prompt: "A submit handler calls `event.preventDefault()` on its first line and then throws an error on its third line. What happens?",
      options: [
        "The page reloads because the handler failed",
        "The page does not reload; preventDefault already cancelled the default action",
        "preventDefault is undone by the error",
        "The browser asks the user whether to continue",
      ],
      answer: 1,
      explanation: "preventDefault takes effect immediately. That is one reason to call it first: later failures cannot cause a reload that hides the error.",
    },
    {
      id: "explain-delegation",
      kind: "explain",
      prompt: "Explain why the Unassign buttons stopped working after the live feed refreshed the list, and why a single listener on #assignments fixes it.",
      concepts: [
        { label: "re-rendering creates new elements; listeners were on the old ones", anyOf: ["new elements", "new buttons", "replaced", "recreated", "removed", "destroyed", "re-render", "rerender", "innerhtml", "discarded"] },
        { label: "click events bubble up to ancestors", anyOf: ["bubble", "bubbling", "propagat"] },
        { label: "the parent's listener identifies the clicked button from the event target", anyOf: ["event.target", "target", "closest", "delegation", "delegate", "parent", "ancestor"] },
      ],
      minConcepts: 2,
      modelAnswer:
        "The listeners were attached to the original button elements. The live feed replaces innerHTML, which discards those elements and creates new buttons without listeners. Click events bubble up from the button to its ancestors, so one listener on the stable #assignments list (event delegation) receives every click and uses event.target.closest(\".unassign\") to find which row to remove, no matter when the button was created.",
      explanation: "Delegation ties behaviour to a stable ancestor instead of to elements that come and go.",
    },
  ],
  debrief: {
    solution: `- **Submit, not click.** \`form.addEventListener("submit", …)\` catches both the button and Enter, and \`event.preventDefault()\` on the first line stops the reload even if validation fails.
- **Validate, then mutate.** Trim, upper-case, test against \`/^LUM-\\d{6}$/\`, and check the driver is not blank. On failure, set \`errorBox.textContent\` and \`hidden = false\`, and return before touching the list.
- **Build nodes, not strings.** \`createElement\` + \`dataset\` + \`append(text, button)\` keeps user input as text.
- **Delegate.** One click listener on \`#assignments\` with \`event.target.closest(".unassign")\` covers original rows, rows added later, and rows the feed re-renders.`,
    commonMistakes: [
      "Listening to the submit button's click event, which misses Enter-to-submit.",
      "Calling preventDefault only on the success path, so invalid input still reloads the page.",
      "Using innerHTML += to append, which recreates every existing row and destroys their listeners.",
      "Checking event.target.classList.contains(\"unassign\") — it breaks as soon as the button contains an icon or span; closest handles nested targets.",
    ],
    realWorld:
      "Frameworks like React delegate events at the root for the same reason, and they escape text by default to prevent XSS — the risk you saw with the <b>Eve</b> driver name is how real injection bugs start. For forms, the submit event is also what assistive technologies and password managers trigger.",
  },
  review: [
    {
      id: "js-form-submit-event",
      skill: "js.dom-events",
      variants: [
        {
          id: "js-form-submit-event-a",
          kind: "mcq",
          prompt: "A search box is inside a `<form>`. Users press Enter and the page reloads. Which fix is correct?",
          options: [
            "form.addEventListener(\"submit\", (e) => { e.preventDefault(); search(); })",
            "button.addEventListener(\"click\", () => search())",
            "input.addEventListener(\"input\", () => search())",
            "form.addEventListener(\"click\", (e) => e.stopPropagation())",
          ],
          answer: 0,
          explanation: "Enter fires submit on the form; cancelling its default action stops the reload.",
        },
        {
          id: "js-form-submit-event-b",
          kind: "mcq",
          prompt: "Which call stops a form submission from navigating away?",
          options: ["event.stopPropagation()", "event.preventDefault()", "return true from the handler", "form.reset()"],
          answer: 1,
          explanation: "preventDefault cancels the browser's default action. stopPropagation only stops the event reaching ancestors.",
        },
      ],
    },
    {
      id: "js-event-delegation",
      skill: "js.dom-events",
      variants: [
        {
          id: "js-event-delegation-a",
          kind: "mcq",
          prompt: "A table's rows are re-rendered every 10 seconds. Each row has a Details button. Where should the click listener go?",
          options: [
            "On each Details button, re-attached after every render",
            "On the table body, using event.target.closest(\"button\") to find the row",
            "On window, checking event.type",
            "Inline onclick strings in the HTML",
          ],
          answer: 1,
          explanation: "Clicks bubble to the stable tbody, so one delegated listener works for every render.",
        },
        {
          id: "js-event-delegation-b",
          kind: "short",
          prompt: "Inside a delegated click listener, which element method finds the nearest ancestor (or itself) matching a selector?",
          accept: ["closest", "closest()", "element.closest", "event.target.closest", "target.closest"],
          explanation: "event.target.closest(selector) walks up from the clicked element and returns the first match, or null.",
        },
      ],
    },
    {
      id: "js-text-not-html",
      skill: "js.dom-events",
      variants: [
        {
          id: "js-text-not-html-a",
          kind: "mcq",
          prompt: "A comment box shows user text. Which line is safe against markup injection?",
          options: ["el.innerHTML = comment", "el.textContent = comment", "el.innerHTML += comment", "el.outerHTML = comment"],
          answer: 1,
          explanation: "textContent inserts a text node; the browser never parses it as HTML.",
        },
        {
          id: "js-text-not-html-b",
          kind: "mcq",
          prompt: "`name = \"<img src=x onerror=alert(1)>\"`. Which code displays it literally?",
          options: ["li.innerHTML = name", "li.append(name)", "li.innerHTML = \"<span>\" + name + \"</span>\"", "document.write(name)"],
          answer: 1,
          explanation: "append with a string creates a text node. The innerHTML variants parse the string and create an img element.",
        },
      ],
    },
  ],
  transfer: {
    context:
      "The parcel exceptions page renders a `<ul id=\"exceptions\">` from WebSocket messages, replacing its contents on each message. Each `<li>` has a \"Resolve\" button and a nested `<span class=\"icon\">` inside the button. Sam asks how to wire Resolve so it always works.",
    question: {
      id: "transfer-delegate-nested",
      kind: "mcq",
      prompt: "Which listener is correct?",
      options: [
        "exceptions.addEventListener(\"click\", (e) => { const b = e.target.closest(\"button.resolve\"); if (b) resolve(b.closest(\"li\").dataset.id); })",
        "exceptions.addEventListener(\"click\", (e) => { if (e.target.classList.contains(\"resolve\")) resolve(e.target.parentElement.dataset.id); })",
        "for (const b of document.querySelectorAll(\".resolve\")) b.addEventListener(\"click\", …) once on page load",
        "window.onload = () => exceptions.innerHTML = \"\"",
      ],
      answer: 0,
      explanation:
        "Delegation on the stable list survives re-renders, and closest handles clicks that land on the nested icon span. Checking e.target directly fails when the span is the target.",
    },
  },
  refresher: {
    body: `An event starts at the element the user touched and then **bubbles** up through its parents, so a listener on a parent hears clicks from all its children; \`event.target\` tells you which one. Forms fire a **submit** event (from the button or the Enter key) whose default is to reload — call \`event.preventDefault()\`. Replacing \`innerHTML\` throws away old elements and their listeners, so put list listeners on the list itself. Use \`textContent\` for user text so it is never treated as HTML.`,
    practice: {
      id: "refresher-bubbling",
      kind: "mcq",
      prompt: "A listener is attached to a `<ul>`. A user clicks a `<button>` inside one of its `<li>` elements. Does the ul's listener run?",
      options: ["Yes, the click bubbles up from the button to the li and then the ul", "No, only listeners on the button run", "Only if the button has an id", "Only for submit buttons"],
      answer: 0,
      explanation: "Click events bubble, so ancestors' listeners run after the target's.",
    },
  },
};
