const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;

const URL = "wss://minybordergs.weskb5gams.net/websocket";

let session_odds = {};
let last_logged = new Set();
let current_sid = null;
let last_odd_time = {};

let keep_alive_count = 1;
let ws = null;

function connectWebSocket() {
  ws = new WebSocket(URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Origin: "https://b52.vin"
    }
  });

  ws.on("open", () => {
    console.log("[✅] WebSocket đã kết nối");

    const authPayload = [
      1, "MiniGame", "", "", {
        agentId: "1",
        accessToken: "13-4bbdf84c08614c7e447383d51c7624db",
        reconnect: false
      }
    ];
    ws.send(JSON.stringify(authPayload));

    setTimeout(() => ws.send(JSON.stringify([6, "MiniGame", "lobbyPlugin", { cmd: 10002 }])), 1000);
    setTimeout(() => ws.send(JSON.stringify([6, "MiniGame", "aviatorPlugin", { cmd: 100000, f: true }])), 2000);
    setTimeout(() => ws.send(JSON.stringify([6, "MiniGame", "aviatorPlugin", { cmd: 100016 }])), 3000);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (!Array.isArray(msg) || msg.length < 2 || typeof msg[1] !== "object") return;

      const payload = msg[1];
      const cmd = payload.cmd;
      const sid = payload.sid;
      const odd = payload.odd;

      if (cmd === 100009 && sid && typeof odd === "number") {
        current_sid = sid;
        if (!session_odds[sid]) session_odds[sid] = [];
        session_odds[sid].push(odd);
        last_odd_time[sid] = Date.now();
      }
    } catch (e) {
      console.log("❌ Lỗi xử lý message:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket ngắt, thử kết nối lại sau 3s...");
    setTimeout(connectWebSocket, 3000);
  });

  ws.on("error", (err) => {
    console.log("❌ WebSocket lỗi:", err.message);
  });
}

setInterval(() => {
  Object.keys(session_odds).forEach((sid) => {
    if (!last_logged.has(sid) && Date.now() - last_odd_time[sid] > 2000) {
      const max_odd = Math.max(...session_odds[sid]);
      console.log(`[✈️💥] Máy bay NỔ ➜ SID: ${sid} | ODD: ${max_odd.toFixed(2)}x`);
      last_logged.add(sid);
    }
  });
}, 500);

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const keepMsg = ["7", "MiniGame", "1", keep_alive_count++];
    ws.send(JSON.stringify(keepMsg));
    console.log(`📶 KeepAlive lần ${keep_alive_count}`);
  }
}, 10000);

setInterval(() => {
  if (SELF_URL.includes("http")) {
    axios.get(`${SELF_URL}/api/latest`).catch(() => {});
  }
}, 300000); // mỗi 5 phút

// API endpoint
app.get("/api/latest", (req, res) => {
  const sids = Object.keys(session_odds);
  if (sids.length === 0) return res.json({ message: "Chưa có dữ liệu" });

  const latest_sid = Math.max(...sids.map(Number));
  const max_odd = Math.max(...session_odds[latest_sid]);
  res.json({
    Phien: latest_sid,
    Ket_qua: max_odd.toFixed(2),
    Thoigian: new Date().toISOString().replace("T", " ").slice(0, 19),
    id: "hknamvip"
  });
});

app.get("/", (req, res) => {
  res.json({ status: "Aviator đang chạy", tong_phien: Object.keys(session_odds).length });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
  connectWebSocket();
});