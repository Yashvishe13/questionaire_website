const { createClient } = require("@supabase/supabase-js");

function applyCors(res) {
  const origin = process.env.ALLOW_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getPayload(req) {
  const raw = req.body;
  if (raw == null) {
    return {};
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      return null;
    }
  }
  return raw;
}

module.exports = async (req, res) => {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    sendJson(res, 500, { error: "Missing Supabase environment variables" });
    return;
  }

  const payload = getPayload(req);
  if (payload === null) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const participantId = payload.participantId;
  const sessionId = payload.sessionId;

  if (!participantId || !sessionId) {
    sendJson(res, 400, {
      error: "participantId and sessionId are required",
    });
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const row = {
    participant_id: participantId,
    session_id: sessionId,
    payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("questionnaire_responses")
    .upsert(row, { onConflict: "participant_id,session_id" });

  if (error) {
    console.error(error);
    sendJson(res, 500, { error: "Failed to save response" });
    return;
  }

  sendJson(res, 200, { ok: true });
};
