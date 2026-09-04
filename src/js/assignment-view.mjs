export function createAssignmentView({ document, assignmentsList }) {
  let renderedIndexes = [];

  function render(assignments, selectedIndexes, emptyMessage, onSelectionChange) {
    assignmentsList.innerHTML = "";
    renderedIndexes = assignments.map((assignment) => assignment.sourceIndex);

    if (assignments.length === 0) {
      assignmentsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">${emptyMessage}</div>`;
      return;
    }

    assignments.forEach((assignment) => {
      assignmentsList.appendChild(
        createAssignmentElement(assignment, selectedIndexes, onSelectionChange),
      );
    });
  }

  function createAssignmentElement(
    assignment,
    selectedIndexes,
    onSelectionChange,
  ) {
    const assignmentDiv = document.createElement("div");
    assignmentDiv.className = "assignment-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "assignment-checkbox";
    checkbox.dataset.index = assignment.sourceIndex;
    checkbox.checked = selectedIndexes.has(assignment.sourceIndex);
    checkbox.addEventListener("change", (event) => {
      onSelectionChange(assignment.sourceIndex, event.currentTarget.checked);
    });

    const infoDiv = document.createElement("div");
    infoDiv.className = "assignment-info";
    infoDiv.appendChild(
      createTextElement("div", "assignment-title", assignment.name),
    );
    infoDiv.appendChild(createBadges(assignment));
    infoDiv.appendChild(createDueDate(assignment));

    const description = document.createElement("div");
    description.className = "assignment-desc";
    if (assignment.description) {
      description.textContent =
        assignment.description.replace(/<[^>]*>/g, "").substring(0, 100) + "...";
    }
    infoDiv.appendChild(description);

    assignmentDiv.appendChild(checkbox);
    assignmentDiv.appendChild(infoDiv);
    return assignmentDiv;
  }

  function createBadges(assignment) {
    const badges = document.createElement("div");
    badges.className = "assignment-badges";
    badges.appendChild(
      createTextElement(
        "span",
        `badge badge-${assignment.type}`,
        `${assignment.type.charAt(0).toUpperCase()}${assignment.type.slice(1)}`,
      ),
    );

    if (assignment.submitted) {
      badges.appendChild(
        createTextElement("span", "badge badge-submitted", "Submitted"),
      );
    }

    return badges;
  }

  function createDueDate(assignment) {
    const due = document.createElement("div");
    due.className = "assignment-due";
    due.textContent = assignment.due_at
      ? `Due: ${new Date(assignment.due_at).toLocaleDateString()} ${new Date(assignment.due_at).toLocaleTimeString()}`
      : "No due date";
    return due;
  }

  function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function setAllChecked(checked) {
    for (const checkbox of assignmentsList.querySelectorAll(
      ".assignment-checkbox",
    )) {
      checkbox.checked = checked;
    }
  }

  function getRenderedIndexes() {
    return renderedIndexes;
  }

  return { getRenderedIndexes, render, setAllChecked };
}
