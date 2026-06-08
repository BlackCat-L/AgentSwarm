# Sprint Contract — 用 harness 优化 harness 自身

## 目标
基于 Hermes Agent 源码参考，优化 claude-workflow-kit 自身代码质量和架构

## 验收标准
1. Hook 脚本 DRY — pre-bash-guard 和 sensitive-file-guard 共用 pattern-reading 函数
2. CLAUDE.md 增加 SOUL 行为段 — 定义 Agent 人格和工程信条（参考 Hermes SOUL.md）
3. self-improving-agent 错误检测器强化 — 更精准的模式匹配
4. 跨文件交叉引用验证 — 所有 [[name]] 链接 + 文件路径一致
5. 部署测试 — TokenDashboard 执行 init.ps1 -Update 零报错
6. self-audit 7项检查全部 PASS

## 涉及文件
- .claude/hooks/pre-bash-guard.sh
- .claude/hooks/sensitive-file-guard.sh
- .claude/hooks/lib/common.sh (新增)
- CLAUDE.md
- .claude/skills/self-improving-agent/scripts/error-detector.sh

## 测试方式
- Hook 脚本语法检查
- TokenDashboard 部署实测
- self-audit 逐项验证
