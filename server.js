// server.js (with rate-limiting + one-submission-per-IP)
require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

// If you're behind a reverse proxy (Render, Vercel, etc.) set trust proxy:
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- CONFIG ----------
const MONGO = process.env.MONGO_URI || "";
const PORT = process.env.PORT || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// ---------- RATE LIMITER ----------
// Global limiter for all routes (adjust values as needed)
const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // max requests per IP per windowMs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Specific, stricter limiter for team submissions (to avoid spam)
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max submissions per IP per hour across the entries endpoint
  message: { error: "Too many submissions from this IP, try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

// ---------- DB CONNECT ----------
let dbConnected = false;
if (MONGO) {
  mongoose
    .connect(MONGO, { dbName: "community_cup_fantasy" })
    .then(() => {
      console.log("MongoDB connected");
      dbConnected = true;
    })
    .catch((err) => {
      console.error("Mongo error:", err);
    });
} else {
  console.log("MONGO_URI not set — running without DB (use .env to set it)");
}

// ---------- SCHEMAS (include ip field on TeamEntry) ----------
const matchSchema = new mongoose.Schema(
  {
    name: String,
    date: Date,
    stats: [
      {
        playerName: String,
        runs: { type: Number, default: 0 },
        fours: { type: Number, default: 0 },
        sixes: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        maidens: { type: Number, default: 0 },
        catches: { type: Number, default: 0 }
      }
    ]
  },
  { timestamps: true }
);

const teamEntrySchema = new mongoose.Schema(
  {
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match" },
    viewerName: String,
    handle: String,
    players: [String],
    captain: String,
    ip: String, // store submitter IP
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
const TeamEntry =
  mongoose.models.TeamEntry || mongoose.model("TeamEntry", teamEntrySchema);

// ---------- In-memory fallback (when DB not connected) ----------
let inMemoryMatches = [];
let inMemoryEntries = [];
let localMatchNextId = 1;
let localEntryNextId = 1;

function usingDB() {
  return dbConnected && mongoose.connection && mongoose.connection.readyState === 1;
}

// ---------- Helpers ----------
function calcPlayerPoints(stat) {
  if (!stat) return 0;
  const runs = stat.runs || 0;
  const fours = stat.fours || 0;
  const sixes = stat.sixes || 0;
  const wickets = stat.wickets || 0;
  const maidens = stat.maidens || 0;
  const catches = stat.catches || 0;

  return (
    runs * 1 +
    fours * 1 +
    sixes * 2 +
    wickets * 20 +
    maidens * 10 +
    catches * 10
  );
}

// ---------- Admin auth ----------
function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.adminToken;
  if (!ADMIN_TOKEN) return res.status(401).json({ error: "Admin token not configured on server" });
  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized (admin token missing/wrong)" });
}

// Helper: get client IP reliably
function getClientIp(req) {
  // trust proxy if configured; x-forwarded-for may contain multiple IPs
  const raw = req.headers["x-forwarded-for"] || req.ip || req.connection?.remoteAddress || "";
  if (!raw) return "";
  return raw.split(",")[0].trim();
}

// ---------- Routes ----------
// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Fantasy API running" });
});

// DEBUG route: inspect match + entries (temporary)
app.get("/debug/match-data/:matchId", async (req, res) => {
  try {
    const { matchId } = req.params;
    if (usingDB()) {
      const match = await Match.findById(matchId).lean();
      const entries = await TeamEntry.find({ matchId }).lean();
      return res.json({ ok: true, match, entries });
    } else {
      const match = inMemoryMatches.find((m) => String(m._id) === String(matchId));
      const entries = inMemoryEntries.filter((e) => String(e.matchId) === String(matchId));
      return res.json({ ok: true, match, entries });
    }
  } catch (err) {
    console.error("DEBUG /debug/match-data error:", err);
    return res.status(500).json({ error: "debug-failed", details: err.message });
  }
});

// Create match (admin)
app.post("/api/matches", adminAuth, async (req, res) => {
  try {
    const { name, date } = req.body;
    if (!name || name.toString().trim() === "") {
      return res.status(400).json({ error: "Match name required" });
    }

    if (usingDB()) {
      const match = await Match.create({ name, date });
      return res.json(match);
    } else {
      const match = {
        _id: `local-${localMatchNextId++}`,
        name,
        date: date || new Date(),
        stats: []
      };
      inMemoryMatches.push(match);
      return res.json(match);
    }
  } catch (err) {
    console.error("Create match error:", err);
    return res.status(500).json({ error: "Failed to create match" });
  }
});

// Get matches
app.get("/api/matches", async (req, res) => {
  try {
    if (usingDB()) {
      const matches = await Match.find().sort({ date: -1 });
      return res.json(matches);
    } else {
      const sorted = inMemoryMatches.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.json(sorted);
    }
  } catch (err) {
    console.error("Get matches error:", err);
    return res.status(500).json({ error: "Failed to fetch matches" });
  }
});

// Update stats for a match (admin)
app.post("/api/matches/:matchId/stats", adminAuth, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { stats } = req.body; // expected array

    if (!Array.isArray(stats)) return res.status(400).json({ error: "stats must be an array" });

    if (usingDB()) {
      const match = await Match.findById(matchId);
      if (!match) return res.status(404).json({ error: "Match not found" });
      match.stats = stats;
      await match.save();
      return res.json({ ok: true, match });
    } else {
      const match = inMemoryMatches.find((m) => String(m._id) === String(matchId));
      if (!match) return res.status(404).json({ error: "Match not found (in-memory)" });
      match.stats = stats;
      return res.json({ ok: true, match });
    }
  } catch (err) {
    console.error("Update stats error:", err);
    return res.status(500).json({ error: "Failed to update stats" });
  }
});

// Viewer submit entry (with submitLimiter applied)
app.post("/api/matches/:matchId/entries", submitLimiter, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { viewerName, handle, players, captain } = req.body;
    const ip = getClientIp(req);

    if (!viewerName || !players || players.length === 0 || !captain) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // One-submission-per-IP or per-viewerName for this match
    if (usingDB()) {
      // check by viewerName OR ip
      const existing = await TeamEntry.findOne({
        matchId,
        $or: [{ viewerName: viewerName }, { ip: ip }]
      });
      if (existing) {
        return res.status(400).json({ error: "You already submitted a team for this match (viewer or IP already used)" });
      }

      const entry = await TeamEntry.create({ matchId, viewerName, handle, players, captain, ip });
      console.log("New entry (DB):", entry.viewerName, "match:", matchId, "ip:", ip);
      return res.json({ ok: true, entry });
    } else {
      // in-memory
      const exists = inMemoryEntries.find((e) => e.matchId === matchId && (e.viewerName === viewerName || e.ip === ip));
      if (exists) {
        return res.status(400).json({ error: "You already submitted a team for this match (local viewer or IP already used)" });
      }

      const entry = {
        _id: `entry-${localEntryNextId++}`,
        matchId,
        viewerName,
        handle,
        players,
        captain,
        ip,
        createdAt: new Date()
      };
      inMemoryEntries.push(entry);
      console.log("New entry (MEM):", viewerName, "match:", matchId, "ip:", ip);
      return res.json({ ok: true, entry });
    }
  } catch (err) {
    console.error("Submit entry error:", err);
    return res.status(500).json({ error: "Failed to submit entry" });
  }
});
const multer = require("multer");
const fetch = require("node-fetch");
const upload = multer({ dest: path.join(__dirname, "tmp_uploads") });
const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "";

// Admin: upload screenshot and parse scorecard using OCR.space
app.post("/api/admin/ocr-scorecard/:matchId", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const matchId = req.params.matchId;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!OCR_SPACE_KEY) return res.status(500).json({ error: "OCR API key not configured" });

    // send file to OCR.space
    const formData = new (require("form-data"))();
    formData.append("apikey", OCR_SPACE_KEY);
    formData.append("language", "eng");
    formData.append("isTable", "true");
    formData.append("OCREngine", "2");
    formData.append("file", require("fs").createReadStream(req.file.path));

    const ocrRes = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: formData });
    const ocrJson = await ocrRes.json();

    // cleanup temp file
    try { require("fs").unlinkSync(req.file.path); } catch(e){}

    if (!ocrJson || !ocrJson.ParsedResults || ocrJson.ParsedResults.length === 0) {
      return res.status(500).json({ error: "OCR failed", details: ocrJson });
    }

    const text = ocrJson.ParsedResults.map(p => p.ParsedText).join("\n");
    // parse text into stats
    const stats = parseScorecardTextToStats(text);
    if (!stats || stats.length === 0) {
      return res.status(400).json({ error: "No players parsed from image", rawText: text });
    }

    // Save stats to match (use your existing Update Stats route logic)
    // If using DB:
    if (usingDB()) {
      const match = await Match.findById(matchId);
      if (!match) return res.status(404).json({ error: "Match not found" });
      match.stats = stats;
      await match.save();
      return res.json({ ok: true, stats, matchId });
    } else {
      // in-memory fallback
      const match = inMemoryMatches.find(m => String(m._id) === String(matchId));
      if (!match) return res.status(404).json({ error: "Match not found (local)" });
      match.stats = stats;
      return res.json({ ok: true, stats, matchId });
    }
  } catch (err) {
    console.error("OCR upload error:", err);
    return res.status(500).json({ error: "OCR processing failed", details: err.message });
  }
});

// Leaderboard
app.get("/api/matches/:matchId/leaderboard", async (req, res) => {
  try {
    const { matchId } = req.params;

    let match;
    let entries;

    if (usingDB()) {
      match = await Match.findById(matchId).lean();
      if (!match) return res.status(404).json({ error: "Match not found" });
      entries = await TeamEntry.find({ matchId }).sort({ createdAt: 1 }).lean();
    } else {
      match = inMemoryMatches.find((m) => String(m._id) === String(matchId));
      if (!match) return res.status(404).json({ error: "Match not found (in-memory)" });
      entries = inMemoryEntries.filter((e) => e.matchId === matchId);
    }

    // build player -> base points map
    const playerPoints = {};
    (match.stats || []).forEach((s) => {
      const key = (s.playerName || "").toUpperCase();
      playerPoints[key] = calcPlayerPoints(s);
    });
// Parse OCR text into stats array
function parseScorecardTextToStats(text) {
  if (!text || typeof text !== "string") return [];

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const stats = [];
  // candidate regex patterns:
  const patterns = [
    // name runs fours sixes wickets maidens catches  (7 columns)
    /^(?<name>[A-Za-z.\-'\s]{2,40})\s+(?<runs>\d{1,3})\s+(?<fours>\d{1,2})\s+(?<sixes>\d{1,2})\s+(?<wickets>\d{1,2})\s+(?<maidens>\d{1,2})\s+(?<catches>\d{1,2})$/,
    // name runs (fours/sixes info) catches etc. fallback simpler:
    /^(?<name>[A-Za-z.\-'\s]{2,40})\s+(?<runs>\d{1,3})\s+(?:\(?[^\)]*\)?)\s*(?<wickets>\d{1,2})?\s*(?<catches>\d{1,2})?$/,
    // common scorecard short: Name 45 4 1 0 0 1
    /^(?<name>[A-Za-z.\-'\s]{2,40})\s+(?<runs>\d{1,3})\s+(?<fours>\d{1,2})\s+(?<sixes>\d{1,2})\s+(?<wickets>\d{1,2})\s+(?<maidens>\d{1,2})\s+(?<catches>\d{1,2})$/
  ];

  for (const raw of lines) {
    // remove common noise (like "Extras", "TOTAL", "Fall of Wickets", etc.)
    const upper = raw.toUpperCase();
    if (upper.includes("EXTRAS") || upper.includes("TOTAL") || upper.includes("FOW") || upper.includes("OVER") || upper.includes("BOWLING") || upper.includes("TEAM")) continue;

    let matched = null;
    for (const p of patterns) {
      const m = raw.match(p);
      if (m && m.groups) { matched = m.groups; break; }
    }

    if (matched) {
      const name = (matched.name || "").replace(/\s{2,}/g, " ").trim();
      const runs = parseInt(matched.runs || 0, 10) || 0;
      const fours = parseInt(matched.fours || 0, 10) || 0;
      const sixes = parseInt(matched.sixes || 0, 10) || 0;
      const wickets = parseInt(matched.wickets || 0, 10) || 0;
      const maidens = parseInt(matched.maidens || 0, 10) || 0;
      const catches = parseInt(matched.catches || 0, 10) || 0;

      // basic sanity filter
      if (name && (runs > 0 || wickets > 0 || catches > 0)) {
        stats.push({ playerName: name.toUpperCase(), runs, fours, sixes, wickets, maidens, catches });
      }
    } else {
      // try to capture patterns like "RUSSELL 45 4x4 1x6 1c"
      // look for name then numbers inside
      const parts = raw.split(/\s{2,}|\s+/).filter(Boolean);
      if (parts.length >= 2) {
        const maybeRuns = parts.find(p => /^\d{1,3}$/.test(p));
        if (maybeRuns) {
          const namePart = raw.substring(0, raw.indexOf(maybeRuns)).trim();
          const name = namePart.replace(/\s{2,}/g, " ").trim();
          if (name.length > 1) {
            const runs = parseInt(maybeRuns, 10) || 0;
            // rough default: other fields zero
            stats.push({ playerName: name.toUpperCase(), runs, fours: 0, sixes: 0, wickets: 0, maidens: 0, catches: 0 });
          }
        }
      }
    }
  }

  // If no stats found at all, try a looser extraction: lines with a number = runs
  if (stats.length === 0) {
    for (const raw of lines) {
      const m = raw.match(/^([A-Za-z.\-'\s]{2,40})\s+(\d{1,3})/);
      if (m) {
        stats.push({ playerName: m[1].trim().toUpperCase(), runs: parseInt(m[2],10)||0, fours:0, sixes:0, wickets:0, maidens:0, catches:0 });
      }
    }
  }

  // remove duplicates by playerName (keep first)
  const seen = new Set();
  return stats.filter(s => {
    if (seen.has(s.playerName)) return false;
    seen.add(s.playerName);
    return true;
  });
}

    // compile leaderboard
    const leaderboard = (entries || []).map((e) => {
      let total = 0;
      const breakdown = [];

      (e.players || []).forEach((p) => {
        const key = (p || "").toUpperCase();
        const base = playerPoints[key] || 0;
        let applied = base;
        let isCaptain = false;
        if (e.captain && key === (e.captain || "").toUpperCase()) {
          applied = base * 2;
          isCaptain = true;
        }
        total += applied;
        breakdown.push({ player: p, base, applied, isCaptain });
      });

      return {
        viewerName: e.viewerName,
        handle: e.handle,
        total,
        breakdown
      };
    });

    leaderboard.sort((a, b) => b.total - a.total);

    return res.json({
      match: { id: match._id, name: match.name, date: match.date },
      leaderboard
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Fallback to index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!MONGO) console.log("MONGO_URI not set — running without DB (use .env to set it)");
});
