const mongoose = require("mongoose");

const SeasonLeaderboardSchema = new mongoose.Schema({
  userKey: { type: String, unique: true }, // viewerName or user id
  viewerName: String,
  totalPoints: { type: Number, default: 0 },
  matchesPlayed: { type: Number, default: 0 }
});

module.exports = mongoose.model("SeasonLeaderboard", SeasonLeaderboardSchema);
