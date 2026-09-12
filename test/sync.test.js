const assert = require("node:assert/strict");
const test = require("node:test");

const modules = Promise.all([
  import("../src/js/canvas-api.mjs"),
  import("../src/js/canvas-url.mjs"),
  import("../src/js/sync-controller.mjs"),
  import("../src/js/trello-api.mjs"),
]);

let loaded;

test.before(async () => {
  const [canvas, url, sync, trello] = await modules;
  loaded = { canvas, url, sync, trello };
});

function createSocket(responseForUrl) {
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
    emit(eventName, id, url) {
      if (eventName !== "fetch-json") return;
      requests.push({ id, url });
      queueMicrotask(() => {
        const data = responseForUrl(new URL(url));
        for (const handler of [...handlers]) handler(id, data);
      });
    },
  };
}

function createCanvasHarness(responseForUrl) {
  const { createCanvasApi } = loaded.canvas;
  const socket = createSocket(responseForUrl);
  const api = createCanvasApi({
    socket,
    getCredentials: () => ({
      domain: "university.instructure.com",
      token: "canvas-token",
    }),
  });
  return { api, socket };
}

test("parseCanvasUrl normalizes supported URLs and rejects other domains", () => {
  const { parseCanvasUrl } = loaded.url;
  assert.deepEqual(
    parseCanvasUrl(
      "https://university.instructure.com/courses/12/assignments/34/?module_item_id=5#details",
      "university.instructure.com",
    ),
    {
      courseId: "12",
      itemId: "34",
      type: "assignments",
      canonicalUrl:
        "https://university.instructure.com/courses/12/assignments/34",
    },
  );
  assert.equal(
    parseCanvasUrl(
      "https://other.instructure.com/courses/12/assignments/34",
      "university.instructure.com",
    ),
    null,
  );
});

test("Canvas assignment completion uses the current user's submission", async () => {
  const { api } = createCanvasHarness((url) => {
    assert.match(url.pathname, /\/courses\/12\/assignments\/34$/);
    assert.equal(url.searchParams.get("include[]"), "submission");
    return { submission: { workflow_state: "submitted" } };
  });

  assert.deepEqual(
    await api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/assignments/34",
    ),
    { state: "complete" },
  );
});

test("Canvas quiz completion recognizes finished quiz submissions", async () => {
  const { api } = createCanvasHarness((url) => {
    assert.match(url.pathname, /\/courses\/12\/quizzes\/34\/submission$/);
    return {
      quiz_submissions: [{ workflow_state: "complete", finished_at: null }],
    };
  });

  assert.deepEqual(
    await api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/quizzes/34",
    ),
    { state: "complete" },
  );
});

test("graded discussion completion is resolved through its assignment", async () => {
  const { api } = createCanvasHarness((url) => {
    assert.match(url.pathname, /\/courses\/12\/assignments$/);
    return [
      {
        id: 99,
        discussion_topic: { id: 34 },
        submission: { submitted_at: "2026-09-12T10:00:00Z" },
      },
    ];
  });

  assert.deepEqual(
    await api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/discussion_topics/34",
    ),
    { state: "complete" },
  );
});

test("ungraded discussions return an unavailable status", async () => {
  const { api } = createCanvasHarness(() => []);
  assert.deepEqual(
    await api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/discussion_topics/34",
    ),
    {
      state: "unavailable",
      reason: "This discussion has no Canvas submission state.",
    },
  );
});

test("discussion completion reuses assignment submissions for the same course", async () => {
  const { api, socket } = createCanvasHarness((url) => {
    assert.match(url.pathname, /\/courses\/12\/assignments$/);
    return [
      {
        discussion_topic: { id: 34 },
        submission: { workflow_state: "submitted" },
      },
    ];
  });

  await Promise.all([
    api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/discussion_topics/34",
    ),
    api.getCompletionForUrl(
      "https://university.instructure.com/courses/12/discussion_topics/35",
    ),
  ]);

  assert.equal(
    socket.requests.filter(
      ({ url }) => /\/courses\/12\/assignments$/.test(new URL(url).pathname),
    ).length,
    1,
  );
});

test("Trello due completion updates send only the requested boolean", async () => {
  const requests = [];
  const { createTrelloApi } = loaded.trello;
  const api = createTrelloApi({
    trello: {
      getRestApi: async () => ({
        isAuthorized: async () => true,
        getToken: async () => "trello-token",
      }),
    },
    appKey: "app-key",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });

  await api.updateCardDueComplete("card-1", false);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(new URL(requests[0].url).searchParams.get("dueComplete"), "false");
});

test("syncBoardCards updates both directions, deduplicates lookups, and continues after failures", async () => {
  const updates = [];
  const lookups = [];
  const { syncBoardCards } = loaded.sync;
  const cards = [
    {
      id: "complete-card",
      name: "Complete in Canvas",
      dueComplete: false,
      attachments: [{ url: "https://university.instructure.com/courses/1/assignments/2" }],
    },
    {
      id: "duplicate-card",
      name: "Duplicate card",
      dueComplete: false,
      attachments: [{ url: "https://university.instructure.com/courses/1/assignments/2?x=1" }],
    },
    {
      id: "incomplete-card",
      name: "Incomplete in Canvas",
      dueComplete: true,
      attachments: [{ url: "https://university.instructure.com/courses/1/assignments/3" }],
    },
    {
      id: "current-card",
      name: "Already current",
      dueComplete: false,
      attachments: [{ url: "https://university.instructure.com/courses/1/assignments/4" }],
    },
    {
      id: "bad-card",
      name: "Canvas failure",
      dueComplete: false,
      attachments: [{ url: "https://university.instructure.com/courses/1/assignments/5" }],
    },
    {
      id: "ambiguous-card",
      name: "Ambiguous",
      dueComplete: false,
      attachments: [
        { url: "https://university.instructure.com/courses/1/assignments/6" },
        { url: "https://university.instructure.com/courses/1/assignments/7" },
      ],
    },
  ];

  const summary = await syncBoardCards({
    cards,
    canvasDomain: "university.instructure.com",
    canvasApi: {
      getCompletionForUrl: async (url) => {
        lookups.push(url);
        if (url.endsWith("/5")) throw new Error("Canvas unavailable");
        if (url.endsWith("/2")) return { state: "complete" };
        if (url.endsWith("/3")) return { state: "incomplete" };
        return { state: "incomplete" };
      },
    },
    trelloApi: {
      updateCardDueComplete: async (id, completed) => {
        updates.push({ id, completed });
      },
    },
    logger: { error() {} },
  });

  assert.equal(lookups.filter((url) => url.endsWith("/2")).length, 1);
  assert.deepEqual(updates, [
    { id: "complete-card", completed: true },
    { id: "duplicate-card", completed: true },
    { id: "incomplete-card", completed: false },
  ]);
  assert.equal(summary.updated, 3);
  assert.deepEqual(
    summary.results.map(({ card, status }) => ({ name: card.name, status })),
    [
      { name: "Complete in Canvas", status: "Updated (complete)" },
      { name: "Duplicate card", status: "Updated (complete)" },
      { name: "Incomplete in Canvas", status: "Updated (incomplete)" },
      { name: "Already current", status: "Current" },
      { name: "Canvas failure", status: "Failed" },
    ],
  );
  assert.deepEqual(
    summary.updatedCards.map(({ card, completed }) => ({
      name: card.name,
      completed,
    })),
    [
      { name: "Complete in Canvas", completed: true },
      { name: "Duplicate card", completed: true },
      { name: "Incomplete in Canvas", completed: false },
    ],
  );
  assert.equal(summary.current, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 1);
});
