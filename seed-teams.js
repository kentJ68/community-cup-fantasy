// seed-teams.js
// Run: node seed-teams.js

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO = process.env.MONGO_URI || process.env.MONGO || '';
if (!MONGO) {
  console.error("MONGO_URI missing in .env");
  process.exit(1);
}

const LeagueTeam = require('./models/LeagueTeam');

const teams = [

  // =====================
  // GROUP A
  // =====================
  {
    name: "LONE RANGERS",
    shortName: "LR",
    group: "A",
    logoUrl: "/assets/league-logos/lr.png",
    seasonPoints: 0,
     nrr: -3.500,
    players: [
      { playerName: "Jos Buttler", role: "WK" },
      { playerName: "Shimron Hetmyer", role: "BAT" },
      { playerName: "Finn Allen", role: "BAT" },
      { playerName: "Bartlett", role: "BWL" },
      { playerName: "Mustafizur Rahman", role: "BWL" },
      { playerName: "Lockie Ferguson", role: "BWL" },
      { playerName: "Mohd Rizwan", role: "WK" },
      { playerName: "Josh Philippe", role: "WK" },
      { playerName: "Cooper Connolly", role: "ALL" },
      { playerName: "Gus Atkinson", role: "BWL" },
      { playerName: "Krunal Pandya", role: "ALL" },
      { playerName: "Brydon Carse", role: "ALL" },
      { playerName: "Shahibzada Farhan", role: "BAT" }
    ]
  },

  {
    name: "WULF NATION",
    shortName: "WN",
    group: "A",
    logoUrl: "/assets/league-logos/wn.png",
    seasonPoints: 2,
     nrr: 0.400,
    players: [
      { playerName: "David Warner", role: "BAT" },
      { playerName: "Rinku Singh", role: "BAT" },
      { playerName: "Tilak Varma", role: "BAT" },
      { playerName: "Prithvi Shaw", role: "BAT" },
      { playerName: "Andre Russell", role: "ALL" },
      { playerName: "Sunil Narine", role: "ALL" },
      { playerName: "Rashid Khan", role: "ALL" },
      { playerName: "Akeal Hosein", role: "ALL" },
      { playerName: "Jamie Overton", role: "ALL" },
      { playerName: "Rachin Ravindra", role: "ALL" },
      { playerName: "Alzarri Joseph", role: "BWL" },
      { playerName: "Shamar Joseph", role: "BWL" },
      { playerName: "Varun Chakravarthy", role: "BWL" }
    ]
  },

  {
    name: "ORANGE ROCKS",
    shortName: "OR",
    group: "A",
    logoUrl: "/assets/league-logos/or.png",
    seasonPoints: 0,
     nrr: -1.200,
    players: [
      { playerName: "Suryakumar Yadav", role: "BAT" },
      { playerName: "Virat Kohli", role: "BAT" },
      { playerName: "Rishabh Pant", role: "WK" },
      { playerName: "MS Dhoni", role: "WK" },
      { playerName: "Keshav Maharaj", role: "ALL" },
      { playerName: "Mohd Shami", role: "BWL" },
      { playerName: "Ryan Rickelton", role: "WK" },
      { playerName: "Jacob Duffy", role: "BWL" },
      { playerName: "Will Jacks", role: "ALL" },
      { playerName: "Sam Billings", role: "WK" },
      { playerName: "Jason Behrendorff", role: "BWL" },
      { playerName: "Daniel Sams", role: "ALL" },
      { playerName: "Ruturaj Gaikwad", role: "BAT" }
    ]
  },

  {
    name: "KHALSA VIKINGS",
    shortName: "KV",
    group: "A",
    logoUrl: "/assets/league-logos/kv.png",
    seasonPoints: 4,
     nrr: 1.950,
    players: [
      { playerName: "Alex Carey", role: "WK" },
      { playerName: "Trent Boult", role: "BWL" },
      { playerName: "Josh Hazlewood", role: "BWL" },
      { playerName: "Adil Rashid", role: "BWL" },
      { playerName: "Tim David", role: "BAT" },
      { playerName: "Abhishek Sharma", role: "ALL" },
      { playerName: "Mohd Amir", role: "BWL" },
      { playerName: "Yashasvi Jaiswal", role: "BAT" },
      { playerName: "Ibrahim Zadran", role: "BAT" },
      { playerName: "Ollie Pope", role: "BAT" },
      { playerName: "Roston Chase", role: "ALL" },
      { playerName: "Tristan Stubbs", role: "BAT" },
      { playerName: "Aaron Hardie", role: "ALL" }
    ]
  },

  // =====================
  // GROUP B
  // =====================
  {
    name: "UP WARRIORS",
    shortName: "UPW",
    group: "B",
    logoUrl: "/assets/league-logos/upw.png",
    seasonPoints: 2,
     nrr: -0.738,
    players: [
      { playerName: "Usman Khawaja", role: "BAT" },
      { playerName: "David Miller", role: "BAT" },
      { playerName: "Jonny Bairstow", role: "WK" },
      { playerName: "Mohammed Siraj", role: "BWL" },
      { playerName: "Mitchell Starc", role: "BWL" },
      { playerName: "Chris Jordan", role: "ALL" },
      { playerName: "Mujeeb Ur Rahman", role: "BWL" },
      { playerName: "Tim Seifert", role: "WK" },
      { playerName: "Fakhar Zaman", role: "BAT" },
      { playerName: "Donovan Ferreira", role: "BAT" },
      { playerName: "Ashton Agar", role: "ALL" },
      { playerName: "Matt Short", role: "ALL" },
      { playerName: "James Neesham", role: "ALL" }
    ]
  },

  {
    name: "HARYANA BLAZERS",
    shortName: "HB",
    group: "B",
    logoUrl: "/assets/league-logos/hb.png",
    seasonPoints: 2,
     nrr: -1.402,
    players: [
      { playerName: "Jasprit Bumrah", role: "BWL" },
      { playerName: "Nicholas Pooran", role: "WK" },
      { playerName: "KL Rahul", role: "WK" },
      { playerName: "Ravindra Jadeja", role: "ALL" },
      { playerName: "Hardik Pandya", role: "ALL" },
      { playerName: "Noor Ahmad", role: "BWL" },
      { playerName: "Haris Rauf", role: "BWL" },
      { playerName: "Reece Topley", role: "BWL" },
      { playerName: "Axar Patel", role: "ALL" },
      { playerName: "Riyan Parag", role: "ALL" },
      { playerName: "Nitish Reddy", role: "ALL" },
      { playerName: "Devdutt Padikkal", role: "BAT" },
      { playerName: "Shivam Dube", role: "ALL" }
    ]
  },

  {
    name: "PINAKA STRIKERS",
    shortName: "PS",
    group: "B",
    logoUrl: "/assets/league-logos/ps.png",
    seasonPoints: 2,
     nrr: 4.274,
    players: [
      { playerName: "Steve Smith", role: "BAT" },
      { playerName: "Ishan Kishan", role: "WK" },
      { playerName: "Ajinkya Rahane", role: "BAT" },
      { playerName: "Shreyas Iyer", role: "BAT" },
      { playerName: "Sherfane Rutherford", role: "ALL" },
      { playerName: "Romario Shepherd", role: "ALL" },
      { playerName: "Jason Holder", role: "ALL" },
      { playerName: "Glenn Maxwell", role: "ALL" },
      { playerName: "William O’Rourke", role: "BWL" },
      { playerName: "Ravi Bishnoi", role: "BWL" },
      { playerName: "Ishant Sharma", role: "BWL" },
      { playerName: "Jordan Cox", role: "WK" },
      { playerName: "Corbin Bosch", role: "ALL" }
    ]
  },

  {
    name: "KESARI XI",
    shortName: "KXI",
    group: "B",
    logoUrl: "/assets/league-logos/kxi.png",
    seasonPoints: 0,
     nrr: -2.098,
    players: [
      { playerName: "Mohammad Nabi", role: "ALL" },
      { playerName: "Ish Sodhi", role: "BWL" },
      { playerName: "Tabraiz Shamsi", role: "BWL" },
      { playerName: "Scott Boland", role: "BWL" },
      { playerName: "Naseem Shah", role: "BWL" },
      { playerName: "Marco Jansen", role: "ALL" },
      { playerName: "Temba Bavuma", role: "BAT" },
      { playerName: "Brandon King", role: "BAT" },
      { playerName: "Dhananjaya de Silva", role: "ALL" },
      { playerName: "Shardul Thakur", role: "ALL" },
      { playerName: "Angelo Mathews", role: "ALL" },
      { playerName: "Mark Chapman", role: "BAT" },
      { playerName: "Charith Asalanka", role: "BAT" }
    ]
  },

  // =====================
  // GROUP C
  // =====================
  {
    name: "PUNJAB DE SHER",
    shortName: "PDS",
    group: "C",
    logoUrl: "/assets/league-logos/pds.png",
    seasonPoints: 2,
     nrr: 0.700,
    players: [
      { playerName: "Kyle Jamieson", role: "ALL" },
      { playerName: "Matt Henry", role: "BWL" },
      { playerName: "Shakib Al Hasan", role: "ALL" },
      { playerName: "Philip Salt", role: "WK" },
      { playerName: "Cameron Green", role: "ALL" },
      { playerName: "Rassie van der Dussen", role: "BAT" },
      { playerName: "Evin Lewis", role: "BAT" },
      { playerName: "Gerald Coetzee", role: "BWL" },
      { playerName: "Jake Fraser-McGurk", role: "BAT" },
      { playerName: "Rilee Rossouw", role: "BAT" },
      { playerName: "Nitish Rana", role: "BAT" },
      { playerName: "Kagiso Rabada", role: "BWL" },
      { playerName: "Rohit Sharma", role: "BAT" }
    ]
  },

  {
    name: "AGRA GLADIATORS",
    shortName: "AG",
    group: "C",
    logoUrl: "/assets/league-logos/ag.png",
    seasonPoints: 2,
     nrr: 0.545,
    players: [
      { playerName: "Sanju Samson", role: "WK" },
      { playerName: "James Anderson", role: "BWL" },
      { playerName: "Aiden Markram", role: "BAT" },
      { playerName: "Mitchell Santner", role: "ALL" },
      { playerName: "Joe Root", role: "BAT" },
      { playerName: "Devon Conway", role: "BAT" },
      { playerName: "Moeen Ali", role: "ALL" },
      { playerName: "Liam Livingstone", role: "ALL" },
      { playerName: "Naveen-ul-Haq", role: "BWL" },
      { playerName: "Kyle Verreynne", role: "WK" },
      { playerName: "Sean Abbott", role: "ALL" },
      { playerName: "Deepak Chahar", role: "BWL" },
      { playerName: "Mohd Abbas", role: "BWL" }
    ]
  },

  {
    name: "ROYAL KNIGHTS",
    shortName: "RK",
    group: "C",
    logoUrl: "/assets/league-logos/rk.png",
    seasonPoints: 2,
     nrr: -0.409,
    players: [
      { playerName: "Heinrich Klaasen", role: "WK" },
      { playerName: "Sikandar Raza", role: "ALL" },
      { playerName: "Ben Stokes", role: "ALL" },
      { playerName: "Chris Lynn", role: "BAT" },
      { playerName: "T Natarajan", role: "BWL" },
      { playerName: "Adam Zampa", role: "BWL" },
      { playerName: "Nathan Lyon", role: "BWL" },
      { playerName: "Alex Hales", role: "BAT" },
      { playerName: "Chris Woakes", role: "ALL" },
      { playerName: "Zak Crawley", role: "BAT" },
      { playerName: "Adam Milne", role: "BWL" },
      { playerName: "Ashton Turner", role: "BAT" },
      { playerName: "Kieron Pollard", role: "ALL" }
    ]
  },

  {
    name: "THE WELLKNOWNS",
    shortName: "TWK",
    group: "C",
    logoUrl: "/assets/league-logos/twk.png",
    seasonPoints: 2,
     nrr: -0.850,
    players: [
      { playerName: "Dewald Brevis", role: "BAT" },
      { playerName: "Bhuvneshwar Kumar", role: "BWL" },
      { playerName: "Cameron Bancroft", role: "BAT" },
      { playerName: "Ben McDermott", role: "WK" },
      { playerName: "Azmatullah Omarzai", role: "ALL" },
      { playerName: "Spencer Johnson", role: "BWL" },
      { playerName: "Maheesh Theekshana", role: "BWL" },
      { playerName: "Matheesha Pathirana", role: "BWL" },
      { playerName: "Ravichandran Ashwin", role: "ALL" },
      { playerName: "Venkatesh Iyer", role: "ALL" },
      { playerName: "Sai Sudharsan", role: "BAT" },
      { playerName: "Shubman Gill", role: "BAT" }
    ]
  },

  // =====================
  // GROUP D
  // =====================
  {
    name: "KOLKATA HEROES",
    shortName: "KH",
    group: "D",
    logoUrl: "/assets/league-logos/kh.png",
    seasonPoints: 2,
     nrr: -0.397,
    players: [
      { playerName: "Shai Hope", role: "WK" },
      { playerName: "Kane Williamson", role: "BAT" },
      { playerName: "Rajat Patidar", role: "BAT" },
      { playerName: "Jhye Richardson", role: "BWL" },
      { playerName: "Sean Williams", role: "ALL" },
      { playerName: "Wanindu Hasaranga", role: "ALL" },
      { playerName: "Shadab Khan", role: "ALL" },
      { playerName: "Reeza Hendricks", role: "BAT" },
      { playerName: "Pathum Nissanka", role: "BAT" },
      { playerName: "Sandeep Sharma", role: "BWL" },
      { playerName: "Luke Wood", role: "BWL" },
      { playerName: "Shashank Singh", role: "BAT" },
      { playerName: "Mehidy Hasan Miraz", role: "ALL" }
    ]
  },

  {
    name: "KOLKATA LEGENDS",
    shortName: "KL",
    group: "D",
    logoUrl: "/assets/league-logos/kl.png",
    seasonPoints: 0,
     nrr: -2.687,
    players: [
      { playerName: "Travis Head", role: "BAT" },
      { playerName: "Pat Cummins", role: "ALL" },
      { playerName: "Daryl Mitchell", role: "ALL" },
      { playerName: "Marcus Stoinis", role: "ALL" },
      { playerName: "Nathan Ellis", role: "BWL" },
      { playerName: "Josh Inglis", role: "WK" },
      { playerName: "Kuldeep Yadav", role: "BWL" },
      { playerName: "Ben Duckett", role: "BAT" },
      { playerName: "Lungi Ngidi", role: "BWL" },
      { playerName: "Salman Agha", role: "ALL" },
      { playerName: "Kusal Mendis", role: "WK" },
      { playerName: "Michael Bracewell", role: "ALL" },
      { playerName: "Binura Fernando", role: "BWL" }
    ]
  },

  {
    name: "PREET FIGHTERS",
    shortName: "PF",
    group: "D",
    logoUrl: "/assets/league-logos/pf.png",
    seasonPoints: 2,
     nrr: 4.500,
    players: [
      { playerName: "Harry Brook", role: "BAT" },
      { playerName: "Babar Azam", role: "BAT" },
      { playerName: "Shaheen Afridi", role: "BWL" },
      { playerName: "Glenn Phillips", role: "ALL" },
      { playerName: "Mitchell Marsh", role: "ALL" },
      { playerName: "Dawid Malan", role: "BAT" },
      { playerName: "Tim Southee", role: "BWL" },
      { playerName: "Arshdeep Singh", role: "BWL" },
      { playerName: "Rahul Chahar", role: "BWL" },
      { playerName: "Jamie Smith", role: "WK" },
      { playerName: "Rakheem Cornwall", role: "ALL" },
      { playerName: "Hasan Ali", role: "BWL" },
      { playerName: "Moises Henriques", role: "ALL" }
    ]
  },

  {
    name: "LUNAR WULFS",
    shortName: "LW",
    group: "D",
    logoUrl: "/assets/league-logos/lw.png",
    seasonPoints: 2,
     nrr: 1.500,
    players: [
      { playerName: "Quinton de Kock", role: "WK" },
      { playerName: "Jason Roy", role: "BAT" },
      { playerName: "Yuzvendra Chahal", role: "BWL" },
      { playerName: "Jofra Archer", role: "BWL" },
      { playerName: "Mark Wood", role: "BWL" },
      { playerName: "Faf du Plessis", role: "BAT" },
      { playerName: "Rovman Powell", role: "BAT" },
      { playerName: "Marnus Labuschagne", role: "BAT" },
      { playerName: "Anrich Nortje", role: "BWL" },
      { playerName: "Sam Curran", role: "ALL" },
      { playerName: "Matthew Wade", role: "WK" },
      { playerName: "Dinesh Chandimal", role: "WK" },
      { playerName: "Rahmanullah Gurbaz", role: "WK" }
    ]
  }

];

async function run() {
  try {
    await mongoose.connect(MONGO, { dbName: "community_cup" });
    console.log("Mongo connected");

    await LeagueTeam.deleteMany({});
    await LeagueTeam.insertMany(teams);

    console.log("✅ Seeded all 16 Community Cup teams with players");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

run();
