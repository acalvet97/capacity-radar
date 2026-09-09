/**
 * Canonical result type for server actions.
 *
 * Payload fields are intersected onto the success variant rather than nested
 * under a `data` key, so callers read `result.phase` after a single `result.ok`
 * check. This matches every existing action's shape.
 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; message: string };
