const mineflayer = require('mineflayer');
const express = require('express');
const { Resolver } = require('dns').promises;

// Cloud Keep-Alive Web Server (Render ke liye)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot process is running active 24/7.'));
app.listen(PORT, () => console.log(`[Keep-Alive] HTTP server listening on port ${PORT}`));

// Aternos Main Details
const MAIN_DOMAIN = 'Mystic_Ansh.aternos.me';
const BOT_USERNAME = 'ServerKeeper_247';

// Public Google DNS (Local Wi-Fi ke DNS blocks ko bypass karne ke liye)
const customResolver = new Resolver();
customResolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

let bot;
let movementInterval = null;
let reconnectTimeout = null;

// Function: Aternos ka dynamic host aur port Google DNS se auto nikaal kar IPv4 me convert karega
async function resolveServerDetails(domain) {
  try {
    console.log(`[DNS] Resolving SRV records for ${domain}...`);
    const srvRecords = await customResolver.resolveSrv(`_minecraft._tcp.${domain}`);
    
    if (srvRecords && srvRecords.length > 0) {
      const dynHost = srvRecords[0].name;
      const dynPort = srvRecords[0].port;
      console.log(`[DNS] Found Dyn Target: ${dynHost}:${dynPort}`);

      // Hostname ko clean IPv4 me convert karo (IPv6 NAT64 freeze se bachne ke liye)
      try {
        const ipRecords = await customResolver.resolve4(dynHost);
        if (ipRecords && ipRecords.length > 0) {
          console.log(`[DNS] Resolved IPv4: ${ipRecords[0]}`);
          return { host: ipRecords[0], port: dynPort };
        }
      } catch (ipErr) {
        console.warn(`[DNS] Direct IPv4 resolve failed, using host string: ${ipErr.message}`);
        return { host: dynHost, port: dynPort };
      }
    }
  } catch (err) {
    console.warn(`[DNS] Auto-resolve delay/error: ${err.message}`);
  }

  // Backup fallback
  return { host: '185.107.194.11', port: 61853 };
}

async function createBot() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const server = await resolveServerDetails(MAIN_DOMAIN);

  const config = {
    host: server.host,
    port: server.port,
    username: BOT_USERNAME,
    version: '1.20.2',             // Tested working protocol (bypasses 1.21 configuration hang)
    auth: 'offline',               // Aternos cracked mode
    connectTimeout: 30000,
    checkTimeoutInterval: 60000,
    keepAlive: true
  };

  console.log(`[Connection] Connecting to ${config.host}:${config.port} as ${config.username}...`);
  bot = mineflayer.createBot(config);

  bot._client.on('connect', () => {
    console.log('[Socket] TCP socket connected! Handshaking with server...');
  });

  bot._client.on('state', (state) => {
    console.log(`[Protocol State] Changed to: ${state}`);
  });

  bot._client.on('error', (err) => {
    console.error('[Client Error]:', err.message);
  });

  bot.on('login', () => {
    console.log(`[Success] Logged in as ${bot.username}`);
  });

  bot.on('spawn', () => {
    console.log(`[Spawn] Bot has spawned in the world! Anti-AFK active.`);
    startMovementLoop();
  });

  bot.on('kicked', (reason) => {
    console.warn(`[Kicked] Disconnected from server. Reason:`, reason);
  });

  bot.on('error', (err) => {
    console.error(`[Error] Encountered error:`, err.message);
  });

  bot.on('end', () => {
    console.log(`[End] Connection closed. Attempting auto-reconnect in 30 seconds...`);
    clearInterval(movementInterval);
    movementInterval = null;
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(createBot, 30000);
    }
  });
}

function startMovementLoop() {
  if (movementInterval) clearInterval(movementInterval);

  const controls = ['forward', 'back', 'left', 'right'];

  movementInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    controls.forEach(ctrl => bot.setControlState(ctrl, false));
    bot.setControlState('jump', false);

    const selectedControl = controls[Math.floor(Math.random() * controls.length)];
    bot.setControlState(selectedControl, true);

    if (Math.random() < 0.45) {
      bot.setControlState('jump', true);
    }

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

// Bot start
createBot();
