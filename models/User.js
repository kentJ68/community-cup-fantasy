// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String },
  displayName: { type: String },
  googleId: { type: String, index: true, sparse: true },
  avatarUrl: { type: String },
  role: { type: String, default: 'user' },
  credits: { type: Number, default: 0 },
  twitchUrl: { type: String },
  youtubeUrl: { type: String }
}, { timestamps: true });

// single index on email is created by `unique: true` in field
// if you prefer schema-level index, remove unique above and uncomment below:
// UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
