import { createCanvasApi } from "./canvas-api.mjs";
import { createLoadController } from "./load-controller.mjs";
import { createTrelloApi } from "./trello-api.mjs";

const TRELLO_APP_KEY = "b5c06882ca740f9920dae402dfbb8341";
const trello =
  window.canvasPowerUp ||
  window.TrelloPowerUp.iframe({
    appKey: TRELLO_APP_KEY,
    appName: "Canvas PowerUp",
  });

syncModalTheme(trello);

const elements = {
  listSelect: document.querySelector("#list"),
  courseSelect: document.querySelector("#course"),
  assignmentsSection: document.querySelector("#assignments-section"),
  assignmentsList: document.querySelector("#assignments-list"),
  hideCompletedCheckbox: document.querySelector("#hide-completed"),
  hideImportedCheckbox: document.querySelector("#hide-imported"),
  duplicateCheckStatus: document.querySelector("#duplicate-check-status"),
  assignmentTypeSelect: document.querySelector("#assignment-type"),
  filtersToggle: document.querySelector("#filters-toggle"),
  filtersPanel: document.querySelector("#filters-panel"),
  filterSummary: document.querySelector("#filter-summary"),
  dueWeekInput: document.querySelector("#due-week"),
  weekRange: document.querySelector("#week-range"),
  previousWeekBtn: document.querySelector("#previous-week"),
  nextWeekBtn: document.querySelector("#next-week"),
  thisWeekFilterBtn: document.querySelector("#current-week"),
  nextWeekFilterBtn: document.querySelector("#next-week-filter"),
  clearDueWeekBtn: document.querySelector("#clear-due-week"),
  selectAllBtn: document.querySelector("#select-all"),
  selectNoneBtn: document.querySelector("#select-none"),
  importTooltipContainer: document.querySelector("#import-tooltip-container"),
  importTooltip: document.querySelector("#import-tooltip"),
  importBtn: document.querySelector("#import-selected"),
  loadingDiv: document.querySelector("#loading"),
  contentDiv: document.querySelector("#content"),
  statusDiv: document.querySelector("#status"),
};

let credentials = { domain: null, token: null };
const canvasApi = createCanvasApi({
  socket: window.io(),
  getCredentials: () => credentials,
});
const trelloApi = createTrelloApi({ trello, appKey: TRELLO_APP_KEY });
const controller = createLoadController({
  document,
  elements,
  canvasApi,
  trelloApi,
  loadCredentials: async () => {
    credentials = {
      domain: await trello.loadSecret("domain"),
      token: await trello.loadSecret("token"),
    };
    return credentials;
  },
  closeModal: () => trello.closeModal(),
});

controller.initialize();

function syncModalTheme(trello) {
  if (typeof trello.updateModal !== "function") return;

  const context =
    typeof trello.getContext === "function" ? trello.getContext() : null;
  const initialTheme = context?.theme || context?.initialTheme;
  const fallback = initialTheme === "dark" ? "#1d2125" : "#ffffff";
  const accentColor =
    typeof trello.getComputedColorToken === "function"
      ? trello.getComputedColorToken("elevation.surface", fallback)
      : fallback;

  trello.updateModal({ accentColor });

  if (typeof trello.subscribeToThemeChanges === "function") {
    trello.subscribeToThemeChanges((theme) => {
      const themeFallback = theme === "dark" ? "#1d2125" : "#ffffff";
      const themeAccentColor =
        typeof trello.getComputedColorToken === "function"
          ? trello.getComputedColorToken("elevation.surface", themeFallback)
          : themeFallback;
      trello.updateModal({ accentColor: themeAccentColor });
    });
  }
}
