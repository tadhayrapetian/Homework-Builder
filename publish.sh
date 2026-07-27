#!/bin/bash
# Publish the latest Worksheet Studio to GitHub Pages.
# Usage: ./publish.sh ["optional commit message"]
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$REPO_DIR/../Worksheet Studio.html"
MSG="${1:-Update Worksheet Studio}"

if [ ! -f "$SOURCE" ]; then
  echo "❌ Source file not found: $SOURCE"
  exit 1
fi

cp "$SOURCE" "$REPO_DIR/index.html"
cd "$REPO_DIR"

if git diff --quiet && git diff --cached --quiet; then
  echo "✅ No changes to publish — the live site is already up to date."
  exit 0
fi

git add -A
git commit -q -m "$MSG"
git push -q origin main

echo "✅ Published. Live in ~1 minute:"
echo "   https://tadhayrapetian.github.io/Homework-Builder/"
