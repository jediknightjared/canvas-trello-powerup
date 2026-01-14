const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(express.static("dist"));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    /* options */
});

io.on("connection", socket => {
    console.log("New Socket Connection");

    socket.on("load-canvas", async (id, url) => {
        const response = await fetch(url);
        const data = await response.json();

        socket.emit("data-canvas", id, data);
    });

    socket.on("fetch-json", async (id, url, options) => {
        try {
            console.log("Fetching JSON from:", url.replace(/access_token=[^&]*/, "access_token=[TOKEN]"));
            const response = await fetch(url, options ?? {});

            if (!response.ok) {
                console.error(`Canvas API error: ${response.status} ${response.statusText}`);
                const errorText = await response.text();
                console.error("Error response:", errorText);
                socket.emit("fetch-json-response", id, {
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    details: errorText
                });
                return;
            }

            const json = await response.json();
            console.log("Canvas API success, data keys:", Object.keys(json));
            socket.emit("fetch-json-response", id, json);
        } catch (error) {
            console.error("Error fetching JSON:", error);
            socket.emit("fetch-json-response", id, { error: error.message });
        }
    });
});

const listener = httpServer.listen(process.env.PORT || 80, function () {
    console.info(`Node Version: ${process.version}`);
    console.log("Trello Power-Up Server listening on port " + listener.address().port);
});
