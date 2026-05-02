import { describe, it, expect } from "vitest";
import { SITE_REGISTRY, getAllUrlPatterns, getAliasMap } from "../../lib/constants";

describe("SITE_REGISTRY", () => {
  it("has 37 site entries", () => {
    expect(Object.keys(SITE_REGISTRY).length).toBe(37);
  });

  it("each entry has name, alias, and urlMatch", () => {
    for (const [key, entry] of Object.entries(SITE_REGISTRY)) {
      expect(entry.name, `${key} missing name`).toBeTruthy();
      expect(entry.alias, `${key} missing alias`).toBeTruthy();
      expect(entry.urlMatch.length, `${key} missing urlMatch`).toBeGreaterThan(0);
    }
  });

  it("aliases are unique", () => {
    const aliases = Object.values(SITE_REGISTRY).map((e) => e.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("getAllUrlPatterns", () => {
  it("returns a flat array of all URL patterns", () => {
    const patterns = getAllUrlPatterns();
    expect(patterns.length).toBeGreaterThan(37);
    expect(patterns.every((p) => typeof p === "string")).toBe(true);
  });

  it("all patterns are valid Chrome match patterns", () => {
    const patterns = getAllUrlPatterns();
    for (const p of patterns) {
      expect(p).toMatch(/^\*:\/\//);
    }
  });
});

describe("getAliasMap", () => {
  it("maps alias to registry key for all entries", () => {
    const map = getAliasMap();
    expect(Object.keys(map).length).toBe(37);
  });

  it("maps known aliases correctly", () => {
    const map = getAliasMap();
    expect(map["chatgpt"]).toBe("chatgpt.com");
    expect(map["claude"]).toBe("claude.ai");
    expect(map["gemini"]).toBe("gemini.google.com");
    expect(map["copilot"]).toBe("copilot.microsoft.com");
  });
});
