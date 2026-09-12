import { toTrelloDescription } from "./assignment-mapper.mjs";

export const COURSE_CUSTOM_FIELD_NAME = "Canvas Course";

export function createTrelloApi({ trello, appKey, fetchImpl = fetch }) {
  let tokenPromise;
  let courseFieldPromise;

  async function getLists() {
    return trello.lists("id", "name");
  }

  async function getBoardCards() {
    const cards = await trello.cards("all");
    if (!Array.isArray(cards)) {
      throw new Error("Unexpected response from Trello cards API");
    }
    return cards;
  }

  async function createCard(assignment, listId) {
    const token = await getAuthorizedToken();
    const courseField = assignment.courseName
      ? await getOrCreateCourseField(token)
      : null;

    const params = new URLSearchParams({
      key: appKey,
      token,
      name: assignment.name,
      idList: listId,
      desc: toTrelloDescription(assignment.description),
      dueComplete: assignment.submitted ? "true" : "false",
      urlSource: assignment.url,
    });

    if (assignment.due_at) {
      params.set("due", new Date(assignment.due_at).toISOString());
    }

    const response = await fetchImpl(`https://api.trello.com/1/cards?${params}`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status}`);
    }

    if (!courseField) return;

    const card = await readJson(response);
    if (!card?.id) {
      throw new Error("Trello card creation did not return a card ID");
    }

    await trelloRequest(
      `/cards/${card.id}/customField/${courseField.id}/item`,
      token,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: { text: String(assignment.courseName) },
        }),
      },
    );
  }

  async function updateCardDueComplete(cardId, completed) {
    const token = await getAuthorizedToken();
    return trelloRequest(`/cards/${encodeURIComponent(cardId)}`, token, {
      method: "PUT",
      query: { dueComplete: String(Boolean(completed)) },
    });
  }

  async function getAuthorizedToken() {
    if (!tokenPromise) {
      tokenPromise = authorizeAndGetToken();
    }

    try {
      return await tokenPromise;
    } catch (error) {
      tokenPromise = null;
      throw error;
    }
  }

  async function authorizeAndGetToken() {
    const restApi = await trello.getRestApi();
    if (!(await restApi.isAuthorized())) {
      await restApi.authorize({ scope: "read,write", expiration: "never" });
    }

    const token = await restApi.getToken();
    if (!token) throw new Error("Trello authorization did not return a token");
    return token;
  }

  async function getOrCreateCourseField(token) {
    if (!courseFieldPromise) {
      courseFieldPromise = loadOrCreateCourseField(token);
    }

    try {
      return await courseFieldPromise;
    } catch (error) {
      courseFieldPromise = null;
      throw error;
    }
  }

  async function loadOrCreateCourseField(token) {
    const board = await trello.board("id");
    const boardId = typeof board === "string" ? board : board?.id;
    if (!boardId) throw new Error("Unable to determine the Trello board ID");

    const fields = await trelloRequest(
      `/boards/${boardId}/customFields`,
      token,
    );
    if (!Array.isArray(fields)) {
      throw new Error("Unexpected response from Trello custom fields API");
    }

    const existingField = fields.find(
      (field) => field.name === COURSE_CUSTOM_FIELD_NAME,
    );
    if (existingField) {
      if (existingField.type !== "text") {
        throw new Error(
          `Trello custom field \"${COURSE_CUSTOM_FIELD_NAME}\" already exists with type ${existingField.type || "unknown"}`,
        );
      }

      if (existingField.display?.cardFront !== true) {
        await trelloRequest(`/customFields/${existingField.id}`, token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "display/cardFront": true }),
        });
      }
      return existingField;
    }

    return trelloRequest("/customFields", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idModel: boardId,
        modelType: "board",
        name: COURSE_CUSTOM_FIELD_NAME,
        type: "text",
        pos: "bottom",
        display_cardFront: true,
      }),
    });
  }

  async function trelloRequest(path, token, options = {}) {
    const params = new URLSearchParams({ key: appKey, token });
    for (const [name, value] of Object.entries(options.query || {})) {
      params.set(name, value);
    }
    const { query: _query, ...requestOptions } = options;
    const response = await fetchImpl(
      `https://api.trello.com/1${path}?${params}`,
      { ...requestOptions, method: options.method || "GET" },
    );
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status}`);
    }
    return readJson(response);
  }

  async function readJson(response) {
    return typeof response.json === "function" ? response.json() : null;
  }

  return { createCard, getBoardCards, getLists, updateCardDueComplete };
}
