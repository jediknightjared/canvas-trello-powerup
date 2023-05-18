const express = import("express");

const app = express();

app.use(express.static("dist"));

const listener = app.listen(process.env.PORT, function () {
  console.info(`Node Version: ${process.version}`);
  console.log(
    "Trello Power-Up Server listening on port " + listener.address().port
  );
});
