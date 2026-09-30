/* WINDOWKILL leaderboard — Vercel serverless adapter (SCAFFOLD).
 *
 * ⏳ TRẠNG THÁI: CHỜ USER CẤP DB URL — chưa hoạt động.
 *
 * Vì sao cần file này: Vercel functions là stateless, filesystem ephemeral nên
 * SQLite của server/ không persist được. Adapter này là điểm cắm sẵn để đọc/ghi
 * leaderboard qua database ngoài (Turso / Neon / Supabase / Upstash).
 *
 * Cách kích hoạt (user làm, không cần team):
 *   1. Tự tạo database ở 1 trong các dịch vụ trên (khuyến nghị Turso).
 *   2. Trên Vercel dashboard → Project Settings → Environment Variables, thêm:
 *        WK_LEADERBOARD_DRIVER = turso | neon | supabase | upstash
 *        WK_LEADERBOARD_URL    = <database URL / REST URL>
 *        WK_LEADERBOARD_TOKEN  = <auth token>
 *   3. Báo backend team để cắm driver thật vào hàm `query()` bên dưới
 *      (cài thêm 1 dependency duy nhất, ví dụ: npm i @libsql/client).
 *
 * TUYỆT ĐỐI: không hardcode secret trong file này — mọi credential chỉ qua ENV.
 * Khi chưa cấu hình, mọi request nhận 503 JSON rõ ràng để client fallback
 * về leaderboard localStorage (js/api.js đã xử lý graceful).
 */
"use strict";

const DRIVER = process.env.WK_LEADERBOARD_DRIVER || "";
const DB_URL = process.env.WK_LEADERBOARD_URL || "";
const DB_TOKEN = process.env.WK_LEADERBOARD_TOKEN || "";

const configured = () =>
  ["turso", "neon", "supabase", "upstash"].includes(DRIVER) && !!DB_URL && !!DB_TOKEN;

const json = (res, status, obj) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(obj));
};
const ok = (res, data, status = 200) => json(res, status, { ok: true, data });
const fail = (res, status, error, hint) =>
  json(res, status, { ok: false, error, ...(hint ? { hint } : {}) });

const NOT_CONFIGURED_HINT =
  "Leaderboard online chưa được cấu hình: cần user tạo database (Turso/Neon/Supabase/Upstash) " +
  "và set ENV WK_LEADERBOARD_DRIVER / WK_LEADERBOARD_URL / WK_LEADERBOARD_TOKEN trên Vercel. " +
  "Xem docs/DEPLOY-BACKEND.md.";

/* ------------------------------------------------------------------
 * query(): điểm cắm driver DB duy nhất. Khi user đã cấp credentials,
 * backend team thay thân hàm này bằng driver thật, ví dụ với Turso:
 *
 *   import { createClient } from "@libsql/client";   // npm i @libsql/client
 *   const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
 *   async function query(sql, args) { return db.execute({ sql, args }); }
 *
 * Giữ nguyên chữ ký (sql, args) để phần handler bên dưới không phải sửa.
 * ------------------------------------------------------------------ */
async function query(_sql, _args) {
  throw new Error(
    "no database driver installed — set WK_LEADERBOARD_* env vars and plug a driver into query()"
  );
}

/* --- minimal validation (mirror server/src/validate.js shapes) --- */
const DIFFS = ["chill", "normal", "hard"];
const intIn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

async function handleGet(req, res, url) {
  const difficulty = url.searchParams.get("difficulty") || "normal";
  const limit = url.searchParams.get("limit") === null ? 10 : intIn(Number(url.searchParams.get("limit")), 1, 50);
  if (!DIFFS.includes(difficulty) || limit === null) return fail(res, 400, "invalid query");
  const rows = await query(
    `SELECT profile_name AS "profileName", score, wave, difficulty, created_at AS "createdAt"
     FROM leaderboard WHERE difficulty = ? ORDER BY score DESC, created_at ASC LIMIT ?`,
    [difficulty, limit]
  );
  ok(res, rows.rows ?? rows);
}

async function handlePost(req, res) {
  const body = await readBody(req, 64 * 1024);
  let b;
  try { b = JSON.parse(body); } catch { return fail(res, 400, "invalid JSON body"); }
  const score = intIn(b.score, 0, 99_999_999);
  const wave = intIn(b.wave, 0, 9_999);
  const name = typeof b.profileName === "string" && b.profileName.trim().slice(0, 24);
  if (score === null || wave === null || !name || !DIFFS.includes(b.difficulty)) {
    return fail(res, 400, "invalid score: need profileName (1-24), score, wave, difficulty");
  }
  await query(
    `INSERT INTO leaderboard (profile_name, score, wave, difficulty, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [b.profileName.trim().slice(0, 24), score, wave, b.difficulty, Date.now()]
  );
  ok(res, { inserted: true }, 201);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* Vercel entrypoint: GET /api/leaderboard?difficulty=&limit= · POST /api/leaderboard */
export default async function handler(req, res) {
  try {
    if (!configured()) {
      return fail(res, 503, "leaderboard_not_configured", NOT_CONFIGURED_HINT);
    }
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET") return await handleGet(req, res, url);
    if (req.method === "POST") return await handlePost(req, res);
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
    return fail(res, 405, "method not allowed");
  } catch (e) {
    console.error("[api/leaderboard]", e?.message);
    return fail(res, 500, "internal server error");
  }
}
