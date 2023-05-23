const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();

app.use(express.static("dist"));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  /* options */
});

io.on("connection", (socket) => {
  console.log("New Socket Connection");

  socket.on("load-canvas", async (id, url) => {
    const response = await fetch(url);
    const data = await response.json();

    socket.emit("data-canvas", id, data);
  });

  socket.on("fetch-json", async (id, url, options) => {
    const response = await fetch(url, options);
    const json = await response.json();
    socket.emit("fetch-json-response", id, json);
  });
});

const listener = httpServer.listen(process.env.PORT || 80, function () {
  console.info(`Node Version: ${process.version}`);
  console.log("Trello Power-Up Server listening on port " + listener.address().port);
});
