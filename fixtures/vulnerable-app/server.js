import express from "express";
import { exec } from "node:child_process";
import path from "node:path";

const app = express();
app.use(express.json());

// Auth boundary (intentionally weak for the fixture)
function requireAuth(req, res, next) {
  if (req.headers["x-admin"] === "1") return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// Route + dangerous eval on user input
app.post("/api/calc", (req, res) => {
  const expr = String(req.body?.expr ?? "");
  try {
    const value = eval(expr);
    res.json({ value });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Path join with user-controlled segment
app.get("/api/files", (req, res) => {
  const name = String(req.query.name ?? "");
  const target = path.join("/var/data", name);
  res.json({ target });
});

// SSRF-ish fetch of attacker URL
app.get("/api/preview", async (req, res) => {
  const url = String(req.query.url ?? "");
  const r = await fetch(url);
  const text = await r.text();
  res.send(text.slice(0, 500));
});

// IDOR-ish: returns user id without auth; pairs with admin RCE below
app.get("/api/users/:id", (req, res) => {
  res.json({ id: req.params.id, role: "user" });
});

// ID-gated RCE (chain with unauthenticated id leak above in a real app)
app.post("/api/admin/run", requireAuth, (req, res) => {
  const cmd = String(req.body?.cmd ?? "echo ok");
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ stderr });
    res.json({ stdout });
  });
});

// SQL concat smell
app.get("/api/search", (req, res) => {
  const q = String(req.query.q ?? "");
  const sql = "SELECT * FROM items WHERE name = '" + q + "'";
  res.json({ sql });
});

export default app;
