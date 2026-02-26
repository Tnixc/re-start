#!/bin/bash
set -eou pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOST_DIR="$PROJECT_DIR/native-host"
BUILD_DIR="$HOST_DIR/build"
BINARY_NAME="apple-reminders-host"
BINARY_PATH="$BUILD_DIR/$BINARY_NAME"
HOST_NAME="com.restart.apple_reminders"

CHROME_NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo "Building native host..."
mkdir -p "$BUILD_DIR"
bun build --compile "$HOST_DIR/src/index.ts" --outfile "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo "Installing native messaging manifest..."
mkdir -p "$CHROME_NMH_DIR"

# Write manifest with correct absolute path
cat > "$CHROME_NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Native messaging host for Apple Reminders integration",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://pcfmojgkkbhkoikeflglafkgnopemeii/"]
}
EOF

echo "Done."
echo "  Binary: $BINARY_PATH"
echo "  Manifest: $CHROME_NMH_DIR/$HOST_NAME.json"
