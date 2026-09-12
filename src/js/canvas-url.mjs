const CANVAS_PATH =
  /^\/courses\/(\d+)\/(assignments|quizzes|discussion_topics)\/(\d+)\/?$/;
const CANVAS_DOMAIN =
  /^(?:[\w-]+\.instructure\.com|canvas\.[\w.-]+\.[\w]+)$/;

export function isValidCanvasDomain(domain) {
  return typeof domain === "string" && CANVAS_DOMAIN.test(domain);
}

export function parseCanvasUrl(value, expectedDomain) {
  if (!value || !expectedDomain) return null;

  let url;
  let domain;
  try {
    url = new URL(value);
    domain = new URL(
      expectedDomain.includes("://")
        ? expectedDomain
        : `https://${expectedDomain}`,
    ).hostname;
  } catch (_error) {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== domain) return null;

  const match = CANVAS_PATH.exec(url.pathname);
  if (!match) return null;

  const [, courseId, type, itemId] = match;
  return {
    courseId,
    itemId,
    type,
    canonicalUrl: `https://${url.hostname}/courses/${courseId}/${type}/${itemId}`,
  };
}
