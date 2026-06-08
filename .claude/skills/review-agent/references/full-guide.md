# Review Agent — Full Guide

Generator/Evaluator separation for autonomous self-improvement. Inspired by Hermes Nudge Engine and Anthropic's multi-agent harness design.

## Architecture

```
Main Agent (Generator)          Review Agent (Evaluator)
─────────────────────          ─────────────────────────
Does the work                  Judges the work
Logs to .learnings/            Checks for completeness
Self-assesses (biased)         Skeptical, objective
Responds to user               Triggered by nudge or cron
```

## Nudge Engine

The self-improvement hook tracks turns since last review. When threshold crossed:

| Level | Trigger | Action |
|---|---|---|
| GREEN | <5 turns, 0 pending | Status line only |
| YELLOW | 5-9 turns or 1-2 pending | Gentle reminder |
| RED | >=10 turns or >=3 pending | Full evaluator mode |

## Evaluator Mode Protocol

When RED level triggers, the agent MUST:

1. Switch identity: "I am now the Evaluator"
2. Review conversation with skepticism
3. Assume the generator missed things
4. Apply the 4 review criteria
5. Output a Review Report

## Promotion Rules

### When to promote (all must be true):
- Pattern seen >= 3 times
- Across at least 2 distinct sessions
- Within a 30-day window

### Promotion format:
```markdown
## [Rule]
Short, actionable instruction. No backstory.
```

Not:
```markdown
## [Rule]
On May 28th the user was working on X and then Y happened, which caused Z...
```

## Skill Patching

When a skill caused issues:
1. Read the skill's SKILL.md
2. Find the relevant section (fuzzy match)
3. Update with corrected approach
4. Add a note: `<!-- patched by review-agent YYYY-MM-DD -->`

## Cron-Based Deep Review

For background reviews when user is inactive:
```bash
openclaw cron add \
  --name "self-improvement-deep-review" \
  --every "60m" \
  --agent "main" \
  --session "isolated" \
  --message "Run evaluator-mode review of .learnings/" \
  --thinking "high" \
  --timeout-seconds 300 \
  --tools "read write edit bash"
```

## Safety

- Never modify files without explicit review findings
- Don't delete learnings — mark as resolved/promoted
- Don't promote one-off incidents
- When in doubt, leave as pending
