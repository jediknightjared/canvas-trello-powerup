import { syncBoardCards } from "/js/sync-controller.mjs";

const progress = document.querySelector("#progress");
const scanSummary = document.querySelector("#scan-summary");
const resultsBody = document.querySelector("#sync-results-body");
const closeButton = document.querySelector("#close");

const cards = [
  {
    id: "preview-complete",
    name: "Data Structures Project",
    dueComplete: false,
    attachments: [
      { url: "https://preview.instructure.com/courses/1/assignments/1" },
    ],
  },
  {
    id: "preview-current",
    name: "Already Current Assignment",
    dueComplete: false,
    attachments: [
      { url: "https://preview.instructure.com/courses/1/assignments/3" },
    ],
  },
  {
    id: "preview-skipped",
    name: "Ungraded Discussion",
    dueComplete: false,
    attachments: [
      { url: "https://preview.instructure.com/courses/1/discussion_topics/4" },
    ],
  },
  {
    id: "preview-failed",
    name: "Canvas Failure Example",
    dueComplete: false,
    attachments: [
      { url: "https://preview.instructure.com/courses/1/assignments/5" },
    ],
  },
  {
    id: "preview-ignored",
    name: "A non-Canvas card",
    dueComplete: false,
    attachments: [{ url: "https://example.com/reference" }],
  },
];

const trelloApi = {
  async updateCardDueComplete(cardId, completed) {
    const card = cards.find((candidate) => candidate.id === cardId);
    if (card) card.dueComplete = completed;
  },
};

const summary = await syncBoardCards({
  cards,
  canvasDomain: "preview.instructure.com",
  canvasApi: {
    async getCompletionForUrl(url) {
      if (url.endsWith("/1")) return { state: "complete" };
      if (url.endsWith("/4")) {
        return {
          state: "unavailable",
          reason: "This discussion has no Canvas submission state.",
        };
      }
      if (url.endsWith("/5")) throw new Error("Preview Canvas request failed");
      return { state: "incomplete" };
    },
  },
  trelloApi,
});

progress.className = "success";
progress.textContent = `Sync complete: ${summary.updated} updated, ${summary.current} already current, ${summary.skipped} skipped, ${summary.failed} failed.`;
scanSummary.textContent = `Scanned ${summary.scanned} card(s); ${summary.eligible} eligible.`;
if (summary.results.length) {
  resultsBody.replaceChildren();
  for (const { card, status, reason } of summary.results) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = card.name;
    const statusCell = document.createElement("td");
    statusCell.textContent = status;
    if (reason) statusCell.title = reason;
    row.appendChild(nameCell);
    row.appendChild(statusCell);
    resultsBody.appendChild(row);
  }
}
closeButton.hidden = false;
closeButton.addEventListener("click", () => window.close());
