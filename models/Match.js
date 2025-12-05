// models/Match.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  playerId: { type: String, default: '' },
  playerName: { type: String, required: true },
  role: { type: String, enum: ['BAT','BOWL','AR','WK'], default: 'BAT' },
  realTeam: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  status: { type: String, enum: ['active','out','unavailable'], default: 'active' }
}, { _id: false });

const statSchema = new mongoose.Schema({
  playerName: { type: String, required: true },
  runs: { type: Number, default: 0 },
  fours: { type: Number, default: 0 },
  sixes: { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  maidens: { type: Number, default: 0 },
  catches: { type: Number, default: 0 },
  mvp: { type: Boolean, default: false }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teamA: { type: String, default: '' },
  teamB: { type: String, default: '' },
  startTime: { type: Date, default: Date.now },
  streamUrl: { type: String, default: '' },
  players: { type: [playerSchema], default: [] }, // roster pool
  stats: { type: [statSchema], default: [] },     // post-match stats
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

matchSchema.index({ startTime: 1 });
module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
