#!/bin/sh
set -eu

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$PLUGIN_DIR/cli"
PROJECT_DIR="$(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20+ required"
  exit 1
fi

cd "$CLI_DIR"
npm install --production=false
npm run build

FORGE_BIN="$PROJECT_DIR/.forge/bin/forge"
mkdir -p "$PROJECT_DIR/.forge/bin"
cat > "$FORGE_BIN" << EOF
#!/bin/sh
node "$CLI_DIR/dist/index.js" "\$@"
EOF
chmod +x "$FORGE_BIN"

echo "forge CLI installed: $FORGE_BIN"
node "$CLI_DIR/dist/index.js" --version-json
