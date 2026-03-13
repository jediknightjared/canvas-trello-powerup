document.querySelector("#settings").onsubmit = handleSave;

function handleSave(e) {
  e.preventDefault();

  const t = window.TrelloPowerUp.iframe();
  const token = e.target.token.value;
  const domain = e.target.domain.value;

  t.storeSecret("domain", domain);
  t.storeSecret("token", token);
}

async function loadSettings() {
  const t = window.TrelloPowerUp.iframe();

  const token = await t.loadSecret("token");
  const domain = await t.loadSecret("domain");

  document.querySelector("#token").value = token || "";
  document.querySelector("#domain").value = domain || "";
}

loadSettings();
