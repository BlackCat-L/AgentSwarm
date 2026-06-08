#!/usr/bin/env bash
# 拦截敏感文件编辑 — PreToolUse hook for Edit|Write
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib/common.sh"

file=$(extract_file_path)

if [ -z "$file" ]; then
    exit 0
fi

matched=$(check_patterns "$file" "$DIR/sensitive-patterns.txt" && echo "found" || echo "")
if [ -n "$matched" ]; then
    echo "BLOCKED - sensitive file: $file"
    exit 2
fi

exit 0
