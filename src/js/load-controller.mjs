import {
  filterVisibleAssignments,
  mergeCourseItems,
} from "./assignment-mapper.mjs";
import { createAssignmentView } from "./assignment-view.mjs";
import { createUi } from "./ui.mjs";

export function createLoadController({
  document,
  elements,
  canvasApi,
  trelloApi,
  loadCredentials,
  closeModal,
  logger = console,
}) {
  const {
    listSelect,
    courseSelect,
    assignmentsSection,
    assignmentsList,
    hideCompletedCheckbox,
    selectAllBtn,
    selectNoneBtn,
    importBtn,
  } = elements;
  const ui = createUi({ document, ...elements });
  const assignmentView = createAssignmentView({ document, assignmentsList });
  const state = {
    assignments: [],
    selectedIndexes: new Set(),
    importing: false,
  };

  async function initialize() {
    bindEvents();
    showCoursePrompt();

    await Promise.all([loadLists(), initializeCanvas()]);
  }

  async function loadLists() {
    try {
      const lists = await trelloApi.getLists();
      renderOptions(
        document,
        listSelect,
        lists,
        "Choose a list...",
        (list) => ({ value: list.id, label: list.name }),
      );
    } catch (error) {
      logger.error("Error loading Trello lists:", error);
      ui.showError("Failed to load Trello lists.");
    }
  }

  async function initializeCanvas() {
    try {
      const credentials = await loadCredentials();
      validateCredentials(credentials);
      await loadCourses();
    } catch (error) {
      logger.error("Error loading courses:", error);
      ui.showError(getInitializationError(error));
    }
  }

  async function loadCourses() {
    const courses = await canvasApi.getCourses();
    if (courses.length === 0) {
      throw new Error(
        "No accessible courses found. Make sure your Canvas token has the correct permissions.",
      );
    }

    renderOptions(
      document,
      courseSelect,
      courses,
      "Choose a course...",
      (course) => ({
        value: course.id,
        label: `${course.name} (${course.term?.name || "No Term"})`,
      }),
    );
    ui.showContent();
  }

  async function loadAssignments(courseId) {
    state.assignments = [];
    state.selectedIndexes.clear();
    setSelectionControlsEnabled(false);
    updateImportButton();
    assignmentView.renderMessage("Loading assignments...", "loading");

    try {
      const sources = await canvasApi.getCourseItems(courseId);
      state.assignments = mergeCourseItems(sources);
      displayCurrentAssignments();
    } catch (error) {
      logger.error("Error loading assignments:", error);
      assignmentView.renderMessage("Unable to load assignments for this course.");
      ui.showError(getAssignmentsError(error));
    }
  }

  function displayCurrentAssignments() {
    const assignments = filterVisibleAssignments(
      state.assignments,
      hideCompletedCheckbox.checked,
    );
    const emptyMessage = hideCompletedCheckbox.checked
      ? "No incomplete assignments found for this course."
      : "No assignments found for this course.";

    assignmentView.render(
      assignments,
      state.selectedIndexes,
      emptyMessage,
      handleAssignmentSelectionChange,
    );
    setSelectionControlsEnabled(assignments.length > 0);
    updateImportButton();
  }

  function showCoursePrompt() {
    state.assignments = [];
    state.selectedIndexes.clear();
    assignmentView.renderMessage("Select a course to view assignments.");
    setSelectionControlsEnabled(false);
    updateImportButton();
  }

  function setSelectionControlsEnabled(enabled) {
    selectAllBtn.disabled = !enabled;
    selectNoneBtn.disabled = !enabled;
  }

  function handleAssignmentSelectionChange(index, checked) {
    if (checked) {
      state.selectedIndexes.add(index);
    } else {
      state.selectedIndexes.delete(index);
    }
    updateImportButton();
  }

  function selectAll() {
    for (const index of assignmentView.getRenderedIndexes()) {
      state.selectedIndexes.add(index);
    }
    assignmentView.setAllChecked(true);
    updateImportButton();
  }

  function selectNone() {
    state.selectedIndexes.clear();
    assignmentView.setAllChecked(false);
    updateImportButton();
  }

  function updateImportButton() {
    const count = getVisibleSelectedIndexes().length;
    importBtn.disabled = count === 0 || !listSelect.value;
    importBtn.textContent = `Import ${count} Selected to Trello`;
  }

  async function importSelected() {
    const selectedIndexes = getVisibleSelectedIndexes();
    if (state.importing || selectedIndexes.length === 0) return;
    state.importing = true;
    importBtn.disabled = true;
    importBtn.textContent = "Importing...";

    const selectedAssignments = state.assignments.filter((assignment) =>
      selectedIndexes.includes(assignment.sourceIndex),
    );
    let succeeded = 0;
    const failed = [];

    try {
      for (const assignment of selectedAssignments) {
        try {
          await trelloApi.createCard(assignment, listSelect.value);
          succeeded++;
        } catch (error) {
          logger.error("Failed to create card for:", assignment.name, error);
          failed.push(assignment.name);
        }
      }

      if (failed.length === 0) {
        ui.showSuccess(
          `Successfully imported ${succeeded} assignment(s) to Trello!`,
        );
        importBtn.textContent = "Import Complete";
        setTimeout(closeModal, 2000);
      } else {
        ui.showError(
          `Imported ${succeeded}, failed ${failed.length}: ${failed.join(", ")}`,
        );
        importBtn.disabled = false;
        importBtn.textContent = "Import Selected to Trello";
      }
    } catch (error) {
      logger.error("Error importing assignments:", error);
      ui.showError("Failed to import assignments. Please try again.");
      importBtn.disabled = false;
      importBtn.textContent = "Import Selected to Trello";
    } finally {
      state.importing = false;
    }
  }

  function getVisibleSelectedIndexes() {
    return assignmentView
      .getRenderedIndexes()
      .filter((index) => state.selectedIndexes.has(index));
  }

  function bindEvents() {
    listSelect.addEventListener("change", updateImportButton);
    courseSelect.addEventListener("change", (event) => {
      if (event.target.value) {
        loadAssignments(event.target.value);
      } else {
        showCoursePrompt();
      }
    });
    hideCompletedCheckbox.addEventListener("change", displayCurrentAssignments);
    selectAllBtn.addEventListener("click", selectAll);
    selectNoneBtn.addEventListener("click", selectNone);
    importBtn.addEventListener("click", importSelected);
  }

  return {
    displayCurrentAssignments,
    initialize,
    loadAssignments,
    updateImportButton,
  };
}

function renderOptions(document, select, options, placeholder, toOption) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const optionData of options.map(toOption)) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.appendChild(option);
  }
}

function validateCredentials({ domain, token }) {
  if (!domain || !token) {
    const missing = [];
    if (!domain) missing.push("Canvas domain");
    if (!token) missing.push("API token");
    throw new Error(
      `${missing.join(" and ")} not configured. Please set them in the Power-Up settings.`,
    );
  }

  const domainRegex = /^([\w-]+\.instructure\.com|canvas\.[\w.-]+\.[\w]+)$/;
  if (!domainRegex.test(domain)) {
    throw new Error(
      "Invalid Canvas domain format. Please use your institution's Canvas URL (e.g., university.instructure.com).",
    );
  }
}

function getInitializationError(error) {
  if (/No accessible courses/.test(error.message)) return error.message;
  if (/not configured|Invalid Canvas domain/.test(error.message)) {
    return error.message;
  }
  return "Failed to load courses from Canvas. Please check your API token.";
}

function getAssignmentsError(error) {
  if (error.status === 403 || /403/.test(error.message)) {
    return "Access denied to course assignments. Your Canvas token may not have permission to view assignments for this course, or you may not be enrolled as an instructor.";
  }
  if (error.status === 401 || /401/.test(error.message)) {
    return "Canvas API token is invalid or expired. Please update your token in the Power-Up settings.";
  }
  return "Failed to load assignments from Canvas.";
}
