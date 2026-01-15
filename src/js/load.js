const courseSelect = document.querySelector("#course");
const assignmentsSection = document.querySelector("#assignments-section");
const assignmentsList = document.querySelector("#assignments-list");
const selectAllBtn = document.querySelector("#select-all");
const selectNoneBtn = document.querySelector("#select-none");
const importBtn = document.querySelector("#import-selected");
const loadingDiv = document.querySelector("#loading");
const contentDiv = document.querySelector("#content");
const statusDiv = document.querySelector("#status");

const t = window.TrelloPowerUp.iframe();
const socket = io();
let canvasToken;
let currentAssignments = [];

// Initialize
t.loadSecret("token").then(token => {
    canvasToken = token;
    if (token) {
        loadCourses();
    } else {
        showError("Canvas API token not configured. Please set it in the Power-Up settings.");
    }
});

// Load courses from Canvas
async function loadCourses() {
    try {
        const coursesUrl = `https://canvas.instructure.com/api/v1/courses?access_token=${canvasToken}&enrollment_state=active&include[]=term`;
        const response = await serverFetchJSON(coursesUrl);

        // Filter to show only courses the user can access
        const accessibleCourses = response.filter(
            course => course.name && course.id && !course.access_restricted_by_date
        );

        if (accessibleCourses.length === 0) {
            showError("No accessible courses found. Make sure your Canvas token has the correct permissions.");
            return;
        }

        // Populate course dropdown
        courseSelect.innerHTML = '<option value="">Choose a course...</option>';
        accessibleCourses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.id;
            option.textContent = `${course.name} (${course.term?.name || "No Term"})`;
            courseSelect.appendChild(option);
        });

        loadingDiv.style.display = "none";
        contentDiv.style.display = "block";
    } catch (error) {
        console.error("Error loading courses:", error);
        showError("Failed to load courses from Canvas. Please check your API token.");
    }
}

// Handle course selection
courseSelect.addEventListener("change", e => {
    const courseId = e.target.value;
    if (courseId) {
        loadAssignments(courseId);
    } else {
        assignmentsSection.style.display = "none";
    }
});

// Load assignments for selected course
async function loadAssignments(courseId) {
    try {
        assignmentsList.innerHTML = '<div class="loading">Loading assignments...</div>';

        const assignmentsUrl = `https://canvas.instructure.com/api/v1/courses/${courseId}/assignments?access_token=${canvasToken}&include[]=submission`;
        console.log("Loading assignments from course:", courseId);
        const assignments = await serverFetchJSON(assignmentsUrl);

        currentAssignments = assignments.filter(assignment => assignment.name && !assignment.graded_submissions_exist);

        displayAssignments(currentAssignments);
        assignmentsSection.style.display = "block";
    } catch (error) {
        console.error("Error loading assignments:", error);
        let errorMessage = "Failed to load assignments from Canvas.";

        if (error.message.includes("403")) {
            errorMessage =
                "Access denied to course assignments. Your Canvas token may not have permission to view assignments for this course, or you may not be enrolled as an instructor.";
        } else if (error.message.includes("401")) {
            errorMessage = "Canvas API token is invalid or expired. Please update your token in the Power-Up settings.";
        }

        showError(errorMessage);
    }
}

// Display assignments in the UI
function displayAssignments(assignments) {
    assignmentsList.innerHTML = "";

    if (assignments.length === 0) {
        assignmentsList.innerHTML =
            '<div style="padding: 20px; text-align: center; color: #666;">No assignments found for this course.</div>';
        importBtn.disabled = true;
        return;
    }

    assignments.forEach((assignment, index) => {
        const assignmentDiv = document.createElement("div");
        assignmentDiv.className = "assignment-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "assignment-checkbox";
        checkbox.dataset.index = index;

        const infoDiv = document.createElement("div");
        infoDiv.className = "assignment-info";

        const titleDiv = document.createElement("div");
        titleDiv.className = "assignment-title";
        titleDiv.textContent = assignment.name;

        const dueDiv = document.createElement("div");
        dueDiv.className = "assignment-due";
        if (assignment.due_at) {
            const dueDate = new Date(assignment.due_at);
            dueDiv.textContent = `Due: ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString()}`;
        } else {
            dueDiv.textContent = "No due date";
        }

        const descDiv = document.createElement("div");
        descDiv.className = "assignment-desc";
        if (assignment.description) {
            // Strip HTML tags for preview
            descDiv.textContent = assignment.description.replace(/<[^>]*>/g, "").substring(0, 100) + "...";
        }

        infoDiv.appendChild(titleDiv);
        infoDiv.appendChild(dueDiv);
        infoDiv.appendChild(descDiv);

        assignmentDiv.appendChild(checkbox);
        assignmentDiv.appendChild(infoDiv);

        assignmentsList.appendChild(assignmentDiv);
    });

    updateImportButton();
}

// Handle select all/none buttons
selectAllBtn.addEventListener("click", () => {
    const checkboxes = assignmentsList.querySelectorAll(".assignment-checkbox");
    checkboxes.forEach(cb => (cb.checked = true));
    updateImportButton();
});

selectNoneBtn.addEventListener("click", () => {
    const checkboxes = assignmentsList.querySelectorAll(".assignment-checkbox");
    checkboxes.forEach(cb => (cb.checked = false));
    updateImportButton();
});

// Update import button state
function updateImportButton() {
    const checkedBoxes = assignmentsList.querySelectorAll(".assignment-checkbox:checked");
    importBtn.disabled = checkedBoxes.length === 0;
    importBtn.textContent = `Import ${checkedBoxes.length} Selected to Trello`;
}

// Handle import button click
importBtn.addEventListener("click", async () => {
    const selectedIndexes = Array.from(assignmentsList.querySelectorAll(".assignment-checkbox:checked")).map(cb =>
        parseInt(cb.dataset.index)
    );

    if (selectedIndexes.length === 0) return;

    try {
        importBtn.disabled = true;
        importBtn.textContent = "Importing...";

        const selectedAssignments = selectedIndexes.map(index => currentAssignments[index]);

        // Create cards for selected assignments
        for (const assignment of selectedAssignments) {
            await createCardFromAssignment(assignment);
        }

        showSuccess(`Successfully imported ${selectedAssignments.length} assignment(s) to Trello!`);
        importBtn.textContent = "Import Complete";

        // Close modal after a delay
        setTimeout(() => {
            t.closeModal();
        }, 2000);
    } catch (error) {
        console.error("Error importing assignments:", error);
        showError("Failed to import some assignments. Please try again.");
        importBtn.disabled = false;
        importBtn.textContent = "Import Selected to Trello";
    }
});

// Create a Trello card from a Canvas assignment
async function createCardFromAssignment(assignment) {
    const cardData = {
        name: assignment.name,
        desc: assignment.description
            ? assignment.description.replace(/<h([1-6])>/g, (_, n) => "#".repeat(+n) + " ").replace(/<[^>]*>/g, "")
            : ""
    };

    // Create the card on the current Trello list
    await t.card("idList").then(async listId => {
        await t.cards("add", cardData.name, listId, cardData.desc);
    });
}

// Server communication helper
function serverFetchJSON(url, options) {
    return new Promise((resolve, reject) => {
        const id = Date.now() + Math.random();
        socket.emit("fetch-json", id, url, options);

        const timeout = setTimeout(() => {
            reject(new Error("Request timeout"));
        }, 30000);

        const handler = (responseId, data) => {
            if (responseId === id) {
                socket.off("fetch-json-response", handler);
                clearTimeout(timeout);
                if (data && data.error) {
                    reject(new Error(data.error));
                } else {
                    resolve(data);
                }
            }
        };

        socket.on("fetch-json-response", handler);
    });
}

// UI helper functions
function showError(message) {
    statusDiv.innerHTML = `<div class="error">${message}</div>`;
    loadingDiv.style.display = "none";
    contentDiv.style.display = "block";
}

function showSuccess(message) {
    statusDiv.innerHTML = `<div class="success">${message}</div>`;
}
