// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, index: true, sparse: true },
  passwordHash: { type: String },
  displayName: { type: String, index: true },
  avatarUrl: { type: String },
  role: { type: String, default: 'user' }, // 'user' | 'admin'
  googleId: { type: String, index: true, sparse: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
