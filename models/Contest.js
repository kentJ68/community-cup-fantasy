// models/Contest.js
const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  title: { type: String, required: true },
  entryFee: { type: Number, default: 0 },
  maxEntries: { type: Number, default: 1000 },
  perViewerLimit: { type: Number, default: 1 },
  closeTime: { type: Date, default: null }, // optional explicit close time
  archived: { type: Boolean, default: false },
  closed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.Contest || mongoose.model('Contest', contestSchema);
