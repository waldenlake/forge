#!/usr/bin/env bash
# Install Forge skills for OpenCode
# This copies skill files to ~/.config/opencode/skills/ where OpenCode can discover them.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILLS_SOURCE="${FORGE_ROOT}/skills"

# Determine target directory
TARGET_DIR="${HOME}/.config/opencode/skills"

echo "Installing Forge skills to: ${TARGET_DIR}"
echo ""

# Create target directory if needed
mkdir -p "${TARGET_DIR}"

# List of skills to install
SKILLS=(
  "using-forge"
  "start"
  "next"
  "resume"
  "done"
  "bugfix"
  "scenarios"
  "progress-tracking"
  "session-handoff"
)

for skill in "${SKILLS[@]}"; do
  src="${SKILLS_SOURCE}/${skill}"
  dest="${TARGET_DIR}/${skill}"

  if [ -d "${dest}" ]; then
    echo "  Updating: ${skill}"
    rm -rf "${dest}"
  else
    echo "  Installing: ${skill}"
  fi

  cp -r "${src}" "${dest}"
done

echo ""
echo "✓ Forge skills installed (${#SKILLS[@]} skills)"
echo ""
echo "Verify in OpenCode: use skill tool to list skills"
echo "You should see forge skills like 'using-forge', 'start', 'next', etc."
