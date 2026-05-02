/**
 * Popup UI controller — manages the extension popup's three states.
 *
 * The popup displays one of three views based on the device registration state:
 * - **Register** (disconnected) — form to enter server URL, token, and user details
 * - **Pending** (pending) — waiting for admin approval, shows device info
 * - **Connected** (connected/registered) — shows scan stats, activity feed, and device info
 *
 * All communication with the background service worker happens through the
 * typed messaging protocol (`sendMessage`). The popup reads device state from
 * extension storage to determine the initial view, then delegates actions
 * (register, disconnect, getStatus) to the background.
 *
 * @module entrypoints/popup/main
 */

import { sendMessage } from "../../lib/messaging";
import { deviceStatus, userName, userEmail, deviceName, fingerprint, serverUrl } from "../../lib/storage";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const stateRegister = document.getElementById("state-register")!;
const statePending = document.getElementById("state-pending")!;
const stateConnected = document.getElementById("state-connected")!;
const statusSubtitle = document.getElementById("status-subtitle")!;
const logo = document.getElementById("logo")!;
const errorDisplay = document.getElementById("error-display")!;

const form = document.getElementById("register-form") as HTMLFormElement;
const inputServer = document.getElementById("input-server") as HTMLInputElement;
const inputToken = document.getElementById("input-token") as HTMLInputElement;
const inputName = document.getElementById("input-name") as HTMLInputElement;
const inputEmail = document.getElementById("input-email") as HTMLInputElement;
const inputDevice = document.getElementById("input-device") as HTMLInputElement;

const statScans = document.getElementById("stat-scans")!;
const statBlocks = document.getElementById("stat-blocks")!;
const statTransforms = document.getElementById("stat-transforms")!;
const activityList = document.getElementById("activity-list")!;
const connectedInfo = document.getElementById("connected-info")!;
const pendingInfo = document.getElementById("pending-info")!;

const btnDisconnectPending = document.getElementById("btn-disconnect-pending")!;
const btnDisconnectConnected = document.getElementById("btn-disconnect-connected")!;

// ── State management ──────────────────────────────────────────────────────────

/** Hide all state panels and the error display. */
function hideAll(): void {
  stateRegister.style.display = "none";
  statePending.style.display = "none";
  stateConnected.style.display = "none";
  errorDisplay.style.display = "none";
}

/** Show the registration form (disconnected state). */
function showRegister(): void {
  hideAll();
  stateRegister.style.display = "block";
  statusSubtitle.textContent = "Disconnected";
  logo.classList.add("gray");
}

/** Show the pending approval panel with device info. */
async function showPending(): Promise<void> {
  hideAll();
  statePending.style.display = "block";
  statusSubtitle.textContent = "Pending Approval";
  logo.classList.remove("gray");

  const name = (await userName.getValue()) ?? "";
  const email = (await userEmail.getValue()) ?? "";
  const device = (await deviceName.getValue()) ?? "";
  const fp = (await fingerprint.getValue()) ?? "";

  pendingInfo.innerHTML = [
    `<strong>Name:</strong> ${escapeHtml(name)}`,
    `<strong>Email:</strong> ${escapeHtml(email)}`,
    `<strong>Device:</strong> ${escapeHtml(device)}`,
    `<strong>Fingerprint:</strong> ${escapeHtml(fp.slice(0, 8))}...`,
  ].join("<br>");
}

/** Show the connected dashboard with scan stats, activity feed, and device info. */
async function showConnected(): Promise<void> {
  hideAll();
  stateConnected.style.display = "block";
  statusSubtitle.textContent = "Connected";
  logo.classList.remove("gray");

  try {
    const status = await sendMessage("getStatus", undefined);

    statScans.textContent = String(status.scanCount);
    statBlocks.textContent = String(status.blockCount);
    statTransforms.textContent = String(status.transformCount);

    // Activity list
    if (status.recentActivity.length === 0) {
      activityList.innerHTML = '<li class="activity-empty">No activity yet</li>';
    } else {
      activityList.innerHTML = status.recentActivity
        .map((entry) => {
          const time = formatTime(entry.time);
          return `<li>
            <span class="status-badge ${entry.status}"></span>
            <span class="activity-site">${escapeHtml(entry.site)}</span>
            <span class="activity-status">${entry.status}</span>
            <span class="activity-time">${time}</span>
          </li>`;
        })
        .join("");
    }

    // Device info
    const name = (await userName.getValue()) ?? "";
    const email = (await userEmail.getValue()) ?? "";
    const device = (await deviceName.getValue()) ?? "";
    const server = (await serverUrl.getValue()) ?? "";
    const policy = status.policyName || "N/A";

    connectedInfo.innerHTML = [
      `<strong>Server:</strong> ${escapeHtml(server)}`,
      `<strong>User:</strong> ${escapeHtml(name)} (${escapeHtml(email)})`,
      `<strong>Device:</strong> ${escapeHtml(device)}`,
      `<strong>Policy:</strong> ${escapeHtml(policy)}`,
    ].join("<br>");
  } catch (err) {
    console.error("[Tidewall] Failed to get status:", err);
  }
}

// ── Form handler ──────────────────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorDisplay.style.display = "none";

  const btn = form.querySelector("button[type=submit]") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Registering...";

  try {
    const result = await sendMessage("register", {
      serverUrl: inputServer.value.trim(),
      rtToken: inputToken.value.trim(),
      userName: inputName.value.trim(),
      userEmail: inputEmail.value.trim(),
      deviceName: inputDevice.value.trim(),
      fingerprint: "",
    });

    if (!result.success) {
      errorDisplay.textContent = result.error ?? "Registration failed";
      errorDisplay.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Register";
      return;
    }

    // Re-read status to determine which view to show
    await init();
  } catch (err) {
    errorDisplay.textContent =
      err instanceof Error ? err.message : "Registration failed";
    errorDisplay.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Register";
  }
});

// ── Disconnect handlers ───────────────────────────────────────────────────────

btnDisconnectPending.addEventListener("click", async () => {
  await sendMessage("disconnect", undefined);
  showRegister();
});

btnDisconnectConnected.addEventListener("click", async () => {
  await sendMessage("disconnect", undefined);
  showRegister();
});

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into HTML.
 *
 * @param str - The raw string to escape
 * @returns HTML-escaped string safe for innerHTML
 */
function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format a Unix timestamp as a relative time string (e.g., "just now", "5m ago", "2h ago").
 *
 * @param ts - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialize the popup by reading the device status and rendering the appropriate view.
 * Called once on popup open and again after successful registration.
 */
async function init(): Promise<void> {
  const status = (await deviceStatus.getValue()) ?? "disconnected";

  switch (status) {
    case "connected":
    case "registered":
      await showConnected();
      break;
    case "pending":
      await showPending();
      break;
    default:
      showRegister();
      break;
  }
}

init();
