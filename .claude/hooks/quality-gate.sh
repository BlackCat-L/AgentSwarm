#!/usr/bin/env bash
# Stop hook — 会话结束前质量检查 + 写入审计文件供下轮验证
set -u

AUDIT_FILE=".claude/session-audit.json"
TIMESTAMP=$(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S)

# 检查项
changed=$(git diff --name-only HEAD 2>/dev/null | wc -l)
bak_count=$(find . -maxdepth 3 -name "*.bak" -not -path "./.git/*" 2>/dev/null | wc -l)
today=$(date +%Y-%m-%d)
has_learnings="false"
if [ -f ".learnings/ERRORS.md" ]; then
    if grep -q "$today" .learnings/ERRORS.md 2>/dev/null; then
        has_learnings="true"
    fi
fi

# 输出
echo "Quality Gate: $TIMESTAMP"
echo "  Changed files: $changed"
echo "  .bak files: $bak_count"
echo "  Today learnings: $has_learnings"

# 写入审计文件（JSON）
cat > "$AUDIT_FILE" << EOF
{
  "session_end": "$TIMESTAMP",
  "branch": "$(git branch --show-current 2>/dev/null || echo 'N/A')",
  "changed_file_count": $changed,
  "bak_file_count": $bak_count,
  "learnings_logged_today": $has_learnings,
  "last_commit": "$(git log -1 --format='%h %s' 2>/dev/null || echo 'N/A')"
}
EOF

# 警告
warnings=0
if [ "$bak_count" -gt 0 ]; then
    echo "  WARNING: $bak_count .bak files found"
    warnings=$((warnings + 1))
fi
if [ "$changed" -gt 0 ]; then
    echo "  WARNING: $changed files uncommitted"
    warnings=$((warnings + 1))
fi

if [ "$warnings" -gt 0 ]; then
    echo "  Quality gate: $warnings warning(s)"
else
    echo "  Quality gate: PASS"
fi

exit 0
