// models/LeagueTeam.js
const mongoose = require('mongoose');

const leaguePlayerSchema = new mongoose.Schema({
  playerId: { type: String, default: "" },
  playerName: { type: String, required: true },
  role: {
    type: String,
    enum: ['BAT', 'BWL', 'ALL', 'WK'],
    default: 'BAT'
  }
}, { _id: false });

const leagueTeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  shortName: { type: String, required: true },

  // ✅ REQUIRED FOR GROUP STANDINGS
  group: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    required: true
  },

  logoUrl: { type: String, default: null },

  players: { type: [leaguePlayerSchema], default: [] },

  seasonPoints: {
    type: Number,
    default: 0
  },

  // ✅ REQUIRED FOR NRR SORTING
  nrr: {
    type: Number,
    default: 0
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

module.exports =
  mongoose.models.LeagueTeam ||
  mongoose.model('LeagueTeam', leagueTeamSchema);
