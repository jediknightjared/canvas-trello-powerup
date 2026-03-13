var Promise = TrelloPowerUp.Promise;

let events = [];
let eventID = 0;

const socket = io();

socket.on("connect", () => {});

socket.on("disconnect", (socket) => {});

TrelloPowerUp.initialize({
  "show-settings": function (t) {
    return t.popup({
      title: "Custom Fields Settings",
      url: "/settings.html",
      height: 184,
    });
  },
  "card-from-url": async function (t, options) {
    const url = options.url;

    const urlRegex =
      /^https:\/\/([\w.-]+)\.instructure\.com\/courses\/([0-9]+)\/(assignments|quizzes|discussion_topics)\/([0-9]+)(?:[/?#].*)?$/;

    if (!urlRegex.test(url)) {
      throw t.NotHandled();
    }

    try {
      const token = await t.loadSecret("token");

      if (!token) {
        throw new Error(
          "Canvas token not configured. Please set your Canvas API token in the Power-Up settings.",
        );
      }

      const [, domain, courseID, type, assignmentID] = urlRegex.exec(url);

      const fetchURL = `https://${domain}.instructure.com/api/v1/courses/${courseID}/${type}/${assignmentID}?access_token=${token}`;

      const data = await serverFetchJSON(fetchURL);

      if (!data || (!data.name && !data.title)) {
        throw new Error("Invalid response from Canvas API - no title found");
      }

      const description = data.description
        ? data.description
            .replaceAll(/<h([1-6])>/g, (_, n) => "#".repeat(+n) + " ")
            .replaceAll(/<.+?>/g, "")
        : "";

      return {
        name: data.name || data.title,
        desc: description,
      };
    } catch (error) {
      console.error("Error in card-from-url:", error);
      // Don't re-throw the error as it might prevent other Power-Ups from working
      // Instead, throw t.NotHandled() to let Trello know this Power-Up can't handle this URL
      throw t.NotHandled();
    }
  },
  "board-buttons": function (t, options) {
    return [
      {
        text: "Load Assignments",
        condition: "always",
        callback: function (t, options) {
          t.modal({
            title: "Load Assignments",
            url: "/loadAssignments.html",
            fullscreen: true,
          });
        },
      },
    ];
  },
  "card-badges": async function (t, options) {
    let cardAttachments = options.attachments;
    const token = await t.loadSecret("token");

    if (!token) {
      throw new Error(
        "Canvas token not configured. Please set your Canvas API token in the Power-Up settings.",
      );
    }

    // check to see if there are any attachments that match the pattern of a canvas assignment URL
    let badges = [];

    for (const attachment of cardAttachments) {
      const urlRegex =
        /^https:\/\/([\w.-]+)\.instructure\.com\/courses\/([0-9]+)\/(assignments|quizzes|discussion_topics)\/([0-9]+)(?:[/?#].*)?$/;
      if (urlRegex.test(attachment.url)) {
        const [, domain, courseID] = urlRegex.exec(attachment.url);

        const base = `https://${domain}.instructure.com/api/v1/`;

        const {
          id: courseId,
          enrollments,
          name: courseName,
        } = await serverFetchJSON(
          `${base}courses/${courseID}?access_token=${token}`,
        );
        const userId = enrollments[0].user_id;
        const { hexcode: color } = await serverFetchJSON(
          `${base}users/${userId}/color/course_${courseId}?access_token=${token}`,
        );

        badges.push({
          text: courseName,
          color: color || "blue",
        });
      }
    }

    return badges;
  },
});

const buffer = {};
let index = 0;

function serverFetchJSON(url, options) {
  const id = index++;
  socket.emit("fetch-json", id, url, options);

  return new Promise((resolve, reject) => {
    buffer[id] = { resolve, reject };
  });
}

socket.on("fetch-json-response", (id, data) => {
  if (buffer[id]) {
    if (data && data.error) {
      buffer[id].reject(
        new Error(data.error + (data.details ? ": " + data.details : "")),
      );
    } else {
      buffer[id].resolve(data);
    }
    delete buffer[id];
  }
});
