// server.js
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
const cron = require("node-cron");
const axios = require("axios");
const FormData = require("form-data");
const moment = require("moment-timezone");

// -------------------------
// Config / Env
// -------------------------
const PORT = process.env.PORT || 4000;
const MONGO = process.env.MONGO_URI || process.env.MONGO || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || "";
const SCORE_API_KEY = process.env.SCORE_API_KEY || "";

// -------------------------
// Connect Mongo
// -------------------------
mongoose
  .connect(MONGO, { dbName: "community_cup", useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo connection error:", err && err.message));

// -------------------------
// Models (assume these files exist in ./models)
// -------------------------
const User = require("./models/User");
const Match = require("./models/Match");
const Team = require("./models/Team");
const Contest = require("./models/Contest");
const TeamEntry = require("./models/TeamEntry");
const LeagueTeam = require("./models/LeagueTeam");

// -------------------------
// Express + HTTP + Socket.IO
// -------------------------
const app = express();
const server = http.createServer(app);
const { Server: IOServer } = require("socket.io");
const io = new IOServer(server, { cors: { origin: "*" } });
global.io = io;

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("joinMatch", (id) => { if (id) socket.join(`match_${id}`); });
  socket.on("leaveMatch", (id) => { if (id) socket.leave(`match_${id}`); });
});

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
// Upload dirs and multer
// -------------------------
const UPLOAD_DIR = path.join(__dirname, "uploads");
const AVATAR_DIR = path.join(__dirname, "public", "assets", "avatars");
const TEAM_LOGO_DIR = path.join(__dirname, "public", "assets", "team-logos");
const LEAGUE_LOGO_DIR = path.join(__dirname, "public", "assets", "league-logos");
const SCORESCREEN_DIR = path.join(UPLOAD_DIR, "score-screens");

[UPLOAD_DIR, AVATAR_DIR, TEAM_LOGO_DIR, LEAGUE_LOGO_DIR, SCORESCREEN_DIR].forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
});

const uploadAvatar = multer({ dest: AVATAR_DIR });
const uploadTeamLogo = multer({ dest: TEAM_LOGO_DIR });
const uploadLeagueLogo = multer({ dest: LEAGUE_LOGO_DIR });
const uploadScoreScreenshot = multer({ dest: SCORESCREEN_DIR });
const uploadAny = multer({ dest: UPLOAD_DIR });

// -------------------------
// Helpers: JWT + auth
// -------------------------
function signJwt(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" }); }
function verifyJwt(token) { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } }

function auth(req, res, next) {
  const authHeader = (req.headers.authorization || "").split(" ");
  if (authHeader.length === 2 && authHeader[0] === "Bearer") {
    const pl = verifyJwt(authHeader[1]);
    if (pl) { req.user = pl; return next(); }
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function admin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.adminToken;
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();
  const authHeader = (req.headers.authorization || "").split(" ");
  if (authHeader.length === 2 && authHeader[0] === "Bearer") {
    const pl = verifyJwt(authHeader[1]);
    if (pl && pl.role === "admin") { req.user = pl; return next(); }
  }
  return res.status(401).json({ error: "Unauthorized (admin)" });
}

// -------------------------
// Google ID token endpoint
// -------------------------
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
app.post("/api/auth/google-idtoken", async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: "id_token missing" });
    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleId = payload.sub, email = payload.email, name = payload.name, picture = payload.picture;
    let user = await User.findOne({ googleId });
    if (!user && email) user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      if (!user.avatarUrl) user.avatarUrl = picture;
      await user.save();
    } else {
      user = await User.create({ googleId, email, displayName: name, avatarUrl: picture });
    }
    const token = signJwt({ id: user._id, role: user.role });
    return res.json({ ok: true, token, user: { id: user._id, displayName: user.displayName, avatarUrl: user.avatarUrl } });
  } catch (err) {
    console.error("google-idtoken error:", err && err.message);
    return res.status(400).json({ error: "Invalid id_token" });
  }
});

// -------------------------
// Auth: register/login
// -------------------------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });
    if (await User.findOne({ email })) return res.status(400).json({ error: "Email exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash: hash, displayName });
    const token = signJwt({ id: user._id, role: user.role });
    return res.json({ ok: true, token, user: { id: user._id, displayName: user.displayName } });
  } catch (err) {
    console.error("register error:", err && err.message);
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
    return res.json({ ok: true, token, user: { id: user._id, displayName: user.displayName } });
  } catch (err) {
    console.error("login error:", err && err.message);
    return res.status(500).json({ error: "Login failed" });
  }
});

// -------------------------
// Profile
// -------------------------
app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    delete user.passwordHash;
    return res.json({ ok: true, user });
  } catch (err) {
    console.error("me error:", err && err.message);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.post("/api/me/avatar", auth, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "No user" });
    if (!req.file) return res.status(400).json({ error: "No file" });
    const allowed = ["image/png","image/jpeg","image/webp"];
    if (!allowed.includes(req.file.mimetype)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Invalid file type" }); }
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const fileName = `${user._id}_${Date.now()}${ext}`;
    const filePath = path.join(AVATAR_DIR, fileName);
    fs.renameSync(req.file.path, filePath);
    user.avatarUrl = `/assets/avatars/${fileName}`;
    await user.save();
    return res.json({ ok: true, avatarUrl: user.avatarUrl });
  } catch (err) {
    console.error("avatar upload error:", err && err.message);
    return res.status(500).json({ error: "Avatar upload failed" });
  }
});

// -------------------------
// Matches: create (IST timezone handling), list, get
// -------------------------
app.post("/api/admin/matches", admin, async (req, res) => {
  try {
    const { name, startTime, streamUrl, teamA, teamB, externalId } = req.body;
    if (!name) return res.status(400).json({ error: "Match name required" });

    let startTimeToSave = null;
    if (startTime) {
      // Try parse with Asia/Kolkata as default timezone (most admin input will be local IST)
      const m = moment.tz(startTime, "Asia/Kolkata");
      if (m.isValid()) {
        startTimeToSave = m.toDate();
      } else {
        // fallback: try generic parse
        const m2 = moment(startTime);
        if (m2.isValid()) startTimeToSave = m2.toDate();
        else return res.status(400).json({ error: "Invalid startTime format" });
      }
    }

    const match = await Match.create({ name, startTime: startTimeToSave, streamUrl, teamA, teamB, externalId });
    return res.json({ ok: true, match });
  } catch (err) {
    console.error("create match error:", err && err.message);
    return res.status(500).json({ error: "Match creation failed" });
  }
});

app.get("/api/matches", async (req, res) => {
  try {
    const matches = await Match.find().sort({ startTime: -1 }).lean();
    return res.json(matches);
  } catch (err) {
    console.error("matches list error:", err && err.message);
    return res.status(500).json({ error: "Failed to list matches" });
  }
});

app.get("/api/matches/:matchId", async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId).lean();
    if (!match) return res.status(404).json({ error: "Match not found" });
    return res.json(match);
  } catch (err) {
    console.error("get match error:", err && err.message);
    return res.status(500).json({ error: "Failed to fetch match" });
  }
});

// -------------------------
// Roster upload (CSV / JSON)
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!text) return { header: [], rows: [] };
  const lines = text.split("\n");
  const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => line.split(",").map((x) => x.trim()));
  return { header, rows };
}

app.post("/api/admin/matches/:matchId/roster-csv", admin, uploadAny.single("rosterCsv"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
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
      players.push({ playerId: obj.playerid || "", playerName: obj.playername, role: (obj.role || "BAT").toUpperCase(), realTeam: obj.realteam || "", credits: Number(obj.credits || 0), status: obj.status || "active" });
    });
    const match = await Match.findById(req.params.matchId);
    match.players = players;
    await match.save();
    io.to(`match_${match._id}`).emit("rosterUpdate", { matchId: match._id, players });
    return res.json({ ok: true, count: players.length });
  } catch (err) {
    console.error("roster-csv error:", err && err.message);
    return res.status(500).json({ error: "Roster upload failed" });
  }
});

app.post("/api/admin/matches/:matchId/roster", admin, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    match.players = req.body.players || [];
    await match.save();
    io.to(`match_${match._id}`).emit("rosterUpdate", { matchId: match._id, players: match.players });
    return res.json({ ok: true });
  } catch (err) {
    console.error("roster save error:", err && err.message);
    return res.status(500).json({ error: "Roster save failed" });
  }
});

app.get("/api/matches/:matchId/players", async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId).lean();
    if (!match) return res.status(404).json({ error: "No match" });
    return res.json({ ok: true, players: match.players || [] });
  } catch (err) {
    console.error("get players error:", err && err.message);
    return res.status(500).json({ error: "Failed to fetch players" });
  }
});

// -------------------------
// Contests (create/list/join) and join validation
// -------------------------
app.post("/api/admin/matches/:matchId/contests", admin, async (req, res) => {
  try {
    const { title, entryFee, maxEntries, perViewerLimit, closeTime } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const contest = await Contest.create({ matchId: req.params.matchId, title, entryFee, maxEntries, perViewerLimit, closeTime: closeTime ? new Date(closeTime) : null, archived: false, closed: false });
    return res.json({ ok: true, contest });
  } catch (err) {
    console.error("create contest error:", err && err.message);
    return res.status(500).json({ error: "Contest creation failed" });
  }
});

app.get("/api/matches/:matchId/contests", async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const contests = await Contest.find({ matchId, archived: { $ne: true } }).lean();
    if (!contests || contests.length === 0) return res.json([]);
    let viewerName = null;
    const authHeader = (req.headers.authorization || "").split(" ");
    if (authHeader.length === 2 && authHeader[0] === "Bearer") {
      const pl = verifyJwt(authHeader[1]);
      if (pl && pl.id) {
        try {
          const user = await User.findById(pl.id).lean();
          if (user && user.displayName) viewerName = user.displayName;
        } catch {}
      }
    }
    const contestsWithCounts = await Promise.all(contests.map(async (c) => {
      const entryCount = await TeamEntry.countDocuments({ contestId: c._id });
      let myEntries = 0;
      if (viewerName) myEntries = await TeamEntry.countDocuments({ contestId: c._id, viewerName });
      return { ...c, entryCount, myEntries, closed: !!c.closed };
    }));
    return res.json(contestsWithCounts);
  } catch (err) {
    console.error("get contests error:", err && err.message);
    return res.status(500).json({ error: "Failed to load contests" });
  }
});

app.post("/api/contests/:contestId/join", async (req, res) => {
  try {
    const { contestId } = req.params;
    const { viewerName } = req.body;
    if (!viewerName) return res.status(400).json({ error: "viewerName required" });

    const contest = await Contest.findById(contestId);
    if (!contest) return res.status(404).json({ error: "No contest" });

    const matchObj = await Match.findById(contest.matchId).lean();
    if (!matchObj) return res.status(500).json({ error: "Match not found for contest" });

    if (contest.closeTime && new Date() >= new Date(contest.closeTime)) return res.status(400).json({ error: "Contest closed" });
    if (matchObj.startTime && Date.now() >= new Date(matchObj.startTime).getTime()) return res.status(400).json({ error: "Contest closed — match already started" });

    const team = await Team.findOne({ matchId: contest.matchId, viewerName });
    if (!team) { console.warn(`Join attempt failed: no team for viewer=${viewerName} match=${contest.matchId}`); return res.status(400).json({ error: "Create a team first" }); }

    const currentEntries = await TeamEntry.countDocuments({ contestId: contest._id, viewerName });
    if (contest.perViewerLimit && currentEntries >= (contest.perViewerLimit || 1)) return res.status(400).json({ error: `Entry limit reached for viewer (${contest.perViewerLimit})` });

    if (contest.maxEntries) {
      const totalEntries = await TeamEntry.countDocuments({ contestId: contest._id });
      if (totalEntries >= contest.maxEntries) return res.status(400).json({ error: "Contest is full" });
    }

    const duplicate = await TeamEntry.findOne({ contestId: contest._id, teamId: team._id });
    if (duplicate) return res.status(400).json({ error: "This team is already joined in the contest" });

    const entry = await TeamEntry.create({ matchId: contest.matchId, contestId: contest._id, viewerName, players: team.players, captain: team.captain, vice: team.vice, teamId: team._id, ip: req.ip, createdAt: new Date() });
    io.to(`match_${String(contest.matchId)}`).emit("contestEntryUpdate", { contestId: String(contest._id), entryId: String(entry._id) });
    return res.json({ ok: true, entry });
  } catch (err) {
    console.error("Join failed:", err && err.message);
    return res.status(500).json({ error: "Join failed" });
  }
});

// -------------------------
// Team creation & lookup
// -------------------------
app.post("/api/matches/:matchId/teams", async (req, res) => {
  try {
    const { matchId } = req.params;
    const { players, captain, vice, name, viewerName, linkedChannel } = req.body;
    if (!Array.isArray(players) || players.length !== 11) return res.status(400).json({ error: "Team must have 11 players" });
    const team = await Team.create({ matchId, players, captain, vice, name, viewerName, linkedChannel });
    return res.json({ ok: true, team });
  } catch (err) {
    console.error("create team error:", err && err.message);
    return res.status(500).json({ error: "Team creation failed" });
  }
});

app.get("/api/matches/:matchId/team/:viewerName", async (req, res) => {
  try {
    const { matchId, viewerName } = req.params;
    if (!viewerName) return res.status(400).json({ ok: false, error: "viewerName required" });
    const team = await Team.findOne({ matchId, viewerName }).lean();
    if (!team) return res.json({ ok: false, team: null });
    return res.json({ ok: true, team });
  } catch (err) {
    console.error("get team error:", err && err.message);
    return res.status(500).json({ ok: false, error: "Failed to fetch team" });
  }
});

// -------------------------
// League / Team logo uploads
// -------------------------
app.post("/api/matches/:matchId/teams/:teamId/logo", auth, uploadTeamLogo.single("logo"), async (req, res) => {
  try {
    const { matchId, teamId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (String(team.matchId) !== String(matchId)) return res.status(400).json({ error: "Team does not belong to this match" });

    const userPl = req.user;
    const isAdmin = userPl && userPl.role === "admin";
    if (!isAdmin) {
      const user = await User.findById(userPl.id).lean();
      if (!user || !user.displayName || user.displayName !== team.viewerName) return res.status(403).json({ error: "Not allowed" });
    }

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowed = ["image/png","image/jpeg","image/webp"];
    if (!allowed.includes(req.file.mimetype)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Invalid file type" }); }

    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const fileName = `team_${teamId}_${Date.now()}${ext}`;
    const destPath = path.join(TEAM_LOGO_DIR, fileName);
    fs.renameSync(req.file.path, destPath);
    team.logoUrl = `/assets/team-logos/${fileName}`;
    await team.save();
    return res.json({ ok: true, logoUrl: team.logoUrl });
  } catch (err) {
    console.error("team logo upload error:", err && err.message);
    return res.status(500).json({ error: "Upload failed" });
  }
});

app.post("/api/admin/league/:leagueTeamId/logo", admin, uploadLeagueLogo.single("logo"), async (req, res) => {
  try {
    const { leagueTeamId } = req.params;
    const team = await LeagueTeam.findById(leagueTeamId);
    if (!team) return res.status(404).json({ error: "League team not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowed = ["image/png","image/jpeg","image/webp"];
    if (!allowed.includes(req.file.mimetype)) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Invalid file type" }); }
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const fileName = `league_${leagueTeamId}_${Date.now()}${ext}`;
    const destPath = path.join(LEAGUE_LOGO_DIR, fileName);
    fs.renameSync(req.file.path, destPath);
    team.logoUrl = `/assets/league-logos/${fileName}`;
    await team.save();
    return res.json({ ok: true, logoUrl: team.logoUrl });
  } catch (err) {
    console.error("league logo upload error:", err && err.message);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// -------------------------
// Scoring logic + helpers
// -------------------------
function computePoints(stat = {}, isCaptain = false, isVice = false) {
  let pts = 0;
  pts += (stat.runs || 0) * 1;
  pts += (stat.fours || 0) * 1;
  pts += (stat.sixes || 0) * 2;
  pts += (stat.wickets || 0) * 25;
  if ((stat.wickets || 0) >= 3) pts += 10;
  pts += (stat.maidens || 0) * 10;
  pts += (stat.catches || 0) * 8;
  if (stat.mvp) pts += 15;
  if (isCaptain) pts *= 2;
  if (isVice) pts = Math.round(pts * 1.5);
  return Math.round(pts);
}

// Admin manual stats update endpoint
app.post("/api/admin/matches/:matchId/stats", admin, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { stats } = req.body;
    if (!Array.isArray(stats)) return res.status(400).json({ error: "stats must be array" });
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: "No match" });
    match.stats = stats;
    await match.save();

    // recompute teams
    const statMap = {};
    stats.forEach(s => { if (s.playerName) statMap[s.playerName.toUpperCase()] = s; });
    const teams = await Team.find({ matchId });
    for (const t of teams) {
      let total = 0;
      (t.players || []).forEach(p => { total += computePoints(statMap[(p||"").toUpperCase()] || {}, p === t.captain, p === t.vice); });
      await Team.findByIdAndUpdate(t._id, { totalPoints: total });
    }

    io.to(`match_${matchId}`).emit("matchStatsUpdate", { matchId });
    io.to(`match_${matchId}`).emit("leaderboardUpdate", { matchId });
    return res.json({ ok: true });
  } catch (err) {
    console.error("admin stats error:", err && err.message);
    return res.status(500).json({ error: "Failed to update stats" });
  }
});

// Leaderboard endpoint
app.get("/api/matches/:matchId/leaderboard", async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId).lean();
    if (!match) return res.status(404).json({ error: "No match" });
    const teams = await Team.find({ matchId: match._id, banned: { $ne: true } }).lean();
    const statMap = {};
    (match.stats || []).forEach(s => { if (s.playerName) statMap[s.playerName.toUpperCase()] = s; });
    const board = teams.map(t => {
      let total = 0;
      (t.players || []).forEach(p => { total += computePoints(statMap[(p||"").toUpperCase()] || {}, p === t.captain, p === t.vice); });
      return { teamId: t._id, name: t.name, viewerName: t.viewerName, total };
    }).sort((a,b) => b.total - a.total);
    return res.json({ ok: true, leaderboard: board });
  } catch (err) {
    console.error("leaderboard error:", err && err.message);
    return res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// -------------------------
// Provider fetch + normalization (example)
// -------------------------
async function fetchRawScorecardFromProvider(match, provider = "example") {
  try {
    if (provider === "example") {
      const externalId = match.externalId || match._id;
      if (!SCORE_API_KEY) throw new Error("No SCORE_API_KEY configured");
      const url = `https://api.examplecricket.com/match/${externalId}/scorecard?api_key=${SCORE_API_KEY}`;
      const res = await axios.get(url, { timeout: 15000 });
      return res.data;
    }
    throw new Error("Unknown provider: " + provider);
  } catch (err) {
    console.error("fetchRawScorecardFromProvider error:", err && err.message);
    throw err;
  }
}

function normalizeScorecard(provider, raw) {
  // Example normalizer for "example" provider
  if (provider === "example") {
    const map = new Map();
    if (raw && Array.isArray(raw.innings)) {
      raw.innings.forEach(inn => {
        if (Array.isArray(inn.batting)) {
          inn.batting.forEach(b => {
            const name = (b.player || "").trim();
            if (!name) return;
            const entry = map.get(name) || { playerName: name, runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, catches: 0, mvp: false };
            entry.runs = Number(b.runs || 0);
            entry.fours = Number(b.fours || 0);
            entry.sixes = Number(b.sixes || 0);
            map.set(name, entry);
          });
        }
        if (Array.isArray(inn.bowling)) {
          inn.bowling.forEach(b => {
            const name = (b.player || "").trim();
            if (!name) return;
            const entry = map.get(name) || { playerName: name, runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, catches: 0, mvp: false };
            entry.wickets = Number(b.wickets || 0);
            entry.maidens = Number(b.maidens || 0);
            map.set(name, entry);
          });
        }
        if (Array.isArray(inn.fielding)) {
          inn.fielding.forEach(f => {
            const name = (f.player || "").trim();
            if (!name) return;
            const entry = map.get(name) || { playerName: name, runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, catches: 0, mvp: false };
            entry.catches = Number(f.catches || 0);
            map.set(name, entry);
          });
        }
      });
    }
    // pick mvp if present
    const mvpCandidate = raw && (raw.mvpPlayer || (raw.topPerformers && raw.topPerformers.manOfTheMatch));
    if (mvpCandidate && map.has(mvpCandidate)) map.get(mvpCandidate).mvp = true;
    else if (mvpCandidate) map.set(mvpCandidate, { playerName: mvpCandidate, runs: 0, fours: 0, sixes: 0, wickets: 0, maidens: 0, catches: 0, mvp: true });
    return Array.from(map.values());
  }
  throw new Error("Unknown provider normalization: " + provider);
}

// Process a match: fetch provider, normalize, save stats, recompute team points
async function processMatchScorecard(matchId, options = { provider: "example" }) {
  const match = await Match.findById(matchId);
  if (!match) throw new Error("Match not found: " + matchId);
  const raw = await fetchRawScorecardFromProvider(match, options.provider);
  const stats = normalizeScorecard(options.provider, raw);
  match.stats = stats;
  await match.save();

  const statMap = {};
  stats.forEach(s => { if (s.playerName) statMap[s.playerName.toUpperCase()] = s; });

  const teams = await Team.find({ matchId: match._id });
  for (const t of teams) {
    let total = 0;
    (t.players || []).forEach(p => {
      const st = statMap[(p||"").toUpperCase()] || {};
      total += computePoints(st, p === t.captain, p === t.vice);
    });
    t.totalPoints = total;
    await t.save();
  }

  io.to(`match_${String(match._id)}`).emit("matchStatsUpdate", { matchId: String(match._id), stats });
  io.to(`match_${String(match._id)}`).emit("leaderboardUpdate", { matchId: String(match._id) });
  return { ok: true, teamsUpdated: teams.length, statsCount: stats.length };
}

app.post("/api/admin/matches/:matchId/fetch-scorecard", admin, async (req, res) => {
  try {
    const { matchId } = req.params;
    const provider = req.body.provider || "example";
    const result = await processMatchScorecard(matchId, { provider });
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("fetch-scorecard admin error:", err && err.message);
    return res.status(500).json({ ok: false, error: err.message || "Failed" });
  }
});

// -------------------------
// PATCHED: upload-scorecard (defensive) - accepts many shapes
// -------------------------
app.post("/api/admin/matches/:matchId/upload-scorecard", admin, express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const { matchId } = req.params;
    const provider = req.body.provider || "example";

    // Accept raw as stringified JSON or object
    let raw = req.body.raw;
    if (!raw && Object.keys(req.body).length > 0) {
      // maybe client posted raw directly
      raw = req.body;
    }

    // Write raw payload to disk for inspection
    const fileName = `scorecard_raw_${matchId}_${Date.now()}.json`;
    const fp = path.join(UPLOAD_DIR, fileName);
    try { fs.writeFileSync(fp, JSON.stringify({ provider, raw }, null, 2)); } catch (e) { console.warn("failed to write raw", e && e.message); }

    // Try normalizing using provider adapter
    let stats = [];
    let normErr = null;
    try {
      if (typeof normalizeScorecard === "function") {
        stats = normalizeScorecard(provider, raw) || [];
        if (!Array.isArray(stats)) stats = [];
      }
    } catch (e) {
      normErr = (e && e.message) || String(e);
      console.warn("normalizeScorecard error:", normErr);
      stats = [];
    }

    // Fallback: raw.parsedBatting (OCR helper output)
    if ((!stats || stats.length === 0) && raw && raw.parsedBatting && Array.isArray(raw.parsedBatting)) {
      stats = raw.parsedBatting.map(p => ({
        playerName: p.playerName || p.player || "",
        runs: Number(p.runs || p.r || 0),
        fours: Number(p.fours || 0),
        sixes: Number(p.sixes || 0),
        wickets: Number(p.wickets || 0),
        maidens: Number(p.maidens || 0),
        catches: Number(p.catches || 0),
        mvp: !!p.mvp
      }));
    }

    // Fallback: raw.stats
    if ((!stats || stats.length === 0) && raw && Array.isArray(raw.stats)) {
      stats = raw.stats.map(p => ({
        playerName: p.playerName || p.name || "",
        runs: Number(p.runs || 0),
        fours: Number(p.fours || 0),
        sixes: Number(p.sixes || 0),
        wickets: Number(p.wickets || 0),
        maidens: Number(p.maidens || 0),
        catches: Number(p.catches || 0),
        mvp: !!p.mvp
      }));
    }

    // Fallback: if raw itself is an array of objects
    if ((!stats || stats.length === 0) && Array.isArray(raw)) {
      stats = raw.map(p => ({
        playerName: p.playerName || p.name || "",
        runs: Number(p.runs || 0),
        fours: Number(p.fours || 0),
        sixes: Number(p.sixes || 0),
        wickets: Number(p.wickets || 0),
        maidens: Number(p.maidens || 0),
        catches: Number(p.catches || 0),
        mvp: !!p.mvp
      }));
    }

    if (!stats || stats.length === 0) {
      return res.json({
        ok: true,
        message: "Saved raw JSON but normalization returned 0 stats.",
        path: `/uploads/${fileName}`,
        normalizationError: normErr,
        statsCount: 0,
        note: "Try sending final stats array or raw.parsedBatting (OCR helper)."
      });
    }

    // Save stats to match
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ error: "Match not found" });
    match.stats = stats;
    await match.save();

    // Recompute all teams' totals
    const statMap = {};
    stats.forEach(s => { if (s.playerName) statMap[s.playerName.toUpperCase()] = s; });
    const teams = await Team.find({ matchId: match._id });
    for (const t of teams) {
      let total = 0;
      (t.players || []).forEach(pName => {
        const st = statMap[(pName||"").toUpperCase()] || {};
        total += computePoints(st, pName === t.captain, pName === t.vice);
      });
      t.totalPoints = total;
      await t.save();
    }

    io.to(`match_${String(match._id)}`).emit("matchStatsUpdate", { matchId: String(match._id), stats });
    io.to(`match_${String(match._id)}`).emit("leaderboardUpdate", { matchId: String(match._id) });

    return res.json({ ok: true, message: "Scorecard processed", statsCount: stats.length });
  } catch (err) {
    console.error("upload-scorecard error:", err && err.message);
    return res.status(500).json({ error: "Failed to upload/process scorecard", details: err && err.message });
  }
});

// -------------------------
// Upload screenshot & OCR.space integration
// -------------------------
app.post("/api/admin/matches/:matchId/upload-score-screenshot", admin, uploadScoreScreenshot.single("screenshot"), async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const fileName = `scoreshot_${matchId}_${Date.now()}${ext}`;
    const dst = path.join(SCORESCREEN_DIR, fileName);
    fs.renameSync(req.file.path, dst);

    let ocrText = "";
    const ocrKey = OCR_SPACE_API_KEY || "";
    if (ocrKey) {
      try {
        const form = new FormData();
        form.append("apikey", ocrKey);
        form.append("language", "eng");
        form.append("OCREngine", "2");
        form.append("file", fs.createReadStream(dst));

        const response = await axios.post("https://api.ocr.space/parse/image", form, {
          headers: Object.assign({}, form.getHeaders()),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 60000
        });

        const data = response.data;
        if (data && data.IsErroredOnProcessing) {
          console.warn("OCR.space processing error:", data.ErrorMessage || data.ErrorDetails);
          ocrText = "";
        } else if (data && Array.isArray(data.ParsedResults) && data.ParsedResults.length > 0) {
          ocrText = data.ParsedResults.map(p => p.ParsedText || "").join("\n\n");
        } else {
          ocrText = "";
        }
      } catch (ocrErr) {
        console.warn("OCR.space request failed:", ocrErr && ocrErr.message);
        ocrText = "";
      }
    } else {
      ocrText = "";
    }

    const meta = { matchId, file: fileName, uploadedAt: new Date(), ocrText };
    try { fs.writeFileSync(path.join(SCORESCREEN_DIR, `${fileName}.meta.json`), JSON.stringify(meta, null, 2)); } catch (e) {}

    return res.json({ ok: true, path: `/uploads/score-screens/${fileName}`, ocrText });
  } catch (err) {
    console.error("upload-score-screenshot (OCR.space) error:", err && err.message);
    try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(500).json({ error: "Failed to upload screenshot" });
  }
});

// -------------------------
// Auto-close cron for contests (every minute)
// -------------------------
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const candidates = await Contest.find({ archived: { $ne: true }, closed: { $ne: true } }).lean();
    for (const c of candidates) {
      const match = await Match.findById(c.matchId).lean();
      const closeTime = c.closeTime ? new Date(c.closeTime) : null;
      const matchStart = match && match.startTime ? new Date(match.startTime) : null;
      const shouldClose = (closeTime && closeTime <= now) || (matchStart && matchStart <= now);
      if (shouldClose) {
        await Contest.updateOne({ _id: c._id }, { $set: { closed: true, archived: true } });
        io.to(`match_${String(c.matchId)}`).emit("contestClosed", { contestId: String(c._id) });
        console.log("Auto-closed contest", String(c._id));
      }
    }
  } catch (err) {
    console.error("Auto-close cron error:", err && err.message);
  }
});

// -------------------------
// Simple health
// -------------------------
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date() }));

// -------------------------
// Start server
// -------------------------
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT} (PORT=${PORT})`);
});
