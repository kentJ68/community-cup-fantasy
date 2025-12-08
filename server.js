// ===============================
// BEOWULF FANTASY ENGINE (FULL BUILD v3)
// Updated with:
// - League Teams
// - Fixtures Generator
// - Season Leaderboard + Badges
// - Normalized Stats
// - Team Lock
// - IP Limit
// - Recompute Engine
// ===============================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { OAuth2Client } = require("google-auth-library");

// -------------------------
// ENV
// -------------------------
const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "Ok12345";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// -------------------------
// DB CONNECT
// -------------------------
mongoose
  .connect(MONGO, { dbName: "beowulf_fantasy" })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo Error:", err));

// -------------------------
// MODELS
// -------------------------
const User = require("./models/User");
const Match = require("./models/Match");
const Team = require("./models/Team");
const Contest = require("./models/Contest");
const TeamEntry = require("./models/TeamEntry");
const LeagueTeam = require("./models/LeagueTeam"); // NEW

// -------------------------
// APP + SOCKET
// -------------------------
const app = express();
const server = http.createServer(app);

const { Server: IOServer } = require("socket.io");
const io = new IOServer(server, { cors: { origin: "*" } });
global.io = io;

// Allow real client IP even behind proxy
app.set("trust proxy", true);

// -------------------------
// SOCKET EVENTS
// -------------------------
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinMatch", (matchId) => {
    if (matchId) socket.join(`match_${matchId}`);
  });

  socket.on("leaveMatch", (matchId) => {
    if (matchId) socket.leave(`match_${matchId}`);
  });
});

// -------------------------
// MIDDLEWARE
// -------------------------
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const UPLOAD_DIR = path.join(__dirname, "uploads");
const AVATAR_DIR = path.join(__dirname, "public", "assets", "avatars");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const uploadRoster = multer({ dest: path.join(UPLOAD_DIR, "roster") });
const uploadAvatar = multer({ dest: AVATAR_DIR });

// -------------------------
// HELPERS
// -------------------------
function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const auth = (req.headers.authorization || "").split(" ");
  if (auth.length === 2 && auth[0] === "Bearer") {
    const pl = verifyJwt(auth[1]);
    if (pl) {
      req.user = pl;
      return next();
    }
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function admin(req, res, next) {
  const token = (req.headers["x-admin-token"] || "").trim();
  const header = (req.headers.authorization || "").split(" ");

  if (token === ADMIN_TOKEN) return next();

  if (header.length === 2 && header[0] === "Bearer") {
    const pl = verifyJwt(header[1]);
    if (pl && pl.role === "admin") {
      req.user = pl;
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized (admin)" });
}

// Helper: extract player name from any stat
function statPlayerName(stat) {
  if (!stat) return "";
  const keys = ["playerName", "player", "name", "fullName", "player_name"];
  for (const k of keys) {
    if (stat[k]) return String(stat[k]).trim();
  }
  for (const k of Object.keys(stat)) {
    if (k.toLowerCase().includes("name")) return String(stat[k]).trim();
  }
  return "";
}

function num(v) {
  return Number(v || 0);
}

// Scoring engine
function computePoints(stat, isC = false, isV = false) {
  if (!stat) return 0;

  const runs = num(stat.runs);
  const fours = num(stat.fours);
  const sixes = num(stat.sixes);
  const wk = num(stat.wickets);
  const maidens = num(stat.maidens);
  const catches = num(stat.catches);
  const mvp = stat.mvp ? 1 : 0;

  let pts = 0;
  pts += runs * 1;
  pts += fours * 1;
  pts += sixes * 2;
  pts += wk * 25;
  if (wk >= 3) pts += 10;
  pts += maidens * 10;
  pts += catches * 8;
  pts += mvp * 15;

  if (isC) pts *= 2;
  if (isV) pts = Math.round(pts * 1.5);

  return Math.round(pts);
}

// -------------------------
// GOOGLE LOGIN
// -------------------------
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.post("/api/auth/google-idtoken", async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: "id_token missing" });

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const googleId = payload.sub;

    let user = await User.findOne({ googleId });
    if (!user && email) user = await User.findOne({ email });

    if (user) {
      user.googleId = googleId;
      if (!user.avatarUrl) user.avatarUrl = payload.picture;
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        displayName: payload.name,
        avatarUrl: payload.picture,
      });
    }

    const token = signJwt({ id: user._id, role: user.role });

    return res.json({
      ok: true,
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: "Invalid id_token" });
  }
});

// -------------------------
// AUTH REGISTER + LOGIN
// -------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    if (await User.findOne({ email }))
      return res.status(400).json({ error: "Email exists" });

    const hash = await bcrypt.hash(password, 12);

    const user = await User.create({
      email,
      passwordHash: hash,
      displayName,
    });

    const token = signJwt({ id: user._id, role: user.role });
    return res.json({
      ok: true,
      token,
      user: { id: user._id, displayName },
    });
  } catch (err) {
    return res.status(500).json({ error: "Register failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Invalid" });

    const token = signJwt({ id: user._id, role: user.role });

    return res.json({
      ok: true,
      token,
      user: { id: user._id, displayName: user.displayName },
    });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
});

// -------------------------
// PROFILE
// -------------------------
app.get("/api/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ error: "User not found" });
  delete user.passwordHash;
  return res.json({ ok: true, user });
});

app.post("/api/me/avatar", auth, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "No user" });

    const ext = path.extname(req.file.originalname) || ".png";
    const fileName = `${user._id}_${Date.now()}${ext}`;
    fs.renameSync(req.file.path, path.join(AVATAR_DIR, fileName));

    user.avatarUrl = `/assets/avatars/${fileName}`;
    await user.save();

    return res.json({ ok: true, avatarUrl: user.avatarUrl });
  } catch (err) {
    return res.status(500).json({ error: "Avatar upload failed" });
  }
});

// -------------------------
// MATCHES (ADMIN)
// -------------------------
app.post("/api/admin/matches", admin, async (req, res) => {
  try {
    const { name, startTime, streamUrl, teamA, teamB } = req.body;
    if (!name) return res.status(400).json({ error: "Match name required" });

    const match = await Match.create({
      name,
      startTime: startTime ? new Date(startTime) : new Date(),
      streamUrl,
      teamA,
      teamB,
    });

    return res.json({ ok: true, match });
  } catch (err) {
    return res.status(500).json({ error: "Match creation failed" });
  }
});

// DELETE MATCH
app.delete("/api/admin/matches/:matchId", admin, async (req, res) => {
  const { matchId } = req.params;

  await Contest.deleteMany({ matchId });
  await Team.deleteMany({ matchId });
  await TeamEntry.deleteMany({ matchId });
  await Match.deleteOne({ _id: matchId });

  io.emit("matchDeleted", { matchId });

  return res.json({ ok: true });
});

// PUBLIC list matches
app.get("/api/matches", async (req, res) => {
  const matches = await Match.find().sort({ startTime: -1 }).lean();
  return res.json(matches);
});

// GET match
app.get("/api/matches/:matchId", async (req, res) => {
  const match = await Match.findById(req.params.matchId).lean();
  if (!match) return res.status(404).json({ error: "Match not found" });
  return res.json(match);
});

// -------------------------
// ROSTER CSV + JSON UPLOAD
// -------------------------
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!text) return { header: [], rows: [] };
  const lines = text.split("\n");
  const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const rows = lines.slice(1).map((l) => l.split(",").map((x) => x.trim()));
  return { header, rows };
}

app.post(
  "/api/admin/matches/:matchId/roster-csv",
  admin,
  uploadRoster.single("rosterCsv"),
  async (req, res) => {
    try {
      const csv = fs.readFileSync(req.file.path, "utf8");
      fs.unlinkSync(req.file.path);

      const parsed = parseCSV(csv);
      const players = parsed.rows.map((row) => {
        const obj = {};
        parsed.header.forEach((h, i) => (obj[h] = row[i]));

        return {
          playerId: obj.playerid || "",
          playerName: obj.playername || obj.name || "",
          role: (obj.role || "BAT").toUpperCase(),
          realTeam: obj.realteam || "",
          credits: Number(obj.credits || 0),
          status: obj.status || "active",
        };
      });

      const match = await Match.findById(req.params.matchId);
      match.players = players;
      await match.save();

      io.to(`match_${match._id}`).emit("rosterUpdate", {
        matchId: match._id,
        players,
      });

      return res.json({ ok: true, count: players.length });
    } catch (err) {
      return res.status(500).json({ error: "Roster CSV failed" });
    }
  }
);

app.post("/api/admin/matches/:matchId/roster", admin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    match.players = req.body.players || [];
    await match.save();

    io.to(`match_${match._id}`).emit("rosterUpdate", {
      matchId: match._id,
      players: match.players,
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Roster save failed" });
  }
});

app.get("/api/matches/:matchId/players", async (req, res) => {
  const match = await Match.findById(req.params.matchId).lean();
  if (!match) return res.status(404).json({ error: "No match" });
  return res.json({ ok: true, players: match.players });
});

// -------------------------
// CONTESTS (ADMIN & PUBLIC)
// -------------------------

// ADMIN create contest
app.post("/api/admin/matches/:matchId/contests", admin, async (req, res) => {
  try {
    const { title, entryFee, maxEntries, perViewerLimit } = req.body;

    if (!title) return res.status(400).json({ error: "title required" });

    const contest = await Contest.create({
      matchId: req.params.matchId,
      title,
      entryFee,
      maxEntries,
      perViewerLimit,
    });

    return res.json({ ok: true, contest });
  } catch (err) {
    console.error("Contest create error:", err);
    return res.status(500).json({ error: "Contest creation failed" });
  }
});

// ADMIN delete contest
app.delete("/api/admin/contests/:contestId", admin, async (req, res) => {
  try {
    const { contestId } = req.params;

    await TeamEntry.deleteMany({ contestId });
    await Contest.deleteOne({ _id: contestId });

    io.emit("contestDeleted", { contestId });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Contest delete error:", err);
    return res.status(500).json({ error: "Contest delete failed" });
  }
});

// GET contests for a match
app.get("/api/matches/:matchId/contests", async (req, res) => {
  const contests = await Contest.find({
    matchId: req.params.matchId,
    archived: { $ne: true },
  }).lean();

  return res.json(contests);
});

// -------------------------
// TEAM CREATION (PUBLIC)
// -------------------------

const MAX_TEAMS_PER_IP = 1; // You can change this if needed

app.post("/api/matches/:matchId/teams", async (req, res) => {
  try {
    const { matchId } = req.params;
    const { players, captain, vice, name, viewerName, linkedChannel } = req.body;

    if (!Array.isArray(players) || players.length !== 11)
      return res.status(400).json({ error: "Team must have 11 players" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    // Check match start lock
    const now = new Date();
    const start = match.startTime ? new Date(match.startTime) : null;
    if (start && now >= start)
      return res.status(400).json({
        error: "Team submissions are closed — match has started",
      });

    // IP detection
    const ip =
      req.ip ||
      (req.headers["x-forwarded-for"] || "").split(",")[0] ||
      req.connection.remoteAddress ||
      "";

    // Enforce per-IP team limit
    if (MAX_TEAMS_PER_IP > 0) {
      const count = await Team.countDocuments({ matchId, ip });
      if (count >= MAX_TEAMS_PER_IP) {
        return res.status(429).json({
          error: `You already submitted (limit ${MAX_TEAMS_PER_IP})`,
        });
      }
    }

    // Create team
    const team = await Team.create({
      matchId,
      players,
      captain,
      vice,
      name,
      viewerName,
      linkedChannel,
      ip,
      createdAt: new Date(),
    });

    io.to(`match_${matchId}`).emit("teamCreated", {
      matchId,
      teamId: team._id,
      viewerName,
      name,
    });

    return res.json({ ok: true, team });
  } catch (err) {
    console.error("Team creation failed:", err);
    return res.status(500).json({ error: "Team creation failed" });
  }
});

// -------------------------
// CONTEST ENTRY (PUBLIC)
// -------------------------
app.post("/api/contests/:contestId/join", async (req, res) => {
  try {
    const { contestId } = req.params;
    const { viewerName, players, captain } = req.body;

    const contest = await Contest.findById(contestId);
    if (!contest) return res.status(404).json({ error: "No contest" });

    const entry = await TeamEntry.create({
      matchId: contest.matchId,
      contestId,
      viewerName,
      players,
      captain,
      ip: req.ip,
    });

    return res.json({ ok: true, entry });
  } catch (err) {
    console.error("Contest join error:", err);
    return res.status(500).json({ error: "Join failed" });
  }
});

// -------------------------
// STATS ENGINE (ADMIN)
// -------------------------

app.post("/api/admin/matches/:matchId/stats", admin, async (req, res) => {
  try {
    const { matchId } = req.params;
    const stats = req.body.stats || [];

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: "No match" });

    // Normalize stats
    const normalized = stats.map((s) => ({
      ...s,
      playerName: statPlayerName(s),
    }));

    match.stats = normalized;
    await match.save();

    // Build stat map
    const statMap = {};
    normalized.forEach((s) => {
      statMap[s.playerName.toUpperCase()] = s;
    });

    // Compute updated totals for each team
    const teams = await Team.find({ matchId });
    for (const t of teams) {
      let total = 0;

      (t.players || []).forEach((p) => {
        const stat =
          statMap[p.toUpperCase()] ||
          statMap[(p || "").trim().toUpperCase()] ||
          {};

        total += computePoints(stat, p === t.captain, p === t.vice);
      });

      await Team.findByIdAndUpdate(t._id, { totalPoints: total });
    }

    io.to(`match_${matchId}`).emit("matchStatsUpdate", { matchId });
    io.to(`match_${matchId}`).emit("leaderboardUpdate", { matchId });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ error: "Stats update failed" });
  }
});

// -------------------------
// MATCH LEADERBOARD
// -------------------------

app.get("/api/matches/:matchId/leaderboard", async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId).lean();
    if (!match) return res.status(404).json({ error: "No match" });

    const statMap = {};
    (match.stats || []).forEach((s) => {
      statMap[s.playerName.toUpperCase()] = s;
    });

    const teams = await Team.find({ matchId: match._id }).lean();

    const board = teams
      .map((t) => {
        let total = 0;

        (t.players || []).forEach((p) => {
          const stat =
            statMap[p.toUpperCase()] ||
            statMap[(p || "").trim().toUpperCase()] ||
            {};
          total += computePoints(stat, p === t.captain, p === t.vice);
        });

        return {
          teamId: t._id,
          name: t.name,
          viewerName: t.viewerName,
          total,
        };
      })
      .sort((a, b) => b.total - a.total);

    return res.json({ ok: true, leaderboard: board });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return res.status(500).json({ error: "Leaderboard failed" });
  }
});

// ======================================================
//                LEAGUE TEAM SYSTEM
// ======================================================

// GET all league teams
app.get("/api/league/teams", async (req, res) => {
  const teams = await LeagueTeam.find().lean();
  return res.json({ ok: true, teams });
});

// ADMIN: Seed league teams (bulk load all 8 teams)
app.post("/api/admin/league/teams/seed", admin, async (req, res) => {
  try {
    const { teams } = req.body;

    if (!Array.isArray(teams))
      return res.status(400).json({ error: "teams array required" });

    await LeagueTeam.deleteMany({});
    await LeagueTeam.insertMany(teams);

    return res.json({ ok: true, inserted: teams.length });
  } catch (err) {
    console.error("Seed teams error:", err);
    return res.status(500).json({ error: "Seed failed" });
  }
});

// ======================================================
//                   FIXTURES GENERATOR
// ======================================================

app.get("/api/league/fixtures", async (req, res) => {
  const teams = await LeagueTeam.find().lean();

  if (teams.length === 0)
    return res.json({ ok: true, fixtures: [] });

  // Create working list
  const t = teams.map((x) => ({
    id: String(x._id),
    short: x.short,
    name: x.name,
  }));

  // If odd, add a BYE
  if (t.length % 2 === 1)
    t.push({ id: "BYE", short: "BYE", name: "BYE" });

  const n = t.length;
  const rounds = n - 1;
  const half = n / 2;

  let arr = t.slice();
  const fixtures = [];

  for (let round = 0; round < rounds; round++) {
    const matches = [];

    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];

      if (home.id !== "BYE" && away.id !== "BYE") {
        matches.push({
          round: round + 1,
          home,
          away,
        });
      }
    }

    fixtures.push(...matches);

    // Rotate
    arr.splice(1, 0, arr.pop());
  }

  res.json({ ok: true, fixtures });
});

// ======================================================
//                SEASON LEADERBOARD
// ======================================================

app.get("/api/season/leaderboard", async (req, res) => {
  try {
    const teams = await Team.find().lean();
    const matches = await Match.find().lean();

    // Build stat maps for every match
    const matchStats = {};
    matches.forEach((m) => {
      const map = {};
      (m.stats || []).forEach((s) => {
        const n = (s.playerName || "").trim().toUpperCase();
        map[n] = s;
      });
      matchStats[String(m._id)] = map;
    });

    // viewerName → total season score
    const totals = {};

    for (const t of teams) {
      const statMap = matchStats[String(t.matchId)] || {};

      let computed = 0;
      (t.players || []).forEach((p) => {
        const key = (p || "").trim().toUpperCase();
        const st = statMap[key] || {};
        computed += computePoints(st, p === t.captain, p === t.vice);
      });

      const finalTotal = computed > 0 ? computed : (t.totalPoints || 0);

      if (!totals[t.viewerName]) totals[t.viewerName] = 0;
      totals[t.viewerName] += finalTotal;
    }

    const leaderboard = Object.entries(totals)
      .map(([viewerName, total]) => ({ viewerName, total }))
      .sort((a, b) => b.total - a.total);

    return res.json({ ok: true, leaderboard });
  } catch (err) {
    console.error("Season leaderboard error:", err);
    return res.status(500).json({ error: "Season leaderboard failed" });
  }
});

// ======================================================
//                   SEASON BADGES
// ======================================================

app.get("/api/season/badges", async (req, res) => {
  try {
    const teams = await Team.find().lean();
    const matches = await Match.find().lean();

    let highestScore = 0;
    let mvp = null;

    const top10Counter = {};

    for (const m of matches) {
      const map = {};
      (m.stats || []).forEach((s) => {
        map[(s.playerName || "").trim().toUpperCase()] = s;
      });

      const matchTeams = teams.filter((t) => String(t.matchId) === String(m._id));

      const scores = matchTeams.map((t) => {
        let total = 0;

        (t.players || []).forEach((p) => {
          const key = (p || "").trim().toUpperCase();
          total += computePoints(map[key], p === t.captain, p === t.vice);
        });

        if (total > highestScore) {
          highestScore = total;
          mvp = { viewerName: t.viewerName, score: total, matchName: m.name };
        }

        return { viewerName: t.viewerName, total };
      });

      scores.sort((a, b) => b.total - a.total);

      scores.slice(0, 10).forEach((s) => {
        top10Counter[s.viewerName] = (top10Counter[s.viewerName] || 0) + 1;
      });
    }

    const badges = [];

    if (mvp) badges.push({ type: "Season MVP", ...mvp });

    Object.entries(top10Counter).forEach(([viewerName, count]) => {
      if (count >= 5)
        badges.push({ type: "Consistency King", viewerName, count });
    });

    teams.forEach((t) => {
      if ((t.totalPoints || 0) >= 400)
        badges.push({ type: "High Roller (400+ pts)", viewerName: t.viewerName });
    });

    return res.json({ ok: true, badges });
  } catch (err) {
    console.error("Season badges error:", err);
    return res.status(500).json({ error: "Badges failed" });
  }
});

// ======================================================
//       ADMIN SEASON RECOMPUTE (RECALCULATE ALL)
// ======================================================

app.post("/api/admin/season/recompute", admin, async (req, res) => {
  try {
    const matches = await Match.find().lean();
    const teams = await Team.find();

    // Build stat maps for each match
    const matchStats = {};
    matches.forEach((m) => {
      const map = {};
      (m.stats || []).forEach((s) => {
        const key = (s.playerName || "").trim().toUpperCase();
        map[key] = s;
      });
      matchStats[String(m._id)] = map;
    });

    let updated = 0;

    for (const t of teams) {
      const statMap = matchStats[String(t.matchId)] || {};
      let computed = 0;

      (t.players || []).forEach((p) => {
        const key = (p || "").trim().toUpperCase();
        computed += computePoints(statMap[key], p === t.captain, p === t.vice);
      });

      if (computed !== t.totalPoints) {
        t.totalPoints = computed;
        await t.save();
        updated++;
      }
    }

    return res.json({ ok: true, updated });
  } catch (err) {
    console.error("Recompute error:", err);
    return res.status(500).json({ error: "Recompute failed" });
  }
});

// ======================================================
//                HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
  return res.json({ ok: true, time: new Date() });
});

// ======================================================
//                START SERVER
// ======================================================

server.listen(PORT, () =>
  console.log(`🚀 SERVER READY → http://localhost:${PORT}`)
);
