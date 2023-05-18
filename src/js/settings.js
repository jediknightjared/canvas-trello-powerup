document.querySelector("#settings").onsubmit = handleSave;

function handleSave(e) {
  e.preventDefault();

  console.log(e);

  const t = window.TrelloPowerUp.iframe();
  const token = e.target.token.value;

  console.log(token);
  t.storeSecret("token", token);
}

function loadToken() {
  const t = window.TrelloPowerUp.iframe();

  const token = t.loadSecret("token").then((secret) => (document.querySelector("#token").value = token));
}

loadToken();
