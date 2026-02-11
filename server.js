const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ---------- Color Prediction Game Engine (WinGo style, multi-market) ----------

const RESULT_DELAY_SEC = 3; // small delay before next round

// Different markets running in parallel
const MARKETS = [
  { id: 'WIN30', label: 'WinGo 30 sec', durationSec: 30 },
  { id: 'WIN1', label: 'WinGo 1 min', durationSec: 60 },
  { id: 'WIN3', label: 'WinGo 3 min', durationSec: 180 },
  { id: 'WIN5', label: 'WinGo 5 min', durationSec: 300 }
];

// Per-market state: { currentRound, history, timer }
const marketStates = {};

function mapNumberToColor(num) {
  // Simple demo mapping similar to popular color games
  if (num === 0 || num === 5 || num === 2 || num === 7) {
    return 'GREEN';
  }
  if (num === 1 || num === 6 || num === 3 || num === 8) {
    return 'RED';
  }
  return 'VIOLET'; // 4, 9
}

function startNewRound(marketId) {
  const market = MARKETS.find((m) => m.id === marketId);
  if (!market) return;

  const now = Date.now();
  const state = marketStates[marketId] || {};

  state.currentRound = {
    id: Math.floor(now / 1000),
    marketId,
    status: 'BETTING', // BETTING -> LOCKED -> RESULT
    endTime: now + market.durationSec * 1000,
    resultNumber: null,
    resultColor: null
  };

  marketStates[marketId] = state;

  io.emit('cp:state', {
    marketId,
    round: state.currentRound,
    history: state.history || []
  });

  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => tickRound(marketId), 1000);
}

function tickRound(marketId) {
  const state = marketStates[marketId];
  if (!state || !state.currentRound) return;
  const currentRound = state.currentRound;
  const now = Date.now();
  const timeLeft = Math.max(0, Math.floor((currentRound.endTime - now) / 1000));

  // Switch to LOCKED in last 5 seconds
  if (timeLeft <= 5 && currentRound.status === 'BETTING') {
    currentRound.status = 'LOCKED';
    io.emit('cp:state', {
      marketId,
      round: currentRound,
      history: state.history || []
    });
  }

  io.emit('cp:tick', {
    marketId,
    roundId: currentRound.id,
    timeLeft,
    status: currentRound.status
  });

  if (timeLeft <= 0 && currentRound.status !== 'RESULT') {
    // Decide result: random number 0-9 and its color
    const number = Math.floor(Math.random() * 10); // 0-9
    const color = mapNumberToColor(number);
    currentRound.status = 'RESULT';
    currentRound.resultNumber = number;
    currentRound.resultColor = color;

    const entry = {
      id: currentRound.id,
      color,
      number
    };
    state.history = [entry, ...(state.history || [])].slice(0, 20);

    io.emit('cp:result', {
      marketId,
      round: currentRound,
      history: state.history
    });

    // Start next round after small delay
    setTimeout(() => {
      startNewRound(marketId);
    }, RESULT_DELAY_SEC * 1000);
  }
}

// start all markets on server boot
MARKETS.forEach((m) => {
  marketStates[m.id] = { currentRound: null, history: [], timer: null };
  startNewRound(m.id);
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Basic API endpoint example
app.get('/api/status', (req, res) => {
  res.json({ ok: true, appName: 'StarClub', message: 'StarClub server is running' });
});

// Socket.IO real-time connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Broadcast join message
  socket.broadcast.emit('system-message', 'A new user joined StarClub ✨');

  // Chat message handler
  socket.on('chat-message', (data) => {
    // Re-broadcast to everyone (including sender)
    io.emit('chat-message', {
      id: socket.id,
      name: data.name || 'Guest',
      message: data.message
    });
  });

  // Color prediction bet event (for display/logging/broadcast only)
  socket.on('cp:bet', (payload) => {
    // Just broadcast bet info so others can see activity (no real money logic)
    io.emit('cp:bet', {
      ...payload,
      socketId: socket.id,
      time: Date.now()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    socket.broadcast.emit('system-message', 'A user left StarClub');
  });
});

server.listen(PORT, () => {
  console.log(`StarClub live server running on http://localhost:${PORT}`);
});

