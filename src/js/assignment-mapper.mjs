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

export function filterVisibleAssignments(assignments, hideCompleted) {
  if (!hideCompleted) return assignments;

  return assignments.filter(
    (assignment) => !assignment.assignmentBacked || !assignment.submitted,
  );
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
