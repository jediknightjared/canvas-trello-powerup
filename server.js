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

  socket.on("load", async (id, url) => {
    const response = await fetch(fetchURL);
    const data = await response.json();

    socket.emit("data", id, data);
  });
});

const listener = httpServer.listen(process.env.PORT || 80, function () {
  console.info(`Node Version: ${process.version}`);
  console.log("Trello Power-Up Server listening on port " + listener.address().port);
});
