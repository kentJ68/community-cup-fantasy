// seed-teams.js
// Run: node seed-teams.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO = process.env.MONGO_URI || process.env.MONGO || '';

// simple check
if (!MONGO) {
  console.error("MONGO connection string not found in .env (MONGO_URI). Aborting.");
  process.exit(1);
}

const LeagueTeam = require('./models/LeagueTeam');

const teams = [
  {
    name: "Lucknow Nawabs",
    shortName: "LKN",
    logo: "/assets/teams/lkn.png",
    players: [
      { playerName: "Rohit Sharma", role: "BAT" },
      { playerName: "Virat Kohli", role: "BAT" },
      { playerName: "Jasprit Bumrah", role: "BWL" },
      { playerName: "Zak Crawley", role: "BAT" },
      { playerName: "Suryakumar Yadav", role: "BAT" },
      { playerName: "Ravindra Jadeja", role: "ALL" },
      { playerName: "Quinton de Kock", role: "WK" },
      { playerName: "Trent Boult", role: "BWL" },
      { playerName: "Sikandar Raza", role: "ALL" },
      { playerName: "Sanju Samson", role: "WK" },
      { playerName: "Harshit Rana", role: "BWL" }
    ]
  },
  {
    name: "Punjab Warriors",
    shortName: "PW",
    logo: "/assets/teams/pw.png",
    players: [
      { playerName: "Jason Holder", role: "ALL" },
      { playerName: "Arshdeep Singh", role: "BWL" },
      { playerName: "Jos Buttler", role: "WK" },
      { playerName: "Shaheen Shah Afridi", role: "BWL" },
      { playerName: "Mujeeb Ur Rahman", role: "BWL" },
      { playerName: "Shubman Gill", role: "BAT" },
      { playerName: "Rahul Chahar", role: "BWL" },
      { playerName: "Sunil Narine", role: "ALL" },
      { playerName: "Liam Livingstone", role: "ALL" },
      { playerName: "Rachin Ravindra", role: "ALL" },
      { playerName: "Glenn Phillips", role: "WK" },
      { playerName: "Shimron Hetmeyer", role: "BAT" }
    ]
  },
  {
    name: "The Daredevils",
    shortName: "DD",
    logo: "/assets/teams/dd.png",
    players: [
      { playerName: "Babar Azam", role: "BAT" },
      { playerName: "Sam Curran", role: "ALL" },
      { playerName: "Nathan Lyon", role: "BWL" },
      { playerName: "Mohammad Nabi", role: "ALL" },
      { playerName: "Heinrich Klaasen", role: "WK" },
      { playerName: "Tim Southee", role: "BWL" },
      { playerName: "David Warner", role: "BAT" },
      { playerName: "Shreyas Iyer", role: "BAT" },
      { playerName: "Steve Smith", role: "BAT" },
      { playerName: "Mohammad Amir", role: "BWL" },
      { playerName: "Mohammad Rizwan", role: "WK" }
    ]
  },
  {
    name: "Assam Warriors",
    shortName: "AW",
    logo: "/assets/teams/aw.png",
    players: [
      { playerName: "Andre Russell", role: "ALL" },
      { playerName: "Kane Williamson", role: "BAT" },
      { playerName: "Rashid Khan", role: "ALL" },
      { playerName: "Hardik Pandya", role: "ALL" },
      { playerName: "Glenn Maxwell", role: "ALL" },
      { playerName: "Pat Cummins", role: "BWL" },
      { playerName: "Kieron Pollard", role: "ALL" },
      { playerName: "KL Rahul", role: "WK" },
      { playerName: "Adil Rashid", role: "BWL" },
      { playerName: "Jamie Smith", role: "WK" },
      { playerName: "Rahmanullah Gurbaz", role: "WK" },
      { playerName: "James Anderson", role: "BWL" }
    ]
  },
  {
    name: "UP Yodhas",
    shortName: "UPY",
    logo: "/assets/teams/upy.png",
    players: [
      { playerName: "Pathum Nissanka", role: "BAT" },
      { playerName: "Mitchell Marsh", role: "ALL" },
      { playerName: "Kagiso Rabada", role: "BWL" },
      { playerName: "Phil Salt", role: "WK" },
      { playerName: "Nicholas Pooran", role: "WK" },
      { playerName: "Mohammad Siraj", role: "BWL" },
      { playerName: "Jason Roy", role: "BAT" },
      { playerName: "Will Jacks", role: "BAT" },
      { playerName: "David Miller", role: "BAT" },
      { playerName: "Lockie Ferguson", role: "BWL" },
      { playerName: "Axar Patel", role: "ALL" },
      { playerName: "Jamie Overton", role: "ALL" }
    ]
  },
  {
    name: "Astar Challengers",
    shortName: "AST",
    logo: "/assets/teams/ast.png",
    players: [
      { playerName: "Rishabh Pant", role: "WK" },
      { playerName: "Mitchell Starc", role: "BWL" },
      { playerName: "Tim David", role: "BAT" },
      { playerName: "Yashasvi Jaiswal", role: "BAT" },
      { playerName: "Ravichandran Ashwin", role: "ALL" },
      { playerName: "Jonny Bairstow", role: "WK" },
      { playerName: "Marcus Stoinis", role: "ALL" },
      { playerName: "Varun Chakravarthy", role: "BWL" },
      { playerName: "Yuzvendra Chahal", role: "BWL" },
      { playerName: "Josh Hazlewood", role: "BWL" },
      { playerName: "Finn Allen", role: "BAT" },
      { playerName: "Jason Behrendorff", role: "BWL" },
      { playerName: "Dewald Brevis", role: "BAT" },
      { playerName: "Alex Hales", role: "BAT" },
      { playerName: "Roston Chase", role: "ALL" }
    ]
  },
  {
    name: "The Unknowns",
    shortName: "UNK",
    logo: "/assets/teams/unk.png",
    players: [
      { playerName: "Anrich Nortje", role: "BWL" },
      { playerName: "Faf du Plessis", role: "BAT" },
      { playerName: "Jofra Archer", role: "BWL" },
      { playerName: "Michael Bracewell", role: "ALL" },
      { playerName: "MS Dhoni", role: "WK" },
      { playerName: "Joe Root", role: "BAT" },
      { playerName: "Alex Carey", role: "WK" },
      { playerName: "Matheesha Pathirana", role: "BWL" },
      { playerName: "Mitchell Santner", role: "ALL" },
      { playerName: "James Vince", role: "BAT" },
      { playerName: "Marco Jansen", role: "ALL" },
      { playerName: "Josh Inglis", role: "WK" },
      { playerName: "Usman Khawaja", role: "BAT" },
      { playerName: "Nathan Ellis", role: "BWL" }
    ]
  },
  {
    name: "Punjab de Sher",
    shortName: "PDS",
    logo: "/assets/teams/pds.png",
    players: [
      { playerName: "Ben Stokes", role: "ALL" },
      { playerName: "Travis Head", role: "BAT" },
      { playerName: "Tristian Stubbs", role: "BAT" },
      { playerName: "Cameron Green", role: "ALL" },
      { playerName: "Harry Brook", role: "BAT" },
      { playerName: "Kuldeep Yadav", role: "BWL" },
      { playerName: "Kyle Jamieson", role: "BWL" },
      { playerName: "Matt Henry", role: "BWL" },
      { playerName: "Mohammed Shami", role: "BWL" },
      { playerName: "Aiden Markram", role: "BAT" },
      { playerName: "Abhishek Sharma", role: "BAT" }
    ]
  }
];

async function run() {
  try {
    await mongoose.connect(MONGO, { dbName: "community_cup" });
    console.log("Mongo connected — seeding league teams...");

    // remove existing if any (comment out if you prefer append)
    await LeagueTeam.deleteMany({});
    const res = await LeagueTeam.insertMany(teams);
    console.log("Inserted teams:", res.length);
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

run();
