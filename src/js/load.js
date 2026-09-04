import { createCanvasApi } from "./canvas-api.mjs";
import { createLoadController } from "./load-controller.mjs";
import { createTrelloApi } from "./trello-api.mjs";

const TRELLO_APP_KEY = "b5c06882ca740f9920dae402dfbb8341";
const trello = window.TrelloPowerUp.iframe({
  appKey: TRELLO_APP_KEY,
  appName: "Canvas PowerUp",
});

const elements = {
  listSelect: document.querySelector("#list"),
  courseSelect: document.querySelector("#course"),
  assignmentsSection: document.querySelector("#assignments-section"),
  assignmentsList: document.querySelector("#assignments-list"),
  hideCompletedCheckbox: document.querySelector("#hide-completed"),
  selectAllBtn: document.querySelector("#select-all"),
  selectNoneBtn: document.querySelector("#select-none"),
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
