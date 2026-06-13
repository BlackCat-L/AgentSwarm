---
name: tavily
description: AI-optimized web search (Tavily). 网络搜索、新闻、事实核查、资料调研，返回结构化结果。
---

# Tavily AI Search

```bash
scripts/tavily_search.py "<query>" [options]
```

## Key options
- `--depth basic|advanced` — basic=fast(1-2s), advanced=thorough(5-10s), default basic
- `--topic general|news` — news for recent events (last 7 days)
- `--max-results N` — default 5
- `--include-domains` / `--exclude-domains` — filter sources
- `--images` — include image URLs
- `--no-answer` — skip AI summary, save credits
- `--json` — machine-readable output

## Decision rules
- Quick fact → `basic`; complex research → `advanced`
- "latest/recent/today" → `--topic news`
- Default: `basic`, no `--raw-content`, limit results to what you'll use

Full reference: [references/full-guide.md](./references/full-guide.md)
