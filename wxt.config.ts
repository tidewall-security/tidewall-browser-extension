import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Tidewall",
    description: "Monitor, redact, and block prompts to AI chat sites.",
    version: "0.1.0",
    permissions: ["alarms", "storage", "tabs"],
    host_permissions: ["http://localhost/*", "https://*/*"],
    web_accessible_resources: [
      {
        resources: ["/capture.js"],
        matches: ["<all_urls>"],
      },
    ],
  },
  webExt: {
    startUrls: ["https://chatgpt.com"],
  },
});
