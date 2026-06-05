/**
 * OpenCode plugin hook for forge context management (Chain A).
 *
 * Registers a session.idle event listener that, when the run-loop returns
 * a `handoff-session` action, executes the SDK three-step sequence:
 *   1. tui.executeCommand("session.new")
 *   2. appendPrompt("/resume")
 *   3. submitPrompt()
 *
 * This script is loaded by OpenCode's plugin system from:
 *   .opencode/plugins/forge.js
 *
 * Prerequisites:
 *   - forge CLI on PATH or installed at ~/.config/opencode/plugins/forge/
 *   - .forge/config.json with context_management.enabled: true
 *
 * Failure behavior: any error is caught and logged; the session continues
 * without handoff (degraded to Chain B / manual compact).
 */

module.exports = function forgeContextManager(sdk) {
  // Only activate if forge signals a handoff is needed.
  // The signal is read from a sentinel file written by the run-loop
  // when it returns action: "handoff-session".
  const fs = require("fs");
  const path = require("path");

  const HANDOFF_SIGNAL = ".forge/handoff-signal.json";

  sdk.on("session.idle", async () => {
    try {
      const cwd = process.cwd();
      const signalPath = path.join(cwd, HANDOFF_SIGNAL);

      if (!fs.existsSync(signalPath)) return;

      const signal = JSON.parse(fs.readFileSync(signalPath, "utf8"));
      if (signal.action !== "handoff-session") return;

      // Clear signal immediately to prevent re-trigger
      fs.unlinkSync(signalPath);

      // SDK three-step: new session → inject /resume → submit
      await sdk.tui.executeCommand("session.new");

      // Small delay to ensure the new session is initialized
      await new Promise((resolve) => setTimeout(resolve, 300));

      await sdk.appendPrompt("/resume");
      await sdk.submitPrompt();
    } catch (err) {
      // Non-fatal: log and degrade to manual /compact
      console.error("[forge context-manager] handoff failed:", err.message);
    }
  });
};
