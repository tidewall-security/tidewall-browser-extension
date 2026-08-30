/**
 * Every `ExtractionOutcome` kind that is declared should be produced.
 *
 * `uninspectablePrompt` — the only kind that fails CLOSED — has been declared,
 * handled in `planExtraction`, and returned by nothing since the day it was
 * written. Nobody noticed, because unreachable code does not fail. Meanwhile
 * an extractor failure becomes `notPrompt`, which passes, so a prompt on a
 * guarded site whose format drifts is sent unguarded.
 *
 * That is issue #17 and it is not fixed here. What is fixed is that it can
 * never happen again silently: this asserts the set of unproduced kinds is
 * EXACTLY what we expect, so it fails if a new kind is added without a
 * producer, if the known gap is closed without updating this list, or if a
 * kind that is produced today quietly loses its producer.
 *
 * Production code only. A kind produced solely by a test is not reachable in
 * the product, which is the property that matters.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");

/** The kinds the union declares, read from the declaration itself. */
function declaredKinds(): string[] {
  const types = readFileSync(join(ROOT, "lib/types.ts"), "utf8");
  const union = types.slice(types.indexOf("export type ExtractionOutcome"));
  // Bounded by the NEXT declaration, not by the first semicolon: the union's
  // own members contain semicolons (`{ kind: "prompt"; prompts: string[] }`),
  // so cutting at the first one found two of the four and would have reported
  // a clean sweep over a fragment.
  const end = union.slice(1).search(/\n(export|interface|type|\/\*\*)/);
  const body = end > 0 ? union.slice(0, end + 1) : union;
  return [...new Set([...body.matchAll(/kind:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]))];
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const full = join(ROOT, dir, name);
    if (statSync(full).isDirectory()) continue;
    if (!name.endsWith(".ts")) continue;
    out.push(full);
  }
  return out;
}

/** Kinds a `kind: "..."` literal returns somewhere in shipped code. */
function producedKinds(): Set<string> {
  const produced = new Set<string>();
  for (const file of [...sourceFiles("handlers"), ...sourceFiles("lib"), ...sourceFiles("entrypoints")]) {
    // The declaration is not a producer.
    if (file.endsWith("lib/types.ts")) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/kind:\s*"([a-zA-Z]+)"/g)) {
      produced.add(m[1]);
    }
  }
  return produced;
}

/**
 * Known unproduced, with the issue that tracks it.
 *
 * An exemption list is the thing this project keeps getting bitten by — a rule
 * with silent exceptions. The difference is that this one is asserted for
 * EQUALITY: adding to it or removing from it without saying so fails.
 */
const KNOWN_UNPRODUCED = {
  uninspectablePrompt: "#17 — the fail-closed path has no producer",
};

describe("every declared ExtractionOutcome kind", () => {
  it("was actually found by the scan", () => {
    // Without this the whole file passes vacuously if the union is
    // restructured or the directories move.
    expect(declaredKinds().sort()).toEqual([
      "notPrompt",
      "prompt",
      "uninspectablePrompt",
      "unsupportedPrompt",
    ]);
    expect(producedKinds().size).toBeGreaterThan(2);
  });

  it("is produced by shipped code, except the ones we have written down", () => {
    const produced = producedKinds();
    const unproduced = declaredKinds().filter((k) => !produced.has(k));

    expect(unproduced.sort()).toEqual(Object.keys(KNOWN_UNPRODUCED).sort());
  });

  it("names an issue for each kind we have allowed to stay unproduced", () => {
    // An exemption without a tracking issue is how a gap becomes permanent.
    for (const [kind, why] of Object.entries(KNOWN_UNPRODUCED)) {
      expect(why, `${kind} is exempt but names no issue`).toMatch(/#\d+/);
    }
  });

  it("still routes the unproduced kind to a block, so wiring it up is enough", () => {
    // If someone closes #17 by producing `uninspectablePrompt`, the decision
    // side must already do the right thing with it. It does; this pins that so
    // the two halves cannot drift apart while one of them is dormant.
    const decide = readFileSync(join(ROOT, "lib/decide.ts"), "utf8");
    const branch = decide.slice(decide.indexOf('case "uninspectablePrompt"'));
    expect(branch.slice(0, 120)).toContain('act: "block"');
  });
});
