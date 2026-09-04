export function createUi({ document, loadingDiv, contentDiv, statusDiv }) {
  function showError(message) {
    showStatus("error", message);
    loadingDiv.style.display = "none";
    contentDiv.style.display = "block";
  }

  function showSuccess(message) {
    showStatus("success", message);
  }

  function showStatus(className, message) {
    const div = document.createElement("div");
    div.className = className;
    div.textContent = message || "";
    statusDiv.replaceChildren(div);
  }

  function showContent() {
    loadingDiv.style.display = "none";
    contentDiv.style.display = "block";
  }

  return { showContent, showError, showSuccess };
}
