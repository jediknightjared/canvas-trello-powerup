import { createCanvasApi } from "./canvas-api.mjs";
import { createSyncController } from "./sync-controller.mjs";
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
  document,
  progress: document.querySelector("#progress"),
  scanSummary: document.querySelector("#scan-summary"),
  resultsBody: document.querySelector("#sync-results-body"),
  closeBtn: document.querySelector("#close"),
};

let credentials = { domain: null, token: null };
const canvasApi = createCanvasApi({
  socket: window.io(),
  getCredentials: () => credentials,
});
const trelloApi = createTrelloApi({ trello, appKey: TRELLO_APP_KEY });
const controller = createSyncController({
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
