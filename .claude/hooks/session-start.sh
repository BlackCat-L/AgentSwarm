#!/usr/bin/env bash
# SessionStart hook — 注入上下文 + 读取上轮审计结果
set -u

echo "Session: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Branch:  $(git branch --show-current 2>/dev/null || echo 'N/A')"
echo "Recent:  $(git log --oneline -3 2>/dev/null | tr '\n' ' ' || echo 'N/A')"

# 读取上轮质量门结果
AUDIT_FILE=".claude/session-audit.json"
if [ -f "$AUDIT_FILE" ]; then
    echo ""
    echo "=== 上轮审计结果 ==="
    cat "$AUDIT_FILE" 2>/dev/null | while IFS= read -r line; do
        echo "  $line"
    done

    # 检查警告项
    if grep -q '"changed_file_count": [1-9]' "$AUDIT_FILE" 2>/dev/null; then
        echo "  ⚠️  上轮有未提交改动 — 确认是否需要在本次处理"
    fi
    if grep -q '"learnings_logged_today": false' "$AUDIT_FILE" 2>/dev/null; then
        echo "  ⚠️  上轮未记录学习日志 — 如有遗漏，本次补记"
    fi
    if grep -q '"bak_file_count": [1-9]' "$AUDIT_FILE" 2>/dev/null; then
        echo "  ⚠️  上轮残留 .bak 文件 — 建议清理"
    fi
else
    echo "  (无上轮审计记录 — 首次运行或上轮未正常结束)"
fi
