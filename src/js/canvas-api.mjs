import { parseCanvasUrl } from "./canvas-url.mjs";
import { isSubmitted } from "./assignment-mapper.mjs";

export function createCanvasApi({ socket, getCredentials }) {
  let requestSequence = 0;
  const courseAssignmentsCache = new Map();

  async function getCourses() {
    const courses = await fetchCollection(
      buildCanvasUrl("/api/v1/courses", {
        enrollment_state: "active",
        "include[]": "term",
      }),
    );

    if (!Array.isArray(courses)) {
      throw new Error("Unexpected response from Canvas API");
    }

    return courses.filter(
      (course) => course.name && course.id && !course.access_restricted_by_date,
    );
  }

  async function getCourseItems(courseId) {
    const [assignmentsResult, quizzesResult, discussionsResult] =
      await Promise.allSettled([
        getCourseAssignmentsWithSubmissions(courseId),
        fetchCollection(
          buildCanvasUrl(`/api/v1/courses/${courseId}/quizzes`, {
            per_page: "100",
          }),
        ),
        fetchCollection(
          buildCanvasUrl(`/api/v1/courses/${courseId}/discussion_topics`, {
            per_page: "100",
          }),
        ),
      ]);

    return {
      assignments: fulfilledArray(assignmentsResult),
      quizzes: fulfilledArray(quizzesResult),
      discussions: fulfilledArray(discussionsResult),
    };
  }

  async function getCompletionForUrl(url) {
    const { domain } = getCredentials();
    const parsed = parseCanvasUrl(url, domain);
    if (!parsed) {
      return {
        state: "unavailable",
        reason: "Unsupported Canvas URL or a different Canvas domain.",
      };
    }

    if (parsed.type === "assignments") {
      const assignment = await fetchJSON(
        buildCanvasUrl(
          `/api/v1/courses/${parsed.courseId}/assignments/${parsed.itemId}`,
          { "include[]": "submission" },
        ),
      );
      return completionFromSubmission(assignment?.submission);
    }

    if (parsed.type === "quizzes") {
      const quizSubmission = await fetchJSON(
        buildCanvasUrl(
          `/api/v1/courses/${parsed.courseId}/quizzes/${parsed.itemId}/submission`,
          { "include[]": "submission" },
        ),
      );
      if (!Array.isArray(quizSubmission?.quiz_submissions)) {
        throw new Error("Unexpected response from Canvas quiz submission API");
      }

      return {
        state: quizSubmission.quiz_submissions.some(isQuizSubmitted)
          ? "complete"
          : "incomplete",
      };
    }

    const assignments = await getCourseAssignmentsWithSubmissions(
      parsed.courseId,
    );
    const discussionAssignment = assignments.find(
      (assignment) =>
        String(assignment.discussion_topic?.id) === String(parsed.itemId),
    );
    if (!discussionAssignment) {
      return {
        state: "unavailable",
        reason: "This discussion has no Canvas submission state.",
      };
    }

    return completionFromSubmission(discussionAssignment.submission);
  }

  async function fetchCollection(url, perPage = 100) {
    const results = [];

    for (let page = 1; ; page++) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set("page", String(page));
      pageUrl.searchParams.set("per_page", String(perPage));

      const pageResults = await serverFetchJSON(pageUrl.toString());
      if (!Array.isArray(pageResults)) {
        throw new Error("Unexpected response from Canvas API");
      }

      results.push(...pageResults);
      if (pageResults.length < perPage) return results;
    }
  }

  function getCourseAssignmentsWithSubmissions(courseId) {
    const cacheKey = String(courseId);
    const cached = courseAssignmentsCache.get(cacheKey);
    if (cached) return cached;

    const request = fetchCollection(
      buildCanvasUrl(`/api/v1/courses/${courseId}/assignments`, {
        per_page: "100",
        "include[]": "submission",
      }),
    );
    courseAssignmentsCache.set(cacheKey, request);
    request.catch(() => {
      if (courseAssignmentsCache.get(cacheKey) === request) {
        courseAssignmentsCache.delete(cacheKey);
      }
    });
    return request;
  }

  function buildCanvasUrl(pathname, searchParams = {}) {
    const { domain, token } = getCredentials();
    const url = new URL(`https://${domain}${pathname}`);
    url.searchParams.set("access_token", token);

    for (const [name, value] of Object.entries(searchParams)) {
      url.searchParams.set(name, value);
    }

    return url.toString();
  }

  function serverFetchJSON(url, options) {
    return new Promise((resolve, reject) => {
      const id = ++requestSequence;
      let settled = false;
      let timeout;

      const cleanup = () => {
        socket.off("fetch-json-response", handleResponse);
        clearTimeout(timeout);
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const handleResponse = (responseId, data) => {
        if (responseId !== id || settled) return;

        settled = true;
        cleanup();
        if (data && data.error) {
          reject(createCanvasError(data.error));
        } else {
          resolve(data);
        }
      };

      timeout = setTimeout(
        () => fail(new Error("Request timeout")),
        30000,
      );
      socket.on("fetch-json-response", handleResponse);
      socket.emit("fetch-json", id, url, options);
    });
  }

  async function fetchJSON(url, options) {
    return serverFetchJSON(url, options);
  }

  return {
    fetchCollection,
    getCompletionForUrl,
    getCourses,
    getCourseItems,
  };
}

function completionFromSubmission(submission) {
  return { state: isSubmitted(submission) ? "complete" : "incomplete" };
}

function isQuizSubmitted(submission) {
  return (
    Boolean(submission?.finished_at) ||
    submission?.workflow_state === "complete" ||
    submission?.workflow_state === "pending_review"
  );
}

function fulfilledArray(result) {
  return result.status === "fulfilled" && Array.isArray(result.value)
    ? result.value
    : [];
}

function createCanvasError(message) {
  const error = new Error(message);
  const status = String(message).match(/HTTP (\d{3})/);
  if (status) error.status = Number(status[1]);
  return error;
}
