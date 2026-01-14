var Promise = TrelloPowerUp.Promise;

console.log("Canvas Power-Up Loaded");

let events = [];
let eventID = 0;

const socket = io();

socket.on("connect", () => {
    console.log("Socket connected!");
});

socket.on("disconnect", socket => {
    console.log("Socket disconnected!");
});

TrelloPowerUp.initialize({
    "show-settings": function (t) {
        return t.popup({
            title: "Custom Fields Settings",
            url: "/settings.html",
            height: 184
        });
    },
    "card-from-url": async function (t, options) {
        console.log("card-from-url called with options:", options);
        const url = options.url;
        console.log("Processing URL:", url);

        const urlRegex =
            /^https:\/\/([\w.-]+)\.instructure\.com\/courses\/([0-9]+)\/(assignments|quizzes|discussion_topics)\/([0-9]+)(?:[/?#].*)?$/;

        if (!urlRegex.test(url)) {
            console.log("Unmatching URL: ", url);
            throw t.NotHandled();
        }

        console.log("URL matched regex");

        try {
            const token = await t.loadSecret("token");

            if (!token) {
                console.error("Canvas token not set in Power-Up settings");
                throw new Error("Canvas token not configured. Please set your Canvas API token in the Power-Up settings.");
            }

            const [, domain, courseID, type, assignmentID] = urlRegex.exec(url);
            console.log("Extracted:", { domain, courseID, type, assignmentID });

            const fetchURL = `https://${domain}.instructure.com/api/v1/courses/${courseID}/${type}/${assignmentID}?access_token=${token}`;

            console.log("Fetching from Canvas API:", fetchURL.replace(token, "[TOKEN]"));

            const data = await serverFetchJSON(fetchURL);

            console.log("Canvas API response:", data);

            if (!data || (!data.name && !data.title)) {
                throw new Error("Invalid response from Canvas API - no title found");
            }

            const description = data.description
                ? data.description.replaceAll(/<h([1-6])>/g, (_, n) => "#".repeat(+n) + " ").replaceAll(/<.+?>/g, "")
                : "";

            return {
                name: data.name || data.title,
                desc: description
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
                text: "Load Asignments",
                condition: "admin",
                callback: function (t, options) {
                    t.modal({
                        title: "Load Assignments",
                        url: "/loadAssignments.html",
                        fullscreen: true
                    });
                }
            }
        ];
    }
});

const buffer = {};
let index = 0;

function serverFetchJSON(url, options) {
    console.log("serverFetchJSON called with URL:", url.replace(/access_token=[^&]*/, "access_token=[TOKEN]"));
    const id = index++;
    socket.emit("fetch-json", id, url, options);

    return new Promise((resolve, reject) => {
        buffer[id] = { resolve, reject };
    });
}

socket.on("fetch-json-response", (id, data) => {
    if (buffer[id]) {
        if (data && data.error) {
            buffer[id].reject(new Error(data.error + (data.details ? ": " + data.details : "")));
        } else {
            buffer[id].resolve(data);
        }
        delete buffer[id];
    }
});
