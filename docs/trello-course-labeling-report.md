# Trello course labeling report

Date: 2026-09-04

## Executive conclusion

Yes. This Power-Up can create a board label for a Canvas course when needed and assign that label to each imported card automatically. The native Trello REST API supports the complete workflow:

1. Read the board's existing labels.
2. Reuse the label whose canonical course key matches the Canvas course.
3. Create the label if it does not exist.
4. Add the label while creating the card, or immediately afterward.

The cleanest importer design is to include the label ID in the card-creation request. Trello's card-create endpoint accepts `idLabels`, and the card-label endpoints also support adding and removing labels after creation.

For a visible course marker without native Trello labels, this project already has the better lightweight option: the `card-badges` capability displays the course name on the front of the card. A hybrid of a native label plus a course badge is the strongest overall design: labels support Trello filtering and organization, while the badge makes the course readable at a glance.

## What the official Trello documentation supports

### Native labels

The REST API documents these relevant operations:

| Need | Endpoint | Notes |
| --- | --- | --- |
| List board labels | `GET /1/boards/{id}/labels` | Use this to find an existing course label by a stable key. |
| Create board label | `POST /1/boards/{id}/labels` | Requires `name` and `color`. |
| Create and attach label in one step | `POST /1/cards/{id}/labels` | Requires a color; accepts a name. |
| Add existing label to card | `POST /1/cards/{id}/idLabels` | Pass the label ID as the `value` query parameter. |
| Remove label from card | `DELETE /1/cards/{id}/idLabels/{idLabel}` | Useful if a card's course is corrected. |
| Add labels during card creation | `POST /1/cards` | The card-create API accepts an `idLabels` array. |

The practical implementation should use a stable course key rather than relying only on the display name. For example, use `canvas:{domain}:{courseId}` in the Power-Up's board-level mapping, while naming the visible label with a short course code or course name. This avoids accidental duplicate labels when a course is renamed.

The REST API client in a Power-Up supplies the Trello authorization flow, but the actual label calls are REST API calls. The member must authorize the Power-Up with `read,write`; the Power-Up must be initialized with its `appKey` and `appName`; and the current member must have permission to write to the board and cards. The project's existing `src/js/trello-api.mjs` already obtains the REST client, checks authorization, requests `read,write`, and performs authenticated `fetch` calls, so the label work fits its current architecture.

### Front-of-card badges

The `card-badges` capability is specifically intended for quick, glanceable information on the front of cards. A badge can return text, an icon, a Trello badge color, and optionally a dynamic function. Dynamic badges can be refreshed by Trello, with a documented minimum refresh interval of 10 seconds.

A badge is presentation supplied by the Power-Up; it is not a native Trello label. It therefore does not provide the same label filtering, label-management, or persistent taxonomy. It is a good fit when the course can be derived from the Canvas URL attached to the card and when the user mainly wants the course visible without opening the card.

### Custom fields shown on the card front

Custom Fields are another native Trello data model. The API supports:

- a board-level custom-field definition;
- `text`, `list`, `checkbox`, `date`, and `number` field types;
- list-field options that can be created and updated;
- card-level values through `customFieldItems`; and
- a `display/cardFront` setting to show the field on the front of cards.

For this use case, a single board field named `Course` is preferable to one field per course. A `text` field avoids maintaining a course-option list; a `list` field gives controlled values and colored options but requires the importer to create or reconcile an option for every course. The Custom Fields Power-Up must be enabled on the board, and the member needs write access. This is the best native alternative when the course should be durable card data and visible on the front, but it adds more setup and API calls than labels or badges.

### Other display locations

- `card-detail-badges` displays dynamic or interactive values at the top of the card back. It is useful for a clickable course link or richer controls, but it does not satisfy a front-of-card requirement.
- `card-back-section` renders a custom iframe on the card back. It can show full Canvas course and assignment details, but it is not a front-card tag.
- A course prefix in the card name, such as `[BIO 101] Lab report`, is simple, persistent, searchable text, but it changes the card title and is less visually clean than a label or badge.
- Trello's organization tags are not a substitute for card labels. The REST API documents organization tags/collections and board `idTags`, but the label endpoints are the card-level mechanism relevant to this importer.

## Findings in this repository

The current code already has most of the required foundation:

- `src/js/trello-api.mjs` creates cards through `POST /1/cards`, using the Power-Up REST client and a write-authorized token.
- `src/js/load-controller.mjs` calls `trelloApi.createCard(assignment, listId)` for each selected assignment.
- `src/js/assignment-mapper.mjs` produces assignment objects, but those objects do not currently retain the selected Canvas course ID or course name.
- `src/js/connector.js` already implements `card-badges`. It parses the Canvas assignment URL, calls Canvas for the course name, and returns that name as a blue dynamic badge.
- The existing badge callback also returns a placeholder static badge (`text: "static"`), which should be removed if the course badge is adopted as the primary display.

## Recommended implementation

### Option A: native labels during import — recommended baseline

Add a label-management layer to the importer:

1. Preserve `courseId`, `courseName`, and Canvas domain when loading a course's assignments.
2. Read the current board ID and board labels once per import session.
3. Resolve a deterministic course key, for example `canvas:{domain}:{courseId}`.
4. Reuse a matching label or create one with a deterministic color from Trello's supported palette.
5. Pass the resolved label ID as `idLabels` in each card-create request.
6. Cache the label map for the session and serialize label creation so two simultaneous imports cannot create duplicate labels.

Conceptually, the card request becomes:

```js
{
  name: assignment.name,
  idList: listId,
  idLabels: [courseLabelId],
  desc: description,
  due: dueDate,
  urlSource: assignment.url
}
```

Use short, human-friendly label names. If there are more courses than useful colors, repeat colors deterministically; the label name and ID remain the source of truth. Do not delete or rename unrelated user-created labels during reconciliation.

### Option B: front badge — lowest-friction display

Keep the existing `card-badges` approach, but return only the course badge and make the fallback explicit when Canvas credentials or the assignment URL are unavailable. This requires no native label setup and already works from the assignment attachment URL. Its tradeoff is that the badge is computed UI, not a native card property, and it depends on the Canvas request succeeding when Trello renders the badge.

### Option C: one `Course` custom field — durable front-card metadata

Create one board-level `Course` field with `display/cardFront: true`, then set its value on each imported card. Prefer a `text` field if Canvas courses can change and the importer should never have to maintain a second option catalog. Prefer a `list` field if controlled values and option colors are important.

### Best overall choice

Implement Option A and retain a cleaned-up version of Option B. The native label makes the board usable with Trello's label workflows; the badge supplies a readable course name even when labels are collapsed. Add Option C only if the course needs to be editable as structured card data or if the user wants a native field visible on the card front.

## Risks and design considerations

- Authorization: label and custom-field writes require the REST client and `read,write` consent. Authorization should be initiated from a user click in an iframe, as Trello documents, rather than from a capability handler.
- Permissions: handle a read-only board/card gracefully and report that automatic labeling was skipped; do not make card import fail if labeling is optional.
- Duplicate labels: match by a stable Canvas course ID/domain key, not only by a mutable course name.
- Renamed courses: decide whether to update the existing label name or preserve it. Updating is convenient but changes the label for all cards using it; preserving the label avoids unexpected historical changes.
- API volume: fetch board labels once, cache them, and create at most one label per course per import session.
- Data freshness: a dynamic badge can change when Trello re-runs it; a native label or custom field is more durable.
- Multiple Canvas domains: include the domain in the key because numeric course IDs can collide across domains.

## Official documentation

- [Power-Up capabilities](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/)
- [`card-badges`](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-badges/)
- [`card-detail-badges`](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-detail-badges/)
- [Power-Up REST API client and authorization](https://developer.atlassian.com/cloud/trello/power-ups/rest-api-client/)
- [Trello board label endpoints](https://developer.atlassian.com/cloud/trello/rest/api-group-boards/)
- [Trello card label endpoints and card creation](https://developer.atlassian.com/cloud/trello/rest/api-group-cards/)
- [Trello label endpoints](https://developer.atlassian.com/cloud/trello/rest/api-group-labels/)
- [Custom Fields guide](https://developer.atlassian.com/cloud/trello/guides/rest-api/getting-started-with-custom-fields/)
- [Custom Fields REST API](https://developer.atlassian.com/cloud/trello/rest/api-group-customfields/)
