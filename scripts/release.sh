#!/bin/bash
set -e

BUMP=${1:-patch}

pnpm build
pnpm typecheck
pnpm test

pnpm -r exec npm version "$BUMP" --no-git-tag-version
VERSION=$(node -p "require('./packages/relate/package.json').version")

git add -A
git commit -m "v$VERSION"
git tag "v$VERSION"

echo ""
echo "Ready! Run: git push && git push --tags"
