const socket = io();

// Global elements
const yearEl = document.getElementById('year');
yearEl.textContent = new Date().getFullYear().toString();

// Screens & navigation
const navLinks = document.querySelectorAll('.nav-link');
const screens = document.querySelectorAll('.screen');

function setActiveScreen(screenId) {
  screens.forEach((s) => {
    s.classList.toggle('active-screen', s.id === `screen-${screenId}`);
  });
  navLinks.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.screen === screenId);
  });
}

navLinks.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.screen;
    setActiveScreen(target);
  });
});

// Live Room elements (may not exist yet if DOM not rendered)
const messagesEl = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const nameInput = document.getElementById('nameInput');
const statusText = document.getElementById('statusText');

// Check backend status via REST (if status element present)
if (statusText) {
  fetch('/api/status')
    .then((res) => res.json())
    .then((data) => {
      statusText.textContent = data.message || 'Connected to StarClub server';
    })
    .catch(() => {
      statusText.textContent = 'Unable to reach server';
    });
}

function appendSystemMessage(text) {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = 'system-message';
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendChatMessage({ id, name, message }) {
  if (!messagesEl) return;
  const el = document.createElement('div');
  const myId = socket.id;
  const isMe = id === myId;
  el.className = `message ${isMe ? 'me' : 'other'}`;

  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = isMe ? `${name || 'Me'} (you)` : name || 'Guest';

  const textEl = document.createElement('div');
  textEl.className = 'text';
  textEl.textContent = message;

  el.appendChild(nameEl);
  el.appendChild(textEl);
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

socket.on('system-message', (text) => {
  appendSystemMessage(text);
});

socket.on('chat-message', (data) => {
  appendChatMessage(data);
});

if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (!message) return;

    const name = nameInput.value.trim() || 'Guest';

    socket.emit('chat-message', { name, message });
    messageInput.value = '';
  });
}

// Profile screen: local save
const profileNameInput = document.getElementById('profileName');
const profileBioInput = document.getElementById('profileBio');
const saveProfileBtn = document.getElementById('saveProfileBtn');

function loadProfileFromLocal() {
  if (!profileNameInput || !profileBioInput) return;
  const storedName = localStorage.getItem('starclub_profile_name');
  const storedBio = localStorage.getItem('starclub_profile_bio');
  if (storedName) profileNameInput.value = storedName;
  if (storedBio) profileBioInput.value = storedBio;
}

loadProfileFromLocal();

if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', () => {
    const n = (profileNameInput?.value || '').trim();
    const b = (profileBioInput?.value || '').trim();
    localStorage.setItem('starclub_profile_name', n);
    localStorage.setItem('starclub_profile_bio', b);
    // Also update live room name if empty
    if (nameInput && !nameInput.value.trim() && n) {
      nameInput.value = n;
    }
    alert('Profile saved locally in this browser.');
  });
}

// ---------- Color Prediction Game (client side, multi-market) ----------

let cpBalance = 1000;
let cpCurrentRoundId = null;
let cpMyBet = null; // { marketId, roundId, color, amount }
let cpSelectedMarket = 'WIN30';
const cpMarketStates = {}; // marketId -> { round, history }

const cpRoundIdEl = document.getElementById('cpRoundId');
const cpStatusEl = document.getElementById('cpStatus');
const cpTimeLeftEl = document.getElementById('cpTimeLeft');
const cpBalanceEl = document.getElementById('cpBalance');
const cpAmountInput = document.getElementById('cpAmount');
const cpMessageEl = document.getElementById('cpMessage');
const cpHistoryEl = document.getElementById('cpHistory');
const cpColorButtons = document.querySelectorAll('.cp-color-btn');
const cpTimeMinEl = document.getElementById('cpTimeMin');
const cpTimeSecEl = document.getElementById('cpTimeSec');
const cpRoundSerialEl = document.getElementById('cpRoundSerial');
const cpResultDisplayEl = document.getElementById('cpResultDisplay');
const cpNumberGridEl = document.getElementById('cpNumberGrid');
const cpGameTabs = document.querySelectorAll('.cp-game-tab');

function setNumberBallStyles(activeNumber) {
  if (!cpNumberGridEl) return;
  const balls = cpNumberGridEl.querySelectorAll('.cp-number-ball');
  balls.forEach((ball) => {
    const num = parseInt(ball.dataset.num || '0', 10);
    ball.classList.remove('green', 'red', 'violet', 'active');
    let color = 'violet';
    if (num === 0 || num === 5 || num === 2 || num === 7) color = 'green';
    if (num === 1 || num === 6 || num === 3 || num === 8) color = 'red';
    ball.classList.add(color);
    if (num === activeNumber) {
      ball.classList.add('active');
    }
  });
}

function updateCpBalanceDisplay() {
  if (cpBalanceEl) {
    cpBalanceEl.textContent = cpBalance.toString();
  }
}

function renderCpHistory(history) {
  if (!cpHistoryEl) return;
  cpHistoryEl.innerHTML = '';
  history.forEach((item) => {
    const dot = document.createElement('div');
    dot.className = 'cp-history-dot';
    if (item.color === 'RED') dot.style.background = '#ef4444';
    if (item.color === 'GREEN') dot.style.background = '#22c55e';
    if (item.color === 'VIOLET') dot.style.background = '#a855f7';
    dot.textContent = item.number ?? '?';
    cpHistoryEl.appendChild(dot);
  });
}

function applyMarketStateToUI(marketId) {
  const state = cpMarketStates[marketId];
  if (!state || !state.round) return;
  const { round, history } = state;
  cpCurrentRoundId = round.id;
  if (cpRoundIdEl) cpRoundIdEl.textContent = round.id;
  if (cpStatusEl) cpStatusEl.textContent = round.status;
  if (cpRoundSerialEl) cpRoundSerialEl.textContent = String(round.id);
  if (cpTimeLeftEl && round.endTime) {
    const timeLeft = Math.max(0, Math.floor((round.endTime - Date.now()) / 1000));
    cpTimeLeftEl.textContent = `${timeLeft}s`;
    if (cpTimeMinEl && cpTimeSecEl) {
      const m = Math.floor(timeLeft / 60)
        .toString()
        .padStart(2, '0');
      const s = (timeLeft % 60).toString().padStart(2, '0');
      cpTimeMinEl.textContent = m;
      cpTimeSecEl.textContent = s;
    }
  }
  if (Array.isArray(history)) renderCpHistory(history);
  if (cpResultDisplayEl && round.resultNumber !== undefined) {
    cpResultDisplayEl.textContent = `${round.resultNumber} · ${round.resultColor}`;
    setNumberBallStyles(round.resultNumber);
  }
}

// Switch market when top tabs clicked
cpGameTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const marketId = tab.dataset.market;
    if (!marketId) return;
    cpSelectedMarket = marketId;
    cpGameTabs.forEach((t) => t.classList.toggle('active', t === tab));
    applyMarketStateToUI(marketId);
  });
});

socket.on('cp:state', ({ marketId, round, history }) => {
  cpMarketStates[marketId] = { round, history };
  if (marketId !== cpSelectedMarket) return;
  applyMarketStateToUI(marketId);
});

socket.on('cp:tick', ({ marketId, roundId, timeLeft, status }) => {
  const state = cpMarketStates[marketId];
  if (!state || state.currentRoundId === roundId) {
    // store partial info
  }
  if (marketId !== cpSelectedMarket) return;
  if (cpTimeLeftEl) cpTimeLeftEl.textContent = `${timeLeft}s`;
  if (cpStatusEl) cpStatusEl.textContent = status;
  if (cpTimeMinEl && cpTimeSecEl) {
    const m = Math.floor(timeLeft / 60)
      .toString()
      .padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    cpTimeMinEl.textContent = m;
    cpTimeSecEl.textContent = s;
  }
});

socket.on('cp:result', ({ marketId, round, history }) => {
  cpMarketStates[marketId] = { round, history };
  if (marketId !== cpSelectedMarket) return;
  applyMarketStateToUI(marketId);

  if (cpMessageEl && round?.resultColor) {
    let msg = `Result: ${round.resultNumber} · ${round.resultColor}`;
    // settle my bet
    if (cpMyBet && cpMyBet.marketId === marketId && cpMyBet.roundId === round.id) {
      if (cpMyBet.color === round.resultColor) {
        const win = cpMyBet.amount * 2;
        cpBalance += win;
        msg += ` · You WON +${win}`;
      } else {
        msg += ' · You lost this round';
      }
      cpMyBet = null;
      updateCpBalanceDisplay();
    }
    cpMessageEl.textContent = msg;
  }
});

cpColorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!cpStatusEl || cpStatusEl.textContent === 'LOCKED' || cpStatusEl.textContent === 'RESULT') {
      if (cpMessageEl) cpMessageEl.textContent = 'Betting closed for this round.';
      return;
    }
    const color = btn.dataset.color;
    const amt = parseInt(cpAmountInput?.value || '0', 10);
    if (!amt || amt <= 0) {
      if (cpMessageEl) cpMessageEl.textContent = 'Please enter a valid amount.';
      return;
    }
    if (amt > cpBalance) {
      if (cpMessageEl) cpMessageEl.textContent = 'Insufficient balance.';
      return;
    }
    if (!cpCurrentRoundId) return;

    cpBalance -= amt;
    cpMyBet = {
      marketId: cpSelectedMarket,
      roundId: cpCurrentRoundId,
      color,
      amount: amt
    };
    updateCpBalanceDisplay();

    socket.emit('cp:bet', {
      marketId: cpSelectedMarket,
      roundId: cpCurrentRoundId,
      color,
      amount: amt,
      name: nameInput?.value || profileNameInput?.value || 'Guest'
    });

    if (cpMessageEl) {
      cpMessageEl.textContent = `Bet placed: ${color} · ${amt}`;
    }
  });
});

