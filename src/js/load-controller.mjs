import {
  filterVisibleAssignments,
  formatDateOnly,
  getMonday,
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
    hideImportedCheckbox,
    duplicateCheckStatus,
    assignmentTypeSelect,
    filtersToggle,
    filtersPanel,
    filterSummary,
    dueWeekInput,
    weekRange,
    previousWeekBtn,
    nextWeekBtn,
    currentWeekBtn,
    nextWeekFilterBtn,
    clearDueWeekBtn,
    selectAllBtn,
    selectNoneBtn,
    importTooltipContainer,
    importTooltip,
    importBtn,
  } = elements;
  const ui = createUi({ document, ...elements });
  const assignmentView = createAssignmentView({ document, assignmentsList });
  const state = {
    assignments: [],
    selectedIndexes: new Set(),
    importedUrls: new Set(),
    duplicateCheckAvailable: false,
    weekStart: "",
    importing: false,
  };

  async function initialize() {
    bindEvents();
    setFiltersExpanded(false);
    updateFilterSummary();
    showCoursePrompt();

    await Promise.all([loadLists(), loadBoardCards(), initializeCanvas()]);
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

  async function loadBoardCards() {
    setDuplicateCheckLoading();

    try {
      const cards = await trelloApi.getBoardCards();
      state.importedUrls = new Set([
        ...state.importedUrls,
        ...extractImportedUrls(cards),
      ]);
      state.duplicateCheckAvailable = true;
      hideImportedCheckbox.disabled = false;
      duplicateCheckStatus.hidden = true;
      duplicateCheckStatus.textContent = "";
      duplicateCheckStatus.className = "filter-status";
      updateFilterSummary();
      if (state.assignments.length > 0) displayCurrentAssignments();
    } catch (error) {
      state.importedUrls = new Set();
      state.duplicateCheckAvailable = false;
      hideImportedCheckbox.checked = false;
      hideImportedCheckbox.disabled = true;
      duplicateCheckStatus.hidden = false;
      duplicateCheckStatus.className = "filter-status warning";
      duplicateCheckStatus.textContent =
        "Could not check Trello cards; showing all assignments.";
      logger.error("Error loading Trello cards:", error);
      updateFilterSummary();
      if (state.assignments.length > 0) displayCurrentAssignments();
    }
  }

  function setDuplicateCheckLoading() {
    hideImportedCheckbox.disabled = true;
    duplicateCheckStatus.hidden = false;
    duplicateCheckStatus.className = "filter-status";
    duplicateCheckStatus.textContent = "Checking Trello cards...";
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
      assignmentTypeSelect.value || "all",
      state.weekStart,
      hideImportedCheckbox.checked && state.duplicateCheckAvailable,
      state.importedUrls,
    );
    const emptyMessage = getEmptyMessage();

    assignmentView.render(
      assignments,
      state.selectedIndexes,
      emptyMessage,
      handleAssignmentSelectionChange,
    );
    setSelectionControlsEnabled(assignments.length > 0);
    updateImportButton();
  }

  function getEmptyMessage() {
    const type = assignmentTypeSelect.value || "all";
    const typeLabel =
      type === "all"
        ? "assignments"
        : `${type === "quiz" ? "quiz" : type} items`;
    const weekLabel = state.weekStart
      ? ` during ${formatWeekRange(state.weekStart)}`
      : "";
    const completionLabel = hideCompletedCheckbox.checked
      ? " incomplete"
      : "";
    const importedLabel =
      hideImportedCheckbox.checked && state.duplicateCheckAvailable
        ? " not already in Trello"
        : "";
    return `No${completionLabel} ${typeLabel}${weekLabel}${importedLabel} found for this course.`;
  }

  function toggleFilters() {
    const expanded = filtersToggle.getAttribute("aria-expanded") === "true";
    setFiltersExpanded(!expanded);
  }

  function setFiltersExpanded(expanded) {
    filtersToggle.setAttribute("aria-expanded", String(expanded));
    filtersPanel.hidden = !expanded;
  }

  function updateFilterSummary() {
    const type = assignmentTypeSelect.value || "all";
    const typeLabel =
      {
        all: "All types",
        assignment: "Assignments",
        quiz: "Quizzes",
        discussion: "Discussions",
      }[type] || "All types";
    const completionLabel = hideCompletedCheckbox.checked
      ? "Incomplete"
      : "";
    const dueLabel = state.weekStart
      ? formatWeekRange(state.weekStart)
      : "All due dates";
    const importedLabel =
      hideImportedCheckbox.checked && state.duplicateCheckAvailable
        ? "Not imported"
        : "";
    filterSummary.textContent = [
      typeLabel,
      dueLabel,
      completionLabel,
      importedLabel,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function handleFilterChange() {
    updateFilterSummary();
    displayCurrentAssignments();
  }

  function handleDueWeekChange() {
    if (!dueWeekInput.value) {
      clearDueWeek();
      return;
    }

    const [year, month, day] = dueWeekInput.value.split("-").map(Number);
    setDueWeek(new Date(year, month - 1, day));
  }

  function setDueWeek(date) {
    const monday = getMonday(date);
    state.weekStart = formatDateOnly(monday);
    dueWeekInput.value = state.weekStart;
    updateWeekRange();
    displayCurrentAssignments();
  }

  function shiftDueWeek(offset) {
    const currentMonday = state.weekStart
      ? parseDateOnly(state.weekStart)
      : getMonday();
    currentMonday.setDate(currentMonday.getDate() + offset * 7);
    setDueWeek(currentMonday);
  }

  function selectNextWeek() {
    const nextMonday = getMonday();
    nextMonday.setDate(nextMonday.getDate() + 7);
    setDueWeek(nextMonday);
  }

  function clearDueWeek() {
    state.weekStart = "";
    dueWeekInput.value = "";
    updateWeekRange();
    displayCurrentAssignments();
  }

  function updateWeekRange() {
    weekRange.textContent = state.weekStart
      ? formatWeekRange(state.weekStart)
      : "All due dates";
    updateFilterSummary();
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
    if (state.importing) {
      importBtn.disabled = true;
      importBtn.textContent = "Importing...";
      setImportGuidance("");
      return;
    }

    const count = getVisibleSelectedIndexes().length;
    const needsAssignments = count === 0;
    const needsList = !listSelect.value;
    const guidance = getImportGuidance(needsAssignments, needsList);

    importBtn.disabled = false;
    importBtn.textContent = `Import ${count} Selected to Trello`;
    setImportGuidance(guidance);
  }

  function getImportGuidance(needsAssignments, needsList) {
    if (needsAssignments && needsList) {
      return "Select one or more assignments and choose a Trello list to enable importing.";
    }
    if (needsAssignments) {
      return "Select one or more assignments to enable importing.";
    }
    if (needsList) return "Choose a Trello list to enable importing.";
    return "";
  }

  function setImportGuidance(message) {
    if (message) {
      importBtn.setAttribute("aria-disabled", "true");
      importBtn.setAttribute("aria-describedby", "import-tooltip");
      importTooltip.textContent = message;
    } else {
      importBtn.removeAttribute("aria-disabled");
      importBtn.removeAttribute("aria-describedby");
      hideImportTooltip();
    }
  }

  function showImportTooltip() {
    if (importBtn.getAttribute("aria-disabled") === "true") {
      importTooltip.hidden = false;
    }
  }

  function hideImportTooltip() {
    importTooltip.hidden = true;
  }

  async function importSelected() {
    const selectedIndexes = getVisibleSelectedIndexes();
    if (
      state.importing ||
      selectedIndexes.length === 0 ||
      !listSelect.value
    ) {
      return;
    }
    state.importing = true;
    updateImportButton();

    const selectedAssignments = state.assignments.filter((assignment) =>
      selectedIndexes.includes(assignment.sourceIndex),
    );
    let succeeded = 0;
    const failed = [];
    let importCompleted = false;

    try {
      for (const assignment of selectedAssignments) {
        try {
          await trelloApi.createCard(assignment, listSelect.value);
          succeeded++;
          cacheImportedAssignment(assignment);
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
        importCompleted = true;
        setTimeout(closeModal, 2000);
      } else {
        ui.showError(
          `Imported ${succeeded}, failed ${failed.length}: ${failed.join(", ")}`,
        );
      }
    } catch (error) {
      logger.error("Error importing assignments:", error);
      ui.showError("Failed to import assignments. Please try again.");
    } finally {
      state.importing = false;
      if (!importCompleted) updateImportButton();
    }
  }

  function getVisibleSelectedIndexes() {
    return assignmentView
      .getRenderedIndexes()
      .filter((index) => state.selectedIndexes.has(index));
  }

  function cacheImportedAssignment(assignment) {
    if (!assignment.url) return;
    state.importedUrls.add(assignment.url);
    if (state.duplicateCheckAvailable && hideImportedCheckbox.checked) {
      displayCurrentAssignments();
    }
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
    filtersToggle.addEventListener("click", toggleFilters);
    hideCompletedCheckbox.addEventListener("change", handleFilterChange);
    hideImportedCheckbox.addEventListener("change", handleFilterChange);
    assignmentTypeSelect.addEventListener("change", handleFilterChange);
    dueWeekInput.addEventListener("change", handleDueWeekChange);
    previousWeekBtn.addEventListener("click", () => shiftDueWeek(-1));
    nextWeekBtn.addEventListener("click", () => shiftDueWeek(1));
    currentWeekBtn.addEventListener("click", () => setDueWeek(getMonday()));
    nextWeekFilterBtn.addEventListener("click", selectNextWeek);
    clearDueWeekBtn.addEventListener("click", clearDueWeek);
    selectAllBtn.addEventListener("click", selectAll);
    selectNoneBtn.addEventListener("click", selectNone);
    importBtn.addEventListener("click", importSelected);
    importTooltipContainer.addEventListener("mouseenter", showImportTooltip);
    importTooltipContainer.addEventListener("mouseleave", hideImportTooltip);
    importBtn.addEventListener("focus", showImportTooltip);
    importBtn.addEventListener("blur", hideImportTooltip);
    importBtn.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideImportTooltip();
    });
  }

  return {
    displayCurrentAssignments,
    initialize,
    loadAssignments,
    updateImportButton,
  };
}

function extractImportedUrls(cards) {
  const urls = new Set();
  for (const card of cards) {
    if (!Array.isArray(card.attachments)) continue;
    for (const attachment of card.attachments) {
      if (attachment?.url) urls.add(attachment.url);
    }
  }
  return urls;
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

function parseDateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatWeekRange(weekStart) {
  const start = parseDateOnly(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const monthDay = (date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${start.toLocaleDateString(undefined, { month: "short" })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${monthDay(start)} – ${monthDay(end)}, ${end.getFullYear()}`;
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
