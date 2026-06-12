#!/usr/bin/env python3
"""Seed the agent-swarm database with the 12-agent dream team.

Encoding-safe: wraps I/O to force UTF-8 regardless of terminal codepage.
No PYTHONIOENCODING env var needed. Idempotent — skips if agents exist.
"""

import sys
import io
import urllib.request
import json

# ── Force UTF-8 I/O (survives GBK terminals on Windows) ──────────
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

API = "http://localhost:5120/api"
PROJECT_NAME = "Agent Swarm 默认项目"

TEAM = [
    ("编排官",       "orchestrator",          "opus"),
    ("产品经理",     "product-manager",       "opus"),
    ("软件架构师",   "software-architect",    "opus"),
    ("UI设计师",     "ui-designer",           "sonnet"),
    ("数据库优化师", "database-optimizer",    "sonnet"),
    ("后端架构师",   "backend-architect",     "opus"),
    ("前端开发",     "frontend-developer",    "sonnet"),
    ("前端架构师",   "frontend-architect",    "opus"),
    ("DevOps自动化", "devops-automator",      "sonnet"),
    ("测试QA",       "testing-qa",            "sonnet"),
    ("安全工程师",   "security-engineer",     "sonnet"),
    ("代码审查师",   "code-reviewer",         "opus"),
]


def request(method, path, body=None):
    """Send HTTP request with proper UTF-8 encoding."""
    url = f"{API}{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Request failed: {e}", file=sys.stderr)
        return None


def is_garbled(name: str) -> bool:
    """Heuristic: detect if a name looks garbled (not valid Chinese/printable)."""
    if not name:
        return True
    # If it contains replacement characters, definitely garbled
    if "�" in name:
        return True
    # If the name has high-bit bytes that are not valid CJK or common chars
    for ch in name:
        cp = ord(ch)
        # Allow: ASCII, CJK Unified (4E00-9FFF), CJK Ext A/B (3400-4DBF, 20000-2A6DF),
        #        fullwidth forms, common symbols, space
        if cp < 0x80:          # ASCII
            continue
        if 0x4E00 <= cp <= 0x9FFF:   # CJK Unified
            continue
        if 0x3400 <= cp <= 0x4DBF:   # CJK Ext-A
            continue
        if 0x20000 <= cp <= 0x2A6DF: # CJK Ext-B
            continue
        if 0xFF00 <= cp <= 0xFFEF:   # Fullwidth forms
            continue
        if 0x3000 <= cp <= 0x303F:   # CJK Symbols/Punctuation
            continue
        if cp == 0x20:          # Space
            continue
        # Any other high-bit char in unexpected range → probably garbled
        return True
    return False


def clean_garbled_agents():
    """Delete agents whose names look garbled."""
    agents = request("GET", "/agents")
    if not agents:
        return
    deleted = 0
    for a in agents:
        if is_garbled(a.get("name", "")):
            result = request("DELETE", f"/agents/{a['id']}")
            if result and "deleted" in result:
                print(f"  Purged garbled agent: {a['name'][:20]}... ({a['id'][:8]}...)")
                deleted += 1
    if deleted:
        print(f"  (Removed {deleted} garbled agents)")


def ensure_project():
    """Get or create the default project."""
    projects = request("GET", "/projects")
    if projects and len(projects) > 0:
        pid = projects[0]["id"]
        # Fix project name if garbled
        pname = projects[0].get("name", "")
        if is_garbled(pname):
            print(f"  Fixing garbled project name: '{pname[:20]}...' → '{PROJECT_NAME}'")
            request("PATCH", f"/projects/{pid}", {"name": PROJECT_NAME})
        return pid

    # Create project
    print(f"  Creating project: {PROJECT_NAME}")
    result = request("POST", "/projects", {"name": PROJECT_NAME, "path": "."})
    if result and "id" in result:
        return result["id"]
    return None


def count_valid_agents():
    """Count agents with non-garbled names."""
    agents = request("GET", "/agents")
    if not agents:
        return 0
    return sum(1 for a in agents if not is_garbled(a.get("name", "")))


def seed():
    """Main entry point — idempotent seed of 12-agent team."""
    print("Agent Swarm — Seeding 12-agent dream team")
    print("=" * 50)

    # Step 1: Clean any pre-existing garbled data
    clean_garbled_agents()

    # Step 2: Check if we already have valid agents
    valid = count_valid_agents()
    if valid >= len(TEAM):
        print(f"✅ Already seeded: {valid} agents with valid names. Nothing to do.")
        return
    elif valid > 0:
        print(f"⚠️  Only {valid}/{len(TEAM)} valid agents. Will complete the team.")
        # Delete remaining partial agents and re-seed
        agents = request("GET", "/agents")
        if agents:
            for a in agents:
                request("DELETE", f"/agents/{a['id']}")

    # Step 3: Ensure project exists
    project_id = ensure_project()
    if not project_id:
        print("❌ Failed to create/find project. Aborting.")
        sys.exit(1)

    # Step 4: Create all 12 agents
    print(f"\nSeeding {len(TEAM)} agents...")
    created = 0
    for name, role, model in TEAM:
        body = {
            "project_id": project_id,
            "name": name,
            "role": role,
            "runtime": "claude-code",
            "model": model,
            "capabilities": [],
            "permission_mode": "acceptEdits",
        }
        result = request("POST", "/agents", body)
        if result and "id" in result:
            print(f"  ✅ {name} ({role})")
            created += 1
        else:
            print(f"  ❌ {name} ({role}) — FAILED")

    print(f"\n{'=' * 50}")
    print(f"Done: {created}/{len(TEAM)} agents created")

    # Step 5: Verify
    final = request("GET", "/agents")
    if final:
        print(f"\nFinal roster ({len(final)} agents):")
        for a in final:
            name = a["name"]
            garbled_mark = " ⚠️ GARBLED" if is_garbled(name) else ""
            print(f"  {name} | {a['role']} | {a['model']}{garbled_mark}")


if __name__ == "__main__":
    seed()
