#!/bin/bash

# Comic Generator Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "🎨 漫画分镜生成器启动脚本"
echo "================================"

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "❌ 错误: 未找到 uv，请先安装 uv"
    echo "💡 Mac/Linux 安装: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Sync dependencies
echo "📦 检查并安装依赖..."
if ! (cd "$SCRIPT_DIR/backend" && uv sync); then
    echo "❌ 依赖安装失败"
    exit 1
fi

# Start backend server
echo "🚀 启动后端服务..."
(
    cd "$SCRIPT_DIR/backend" || exit 1
    exec uv run app.py
) &
BACKEND_PID=$!

echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"
echo "📍 后端地址: http://localhost:5003"

# Wait for backend to start
sleep 2

# Start frontend server
echo "🚀 启动前端服务..."
python3 "$SCRIPT_DIR/serve_frontend.py" &
FRONTEND_PID=$!

echo "✅ 前端服务已启动 (PID: $FRONTEND_PID)"
echo "📍 前端地址: http://localhost:8000"
echo ""
echo "================================"
echo "✨ 服务已全部启动！"
echo "🌐 请在浏览器中打开: http://localhost:8000"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "================================"

cleanup() {
    trap - INT TERM EXIT
    echo ""
    echo "🛑 正在停止服务..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    echo "✅ 服务已停止"
}

trap cleanup INT TERM EXIT

# Wait for processes
wait
