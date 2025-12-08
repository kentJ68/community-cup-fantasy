// models/Match.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Player subdocument schema
const playerSchema = new Schema({
  playerId: { type: String, trim: true, default: "" },
  playerName: { type: String, trim: true, default: "" },
  // allow a wider set but canonicalization happens in pre-validate hook
  role: {
    type: String,
    enum: ["BAT", "BOW", "BWL", "BOWL", "ALL", "ALLR", "AR", "WK", "WKT", "WKP", "WICKET"],
    default: "BAT",
  },
  realTeam: { type: String, trim: true, default: "" },
  credits: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "active" },
  // optional flags from some spreadsheets
  captainEligible: { type: Boolean, default: false },
  viceEligible: { type: Boolean, default: false },
  imageUrl: { type: String, trim: true, default: "" },
});

// Helper: map many possible role strings to canonical values used by the app
function canonicalRole(role) {
  if (!role) return "BAT";
  const r = String(role).trim().toUpperCase();

  // Bowler variants -> BOW
  if (["BWL", "BOWL", "BOWLER", "BOWL"].includes(r)) return "BOW";
  if (r === "BOW") return "BOW";

  // Allrounder variants -> ALL
  if (["ALLR", "AR", "ALLROUND", "ALL-ROUND", "ALLROUNDer", "ALL-ROUNDER"].includes(r)) return "ALL";
  if (r === "ALL") return "ALL";

  // Wicket-keeper variants -> WK
  if (["WK", "WKT", "WICKET", "WICKET-KEEPER", "WKP"].includes(r)) return "WK";
  if (r === "WK") return "WK";

  // Batter variants -> BAT
  if (["BAT", "BATSMAN", "BATTER"].includes(r)) return "BAT";

  // If already canonical (safe), return it
  if (["BAT", "BOW", "ALL", "WK"].includes(r)) return r;

  // Fallback: return BAT (safe default) — avoids storing unpredictable enums
  return "BAT";
}

// Match schema
const matchSchema = new Schema({
  name: { type: String, trim: true, default: "" },
  startTime: { type: Date, default: Date.now },
  streamUrl: { type: String, trim: true, default: "" },
  teamA: { type: String, trim: true, default: "" },
  teamB: { type: String, trim: true, default: "" },

  // roster players
  players: { type: [playerSchema], default: [] },

  // scoring / stats
  stats: { type: Array, default: [] },

  // other fields
  archived: { type: Boolean, default: false },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Pre-validate hook: normalize players (roles, credits, names) before Mongoose runs validation
matchSchema.pre("validate", function (next) {
  try {
    if (Array.isArray(this.players)) {
      this.players = this.players.map((p) => {
        if (!p || typeof p !== "object") return p;

        // canonicalize role
        try {
          p.role = canonicalRole(p.role);
        } catch (e) {
          p.role = "BAT";
        }

        // ensure credits numeric
        p.credits = Number(p.credits || 0) || 0;

        // normalize string fields safely
        p.playerName = p.playerName ? String(p.playerName) : "";
        p.playerId = p.playerId ? String(p.playerId) : "";
        p.realTeam = p.realTeam ? String(p.realTeam) : "";
        p.status = p.status ? String(p.status) : "active";

        // booleans
        p.captainEligible = !!p.captainEligible;
        p.viceEligible = !!p.viceEligible;

        return p;
      });
    }
  } catch (err) {
    // never block save because of normalization error - log then continue
    console.error("Match pre-validate normalization error:", err && err.stack ? err.stack : err);
  }
  next();
});

// Export model
module.exports = mongoose.models.Match || mongoose.model("Match", matchSchema);
