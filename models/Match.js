// models/Match.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, default: "" },
  playerName: { type: String, required: true },
  role: { type: String, default: "BAT" }, // BAT | BWL | ALL | WK
  realTeam: { type: String, default: "" },
  credits: { type: Number, default: 0 },
  status: { type: String, default: "active" }
}, { _id: false });

const statSchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  runs: { type: Number, default: 0 },
  balls: { type: Number, default: 0 },
  fours: { type: Number, default: 0 },
  sixes: { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  maidens: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },
  mvp: { type: Boolean, default: false }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startTime: { type: Date, default: null, index: true },
  streamUrl: { type: String, default: "" },
  teamA: { type: String, default: "" },
  teamB: { type: String, default: "" },
  externalId: { type: String, default: "" },
  players: { type: [playerSchema], default: [] },
  stats: { type: [statSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
