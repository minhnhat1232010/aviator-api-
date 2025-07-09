const express = require("express");
const WebSocket = require("ws");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;
const URL = "wss://minybordergs.weskb5gams.net/websocket";

// Dữ liệu chính
let session_odds = {};         // { sid: [odd, odd, ...] }
let last_logged = new Set();   // SID đã in log
let logged_results = {};       // { sid: {Phien, Ket_qua, Thoigian, id} }
let last_odd_time = {};        // { sid: timestamp }
let keep_alive_count = 1;
let ws = null;

// 🔁 Kết nối WebSocket
function connectWebSocket() {
  ws = new WebSocket(URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Origin: "https://b52.vin"
    }
  });

  ws.on("open", () => {
    console.log("[✅] WebSocket đã kết nối");

    // Gửi xác thực + plugin
    ws.send(JSON.stringify([
      1, "MiniGame", "", "", {
        agentId: "1",
        accessToken: "13-512bfa8983978c7d8d483a35b384ec8e",
        reconnect: false
      }
    ]));

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

// ⏱ Theo dõi phiên đã nổ (idle > 2s), log & lưu kết quả
setInterval(() => {
  const now = Date.now();
  Object.keys(session_odds).forEach((sid) => {
    if (!last_logged.has(sid) && now - (last_odd_time[sid] || 0) > 2000) {
      const max_odd = Math.max(...session_odds[sid]);
      const time_str = new Date(now).toISOString().replace("T", " ").slice(0, 19);

      console.log(`[✈️💥] Máy bay NỔ ➜ SID: ${sid} | ODD: ${max_odd.toFixed(2)}x | ${time_str}`);
      last_logged.add(sid);

      logged_results[sid] = {
        Phien: parseInt(sid),
        Ket_qua: max_odd.toFixed(2),
        Thoigian: time_str,
        id: "hknamvip"
      };
    }
  });
}, 500);

// 📶 KeepAlive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(["7", "MiniGame", "1", keep_alive_count++]));
    console.log(`📶 KeepAlive lần ${keep_alive_count}`);
  }
}, 10000);

// 🛡 Ngừa sleep khi deploy (Render/Railway)
setInterval(() => {
  if (SELF_URL.includes("http")) {
    axios.get(`${SELF_URL}/api/latest`).catch(() => {});
  }
}, 5 * 60 * 1000);

// 📡 API: /api/latest ➜ phiên đã nổ mới nhất
app.get("/api/latest", (req, res) => {
  const sids = Object.keys(logged_results);
  if (sids.length === 0) return res.json({ message: "Chưa có phiên nào nổ" });

  const latest_sid = Math.max(...sids.map(Number));
  res.json(logged_results[latest_sid]);
});

// 📡 API: /api/history ➜ 10 phiên đã nổ gần nhất
app.get("/api/history", (req, res) => {
  const sids = Object.keys(logged_results)
    .map(Number)
    .sort((a, b) => b - a)
    .slice(0, 10);

  const result = sids.map((sid) => logged_results[sid]);
  res.json(result);
});

// 📡 API: /
app.get("/", (req, res) => {
  res.json({
    status: "Aviator đang chạy",
    tong_phien: Object.keys(session_odds).length,
    da_no: last_logged.size
  });
});

// 🚀 Start Server + WebSocket
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  connectWebSocket();
});
