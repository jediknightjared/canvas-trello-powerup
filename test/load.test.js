const assert = require("node:assert/strict");
const test = require("node:test");

const modules = Promise.all([
  import("../src/js/assignment-mapper.mjs"),
  import("../src/js/canvas-api.mjs"),
  import("../src/js/load-controller.mjs"),
  import("../src/js/trello-api.mjs"),
]);

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { display: "" };
    this.className = "";
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
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

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  async dispatchEvent(eventName, event = { target: this }) {
    event.currentTarget = this;
    await Promise.all(
      (this.listeners.get(eventName) || []).map((handler) => handler(event)),
    );
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

function createElements() {
  const elements = {
    listSelect: new FakeElement("select"),
    courseSelect: new FakeElement("select"),
    assignmentsSection: new FakeElement("section"),
    assignmentsList: new FakeElement("div"),
    hideCompletedCheckbox: new FakeElement("input"),
    selectAllBtn: new FakeElement("button"),
    selectNoneBtn: new FakeElement("button"),
    importTooltipContainer: new FakeElement("span"),
    importTooltip: new FakeElement("span"),
    importBtn: new FakeElement("button"),
    loadingDiv: new FakeElement("div"),
    contentDiv: new FakeElement("div"),
    statusDiv: new FakeElement("div"),
  };
  elements.importTooltip.hidden = true;
  return elements;
}

function createDocument(elements) {
  return {
    querySelector(selector) {
      const lookup = {
        "#list": "listSelect",
        "#course": "courseSelect",
        "#assignments-section": "assignmentsSection",
        "#assignments-list": "assignmentsList",
        "#hide-completed": "hideCompletedCheckbox",
        "#select-all": "selectAllBtn",
        "#select-none": "selectNoneBtn",
        "#import-tooltip-container": "importTooltipContainer",
        "#import-tooltip": "importTooltip",
        "#import-selected": "importBtn",
        "#loading": "loadingDiv",
        "#content": "contentDiv",
        "#status": "statusDiv",
      };
      return elements[lookup[selector]];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

function textContentOf(element) {
  return [element.textContent, ...element.children.map(textContentOf)].join("");
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

function createCanvasHarness(responseForUrl) {
  const socket = createSocket(responseForUrl);
  const { createCanvasApi } = requireModule("canvas");
  const api = createCanvasApi({
    socket,
    getCredentials: () => ({
      domain: "university.instructure.com",
      token: "canvas-token",
    }),
  });
  return { api, socket };
}

function createControllerHarness({
  items = createCourseItems(),
  createCard,
  getCourseItems,
  getCourses,
  getLists,
  loadCredentials,
} = {}) {
  const elements = createElements();
  const document = createDocument(elements);
  const cards = [];
  const canvasApi = {
    getCourses:
      getCourses ||
      (async () => [
        { id: 123, name: "Computer Science", term: { name: "Fall" } },
      ]),
    getCourseItems: getCourseItems || (async () => items),
  };
  const trelloApi = {
    getLists:
      getLists || (async () => [{ id: "list-1", name: "Inbox" }]),
    createCard: async (assignment, listId) => {
      cards.push({ assignment, listId });
      if (createCard) return createCard(assignment, listId);
    },
  };
  const { createLoadController } = requireModule("controller");
  const controller = createLoadController({
    document,
    elements,
    canvasApi,
    trelloApi,
    loadCredentials:
      loadCredentials ||
      (async () => ({
        domain: "university.instructure.com",
        token: "canvas-token",
      })),
    closeModal: () => {},
    logger: { error() {} },
  });

  return { cards, controller, elements, trelloApi };
}

let loadedModules;
function requireModule(name) {
  if (!loadedModules) {
    throw new Error(`Modules are not loaded yet; await modules before using ${name}`);
  }
  return loadedModules[name];
}

function createCourseItems() {
  return {
    assignments: [
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
    ],
    quizzes: [
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
    ],
    discussions: [
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
    ],
  };
}

test.before(async () => {
  const [mapper, canvas, controller, trello] = await modules;
  loadedModules = { mapper, canvas, controller, trello };
});

test("isSubmitted recognizes submitted timestamps and workflow states", () => {
  const { isSubmitted } = requireModule("mapper");

  assert.equal(isSubmitted({ submitted_at: "2024-01-01" }), true);
  assert.equal(isSubmitted({ workflow_state: "graded" }), true);
  assert.equal(isSubmitted({ workflow_state: "pending_review" }), true);
  assert.equal(isSubmitted({ workflow_state: "unsubmitted" }), false);
  assert.equal(isSubmitted(null), false);
});

test("fetchCollection loads all pages and returns one combined array", async () => {
  const { api, socket } = createCanvasHarness(({ searchParams }) => {
    const page = searchParams.get("page");
    if (page === "1") return ["first", "second"];
    if (page === "2") return ["third"];
    throw new Error(`Unexpected page: ${page}`);
  });

  const results = await api.fetchCollection(
    "https://canvas.example/api/v1/items?access_token=secret",
    2,
  );

  assert.deepEqual(Array.from(results), ["first", "second", "third"]);
  assert.deepEqual(
    socket.requests.map(({ url }) => {
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

test("fetchCollection rejects non-array Canvas responses", async () => {
  const { api } = createCanvasHarness(() => ({ not: "an array" }));

  await assert.rejects(
    api.fetchCollection("https://canvas.example/api/v1/items"),
    /Unexpected response from Canvas API/,
  );
});

test("mergeCourseItems deduplicates and sorts Canvas item types", () => {
  const { mergeCourseItems, filterVisibleAssignments } = requireModule("mapper");
  const items = mergeCourseItems(createCourseItems());

  assert.deepEqual(
    items.map(({ name, type, submitted }) => ({ name, type, submitted })),
    [
      { name: "Graded discussion", type: "discussion", submitted: false },
      { name: "Quiz assignment", type: "quiz", submitted: false },
      { name: "Essay", type: "assignment", submitted: true },
      { name: "Standalone quiz", type: "quiz", submitted: false },
      { name: "Ungraded discussion", type: "discussion", submitted: false },
    ],
  );
  assert.equal(filterVisibleAssignments(items, true).length, 4);
});

test("controller renders course items and preserves the hide-completed behavior", async () => {
  const { controller, elements } = createControllerHarness();
  await controller.initialize();
  await controller.loadAssignments("123");

  const rows = elements.assignmentsList.children;
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
  assert.equal(elements.assignmentsSection.style.display, "");

  elements.hideCompletedCheckbox.checked = true;
  await elements.hideCompletedCheckbox.dispatchEvent("change");
  assert.equal(elements.assignmentsList.children.length, 4);
  assert.equal(
    Array.from(elements.assignmentsList.children).some((row) =>
      textContentOf(row).includes("Essay"),
    ),
    false,
  );

  elements.hideCompletedCheckbox.checked = false;
  await elements.hideCompletedCheckbox.dispatchEvent("change");
  const completedCheckbox = elements.assignmentsList
    .querySelectorAll(".assignment-checkbox")
    .find((checkbox) => String(checkbox.dataset.index) === "2");
  completedCheckbox.checked = true;
  await completedCheckbox.dispatchEvent("change");
  elements.hideCompletedCheckbox.checked = true;
  await elements.hideCompletedCheckbox.dispatchEvent("change");
  elements.listSelect.value = "list-1";
  assert.equal(elements.importBtn.textContent, "Import 0 Selected to Trello");
});

test("switching courses keeps the assignments loading message visible", async () => {
  let resolveSecondLoad;
  let requestCount = 0;
  const secondLoad = new Promise((resolve) => {
    resolveSecondLoad = resolve;
  });
  const { controller, elements } = createControllerHarness({
    getCourseItems: async () => {
      requestCount++;
      return requestCount === 1 ? createCourseItems() : secondLoad;
    },
  });

  await controller.initialize();
  await controller.loadAssignments("first-course");
  elements.listSelect.value = "list-1";
  const firstCheckbox = elements.assignmentsList.querySelectorAll(
    ".assignment-checkbox",
  )[0];
  firstCheckbox.checked = true;
  await firstCheckbox.dispatchEvent("change");
  assert.equal(elements.importBtn.disabled, false);

  const pendingLoad = controller.loadAssignments("second-course");

  assert.equal(elements.assignmentsSection.style.display, "");
  assert.match(elements.assignmentsList.innerHTML, /Loading assignments/);
  assert.equal(elements.selectAllBtn.disabled, true);
  assert.equal(elements.selectNoneBtn.disabled, true);
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");

  resolveSecondLoad(createCourseItems());
  await pendingLoad;
});

test("the first course selection displays the assignments loading message", async () => {
  let resolveItems;
  const itemsPending = new Promise((resolve) => {
    resolveItems = resolve;
  });
  const { controller, elements } = createControllerHarness({
    getCourseItems: async () => itemsPending,
  });

  await controller.initialize();
  assert.equal(elements.assignmentsSection.style.display, "");
  assert.match(elements.assignmentsList.innerHTML, /Select a course/);
  assert.equal(elements.selectAllBtn.disabled, true);
  assert.equal(elements.selectNoneBtn.disabled, true);

  const pendingLoad = controller.loadAssignments("first-course");
  assert.equal(elements.assignmentsSection.style.display, "");
  assert.match(elements.assignmentsList.innerHTML, /Loading assignments/);
  assert.equal(elements.selectAllBtn.disabled, true);
  assert.equal(elements.selectNoneBtn.disabled, true);

  resolveItems(createCourseItems());
  await pendingLoad;
  assert.equal(elements.selectAllBtn.disabled, false);
  assert.equal(elements.selectNoneBtn.disabled, false);
});

test("clearing the course restores the prompt and disables assignment actions", async () => {
  const { controller, elements } = createControllerHarness();
  await controller.initialize();
  await controller.loadAssignments("123");

  elements.courseSelect.value = "";
  await elements.courseSelect.dispatchEvent("change");

  assert.equal(elements.assignmentsSection.style.display, "");
  assert.match(elements.assignmentsList.innerHTML, /Select a course/);
  assert.equal(elements.selectAllBtn.disabled, true);
  assert.equal(elements.selectNoneBtn.disabled, true);
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");
  assert.equal(elements.importBtn.textContent, "Import 0 Selected to Trello");
});

test("a Trello list failure does not prevent Canvas courses from loading", async () => {
  const { controller, elements } = createControllerHarness({
    getLists: async () => {
      throw new Error("Trello unavailable");
    },
  });

  await controller.initialize();

  assert.equal(elements.courseSelect.children.length, 1);
  assert.equal(
    textContentOf(elements.statusDiv),
    "Failed to load Trello lists.",
  );
  assert.equal(elements.contentDiv.style.display, "block");
});

test("a Canvas course failure preserves the original error message", async () => {
  const { controller, elements } = createControllerHarness({
    getCourses: async () => {
      throw new Error("Canvas unavailable");
    },
  });

  await controller.initialize();

  assert.equal(elements.listSelect.children.length, 1);
  assert.equal(
    textContentOf(elements.statusDiv),
    "Failed to load courses from Canvas. Please check your API token.",
  );
});

test("selection controls update the import button", async () => {
  const { controller, elements } = createControllerHarness();
  await controller.initialize();
  await controller.loadAssignments("123");

  assert.equal(
    elements.importTooltip.textContent,
    "Select one or more assignments and choose a Trello list to enable importing.",
  );
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");
  assert.equal(
    elements.importBtn.getAttribute("aria-describedby"),
    "import-tooltip",
  );

  elements.listSelect.value = "list-1";
  await elements.listSelect.dispatchEvent("change");
  assert.equal(
    elements.importTooltip.textContent,
    "Select one or more assignments to enable importing.",
  );

  const checkboxes = elements.assignmentsList.querySelectorAll(
    ".assignment-checkbox",
  );
  checkboxes[0].checked = true;
  await checkboxes[0].dispatchEvent("change");
  assert.equal(elements.importBtn.disabled, false);
  assert.equal(elements.importBtn.textContent, "Import 1 Selected to Trello");
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), null);
  assert.equal(elements.importBtn.getAttribute("aria-describedby"), null);
  assert.equal(elements.importTooltip.hidden, true);

  elements.listSelect.value = "";
  await elements.listSelect.dispatchEvent("change");
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");
  assert.equal(
    elements.importTooltip.textContent,
    "Choose a Trello list to enable importing.",
  );

  elements.listSelect.value = "list-1";
  await elements.listSelect.dispatchEvent("change");

  await elements.selectAllBtn.dispatchEvent("click");
  assert.equal(elements.importBtn.textContent, "Import 5 Selected to Trello");

  await elements.selectNoneBtn.dispatchEvent("click");
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");
  assert.equal(elements.importBtn.textContent, "Import 0 Selected to Trello");
  assert.equal(
    elements.importTooltip.textContent,
    "Select one or more assignments to enable importing.",
  );
});

test("import tooltip supports hover, keyboard focus, and Escape dismissal", async () => {
  const { controller, elements } = createControllerHarness();
  await controller.initialize();

  assert.equal(elements.importTooltip.hidden, true);
  await elements.importTooltipContainer.dispatchEvent("mouseenter");
  assert.equal(elements.importTooltip.hidden, false);
  await elements.importTooltipContainer.dispatchEvent("mouseleave");
  assert.equal(elements.importTooltip.hidden, true);

  await elements.importBtn.dispatchEvent("focus");
  assert.equal(elements.importTooltip.hidden, false);
  await elements.importBtn.dispatchEvent("keydown", {
    key: "Escape",
    target: elements.importBtn,
  });
  assert.equal(elements.importTooltip.hidden, true);

  await elements.importBtn.dispatchEvent("focus");
  await elements.importBtn.dispatchEvent("blur");
  assert.equal(elements.importTooltip.hidden, true);
});

test("the aria-disabled import button cannot import without a list", async () => {
  const { cards, controller, elements } = createControllerHarness({
    createCard: async () => {
      throw new Error("Preview failure prevents the success timer");
    },
  });
  await controller.initialize();
  await controller.loadAssignments("123");

  const checkbox = elements.assignmentsList.querySelectorAll(
    ".assignment-checkbox",
  )[0];
  checkbox.checked = true;
  await checkbox.dispatchEvent("change");
  assert.equal(elements.importBtn.getAttribute("aria-disabled"), "true");

  await elements.importBtn.dispatchEvent("click");
  assert.equal(cards.length, 0);

  elements.listSelect.value = "list-1";
  await elements.listSelect.dispatchEvent("change");
  await elements.importBtn.dispatchEvent("click");
  assert.equal(cards.length, 1);
});

test("createCard authorizes Trello and sends the expected card payload", async () => {
  const { createTrelloApi } = requireModule("trello");
  const requests = [];
  let authorized = false;
  const trello = {
    getRestApi: async () => ({
      isAuthorized: async () => false,
      authorize: async (options) => {
        authorized = options.scope === "read,write";
      },
      getToken: async () => "trello-token",
    }),
  };
  const api = createTrelloApi({
    trello,
    appKey: "app-key",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  await api.createCard(
    {
      name: "Essay",
      description: "<h2>Instructions</h2><p>Write it.</p>",
      due_at: "2024-01-03T12:00:00Z",
      submitted: true,
      url: "https://canvas.example/assignments/1",
    },
    "trello-list-id",
  );

  assert.equal(authorized, true);
  assert.equal(requests.length, 1);
  const params = new URL(requests[0].url).searchParams;
  assert.equal(requests[0].options.method, "POST");
  assert.equal(params.get("key"), "app-key");
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
});
