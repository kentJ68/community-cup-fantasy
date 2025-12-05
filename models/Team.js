// models/Team.js
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  name: { type: String, default: '' }, // team name (viewer provided)
  viewerName: { type: String, default: null }, // display name of viewer (if anon)
  linkedChannel: { type: String, default: null }, // Twitch/YouTube link for owner promotion
  players: { type: [String], default: [] }, // array of playerName strings exactly matching Match.players.playerName
  roles: { type: [String], default: [] }, // parallel array describing role per player (optional)
  captain: { type: String, default: null }, // playerName
  vice: { type: String, default: null }, // playerName
  totalPoints: { type: Number, default: 0 },
  banned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

teamSchema.index({ matchId: 1, userId: 1 });
module.exports = mongoose.models.Team || mongoose.model('Team', teamSchema);
