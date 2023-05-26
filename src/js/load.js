const course = document.querySelector("#course");
const t = window.TrelloPowerUp.iframe();
let canvasToken;

t.loadSecret("token").then((token) => (canvasToken = token));
