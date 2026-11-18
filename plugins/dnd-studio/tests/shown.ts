// Test helper: what a drawing shows as text, a graphical pill included (a pill is an Svg image there; its text is the
// Svg's `alt`).
type Found = { type: string; text: string; props: Record<string, unknown> };
type Ui = { findAll: (q: { type?: string }) => Promise<Found[]> };

/** Every Text's text and every Svg's `alt`, in document order per kind. */
export async function shownTexts(ui: Ui): Promise<string[]> {
  const texts = (await ui.findAll({ type: "Text" })).map((x) => x.text);
  const alts = (await ui.findAll({ type: "Svg" })).map((x) =>
    String(x.props.alt ?? ""),
  );
  return [...texts, ...alts];
}

/**
 * The first shown text equal to `text` (a pill's mark before it allowed: "■ gestoppt") or matching the RegExp, as
 * `{ text }`, like `ui.find({ type: 'Text', text })`.
 */
export async function findShown(
  ui: Ui,
  text: string | RegExp,
): Promise<{ text: string } | undefined> {
  const hit = (await shownTexts(ui)).find((t) =>
    typeof text === "string"
      ? t === text || t.endsWith(` ${text}`)
      : text.test(t),
  );
  return hit === undefined ? undefined : { text: hit };
}
