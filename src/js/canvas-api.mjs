export function createCanvasApi({ socket, getCredentials }) {
  let requestSequence = 0;

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
        fetchCollection(
          buildCanvasUrl(`/api/v1/courses/${courseId}/assignments`, {
            per_page: "100",
            "include[]": "submission",
          }),
        ),
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

  return { fetchCollection, getCourses, getCourseItems };
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
