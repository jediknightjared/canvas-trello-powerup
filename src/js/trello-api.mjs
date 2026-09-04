import { toTrelloDescription } from "./assignment-mapper.mjs";

export function createTrelloApi({ trello, appKey, fetchImpl = fetch }) {
  async function getLists() {
    return trello.lists("id", "name");
  }

  async function createCard(assignment, listId) {
    const restApi = await trello.getRestApi();
    if (!(await restApi.isAuthorized())) {
      await restApi.authorize({ scope: "read,write", expiration: "never" });
    }

    const params = new URLSearchParams({
      key: appKey,
      token: await restApi.getToken(),
      name: assignment.name,
      idList: listId,
      desc: toTrelloDescription(assignment.description),
      dueComplete: assignment.submitted ? "true" : "false",
      urlSource: assignment.url,
    });

    if (assignment.due_at) {
      params.set("due", new Date(assignment.due_at).toISOString());
    }

    const response = await fetchImpl(
      `https://api.trello.com/1/cards?${params.toString()}`,
      { method: "POST" },
    );
    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status}`);
    }
  }

  return { createCard, getLists };
}
