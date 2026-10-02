const mineflayer = require('mineflayer');
const express = require('express');

// Cloud host (Render/Koyeb) ko alive rakhne ke liye HTTP ping server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('Bot process is running active 24/7.');
});

app.listen(PORT, () => {
  console.log(`[Keep-Alive] HTTP server listening on port ${PORT}`);
});

// Server Configuration
const CONFIG = {
  host: 'loosejaw.aternos.host',
  port: 61853,
  username: 'ServerKeeper_247',
  version: '1.21',   // Quotes ke andar zaroori hai
  auth: 'offline'     // Cracked / Aternos offline mode bypass
};

let bot;
let movementInterval = null;
let reconnectTimeout = null;

function createBot() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  console.log(`[Connection] Connecting to ${CONFIG.host}:${CONFIG.port}...`);
  
  bot = mineflayer.createBot(CONFIG);

  bot.on('login', () => {
    console.log(`[Success] Logged in as ${bot.username}`);
  });

  bot.on('spawn', () => {
    console.log(`[Spawn] Bot has spawned in the world.`);
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

    // Pehle ke movements clear karo
    controls.forEach(ctrl => bot.setControlState(ctrl, false));
    bot.setControlState('jump', false);

    // Random direction pick karo
    const selectedControl = controls[Math.floor(Math.random() * controls.length)];
    bot.setControlState(selectedControl, true);

    // 45% chance to jump
    if (Math.random() < 0.45) {
      bot.setControlState('jump', true);
    }

    // Head rotation (yaw aur pitch change karna AFK plugins ko beat karta hai)
    const randomYaw = (Math.random() * Math.PI * 2) - Math.PI;
    const randomPitch = (Math.random() * 0.6) - 0.3;
    bot.look(randomYaw, randomPitch, true);

    // 1.5 seconds walk karne ke baad stop karo
    setTimeout(() => {
      if (bot && bot.entity) {
        controls.forEach(ctrl => bot.setControlState(ctrl, false));
        bot.setControlState('jump', false);
      }
    }, 1500);

  }, 4000); // Har 4 second par trigger hoga
}

// Bot start karo
createBot();
