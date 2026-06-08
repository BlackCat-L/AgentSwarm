#!/bin/bash
# OpenClaw 安全巡检报告 — 每周日凌晨 3:00 自动执行

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_HTML="$HOME/.openclaw/workspace/docs/security-report.html"
ACTIVITY_LOG="$HOME/.openclaw/workspace/logs/activity.log"
ARCHIVE_DIR="$HOME/.openclaw/workspace/logs/archive"

# --- 运行扫描 ---
SCAN_OUTPUT=$(cd "$SKILL_DIR" && bash scripts/scan-skills.sh 2>&1)
INTEGRITY_OUTPUT=$(cd "$SKILL_DIR" && bash scripts/integrity-check.sh 2>&1)
AUDIT_OUTPUT=$(cd "$SKILL_DIR" && bash scripts/audit-outbound.sh 2>&1)

# --- 读取活动日志 ---
ACTIVITY_LINES=$(grep -v '^#' "$ACTIVITY_LOG" 2>/dev/null | grep -v '^$')

# --- 导出变量给 Python ---
export SCAN_OUTPUT INTEGRITY_OUTPUT AUDIT_OUTPUT ACTIVITY_LINES REPORT_HTML ACTIVITY_LOG ARCHIVE_DIR

# --- 用 Python 生成 HTML ---
python3 << 'PYEOF'
import subprocess, os, json
from datetime import datetime

now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
week = datetime.now().strftime('第 %Y 年第 %W 周')

scan = os.environ.get('SCAN_OUTPUT', '')
integrity = os.environ.get('INTEGRITY_OUTPUT', '')
audit = os.environ.get('AUDIT_OUTPUT', '')
# 直接从文件读活动日志
activity_log_path = os.path.expanduser('~/.openclaw/workspace/logs/activity.log')
try:
    with open(activity_log_path, 'r') as f:
        lines = f.readlines()
    activity_raw = ''.join(l for l in lines if not l.startswith('#') and l.strip())
except:
    activity_raw = ''

# 统计
c_count = scan.count('Critical:')
w_count = scan.count('Warnings:')

if c_count == 0 and w_count <= 1:
    status, color = '✅ 安全', '#22c55e'
elif c_count == 0:
    status, color = '⚠️ 有警告', '#f59e0b'
else:
    status, color = '🔴 严重问题', '#ef4444'

findings = []
if c_count > 0:
    findings.append(f'<li>🔴 发现严重问题</li>')
if w_count > 0:
    findings.append(f'<li>🟡 发现 {w_count} 个警告</li>')
if not findings:
    findings.append('<li>🟢 未发现安全问题</li>')

# 活动表格
activity_rows = ''
if activity_raw.strip():
    for line in activity_raw.strip().split('\n'):
        line = line.strip()
        if not line:
            continue
        parts = line.split(' ', 2)
        ts = ' '.join(parts[:2]) if len(parts) >= 2 else ''
        desc = parts[2] if len(parts) >= 3 else line
        desc = desc.replace('<', '&lt;').replace('>', '&gt;')
        if '🔴' in line:
            style = 'style="background:#3b1515;border-left:3px solid #ef4444;"'
        elif '🟡' in line:
            style = 'style="background:#2d2410;border-left:3px solid #f59e0b;"'
        else:
            style = 'style="border-left:3px solid #444;"'
        activity_rows += f'<tr {style}><td style="padding:4px 8px;font-size:12px;white-space:nowrap;color:#888;">{ts}</td><td style="padding:4px 8px;font-size:13px;">{desc}</td></tr>\n'

activity_html = ''
if activity_rows:
    activity_html = f'''
      <div class="activity" style="margin-top:15px;">
        <strong style="color:#ccc;">📝 本周操作记录：</strong>
        <table style="width:100%;margin-top:8px;border-collapse:collapse;color:#ccc;font-size:13px;">
          <tr style="background:#1a1a2e;"><th style="padding:6px 8px;text-align:left;color:#888;font-size:12px;">时间</th><th style="padding:6px 8px;text-align:left;color:#888;font-size:12px;">操作</th></tr>
          {activity_rows}
        </table>
      </div>'''

scan_html = scan.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
integrity_html = integrity.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
audit_html = audit.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

entry = f'''
    <div class="entry" style="border-left:4px solid {color};margin:20px 0;padding:15px;background:#1a1a2e;border-radius:8px;">
      <div class="header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0;color:{color};">📋 第 {week} 周安全巡检报告</h3>
        <span style="color:#888;font-size:14px;">{now}</span>
      </div>
      <div class="status" style="font-size:18px;font-weight:bold;color:{color};margin-bottom:10px;">{status}</div>
      <div class="summary" style="margin-bottom:10px;color:#ccc;">
        <strong>检查内容：</strong>Skill 恶意代码扫描 + 文件完整性校验 + 外连数据审计
      </div>
      {activity_html}
      <div class="findings" style="color:#aaa;margin-top:10px;">
        <strong>发现：</strong>
        <ul style="margin:5px 0;">{"".join(findings)}</ul>
      </div>
      <details style="margin-top:10px;">
        <summary style="cursor:pointer;color:#60a5fa;">📄 查看详细日志</summary>
        <pre style="background:#0f0f23;padding:10px;margin-top:10px;font-size:12px;max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:#9ca3af;border-radius:4px;">
=== Skill 扫描 ===
{scan_html}

=== 完整性检查 ===
{integrity_html}

=== 外连审计 ===
{audit_html}
        </pre>
      </details>
    </div>'''

report_path = os.environ['REPORT_HTML']

if not os.path.exists(report_path):
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw 安全巡检报告</title>
  <style>
    * {{ box-sizing:border-box;margin:0;padding:0; }}
    body {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f0f23;color:#e5e7eb;padding:40px 20px;max-width:900px;margin:0 auto; }}
    h1 {{ color:#f0f6fc;border-bottom:2px solid #30363d;padding-bottom:15px;margin-bottom:30px; }}
    h1 small {{ color:#8b949e;font-size:16px;font-weight:normal;margin-left:10px; }}
    .footer {{ margin-top:40px;padding-top:20px;border-top:1px solid #30363d;color:#6e7681;font-size:13px;text-align:center; }}
    a {{ color:#60a5fa; }}
  </style>
</head>
<body>
  <h1>🦞 OpenClaw 安全巡检报告 <small>自动生成 · 每周日凌晨 3:00</small></h1>
  <p style="color:#8b949e;margin-bottom:30px;">本报告由 openclaw-security-hardening 自动扫描生成，持续记录每周安全状态。</p>
{entry}
  <div class="footer">
    <p>OpenClaw Security Hardening · 自动巡检 · <a href="https://gitee.com/weifeng_code/openclaw">weifeng_code/openclaw</a></p>
  </div>
</body>
</html>'''
else:
    with open(report_path, 'r') as f:
        html = f.read()
    html = html.replace('</body>', entry + '\n</body>')

os.makedirs(os.path.dirname(report_path), exist_ok=True)
with open(report_path, 'w') as f:
    f.write(html)

print(f'✅ 安全报告已更新: {report_path}')
PYEOF

# --- 归档活动日志 ---
mkdir -p "$ARCHIVE_DIR"
WEEK_TAG=$(date '+%Y-W%V')
cp "$ACTIVITY_LOG" "$ARCHIVE_DIR/activity-${WEEK_TAG}.log"
# 只保留头部，清空正文
head -3 "$ACTIVITY_LOG" > "${ACTIVITY_LOG}.tmp" && mv "${ACTIVITY_LOG}.tmp" "$ACTIVITY_LOG"
echo "✅ 活动日志已归档: ${ARCHIVE_DIR}/activity-${WEEK_TAG}.log"

# --- 更新完整性基线 ---
cd "$SKILL_DIR" && bash scripts/integrity-check.sh --update 2>&1 > /dev/null
