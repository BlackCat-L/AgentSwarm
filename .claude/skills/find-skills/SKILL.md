---
name: find-skills
description: 当用户说"找 skill"、"安装 skill"、"find skill"、"install skill"时触发。
---

# Find Skills

## 抓取 Skill 页面内容

用 `https://r.jina.ai/<url>` 前缀抓取任意文档/README/skill 页面，无需配置。

## 搜索安装顺序

1. 优先用 skillhub（国内）搜索：搜索 `site:skillhub.cn <关键词>` 或直接浏览
2. 无结果则用 clawhub：`npx skills search <query>`
3. 手动安装：下载 SKILL.md → 放到 `.claude/skills/<skill-name>/`

## 工作流

1. 理解需求（领域 + 具体任务）
2. 搜索并展示结果（skill 名、功能、安装命令）
3. 用户确认后安装
4. 安装后按优化规则压缩 SKILL.md（正文 <30 行，详细内容移到 references/）

## 安装方式

```bash
# 方式1: 放到项目级 skills（只当前项目生效）
mkdir -p .claude/skills/<skill-name>/
cp SKILL.md .claude/skills/<skill-name>/

# 方式2: 放到全局 skills（所有项目生效）
mkdir -p ~/.claude/skills/<skill-name>/
cp SKILL.md ~/.claude/skills/<skill-name>/
```

## 无结果时

直接用通用能力处理，或建议在 workspace 创建自定义 skill。
