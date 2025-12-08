// ===============================
// server.js – FULL FANTASY ENGINE
// Version B (Dream11-style)
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
// Environment Variables
// -------------------------
const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGO_URI || process.env.MONGO || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// -------------------------
// MongoDB Connection
// -------------------------
mongoose
  .connect(MONGO, { dbName: "community_cup" })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo Error:", err));

// -------------------------
// Models
// -------------------------
const User = require("./models/User");
const Match = require("./models/Match");
const Team = require("./models/Team");
const Contest = require("./models/Contest");
const TeamEntry = require("./models/TeamEntry");
const LeagueTeam = require("./models/LeagueTeam"); // <-- only require once

// -------------------------
// Express + Server
// -------------------------
const app = express();
const server = http.createServer(app);

// -------------------------
// Socket.IO
// -------------------------
const { Server: IOServer } = require("socket.io");
const io = new IOServer(server, { cors: { origin: "*" } });
global.io = io;

io.on("connection", (socket) => {
  console.log("Socket:", socket.id);

  socket.on("joinMatch", (matchId) => {
    if (matchId) socket.join(`match_${matchId}`);
  });

  socket.on("leaveMatch", (matchId) => {
    if (matchId) socket.leave(`match_${matchId}`);
  });
});

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));

// Static folder
app.use(express.static(path.join(__dirname, "public")));

// Upload folders
const UPLOAD_DIR = path.join(__dirname, "uploads");
const AVATAR_DIR = path.join(__dirname, "public", "assets", "avatars");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const uploadRoster = multer({ dest: path.join(UPLOAD_DIR, "roster") });
const uploadAvatar = multer({ dest: AVATAR_DIR });

// -------------------------
// Helper Functions
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

// AUTH middleware
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

// ADMIN middleware
function admin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.adminToken;

  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();

  const authHeader = (req.headers.authorization || "").split(" ");
  if (authHeader.length === 2 && authHeader[0] === "Bearer") {
    const pl = verifyJwt(authHeader[1]);
    if (pl && pl.role === "admin") {
      req.user = pl;
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized (admin)" });
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
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    let user = await User.findOne({ googleId });
    if (!user && email) user = await User.findOne({ email });

    if (user) {
      user.googleId = googleId;
      if (!user.avatarUrl) user.avatarUrl = picture;
      await user.save();
    } else {
      user = await User.create({
        googleId,
        email,
        displayName: name,
        avatarUrl: picture,
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
    return res.status(400).json({ error: "Invalid id_token" });
  }
});

// -------------------------
// EMAIL REGISTER + LOGIN
// -------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });

    if (await User.findOne({ email }))
      return res.status(400).json({ error: "Email exists" });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      passwordHash: hash,
      displayName,
    });

    const token = signJwt({ id: user._id, role: user.role });
    return res.json({
      ok: true,
      token,
      user: { id: user._id, displayName: user.displayName },
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
// PROFILE + AVATAR
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
    const filePath = path.join(AVATAR_DIR, fileName);

    fs.renameSync(req.file.path, filePath);

    user.avatarUrl = `/assets/avatars/${fileName}`;
    await user.save();

    return res.json({ ok: true, avatarUrl: user.avatarUrl });
  } catch (err) {
    return res.status(500).json({ error: "Avatar upload failed" });
  }
});

// -------------------------
// MATCHES (Admin)
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

app.get("/api/matches", async (req, res) => {
  const matches = await Match.find().sort({ startTime: -1 }).lean();
  return res.json(matches);
});

app.get("/api/matches/:matchId", async (req, res) => {
  const match = await Match.findById(req.params.matchId).lean();
  if (!match) return res.status(404).json({ error: "Match not found" });
  return res.json(match);
});

// -------------------------
// ROSTER UPLOAD (CSV + JSON)
// -------------------------

// CSV parser
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!text) return { header: [], rows: [] };

  const lines = text.split("\n");
  const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => line.split(",").map((x) => x.trim()));
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
      const header = parsed.header;
      const rows = parsed.rows;

      const players = [];

      rows.forEach((row) => {
        const obj = {};
        header.forEach((h, i) => (obj[h] = row[i]));

        if (!obj.playername) return;

        players.push({
          playerId: obj.playerid || "",
          playerName: obj.playername,
          role: (obj.role || "BAT").toUpperCase(),
          realTeam: obj.realteam || "",
          credits: Number(obj.credits || 0),
          status: obj.status || "active",
        });
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
      return res.status(500).json({ error: "Roster upload failed" });
    }
  }
);

// JSON roster
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
// CONTESTS
// -------------------------
app.post("/api/admin/matches/:matchId/contests", admin, async (req, res) => {
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
});

// DELETE CONTEST
app.delete("/api/admin/contests/:contestId", admin, async (req, res) => {
  const { contestId } = req.params;

  await TeamEntry.deleteMany({ contestId });
  await Contest.deleteOne({ _id: contestId });

  io.emit("contestDeleted", { contestId });

  return res.json({ ok: true });
});

app.get("/api/matches/:matchId/contests", async (req, res) => {
  const contests = await Contest.find({
    matchId: req.params.matchId,
    archived: { $ne: true },
  }).lean();

  return res.json(contests);
});

// -------------------------
// TEAM ENTRY (CREATE XI)
// -------------------------
app.post("/api/matches/:matchId/teams", async (req, res) => {
  try {
    const { matchId } = req.params;
    const { players, captain, vice, name, viewerName, linkedChannel } = req.body;

    if (!Array.isArray(players) || players.length !== 11)
      return res.status(400).json({ error: "Team must have 11 players" });

    const team = await Team.create({
      matchId,
      players,
      captain,
      vice,
      name,
      viewerName,
      linkedChannel,
    });

    return res.json({ ok: true, team });
  } catch (err) {
    return res.status(500).json({ error: "Team creation failed" });
  }
});

// -------------------------
// CONTEST ENTRY
// -------------------------
app.post("/api/contests/:contestId/join", async (req, res) => {
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
});

// -------------------------
// STATS + SCORING ENGINE
// -------------------------
function computePoints(stat, isCaptain, isVice) {
  if (!stat) return 0;
  let pts = 0;

  pts += stat.runs * 1;
  pts += stat.fours * 1;
  pts += stat.sixes * 2;
  pts += stat.wickets * 25;
  if (stat.wickets >= 3) pts += 10;
  pts += stat.maidens * 10;
  pts += stat.catches * 8;
  if (stat.mvp) pts += 15;

  if (isCaptain) pts *= 2;
  if (isVice) pts = Math.round(pts * 1.5);

  return Math.round(pts);
}

app.post("/api/admin/matches/:matchId/stats", admin, async (req, res) => {
  const { matchId } = req.params;
  const { stats } = req.body;

  const match = await Match.findById(matchId);
  match.stats = stats;
  await match.save();

  const statMap = {};
  stats.forEach((s) => {
    statMap[s.playerName.toUpperCase()] = s;
  });

  const teams = await Team.find({ matchId });

  for (const t of teams) {
    let total = 0;
    t.players.forEach((p) => {
      const st = statMap[p.toUpperCase()] || {};
      const isC = p === t.captain;
      const isV = p === t.vice;
      total += computePoints(st, isC, isV);
    });

    await Team.findByIdAndUpdate(t._id, { totalPoints: total });
  }

  io.to(`match_${matchId}`).emit("matchStatsUpdate", {
    matchId,
    stats,
  });

  io.to(`match_${matchId}`).emit("leaderboardUpdate", { matchId });

  return res.json({ ok: true });
});

// -------------------------
// LEADERBOARDS
// -------------------------
app.get("/api/matches/:matchId/leaderboard", async (req, res) => {
  const match = await Match.findById(req.params.matchId).lean();
  if (!match) return res.status(404).json({ error: "No match" });

  const teams = await Team.find({
    matchId: match._id,
    banned: { $ne: true },
  }).lean();

  const statMap = {};
  (match.stats || []).forEach((s) => {
    statMap[s.playerName.toUpperCase()] = s;
  });

  const board = teams
    .map((t) => {
      let total = 0;
      (t.players || []).forEach((p) => {
        total += computePoints(
          statMap[p.toUpperCase()],
          p === t.captain,
          p === t.vice
        );
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
});

// -------------------------
// EXPORT TEAMS (CSV)
// -------------------------
app.get("/api/admin/matches/:matchId/export-teams", admin, async (req, res) => {
  const teams = await Team.find({ matchId: req.params.matchId }).lean();
  const lines = ["name,players,captain,vice,totalPoints"];

  teams.forEach((t) => {
    lines.push(
      `"${t.name}","${t.players.join("|")}","${t.captain}","${t.vice}",${t.totalPoints}`
    );
  });

  const csv = lines.join("\n");

  res.header("Content-Type", "text/csv");
  res.attachment(`match-${req.params.matchId}-teams.csv`);
  return res.send(csv);
});

// -------------------------
// LEAGUE TEAMS API (READ TEAMS FOR LEAGUE PAGE)
// -------------------------
app.get("/api/league/teams", async (req, res) => {
  try {
    const teams = await LeagueTeam.find().lean();
    return res.json({ ok: true, teams });
  } catch (err) {
    console.error("League error:", err);
    return res.status(500).json({ ok: false, error: "Failed to load league teams" });
  }
});

// -------------------------
// HEALTH CHECK
// -------------------------
app.get("/api/health", (req, res) => {
  return res.json({ ok: true, time: new Date() });
});

// -------------------------
// START SERVER
// -------------------------
server.listen(PORT, () =>
  console.log(`🚀 SERVER READY at http://localhost:${PORT}`)
);
