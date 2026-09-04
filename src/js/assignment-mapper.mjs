const SUBMITTED_WORKFLOW_STATES = new Set([
  "submitted",
  "graded",
  "pending_review",
]);

export function isSubmitted(submission) {
  return (
    Boolean(submission?.submitted_at) ||
    SUBMITTED_WORKFLOW_STATES.has(submission?.workflow_state)
  );
}

export function mergeCourseItems({ assignments, quizzes, discussions }) {
  const items = [];
  const discussionAssignmentIds = new Set(
    discussions
      .filter((discussion) => discussion.assignment_id != null)
      .map((discussion) => String(discussion.assignment_id)),
  );
  const assignmentIds = new Set(
    assignments
      .filter((assignment) => assignment.id != null)
      .map((assignment) => String(assignment.id)),
  );
  const quizAssignmentIds = new Set(
    assignments
      .filter((assignment) => assignment.quiz_id != null)
      .map((assignment) => String(assignment.quiz_id)),
  );

  for (const assignment of assignments) {
    if (!assignment.name) continue;

    const isDiscussion =
      assignment.submission_types?.includes("discussion_topic") ||
      Boolean(assignment.discussion_topic) ||
      discussionAssignmentIds.has(String(assignment.id));
    const isQuiz =
      !isDiscussion &&
      (assignment.is_quiz_assignment ||
        assignment.quiz_id != null ||
        assignment.submission_types?.includes("online_quiz"));

    items.push({
      name: assignment.name,
      description: assignment.description || "",
      due_at: assignment.due_at,
      submitted: isSubmitted(assignment.submission),
      assignmentBacked: true,
      type: isDiscussion ? "discussion" : isQuiz ? "quiz" : "assignment",
      url: assignment.html_url,
    });
  }

  for (const quiz of quizzes) {
    if (quizAssignmentIds.has(String(quiz.id))) continue;
    if (!quiz.due_at) continue;

    items.push({
      name: quiz.title,
      description: quiz.description || "",
      due_at: quiz.due_at,
      submitted: false,
      assignmentBacked: false,
      type: "quiz",
      url: quiz.html_url,
    });
  }

  for (const discussion of discussions) {
    if (
      discussion.assignment_id != null &&
      assignmentIds.has(String(discussion.assignment_id))
    ) {
      continue;
    }

    const due = discussion.assignment?.due_at || discussion.todo_date;
    if (!due) continue;

    items.push({
      name: discussion.title,
      description: discussion.message || "",
      due_at: due,
      submitted: false,
      assignmentBacked: false,
      type: "discussion",
      url: discussion.html_url,
    });
  }

  return items.sort(compareDueDates).map((item, sourceIndex) => ({
    ...item,
    sourceIndex,
  }));
}

export function filterVisibleAssignments(
  assignments,
  hideCompleted,
  type = "all",
  weekStart = "",
  hideImported = false,
  importedUrls = new Set(),
) {
  const normalizedWeekStart = weekStart ? parseDateOnly(weekStart) : null;
  const weekEnd = normalizedWeekStart
    ? addDays(normalizedWeekStart, 7)
    : null;

  return assignments.filter((assignment) => {
    if (
      hideCompleted &&
      assignment.assignmentBacked &&
      assignment.submitted
    ) {
      return false;
    }

    if (type !== "all" && assignment.type !== type) return false;

    if (hideImported && assignment.url && importedUrls.has(assignment.url)) {
      return false;
    }

    if (normalizedWeekStart) {
      const dueDate = parseCanvasDate(assignment.due_at);
      if (!dueDate || dueDate < normalizedWeekStart || dueDate >= weekEnd) {
        return false;
      }
    }

    return true;
  });
}

export function getMonday(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = monday.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

export function formatDateOnly(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function toTrelloDescription(description) {
  return description
    ? description
        .replace(/<h([1-6])>/g, (_, level) => "#".repeat(+level) + " ")
        .replace(/<[^>]*>/g, "")
    : "";
}

function compareDueDates(left, right) {
  if (!left.due_at && !right.due_at) return 0;
  if (!left.due_at) return 1;
  if (!right.due_at) return -1;
  return new Date(left.due_at) - new Date(right.due_at);
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseCanvasDate(value) {
  if (!value) return null;
  const date = parseDateOnly(value) || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
