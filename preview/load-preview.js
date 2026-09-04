import { createLoadController } from "/js/load-controller.mjs";

const elements = {
  listSelect: document.querySelector("#list"),
  courseSelect: document.querySelector("#course"),
  assignmentsSection: document.querySelector("#assignments-section"),
  assignmentsList: document.querySelector("#assignments-list"),
  hideCompletedCheckbox: document.querySelector("#hide-completed"),
  hideImportedCheckbox: document.querySelector("#hide-imported"),
  duplicateCheckStatus: document.querySelector("#duplicate-check-status"),
  assignmentTypeSelect: document.querySelector("#assignment-type"),
  filtersToggle: document.querySelector("#filters-toggle"),
  filtersPanel: document.querySelector("#filters-panel"),
  filterSummary: document.querySelector("#filter-summary"),
  dueWeekInput: document.querySelector("#due-week"),
  weekRange: document.querySelector("#week-range"),
  previousWeekBtn: document.querySelector("#previous-week"),
  nextWeekBtn: document.querySelector("#next-week"),
  currentWeekBtn: document.querySelector("#current-week"),
  nextWeekFilterBtn: document.querySelector("#next-week-filter"),
  clearDueWeekBtn: document.querySelector("#clear-due-week"),
  selectAllBtn: document.querySelector("#select-all"),
  selectNoneBtn: document.querySelector("#select-none"),
  importTooltipContainer: document.querySelector("#import-tooltip-container"),
  importTooltip: document.querySelector("#import-tooltip"),
  importBtn: document.querySelector("#import-selected"),
  loadingDiv: document.querySelector("#loading"),
  contentDiv: document.querySelector("#content"),
  statusDiv: document.querySelector("#status"),
};

const canvasApi = {
  async getCourses() {
    return [
      {
        id: "preview-course",
        name: "Introduction to Computer Science",
        term: { name: "Fall 2026" },
      },
      {
        id: "preview-course-2",
        name: "Technical Writing",
        term: { name: "Fall 2026" },
      },
    ];
  },
  async getCourseItems() {
    return {
      assignments: [
        {
          id: 1,
          name: "Data Structures Project",
          description:
            "<p>Implement and analyze a balanced search tree.</p>",
          due_at: "2026-09-15T23:59:00Z",
          html_url: "https://canvas.example/assignments/1",
          submission: null,
        },
        {
          id: 2,
          name: "Algorithm Analysis Reflection",
          description:
            "<p>Compare the runtime characteristics of two approaches.</p>",
          due_at: "2026-09-19T23:59:00Z",
          html_url: "https://canvas.example/assignments/2",
          submission: { workflow_state: "submitted" },
        },
      ],
      quizzes: [
        {
          id: 3,
          title: "Searching and Sorting Quiz",
          description: "Review binary search and common sorting algorithms.",
          due_at: "2026-09-12T18:00:00Z",
          html_url: "https://canvas.example/quizzes/3",
        },
      ],
      discussions: [
        {
          id: 4,
          title: "When does optimization matter?",
          message: "Discuss a case where algorithmic efficiency affects users.",
          todo_date: "2026-09-10T18:00:00Z",
          html_url: "https://canvas.example/discussion_topics/4",
        },
      ],
    };
  },
};

const previewCards = [
  {
    id: "preview-card-1",
    attachments: [{ url: "https://canvas.example/assignments/1" }],
  },
];
let previewCardSequence = 2;

const trelloApi = {
  async getLists() {
    return [
      { id: "preview-list-1", name: "Assignments" },
      { id: "preview-list-2", name: "This Week" },
    ];
  },
  async getBoardCards() {
    return previewCards;
  },
  async createCard(assignment) {
    previewCards.push({
      id: `preview-card-${previewCardSequence++}`,
      attachments: assignment.url ? [{ url: assignment.url }] : [],
    });
  },
};

async function initializePreview() {
  const controller = createLoadController({
    document,
    elements,
    canvasApi,
    trelloApi,
    loadCredentials: async () => ({
      domain: "preview.instructure.com",
      token: "preview-token",
    }),
    closeModal: () => {},
  });

  await controller.initialize();
  elements.courseSelect.value = "preview-course";
  await controller.loadAssignments("preview-course");
}

initializePreview();
