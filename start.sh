#!/bin/bash
echo "⬛ Agent Swarm — Dark Factory 黑灯工厂"
echo "─────────────────────────────────────"
echo "后端 API : http://localhost:5120"
echo "前端看板 : http://localhost:5173"
echo "─────────────────────────────────────"
echo ""

# Auto-open browser
if command -v open &>/dev/null; then
  open http://localhost:5173
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173
fi

# Start both servers
pnpm dev
