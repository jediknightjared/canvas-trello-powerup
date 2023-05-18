document.querySelector("#settings").onsubmit = handleSave;

function handleSave(e) {
  e.preventDefault();

  console.log(e);

  const t = window.TrelloPowerUp.iframe();
  const token = e.target.token.value;

  console.log(token);
  t.storeSecret("token", token);
}

async function loadToken() {
  const t = window.TrelloPowerUp.iframe();

  const token = await t.loadSecret("token");

  document.querySelector("#token").value = token;
}

loadToken();
