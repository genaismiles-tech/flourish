#!/bin/bash
# Start PlantIt — plant disease diagnosis app

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  ANTHROPIC_API_KEY is not set. Please export it first:"
  echo "   export ANTHROPIC_API_KEY=your_key_here"
  exit 1
fi

echo "🌿 Starting Flourish..."

# Start server in background
(cd server && npx tsx src/server.ts) &
SERVER_PID=$!

# Wait for server to be ready
sleep 2

# Start client
(cd client && npm run dev -- --open) &
CLIENT_PID=$!

echo "✅ Flourish running:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"

# Wait and cleanup on exit
trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" INT TERM
wait
