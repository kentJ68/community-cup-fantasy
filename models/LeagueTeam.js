const mongoose = require("mongoose");

const LeagueTeamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  shortName: { type: String },
  logo: { type: String }, // optional custom logo path

  players: [
    {
      playerName: String,
      role: String,
      nationality: String,
      rating: Number,
    }
  ],

  // meta
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  ties: { type: Number, default: 0 },

  // total season fantasy points (computed)
  seasonPoints: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("LeagueTeam", LeagueTeamSchema);
