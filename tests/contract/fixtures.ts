import type { RoundTrip } from "./round-trip";

/**
 * One realistic request body per redacting site, of the type that site's
 * transport actually delivers.
 *
 * Existing handler tests hand a `FormData` straight to a handler that would
 * never receive one, because capture flattened it first. Those fixtures prove
 * the extractor parses a shape, not that the shape ever arrives. These must
 * be the real thing.
 *
 * A site appears here in the same commit that gives it a working write-back.
 */
export const FIXTURES: Record<string, RoundTrip> = {
  grok: {
    body: JSON.stringify({ message: "my ssn is 123-45-6789", modelName: "grok-3" }),
    redacted: ["my ssn is [REDACTED]"],
  },
  claude: {
    body: JSON.stringify({ prompt: "my ssn is 123-45-6789", model: "claude-3-5-sonnet" }),
    redacted: ["my ssn is [REDACTED]"],
  },
  deepseek: {
    body: JSON.stringify({ prompt: "my ssn is 123-45-6789", ref_file_ids: [] }),
    redacted: ["my ssn is [REDACTED]"],
  },
  poe: {
    body: JSON.stringify({ queryName: "sendMessageMutation",
                           variables: { query: "my ssn is 123-45-6789", bot: "a2" } }),
    redacted: ["my ssn is [REDACTED]"],
  },
  you: {
    body: JSON.stringify({ query: "my ssn is 123-45-6789", chatId: "x" }),
    redacted: ["my ssn is [REDACTED]"],
  },
  perplexity: {
    body: JSON.stringify({ query_str: "my ssn is 123-45-6789", params: { mode: "concise" } }),
    redacted: ["my ssn is [REDACTED]"],
  },
  chatgpt: {
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ content: { parts: ["my ssn is 123-45-6789"] } }],
    }),
    redacted: ["my ssn is [REDACTED]"],
  },
  gemini: {
    // Gemini sends form-encoded `f.req` with nested JSON inside it.
    body: new URLSearchParams({
      "f.req": JSON.stringify([null, JSON.stringify([["my ssn is 123-45-6789"]])]),
    }).toString(),
    redacted: ["my ssn is [REDACTED]"],
  },
  glean: {
    body: JSON.stringify({
      messages: [{ fragments: [{ text: "my ssn is 123-45-6789" }] }],
    }),
    redacted: ["my ssn is [REDACTED]"],
  },
  meta: {
    // A real FormData — the type the transport actually delivers, which the
    // content script used to flatten to "[object FormData]".
    body: (() => {
      const f = new FormData();
      f.append("variables", JSON.stringify({
        message: { sensitive_string_value: "my ssn is 123-45-6789" },
      }));
      return f;
    })(),
    redacted: ["my ssn is [REDACTED]"],
  },
  aistudio: {
    // data[1] -> last -> [0][0][1] is where the prompt sits.
    body: JSON.stringify([null, [[[[null, "my ssn is 123-45-6789"]]]]]),
    redacted: ["my ssn is [REDACTED]"],
  },
};
