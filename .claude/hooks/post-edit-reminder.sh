#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook — 代码修改后强制技能提醒
# 跟踪本次会话的文件修改数，超过阈值强力提醒
set -u

COUNTER_FILE=".claude/.edit-count"
THRESHOLD=3

# 提取被修改的文件路径
input=$(cat 2>/dev/null || echo "")
file=$(echo "$input" | grep -o '"file_path"\s*:\s*"[^"]*"' 2>/dev/null | head -1 | grep -o '"[^"]*"$' 2>/dev/null | tr -d '"' 2>/dev/null || echo "")

# 更新计数
touch "$COUNTER_FILE" 2>/dev/null || true
if [ -n "$file" ]; then
    echo "$file" >> "$COUNTER_FILE"
fi

count=$(sort -u "$COUNTER_FILE" 2>/dev/null | wc -l)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ 编码门禁检查（本次会话已改 $count 个文件）"
echo ""

if [ "$count" -ge "$THRESHOLD" ]; then
    echo "🔴 已超过 $THRESHOLD 个文件 — 必须调 Skill(\"auto-agent\") 做任务分解！"
fi

echo "🟡 代码修改完成时必须调 Skill(\"simplify\") 做质量审查。"
echo "🟡 遇到错误/纠正时必须调 Skill(\"self-improving-agent\") 沉淀教训。"
echo "    上述不是建议，是 CLAUDE.md SOUL 第 9 条强制要求。"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
