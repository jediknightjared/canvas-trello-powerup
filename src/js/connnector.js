var Promise = TrelloPowerUp.Promise;

console.log("Canvas Power-Up Loaded");

let events = [];
let eventID = 0;

const socket = io();

socket.on("connect", () => {
  console.log("Socket connection complete!");
});

socket.on("data-canvas", (id, data) => {
  events[id]({
    name: data.name || data.title,
    desc: data.description.replaceAll(/<h([1-6])>/g, (_, n) => "#".repeat(+n) + " ").replaceAll(/<.+?>/g, ""),
    due: data.due_at
  });
});

socket.on("disconnect", (socket) => {
  console.log("Socket disconnected!");
});

TrelloPowerUp.initialize({
  "show-settings": function (t, options) {
    return t.popup({
      title: "Custom Fields Settings",
      url: "/settings.html",
      height: 184
    });
  },
  "card-from-url": async function (t, options) {
    console.log("Running card-from-url function");
    const url = options.url;

    const urlRegex =
      /^https:\/\/(\w+)\.instructure\.com\/courses\/([0-9]+)\/(assignments|quizzes|discussion_topics)\/([0-9]+)$/;

    if (!urlRegex.test(url)) {
      console.log("Unmatching URL: ", url);
      throw t.NotHandled();
    }

    console.log("loading token");

    const token = await t.loadSecret("token");

    const [, domain, courseID, type, assignmentID] = urlRegex.exec(url);

    const fetchURL = `https://${domain}.instructure.com/api/v1/courses/${courseID}/${type}/${assignmentID}?access_token=${token}`;

    const currID = eventID++;

    const data = await serverFetchJSON(url);

    return new Promise(function (resolve) {
      resolve({
        name: data.name || data.title,
        desc: data.description.replaceAll(/<h([1-6])>/g, (_, n) => "#".repeat(+n) + " ").replaceAll(/<.+?>/g, ""),
        due: data.due_at
      });
    });
  }
});

const buffer = {};

function serverFetchJSON(url, options) {
  const id = Date.now();
  socket.emit("fetch-json", id, url, options);

  return new Promise((resolve) => {
    buffer[id] = resolve;
  });
}

socket.on("fetch-json-response", (id, data) => {
  buffer[id](data);
  delete buffer[id];
});
