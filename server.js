const Fastify = require("fastify");
const WebSocket = require("ws");
const axios = require("axios");

const fastify = Fastify({ logger: false });
const PORT = process.env.PORT || 3010;
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;

let b52LatestDice = null;
let b52CurrentSession = null;
let b52CurrentMD5 = null;
let b52WS = null;
let b52IntervalCmd = null;
const b52ReconnectInterval = 5000;

function calcResult(d1, d2, d3) {
  const total = d1 + d2 + d3;
  return total <= 10 ? "Xỉu" : "Tài";
}

function sendB52Cmd2000() {
  if (b52WS && b52WS.readyState === WebSocket.OPEN) {
    const payload = [6, "MiniGame", "taixiuKCBPlugin", { cmd: 2000 }];
    b52WS.send(JSON.stringify(payload));
  }
}

function connectB52WebSocket() {
  b52WS = new WebSocket("wss://minybordergs.weskb5gams.net/websocket");

  b52WS.on("open", () => {
    const authPayload = [
      1,
      "MiniGame",
      "",
      "",
      {
        agentId: "1",
        accessToken: "13-4bbdf84c08614c7e447383d51c7624db",
        reconnect: false,
      },
    ];
    b52WS.send(JSON.stringify(authPayload));
    clearInterval(b52IntervalCmd);
    b52IntervalCmd = setInterval(sendB52Cmd2000, 5000);
  });

  b52WS.on("message", (data) => {
    try {
      const json = JSON.parse(data);
      if (Array.isArray(json) && json[1]?.htr) {
        const htr = json[1].htr;
        const latest = htr[htr.length - 1];

        if (
          latest &&
          typeof latest.d1 === "number" &&
          typeof latest.d2 === "number" &&
          typeof latest.d3 === "number" &&
          latest.sid
        ) {
          b52LatestDice = {
            d1: latest.d1,
            d2: latest.d2,
            d3: latest.d3,
          };
          b52CurrentSession = latest.sid;

          if (json[1].md5) {
            b52CurrentMD5 = json[1].md5;
          }

          const resultText = calcResult(latest.d1, latest.d2, latest.d3);
          const time = new Date().toISOString().replace("T", " ").slice(0, 19);
          console.log(`[🎲✅] SID ${latest.sid} ➜ Kết quả: ${resultText} (${latest.d1},${latest.d2},${latest.d3}) | ${time}`);
        }
      }
    } catch (e) {
      console.error("❌ Lỗi parse WebSocket:", e.message);
    }
  });

  b52WS.on("close", () => {
    clearInterval(b52IntervalCmd);
    setTimeout(connectB52WebSocket, b52ReconnectInterval);
  });

  b52WS.on("error", (err) => {
    console.error("❌ WebSocket lỗi:", err.message);
    if (b52WS.readyState !== WebSocket.CLOSED) {
      b52WS.close();
    }
  });
}

connectB52WebSocket();

fastify.get("/api/b52", async (request, reply) => {
  if (!b52LatestDice || !b52CurrentSession) {
    return {
      message: "Chưa có dữ liệu",
      status: "waiting"
    };
  }

  const diceValues = [b52LatestDice.d1, b52LatestDice.d2, b52LatestDice.d3];
  const sumDice = diceValues.reduce((a, b) => a + b, 0);
  const current_result = calcResult(...diceValues);

  return {
    current_dice: diceValues,
    current_result,
    current_session: b52CurrentSession,
    next_session: b52CurrentSession + 1,
    current_md5: b52CurrentMD5 || null,
    id: "hknamvip",
    time: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
});

fastify.get("/", async () => {
  return {
    status: "Server B52 Dice đang hoạt động",
    current_session: b52CurrentSession || null,
    time: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
});

// ✅ Giữ cho Render không sleep bằng cách tự ping chính mình mỗi 5 phút
setInterval(() => {
  if (SELF_URL.includes("http")) {
    axios.get(`${SELF_URL}/api/b52`).catch(() => {});
  }
}, 300000); // 5 phút

const start = async () => {
  try {
    const address = await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`🚀 Server B52 đang chạy tại ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();