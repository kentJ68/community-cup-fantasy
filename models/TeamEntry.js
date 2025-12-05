// models/TeamEntry.js
const mongoose = require('mongoose');

const teamEntrySchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
  viewerName: { type: String, required: true },
  handle: { type: String, default: null }, // optional display handle
  players: { type: [String], required: true }, // array of playerName strings
  captain: { type: String, required: true },
  ip: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

teamEntrySchema.index({ contestId: 1, viewerName: 1 });
module.exports = mongoose.models.TeamEntry || mongoose.model('TeamEntry', teamEntrySchema);
