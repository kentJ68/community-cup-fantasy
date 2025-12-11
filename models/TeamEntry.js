// models/TeamEntry.js
const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  viewerName: { type: String, required: true },
  players: { type: [String], default: [] },
  captain: { type: String, default: null },
  vice: { type: String, default: null },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.TeamEntry || mongoose.model('TeamEntry', entrySchema);
