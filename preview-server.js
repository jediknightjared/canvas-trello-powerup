const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const projectRoot = __dirname;
const previewPort = process.env.PREVIEW_PORT || 4173;

app.use("/css", express.static(path.join(projectRoot, "src", "css")));
app.use("/js", express.static(path.join(projectRoot, "src", "js")));
app.use("/preview", express.static(path.join(projectRoot, "preview")));

app.get(["/", "/loadAssignments.html"], (_request, response) => {
  const htmlPath = path.join(
    projectRoot,
    "src",
    "html",
    "loadAssignments.html",
  );
  const productionScript =
    '<script type="module" src="../js/load.js"></script>';
  const previewScript =
    '<script type="module" src="/preview/load-preview.js"></script>';
  const html = fs.readFileSync(htmlPath, "utf8");

  if (!html.includes(productionScript)) {
    response.status(500).send("Unable to locate the production load script.");
    return;
  }

  response.type("html").send(html.replace(productionScript, previewScript));
});

app.listen(previewPort, "127.0.0.1", () => {
  console.log(`Assignment preview: http://127.0.0.1:${previewPort}`);
});
