#!/usr/bin/env bash
# Guard hook 共用库 — pattern-file 读取逻辑
set -u

# 获取 hook 所在目录
hook_dir() {
    cd "$(dirname "$0")" && pwd
}

# 从模式文件逐行读取，检查 text 是否匹配任何模式
# 参数: $1 = 要检查的文本, $2 = 模式文件路径
# 返回: 0 = 找到匹配, 1 = 未找到
check_patterns() {
    local text="$1"
    local patterns_file="$2"

    if [ ! -f "$patterns_file" ]; then
        return 1
    fi

    while IFS= read -r pattern || [ -n "$pattern" ]; do
        [ -z "$pattern" ] && continue
        if echo "$text" | grep -qi "$pattern" 2>/dev/null; then
            echo "$pattern"
            return 0
        fi
    done < "$patterns_file"

    return 1
}

# 从 stdin 读取 JSON，提取 file_path 字段值
extract_file_path() {
    local input
    input=$(cat 2>/dev/null || echo "")
    echo "$input" | grep -o '"file_path"\s*:\s*"[^"]*"' 2>/dev/null | head -1 | grep -o '"[^"]*"$' 2>/dev/null | tr -d '"' 2>/dev/null || echo ""
}
