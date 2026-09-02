const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const loadScript = fs.readFileSync(
  path.join(__dirname, "..", "src", "js", "load.js"),
  "utf8",
);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.style = { display: "" };
    this.className = "";
    this.disabled = false;
    this.checked = false;
    this.type = "";
    this.value = "";
    this._innerHTML = "";
    this.textContent = "";
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(eventName, handler) {
    const handlers = this.listeners.get(eventName) || [];
    handlers.push(handler);
    this.listeners.set(eventName, handlers);
  }

  dispatchEvent(eventName, event = { target: this }) {
    event.currentTarget = this;
    for (const handler of this.listeners.get(eventName) || []) {
      handler(event);
    }
  }

  querySelectorAll(selector) {
    const descendants = [];
    const visit = (element) => {
      for (const child of element.children) {
        descendants.push(child);
        visit(child);
      }
    };
    visit(this);

    if (selector === ".assignment-checkbox") {
      return descendants.filter(
        (element) => element.className === "assignment-checkbox",
      );
    }

    if (selector === ".assignment-checkbox:checked") {
      return descendants.filter(
        (element) =>
          element.className === "assignment-checkbox" && element.checked,
      );
    }

    return [];
  }
}

function textContentOf(element) {
  return [
    element.textContent,
    ...element.children.map(textContentOf),
  ].join("");
}

function createSocket(responseForUrl = () => []) {
  const handlers = new Set();
  const requests = [];

  return {
    requests,
    on(eventName, handler) {
      if (eventName === "fetch-json-response") handlers.add(handler);
    },
    off(eventName, handler) {
      if (eventName === "fetch-json-response") handlers.delete(handler);
    },
    emit(eventName, id, url, options) {
      if (eventName !== "fetch-json") return;

      requests.push({ id, url, options });
      queueMicrotask(() => {
        const data = responseForUrl(new URL(url));
        for (const handler of [...handlers]) handler(id, data);
      });
    },
  };
}

function createHarness({ responseForUrl, lists = [] } = {}) {
  const elements = new Map(
    [
      ["#list", new FakeElement("select")],
      ["#course", new FakeElement("select")],
      ["#assignments-section", new FakeElement("section")],
      ["#assignments-list", new FakeElement("div")],
      ["#hide-completed", new FakeElement("input")],
      ["#select-all", new FakeElement("button")],
      ["#select-none", new FakeElement("button")],
      ["#import-selected", new FakeElement("button")],
      ["#loading", new FakeElement("div")],
      ["#content", new FakeElement("div")],
      ["#status", new FakeElement("div")],
    ],
  );
  const socket = createSocket(responseForUrl);
  const cards = [];
  const restApi = {
    isAuthorized: async () => false,
    authorize: async () => {},
    getToken: async () => "trello-token",
  };
  const trello = {
    lists: async () => lists,
    loadSecret: () => new Promise(() => {}),
    getRestApi: async () => restApi,
    closeModal: () => {},
  };

  const document = {
    querySelector(selector) {
      return elements.get(selector);
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  const context = vm.createContext({
    Array,
    Boolean,
    Date,
    Error,
    Map,
    Math,
    Promise,
    Set,
    String,
    URL,
    URLSearchParams,
    clearTimeout,
    console: { error() {}, log() {} },
    document,
    fetch: async (url, options) => {
      cards.push({ url, options });
      return { ok: true, status: 200 };
    },
    io: () => socket,
    parseInt,
    queueMicrotask,
    setTimeout,
    window: {
      TrelloPowerUp: {
        iframe: () => trello,
      },
    },
  });

  vm.runInContext(loadScript, context, {
    filename: path.join(__dirname, "..", "src", "js", "load.js"),
  });

  return { context, elements, socket, cards, restApi };
}

function canvasResponse(url) {
  const pathName = url.pathname;

  if (pathName.endsWith("/assignments")) {
    return [
      {
        id: 1,
        name: "Essay",
        description: "<p>Write the essay</p>",
        due_at: "2024-01-03T12:00:00Z",
        html_url: "https://canvas.example/assignments/1",
        submission: { workflow_state: "submitted" },
        submission_types: ["online_upload"],
      },
      {
        id: 2,
        name: "Quiz assignment",
        description: "Quiz description",
        due_at: "2024-01-02T12:00:00Z",
        quiz_id: 20,
        html_url: "https://canvas.example/assignments/2",
        submission: null,
      },
      {
        id: 3,
        name: "Graded discussion",
        description: "Discussion description",
        due_at: "2024-01-01T12:00:00Z",
        discussion_topic: { id: 30 },
        html_url: "https://canvas.example/assignments/3",
        submission: null,
      },
    ];
  }

  if (pathName.endsWith("/quizzes")) {
    return [
      {
        id: 20,
        title: "Quiz assignment",
        due_at: "2024-01-02T12:00:00Z",
        html_url: "https://canvas.example/quizzes/20",
      },
      {
        id: 21,
        title: "Standalone quiz",
        description: "Standalone quiz description",
        due_at: "2024-01-04T12:00:00Z",
        html_url: "https://canvas.example/quizzes/21",
      },
    ];
  }

  if (pathName.endsWith("/discussion_topics")) {
    return [
      {
        id: 30,
        title: "Graded discussion",
        assignment_id: 3,
        todo_date: "2024-01-01T12:00:00Z",
      },
      {
        id: 31,
        title: "Ungraded discussion",
        message: "Post your thoughts",
        todo_date: "2024-01-05T12:00:00Z",
        html_url: "https://canvas.example/discussion_topics/31",
      },
    ];
  }

  throw new Error(`Unexpected Canvas URL: ${url}`);
}

test("isSubmitted recognizes submitted timestamps and workflow states", () => {
  const { context } = createHarness();

  assert.equal(context.isSubmitted({ submitted_at: "2024-01-01" }), true);
  assert.equal(context.isSubmitted({ workflow_state: "graded" }), true);
  assert.equal(context.isSubmitted({ workflow_state: "pending_review" }), true);
  assert.equal(context.isSubmitted({ workflow_state: "unsubmitted" }), false);
  assert.equal(context.isSubmitted(null), false);
});

test("fetchCanvasCollection loads all pages and returns one combined array", async () => {
  const harness = createHarness({
    responseForUrl: ({ searchParams }) => {
      const page = searchParams.get("page");
      if (page === "1") return ["first", "second"];
      if (page === "2") return ["third"];
      throw new Error(`Unexpected page: ${page}`);
    },
  });

  const results = await harness.context.fetchCanvasCollection(
    "https://canvas.example/api/v1/items?access_token=secret",
    2,
  );

  assert.deepEqual(Array.from(results), ["first", "second", "third"]);
  assert.deepEqual(
    harness.socket.requests.map(({ url }) => {
      const parsed = new URL(url);
      return [
        parsed.searchParams.get("page"),
        parsed.searchParams.get("per_page"),
      ];
    }),
    [
      ["1", "2"],
      ["2", "2"],
    ],
  );
});

test("fetchCanvasCollection rejects non-array Canvas responses", async () => {
  const { context } = createHarness({
    responseForUrl: () => ({ not: "an array" }),
  });

  await assert.rejects(
    context.fetchCanvasCollection("https://canvas.example/api/v1/items"),
    /Unexpected response from Canvas API/,
  );
});

test(
  "loadAssignments merges and deduplicates Canvas item types, then sorts by due date",
  async () => {
    const harness = createHarness({ responseForUrl: canvasResponse });

    await harness.context.loadAssignments("123");

    const rows = harness.elements.get("#assignments-list").children;
    assert.equal(rows.length, 5);
    assert.deepEqual(
      Array.from(
        rows,
        (row) => textContentOf(row).trim().split("Due:")[0].trim(),
      ),
      [
        "Graded discussionDiscussion",
        "Quiz assignmentQuiz",
        "EssayAssignmentSubmitted",
        "Standalone quizQuiz",
        "Ungraded discussionDiscussion",
      ],
    );
    assert.equal(
      harness.elements.get("#assignments-section").style.display,
      "block",
    );

    const checkboxes = harness.elements
      .get("#assignments-list")
      .querySelectorAll(".assignment-checkbox");
    assert.equal(checkboxes.length, 5);
    assert.equal(
      harness.elements
        .get("#assignments-list")
        .children[2].children[1].children[1].children[1].textContent,
      "Submitted",
    );

    const hideCompleted = harness.elements.get("#hide-completed");
    hideCompleted.checked = true;
    hideCompleted.dispatchEvent("change");
    assert.equal(harness.elements.get("#assignments-list").children.length, 4);
    assert.equal(
      Array.from(harness.elements.get("#assignments-list").children).some(
        (row) => textContentOf(row).includes("Essay"),
      ),
      false,
    );
  },
);

test(
  "displayAssignments and selection controls update the import button",
  () => {
    const harness = createHarness();
    const listSelect = harness.elements.get("#list");
    const importButton = harness.elements.get("#import-selected");

    harness.context.displayAssignments([
      {
        name: "First assignment",
        description: "A description",
        due_at: null,
        submitted: false,
        type: "assignment",
        url: "https://canvas.example/assignments/1",
      },
      {
        name: "Second assignment",
        description: "Another description",
        due_at: "2024-01-01T12:00:00Z",
        submitted: true,
        type: "quiz",
        url: "https://canvas.example/quizzes/2",
      },
    ]);

    assert.equal(importButton.disabled, true);
    assert.equal(importButton.textContent, "Import 0 Selected to Trello");

    listSelect.value = "trello-list-id";
    const checkboxes = harness.elements
      .get("#assignments-list")
      .querySelectorAll(".assignment-checkbox");
    checkboxes[0].checked = true;
    harness.context.updateImportButton();

    assert.equal(importButton.disabled, false);
    assert.equal(importButton.textContent, "Import 1 Selected to Trello");

    harness.elements.get("#select-all").dispatchEvent("click");
    assert.equal(importButton.textContent, "Import 2 Selected to Trello");

    harness.elements.get("#select-none").dispatchEvent("click");
    assert.equal(importButton.disabled, true);
    assert.equal(importButton.textContent, "Import 0 Selected to Trello");
  },
);

test(
  "createCardFromAssignment authorizes Trello and sends the expected card payload",
  async () => {
    const harness = createHarness();
    harness.elements.get("#list").value = "trello-list-id";

    await harness.context.createCardFromAssignment({
      name: "Essay",
      description: "<h2>Instructions</h2><p>Write it.</p>",
      due_at: "2024-01-03T12:00:00Z",
      submitted: true,
      url: "https://canvas.example/assignments/1",
    });

    assert.equal(harness.cards.length, 1);
    const request = harness.cards[0];
    const params = new URL(request.url).searchParams;

    assert.equal(request.options.method, "POST");
    assert.equal(params.get("key"), "b5c06882ca740f9920dae402dfbb8341");
    assert.equal(params.get("token"), "trello-token");
    assert.equal(params.get("name"), "Essay");
    assert.equal(params.get("idList"), "trello-list-id");
    assert.equal(params.get("desc"), "## InstructionsWrite it.");
    assert.equal(params.get("due"), "2024-01-03T12:00:00.000Z");
    assert.equal(params.get("dueComplete"), "true");
    assert.equal(
      params.get("urlSource"),
      "https://canvas.example/assignments/1",
    );
  },
);
