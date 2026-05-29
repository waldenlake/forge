// Single source of truth for the Forge CLI runtime version.
// Update this constant when releasing a new CLI version; init.ts and
// state/config.ts both read from here so the two cannot drift.
export const FORGE_CLI_VERSION = "0.2.0";
