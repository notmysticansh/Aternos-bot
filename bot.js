const mineflayer = require('mineflayer');
const express = require('express');
const { Resolver } = require('dns').promises;
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());

const customResolver = new Resolver();
customResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Active Configuration State
let currentConfig = {
  mode: 'auto',
  host: 'Mystic_Ansh.aternos.me',
  manualIp: '',
  port: 61853,
  username: 'ServerKeeper_247',
  version: '1.20.2'
};

let bot = null;
let movementInterval = null;
let reconnectTimeout = null;
let isManualStop = false;
let botStatus = 'OFFLINE';
let liveLogs = [];

function addLog(msg) {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = `[${timestamp}] ${msg}`;
  liveLogs.unshift(entry);
  if (liveLogs.length > 50) liveLogs.pop();
  console.log(entry);
}

// Dynamic SRV & IPv4 Resolver (Tumhara original working resolver)
async function resolveServerDetails(domain) {
  try {
    addLog(`Resolving SRV records for ${domain}...`);
    const srvRecords = await customResolver.resolveSrv(`_minecraft._tcp.${domain}`);

    if (srvRecords && srvRecords.length > 0) {
      const dynHost = srvRecords[0].name;
      const dynPort = srvRecords[0].port;
      addLog(`Found Dyn Target: ${dynHost}:${dynPort}`);

      try {
        const ipRecords = await customResolver.resolve4(dynHost);
        if (ipRecords && ipRecords.length > 0) {
          addLog(`Resolved Clean IPv4: ${ipRecords[0]}`);
          return { host: ipRecords[0], port: dynPort };
        }
      } catch (ipErr) {
        addLog(`IPv4 lookup fallback to domain: ${ipErr.message}`);
        return { host: dynHost, port: dynPort };
      }
    }
  } catch (err) {
    addLog(`DNS resolve fallback: ${err.message}`);
  }
  return { host: '185.107.194.11', port: 61853 };
}

// Bot Connection Engine
async function startBotProcess() {
  if (bot) {
    try {
      bot.removeAllListeners();
      if (bot._client) bot._client.end();
    } catch (e) {}
    bot = null;
  }

  isManualStop = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  botStatus = 'CONNECTING';

  let targetHost = currentConfig.host;
  let targetPort = currentConfig.port;

  if (currentConfig.mode === 'auto') {
    const resolved = await resolveServerDetails(currentConfig.host);
    targetHost = resolved.host;
    targetPort = resolved.port;
  } else {
    targetHost = currentConfig.manualIp || currentConfig.host;
    targetPort = parseInt(currentConfig.port, 10);
    addLog(`Using Manual Target: ${targetHost}:${targetPort}`);
  }

  const botOptions = {
    host: targetHost,
    port: targetPort,
    username: currentConfig.username,
    version: currentConfig.version || '1.20.2',
    auth: 'offline',
    connectTimeout: 30000,
    checkTimeoutInterval: 90000, // Timeout sensitivity loose rakhi hai taaki random drop na ho
    keepAlive: true
  };

  addLog(`Connecting to ${botOptions.host}:${botOptions.port} as ${botOptions.username} (v${botOptions.version})...`);
  
  try {
    bot = mineflayer.createBot(botOptions);
  } catch (err) {
    addLog(`Initialization Error: ${err.message}`);
    botStatus = 'OFFLINE';
    return;
  }

  bot._client.on('connect', () => {
    addLog('TCP Socket connected! Handshaking with server...');
  });

  bot._client.on('state', (state) => {
    addLog(`Protocol State: ${state}`);
  });

  bot._client.on('error', (err) => {
    addLog(`Client Error: ${err.message}`);
  });

  bot.on('login', () => {
    addLog(`Logged in as ${bot.username}`);
  });

  bot.on('spawn', () => {
    botStatus = 'ONLINE';
    addLog(`Bot spawned in world! Anti-AFK engine initialized.`);
    startMovementLoop();
  });

  bot.on('kicked', (reason) => {
    addLog(`Disconnected from server. Reason: ${typeof reason === 'object' ? JSON.stringify(reason) : reason}`);
  });

  bot.on('error', (err) => {
    addLog(`Error encountered: ${err.message}`);
  });

  bot.on('end', () => {
    botStatus = 'OFFLINE';
    if (movementInterval) {
      clearInterval(movementInterval);
      movementInterval = null;
    }
    
    // Purane socket listeners clean up taaki duplicate connection create na ho
    if (bot) {
      try {
        bot.removeAllListeners();
        if (bot._client) bot._client.end();
      } catch (e) {}
      bot = null;
    }

    if (isManualStop) {
      addLog('Bot stopped manually by User. Standing by.');
    } else {
      // 30s se ghata kar 10s kiya taaki Aternos shutdown hone se pehle turant wapas ghus jaye
      addLog('Connection lost. Fast auto-reconnect in 10s...');
      if (!reconnectTimeout) {
        reconnectTimeout = setTimeout(startBotProcess, 10000);
      }
    }
  });
}

// Bot Stop Routine
function stopBotProcess() {
  isManualStop = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }

  if (bot) {
    addLog('Terminating bot session by user request...');
    try {
      bot.quit();
      bot.removeAllListeners();
      if (bot._client) bot._client.end();
    } catch (e) {}
    bot = null;
    botStatus = 'OFFLINE';
  } else {
    botStatus = 'OFFLINE';
    addLog('Bot was already inactive.');
  }
}

// Anti-AFK Engine (Exact same random loop)
function startMovementLoop() {
  if (movementInterval) clearInterval(movementInterval);
  const controls = ['forward', 'back', 'left', 'right'];

  movementInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    controls.forEach(ctrl => bot.setControlState(ctrl, false));
    bot.setControlState('jump', false);

    const selected = controls[Math.floor(Math.random() * controls.length)];
    bot.setControlState(selected, true);

    if (Math.random() < 0.45) bot.setControlState('jump', true);

    const randomYaw = (Math.random() * Math.PI * 2) - Math.PI;
    const randomPitch = (Math.random() * 0.6) - 0.3;
    bot.look(randomYaw, randomPitch, true);

    setTimeout(() => {
      if (bot && bot.entity) {
        controls.forEach(ctrl => bot.setControlState(ctrl, false));
        bot.setControlState('jump', false);
      }
    }, 1500);
  }, 4000);
}

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
  res.json({
    status: botStatus,
    logs: liveLogs,
    config: currentConfig
  });
});

app.post('/api/action', (req, res) => {
  const { action, config } = req.body;

  if (config) {
    currentConfig = { ...currentConfig, ...config };
  }

  if (action === 'start') {
    startBotProcess();
    res.json({ success: true, message: 'Bot starting initiated.' });
  } else if (action === 'stop') {
    stopBotProcess();
    res.json({ success: true, message: 'Bot stopped successfully.' });
  } else if (action === 'save_config') {
    addLog(`Configuration updated: ${JSON.stringify(currentConfig)}`);
    res.json({ success: true, message: 'Config saved.' });
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

// --- GUI Dashboard ---
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SERVERKEEPER // CONTROL CONSOLE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 20, 32, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --cyan: #00f0ff;
      --cyan-glow: rgba(0, 240, 255, 0.35);
      --green: #00ff88;
      --green-glow: rgba(0, 255, 136, 0.35);
      --red: #ff3366;
      --red-glow: rgba(255, 51, 102, 0.35);
      --yellow: #ffb800;
      --text: #f0f4f8;
      --text-dim: #7f8fa6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #151d30 0%, var(--bg) 80%);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      overflow-x: hidden;
    }
    .ambient-glow {
      position: absolute;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 350px;
      background: radial-gradient(circle, var(--cyan-glow) 0%, transparent 70%);
      filter: blur(90px);
      z-index: 0;
      pointer-events: none;
    }
    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 680px;
      background: var(--card-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 32px 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.1);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 16px;
    }
    .title-group h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 1.5px;
      background: linear-gradient(90deg, #ffffff, var(--cyan));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-transform: uppercase;
    }
    .title-group p {
      font-size: 13px;
      color: var(--text-dim);
      font-family: 'JetBrains Mono', monospace;
      margin-top: 4px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 7px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; position: relative; }
    .status-dot::after {
      content: ''; position: absolute; inset: -4px; border-radius: 50%; opacity: 0.7;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.6); opacity: 0; }
      100% { transform: scale(0.9); opacity: 0; }
    }
    .status-online { background: rgba(0, 255, 136, 0.1); color: var(--green); border-color: rgba(0, 255, 136, 0.3); }
    .status-online .status-dot, .status-online .status-dot::after { background: var(--green); }
    .status-offline { background: rgba(255, 51, 102, 0.1); color: var(--red); border-color: rgba(255, 51, 102, 0.3); }
    .status-offline .status-dot, .status-offline .status-dot::after { background: var(--red); }
    .status-connecting { background: rgba(255, 184, 0, 0.1); color: var(--yellow); border-color: rgba(255, 184, 0, 0.3); }
    .status-connecting .status-dot, .status-connecting .status-dot::after { background: var(--yellow); }
    .config-panel {
      background: rgba(10, 14, 24, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 18px;
      padding: 18px;
      margin-bottom: 22px;
    }
    .config-header {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--cyan);
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .mode-switch {
      display: flex;
      background: rgba(0, 0, 0, 0.4);
      padding: 3px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .mode-btn {
      background: transparent;
      border: none;
      color: var(--text-dim);
      padding: 5px 12px;
      border-radius: 7px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mode-btn.active { background: var(--cyan); color: #07090e; font-weight: 700; }
    .inputs-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; }
    .inputs-grid-secondary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .input-box { display: flex; flex-direction: column; gap: 6px; }
    .input-box label { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; }
    .input-box input {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 10px 14px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-box input:focus { border-color: var(--cyan); box-shadow: 0 0 10px rgba(0, 240, 255, 0.2); }
    .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    .btn {
      position: relative; border: none; padding: 16px 20px; border-radius: 14px;
      font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700;
      letter-spacing: 1px; text-transform: uppercase; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    }
    .btn-start { background: linear-gradient(135deg, #00ff88, #00b359); color: #05160d; }
    .btn-start:hover { box-shadow: 0 0 25px var(--green-glow); transform: translateY(-2px); }
    .btn-stop { background: linear-gradient(135deg, #ff3366, #b8143d); color: #ffffff; }
    .btn-stop:hover { box-shadow: 0 0 25px var(--red-glow); transform: translateY(-2px); }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
    .terminal-section {
      background: rgba(5, 7, 12, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px; padding: 16px;
    }
    .terminal-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase; letter-spacing: 1px;
    }
    .terminal-window {
      height: 190px; overflow-y: auto; font-family: 'JetBrains Mono', monospace;
      font-size: 12px; line-height: 1.6; color: #b0c4de; padding-right: 6px;
      display: flex; flex-direction: column-reverse;
    }
    .terminal-window::-webkit-scrollbar { width: 5px; }
    .terminal-window::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
    .log-line { margin-bottom: 4px; word-break: break-word; }
    .log-line:first-child { color: var(--cyan); }
    footer { margin-top: 18px; text-align: center; font-size: 11px; color: rgba(255, 255, 255, 0.25); font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>ServerKeeper</h1>
        <p id="targetSubtext">Target // Mystic_Ansh.aternos.me</p>
      </div>
      <div id="statusBadge" class="status-badge status-offline">
        <span class="status-dot"></span>
        <span id="statusText">OFFLINE</span>
      </div>
    </header>

    <div class="config-panel">
      <div class="config-header">
        <span>Target Configuration</span>
        <div class="mode-switch">
          <button id="modeAuto" class="mode-btn active" onclick="setMode('auto')">ATERNOS AUTO</button>
          <button id="modeManual" class="mode-btn" onclick="setMode('manual')">MANUAL IP/PORT</button>
        </div>
      </div>
      <div class="inputs-grid">
        <div class="input-box">
          <label id="lblServer">Server Domain / IP</label>
          <input type="text" id="cfgServer" value="Mystic_Ansh.aternos.me">
        </div>
        <div class="input-box">
          <label>Port</label>
          <input type="number" id="cfgPort" value="61853">
        </div>
      </div>
      <div class="inputs-grid-secondary">
        <div class="input-box">
          <label>Bot Name</label>
          <input type="text" id="cfgUsername" value="ServerKeeper_247">
        </div>
        <div class="input-box">
          <label>Protocol Version</label>
          <input type="text" id="cfgVersion" value="1.20.2">
        </div>
      </div>
    </div>

    <div class="control-grid">
      <button id="btnStart" class="btn btn-start" onclick="sendAction('start')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Start Keeper
      </button>
      <button id="btnStop" class="btn btn-stop" onclick="sendAction('stop')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
        Stop Keeper
      </button>
    </div>

    <div class="terminal-section">
      <div class="terminal-header">
        <span>Telemetry Live Feed</span>
        <span>FAST RECONNECT (10s)</span>
      </div>
      <div id="terminal" class="terminal-window">
        <div class="log-line">Ready. Engine tuned for zero-timeout persistence.</div>
      </div>
    </div>
    <footer>RAPID ENGINE // PERSISTENCE TUNED</footer>
  </div>

  <script>
    let currentMode = 'auto';
    function setMode(mode) {
      currentMode = mode;
      document.getElementById('modeAuto').className = 'mode-btn' + (mode === 'auto' ? ' active' : '');
      document.getElementById('modeManual').className = 'mode-btn' + (mode === 'manual' ? ' active' : '');
      const lbl = document.getElementById('lblServer');
      const srvInput = document.getElementById('cfgServer');
      const portInput = document.getElementById('cfgPort');
      if (mode === 'auto') {
        lbl.textContent = 'Aternos Domain (SRV Auto)';
        portInput.disabled = true;
        portInput.style.opacity = '0.5';
      } else {
        lbl.textContent = 'Direct IP / Custom Host';
        portInput.disabled = false;
        portInput.style.opacity = '1';
      }
    }

    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        const badge = document.getElementById('statusBadge');
        const text = document.getElementById('statusText');
        const btnStart = document.getElementById('btnStart');
        const btnStop = document.getElementById('btnStop');

        text.textContent = data.status;
        badge.className = 'status-badge status-' + data.status.toLowerCase();
        btnStart.disabled = (data.status === 'ONLINE' || data.status === 'CONNECTING');
        btnStop.disabled = (data.status === 'OFFLINE');

        const terminal = document.getElementById('terminal');
        terminal.innerHTML = data.logs.map(log => \`<div class="log-line">\${log}</div>\`).join('');
      } catch (err) {}
    }

    async function sendAction(action) {
      const config = {
        mode: currentMode,
        host: document.getElementById('cfgServer').value.trim(),
        manualIp: document.getElementById('cfgServer').value.trim(),
        port: parseInt(document.getElementById('cfgPort').value.trim(), 10) || 25565,
        username: document.getElementById('cfgUsername').value.trim() || 'ServerKeeper_247',
        version: document.getElementById('cfgVersion').value.trim() || '1.20.2'
      };

      try {
        await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, config })
        });
        updateDashboard();
      } catch (err) {
        alert('Action failed: ' + err.message);
      }
    }

    setMode('auto');
    setInterval(updateDashboard, 2000);
    updateDashboard();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Keep-Alive] GUI Dashboard running on http://localhost:${PORT}`);
  if (!process.env.RENDER) {
    exec(`start http://localhost:${PORT}`);
  }
});
