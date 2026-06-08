#!/usr/bin/env bash
# 拦截危险命令 — PreToolUse hook for Bash
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib/common.sh"

input=$(cat 2>/dev/null || echo "")
cmd_head=$(echo "$input" | head -c 300)

found=$(check_patterns "$cmd_head" "$DIR/dangerous-patterns.txt" 2>/dev/null || echo "")
if [ -n "$found" ]; then
    echo "BLOCKED: $found"
    exit 2
fi

exit 0
