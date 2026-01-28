// models/Team.js
const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', index: true },
  players: { type: [String], default: [] },
  captain: { type: String, default: '' },
  vice: { type: String, default: '' },
  name: { type: String, default: '' },
  viewerName: { type: String, default: '' },
  linkedChannel: { type: String, default: '' },

  totalPoints: { type: Number, default: 0 },

  // store submitter IP and timestamp
  ip: { type: String, index: true, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// optional: if you want to discourage same IP spam you can keep this non-unique index
// TeamSchema.index({ matchId: 1, ip: 1 });

module.exports = mongoose.model('Team', TeamSchema);