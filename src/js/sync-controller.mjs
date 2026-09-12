import { isValidCanvasDomain, parseCanvasUrl } from "./canvas-url.mjs";

export async function syncBoardCards({
  cards,
  canvasApi,
  trelloApi,
  canvasDomain,
  onProgress = () => {},
  logger = console,
}) {
  const targets = [];
  const skipped = [];
  const grouped = new Map();

  for (const card of cards) {
    const urls = new Map();
    for (const attachment of Array.isArray(card.attachments)
      ? card.attachments
      : []) {
      const parsed = parseCanvasUrl(attachment?.url, canvasDomain);
      if (parsed) urls.set(parsed.canonicalUrl, parsed);
    }

    if (urls.size === 0) continue;
    if (urls.size > 1) {
      skipped.push({
        card,
        reason: "Card has multiple different Canvas URLs.",
      });
      continue;
    }

    const [canonicalUrl, parsed] = urls.entries().next().value;
    const target = { card, canonicalUrl, parsed };
    targets.push(target);
    const group = grouped.get(canonicalUrl) || { parsed, targets: [] };
    group.targets.push(target);
    grouped.set(canonicalUrl, group);
  }

  const summary = {
    scanned: cards.length,
    eligible: targets.length,
    updated: 0,
    updatedCards: [],
    results: [],
    current: 0,
    skipped: skipped.length,
    failed: 0,
    skippedCards: skipped,
    failedCards: [],
  };

  let processed = 0;
  for (const [canonicalUrl, group] of grouped) {
    onProgress({ processed, total: targets.length });
    let completion;
    try {
      completion = await canvasApi.getCompletionForUrl(canonicalUrl);
    } catch (error) {
      logger.error("Canvas status lookup failed:", canonicalUrl, error);
      for (const target of group.targets) {
        addFailure(summary, target.card, error);
        addResult(summary, target.card, "Failed", error?.message);
        processed++;
      }
      continue;
    }

    if (completion?.state === "unavailable") {
      for (const target of group.targets) {
        summary.skipped++;
        summary.skippedCards.push({
          card: target.card,
          reason: completion.reason || "Canvas completion status unavailable.",
        });
        addResult(summary, target.card, "Skipped", completion.reason);
        processed++;
      }
      continue;
    }

    if (!["complete", "incomplete"].includes(completion?.state)) {
      for (const target of group.targets) {
        summary.skipped++;
        summary.skippedCards.push({
          card: target.card,
          reason: "Canvas completion status was not recognized.",
        });
        addResult(summary, target.card, "Skipped", "Canvas completion status was not recognized.");
        processed++;
      }
      continue;
    }

    const completed = completion.state === "complete";
    for (const target of group.targets) {
      if (Boolean(target.card.dueComplete) === completed) {
        summary.current++;
        addResult(summary, target.card, "Current");
      } else if (!target.card.id) {
        const error = new Error("Card has no Trello ID.");
        addFailure(summary, target.card, error);
        addResult(summary, target.card, "Failed", error.message);
      } else {
        try {
          await trelloApi.updateCardDueComplete(target.card.id, completed);
          summary.updated++;
          summary.updatedCards.push({ card: target.card, completed });
          addResult(summary, target.card, `Updated (${completed ? "complete" : "incomplete"})`);
        } catch (error) {
          logger.error("Trello due-date update failed:", target.card.id, error);
          addFailure(summary, target.card, error);
          addResult(summary, target.card, "Failed", error?.message);
        }
      }
      processed++;
      onProgress({ processed, total: targets.length });
    }
  }

  onProgress({ processed: targets.length, total: targets.length });
  return summary;
}

function addFailure(summary, card, error) {
  summary.failed++;
  summary.failedCards.push({
    card,
    reason: error?.message || "Unknown error.",
  });
}

function addResult(summary, card, status, reason) {
  summary.results.push({ card, status, reason: reason || "" });
}

export function createSyncController({
  elements,
  canvasApi,
  trelloApi,
  loadCredentials,
  closeModal,
  logger = console,
}) {
  async function initialize() {
    setText(elements.progress, "Loading Canvas credentials and Trello cards...");
    elements.closeBtn.hidden = true;

    try {
      const credentials = await loadCredentials();
      validateCredentials(credentials);
      const cards = await trelloApi.getBoardCards();
      setText(elements.progress, `Checking ${cards.length} Trello card(s)...`);
      const summary = await syncBoardCards({
        cards,
        canvasApi,
        trelloApi,
        canvasDomain: credentials.domain,
        logger,
        onProgress: ({ processed, total }) => {
          setText(
            elements.progress,
            total
              ? `Checking Canvas status: ${processed} of ${total} eligible card(s)...`
              : "No eligible Canvas cards found.",
          );
        },
      });
      renderSummary(elements, summary);
      elements.closeBtn.hidden = false;
    } catch (error) {
      logger.error("Assignment status sync failed:", error);
      setText(elements.progress, getErrorMessage(error));
      elements.progress.className = "error";
      elements.closeBtn.hidden = false;
    }
  }

  elements.closeBtn.addEventListener("click", closeModal);
  return { initialize };
}

function renderSummary(elements, summary) {
  elements.progress.className = "success";
  setText(
    elements.progress,
    `Sync complete: ${summary.updated} updated, ${summary.current} already current, ${summary.skipped} skipped, ${summary.failed} failed.`,
  );
  setText(
    elements.scanSummary,
    `Scanned ${summary.scanned} card(s); ${summary.eligible} eligible.`,
  );
  renderResults(elements, summary.results);
}

function renderResults(elements, results) {
  if (!results.length) return;
  elements.resultsBody.replaceChildren();
  for (const { card, status, reason } of results) {
    const row = elements.document.createElement("tr");
    const nameCell = elements.document.createElement("td");
    nameCell.textContent = card.name || "Unnamed card";
    const statusCell = elements.document.createElement("td");
    statusCell.textContent = status;
    if (reason) statusCell.title = reason;
    row.appendChild(nameCell);
    row.appendChild(statusCell);
    elements.resultsBody.appendChild(row);
  }
}

function setText(element, text) {
  element.textContent = text;
}

function validateCredentials({ domain, token }) {
  if (!domain || !token) {
    throw new Error("Canvas domain and API token must be configured first.");
  }

  if (!isValidCanvasDomain(domain)) {
    throw new Error(
      "Invalid Canvas domain format. Please use your institution's Canvas URL (e.g., university.instructure.com).",
    );
  }
}

function getErrorMessage(error) {
  if (/401/.test(error?.message || "")) {
    return "Canvas API token is invalid or expired. Please update it in the Power-Up settings.";
  }
  return error?.message || "Unable to synchronize assignment status.";
}
