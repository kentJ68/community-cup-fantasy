// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, index: true, sparse: true },
  passwordHash: { type: String },
  googleId: { type: String, index: true, sparse: true },
  displayName: { type: String, required: true },
  avatarUrl: { type: String, default: null },
  role: { type: String, enum: ['user','admin'], default: 'user' },
  credits: { type: Number, default: 0 }, // wallet balance
  twitchUrl: { type: String, default: null },
  youtubeUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });


