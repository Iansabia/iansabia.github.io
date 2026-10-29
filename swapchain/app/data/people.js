// SwapChain demo data. EVERY student, name, profile, room assignment and listing here is
// made up for a class demo. No real people. Instagram handles all end in ".demo" and are
// never real accounts or links.
//
// Story (checked by tools/check_demo.mjs):
// - 40 students want to move. 1-to-1 swaps alone move 6 of them (3 pairs).
// - Loops move 24: Loop W (3, across the three Warren towers), Loop X (5, across 5 dorms),
//   Loop S (4, floor to floor inside Sleeper), Loop Y (3, across 3 dorms, includes "You"),
//   Loop J (3, Miles joins to live with Jared), plus the same 3 pairs.
// - BU rooms are single gender: a spot only goes to someone of the same gender as the student
//   leaving it and the roommate staying (src/chains.js accepts). Every loop below is one gender.
// - Live add: Noor posts her Myles room and closes Loop L (4) out of 3 students who were
//   waiting, so 28 move.
// - Every listing below is for the fall swap window (open until Nov 30, 2026).

// ---------- people ----------
// [id, name, year, major, hometown, bio, interests, sleep, tidy, social, hue]
const P = [
  // listings (people who want to move)
  ["p00", "Sam Okafor", 2030, "Data Science", "Columbus, OH", "Freshman in Warren C. Up at 6am; my roommate games till 3am. Need a roommate who fits.", ["running", "hackathons", "indie games", "Thai food"], "early", 4, 3, 205],
  ["p01", "Ava Martinez", 2028, "Biomedical Engineering", "San Antonio, TX", "Lab by day, salsa club by night. Always has snacks.", ["salsa", "3D printing", "baking"], "late", 3, 5, 12],
  ["p02", "Bea Kowalski", 2027, "Economics", "Milwaukee, WI", "Senior. Studies in silence, then talks your ear off about baseball.", ["baseball", "chess", "podcasts"], "early", 5, 2, 220],
  ["p03", "Cleo Dubois", 2029, "Film and Television", "Montreal, QC", "Shooting a short film this fall. Will ask you to be an extra.", ["film photography", "thrifting", "horror movies", "coffee"], "late", 2, 4, 330],
  ["p04", "Dev Patel", 2028, "Computer Science", "Edison, NJ", "Builds side projects at 1am. Quiet otherwise, promise.", ["robotics", "cricket", "anime"], "late", 4, 2, 260],
  ["p05", "Enzo Rossi", 2027, "International Relations", "Providence, RI", "Model UN lifer. Makes pasta for the whole floor on Sundays.", ["Model UN", "cooking", "Italian films", "tennis"], "early", 4, 4, 0],
  ["p06", "Femi Adeyemi", 2028, "Mechanical Engineering", "Houston, TX", "Formula SAE team. I fix bikes for free if you ask nicely.", ["Formula SAE", "cycling", "afrobeats"], "early", 3, 3, 140],
  ["p07", "Gavin Liu", 2029, "Psychology", "Irvine, CA", "Plant dad, journaler, early riser. Looking for a calm floor.", ["plants", "journaling", "yoga", "boba"], "early", 5, 2, 95],
  ["p08", "Hugo Silva", 2028, "Hospitality Administration", "Fall River, MA", "Will cook you dinner. Loves a high floor with a skyline view.", ["cooking", "soccer", "jazz"], "late", 4, 5, 25],
  ["p09", "Miles Chen", 2029, "Neuroscience", "Seattle, WA", "Pre-med, climber, terrible at sleeping in. Looking for a roommate I click with.", ["climbing", "pre-med", "K-dramas", "matcha"], "early", 4, 3, 300],
  ["p10", "Jack Reyes", 2029, "Economics", "Phoenix, AZ", "Leaving Kilachand to live near my teammates in The Towers.", ["club soccer", "fantasy football", "gym"], "late", 3, 4, 195],
  ["p11", "Theo Brooks", 2028, "Journalism", "Baltimore, MD", "Writes for the paper, needs a single to edit at weird hours.", ["writing", "vinyl", "basketball"], "late", 3, 3, 35],
  ["p12", "Ines Navarro", 2028, "Art History", "Miami, FL", "Museum nerd. Wants a higher floor, closer to my best friend on 7.", ["museums", "sketching", "salsa"], "early", 4, 3, 350],
  ["p13", "Jun Park", 2027, "Physics", "Fort Lee, NJ", "Senior thesis on dark matter. Wants a top floor for the quiet.", ["astronomy", "piano", "ramen"], "late", 4, 1, 230],
  ["p14", "Kai Nakamura", 2029, "Music Performance", "Honolulu, HI", "Cellist. Elevator waits from 11 are killing my practice schedule.", ["cello", "surfing", "film scores"], "early", 3, 3, 175],
  ["p15", "Lena Fischer", 2028, "Marketing", "Chicago, IL", "Runs the campus thrift pop-up. Low floor so I can haul racks.", ["thrifting", "running", "branding"], "early", 4, 4, 15],
  ["p16", "Nate Owusu", 2028, "Public Health", "Atlanta, GA", "Volunteers at a clinic near Kenmore. Wants a shorter walk.", ["volunteering", "gospel choir", "spin class"], "early", 5, 3, 285],
  ["p17", "Omar Haddad", 2027, "Chemistry", "Dearborn, MI", "Lives in the chem labs. Wants Warren to be near the labs and dining.", ["chemistry", "soccer", "chai"], "early", 4, 3, 45],
  ["p18", "Priya Shah", 2028, "Biology", "Cary, NC", "Rowing at 5am, asleep by 10. Hoping to move closer to my crew friends.", ["rowing", "bollywood dance", "baking"], "early", 5, 3, 320],
  ["p19", "Quinn O'Brien", 2029, "Philosophy", "Burlington, VT", "Reads Kant for fun. Looking for a single on West Campus.", ["philosophy", "hiking", "folk music"], "late", 3, 2, 160],
  ["p20", "Rosa Vega", 2027, "Advertising", "Los Angeles, CA", "Senior. Interning downtown, so I want East Campus near the T.", ["design", "skateboarding", "tacos"], "late", 3, 4, 10],
  ["p21", "Zoe Bennett", 2029, "Classics", "Portland, OR", "Latin tutor and amateur baker. Want a higher floor in Rich.", ["Latin", "baking", "board games"], "early", 4, 3, 50],
  ["p22", "Lucia Ortega", 2028, "Finance", "El Paso, TX", "Investment club. Want a low floor in Claflin near my study group.", ["investing", "basketball", "salsa"], "early", 5, 4, 210],
  ["p23", "Haru Sato", 2029, "Linguistics", "San Jose, CA", "Learning my fifth language. Want a classic double in Kilachand.", ["languages", "calligraphy", "tea"], "early", 4, 2, 120],
  ["p24", "Marcus Greene", 2028, "Political Science", "Richmond, VA", "Debate team captain. Want a suite single in Myles, higher up.", ["debate", "history podcasts", "basketball"], "late", 3, 4, 240],
  ["p25", "Tariq Aziz", 2027, "Electrical Engineering", "Paterson, NJ", "Senior design crunch. A single at 575 with its own bathroom is the dream.", ["electronics", "soccer", "coffee"], "late", 4, 2, 180],
  ["p26", "Wren Callahan", 2029, "Theatre Arts", "Asheville, NC", "Stage manager. Want a high floor in The Towers with my castmates.", ["theatre", "crochet", "musicals"], "late", 3, 5, 280],
  ["p27", "Ibrahim Diallo", 2028, "Mathematics", "Bronx, NY", "Kilachand honors. Want a 1019 suite with a real common room.", ["math puzzles", "chess", "running"], "early", 4, 2, 150],
  ["p28", "Sasha Petrova", 2027, "Sociology", "Brooklyn, NY", "Senior. Want a quiet top floor in Myles for thesis season.", ["sociology", "pilates", "poetry"], "early", 5, 2, 340],
  ["p29", "Diego Fuentes", 2028, "Business Administration", "San Diego, CA", "Startup club. Want a triple at 575 with two of my teammates.", ["startups", "surfing", "tacos"], "late", 3, 5, 30],
  ["p30", "Amara Nwosu", 2029, "Health Science", "Dallas, TX", "Sargent student. Looking for a Claflin single, close to FitRec.", ["fitness", "gospel choir", "nail art"], "early", 4, 4, 310],
  ["p31", "Ethan Walsh", 2029, "History", "Scranton, PA", "Hockey fan and history nerd. Want East Campus, near my friends in Kilachand.", ["history", "hockey", "video games"], "late", 2, 4, 200],
  ["p32", "Leo Romano", 2029, "Computer Engineering", "Staten Island, NY", "Lifts every morning. West Campus near the gym would be great.", ["gym", "PC builds", "pizza"], "late", 3, 4, 215],
  ["p33", "Isla MacLeod", 2028, "Graphic Design", "Halifax, NS", "On the CFA floor. Want a 1019 suite with a living room to paint in.", ["painting", "zines", "indie rock"], "late", 2, 3, 100],
  ["p34", "Ravi Iyer", 2027, "Economics and Mathematics", "Austin, TX", "Senior in a triple. Would love a high single in Rich or Sleeper.", ["poker", "cricket", "spreadsheets"], "late", 4, 3, 270],
  ["p35", "Mina Jang", 2028, "Communication", "Fort Lee, NJ", "Hosts a campus radio show. Want a Danielsen single with a view.", ["radio", "K-pop", "photography"], "late", 3, 4, 330],
  ["p36", "Felix Wagner", 2029, "Earth and Environment", "Boulder, CO", "Outing club. Want a 1019 suite to share gear with friends.", ["hiking", "climbing", "sustainability"], "early", 3, 4, 110],
  ["p37", "Yara Mansour", 2027, "Anthropology", "Paterson, NJ", "Senior. Want a single with my own bathroom at 575.", ["anthropology", "pottery", "oud"], "early", 5, 2, 20],
  ["p38", "Chloe Martin", 2028, "Speech, Language and Hearing Sciences", "Nashua, NH", "Want a Kilachand triple with my two best friends.", ["ASL", "swimming", "baking"], "early", 4, 4, 340],
  ["p39", "Noah Feldman", 2029, "Archaeology", "Newton, MA", "In a triple, want a single in Claflin or a 1019 suite.", ["archaeology", "D&D", "rock climbing"], "late", 3, 3, 60],

  // staying roommates (profiles only, no listing)
  ["p40", "Lily Tran", 2028, "Biomedical Engineering", "Garden Grove, CA", "Ava's lab partner and roommate. Staying put.", ["violin", "bubble tea", "lab life"], "early", 4, 3, 330],
  ["p41", "Mateo Cruz", 2030, "Computer Science", "Orlando, FL", "Sam's roommate. Staying in Warren C. Night owl, gaming until 3am.", ["guitar", "gaming", "coding"], "late", 1, 4, 190],
  ["p42", "Arjun Mehta", 2028, "Computer Science", "Plano, TX", "Staying in Warren C 1505. Always down for pickup basketball.", ["basketball", "hackathons", "biryani"], "late", 3, 4, 250],
  ["p43", "Simon Laurent", 2027, "French", "New Orleans, LA", "Staying in the Kilachand suite. Bakes croissants at 7am.", ["baking", "French cinema", "jazz"], "early", 5, 3, 355],
  ["p44", "Evan Novak", 2029, "Psychology", "Cleveland, OH", "Staying in Claflin 1104. Quiet, tidy, loves a good playlist.", ["playlists", "running", "sudoku"], "early", 5, 2, 90],
  ["p45", "Ryan Cho", 2028, "Hospitality Administration", "Queens, NY", "Staying in The Towers. Night shift at a hotel downtown.", ["cooking", "sneakers", "basketball"], "late", 3, 3, 225],
  ["p46", "Jared Thompson", 2029, "Film and Television", "Denver, CO", "Staying in Kilachand 714L. Night owl, cooks a lot, edits films.", ["filmmaking", "cooking", "snowboarding", "vinyl"], "late", 4, 4, 165],
  ["p47", "Caleb Ward", 2028, "Journalism", "Louisville, KY", "Staying in Towers 302W. Covers BU hockey for the paper.", ["hockey", "writing", "bluegrass"], "late", 3, 4, 40],
  ["p48", "Fatima Benali", 2028, "Art History", "Paterson, NJ", "Staying in Sleeper 204. Museum docent on weekends.", ["museums", "calligraphy", "tea"], "early", 4, 2, 300],
  ["p49", "Dana Kim", 2027, "Physics", "Fort Lee, NJ", "Staying in Sleeper 716. Telescope on the windowsill.", ["astronomy", "chess", "ramen"], "late", 4, 2, 235],
  ["p50", "Mia Hoffman", 2029, "Music Performance", "Ann Arbor, MI", "Staying in Sleeper 1108. Trumpet, but I practice at the CFA.", ["trumpet", "jazz", "skiing"], "early", 3, 4, 130],
  ["p51", "Olivia Grant", 2028, "Marketing", "Minneapolis, MN", "Staying in Sleeper 419. Runs a campus food account.", ["food photos", "running", "brunch"], "early", 4, 5, 5],
  ["p52", "Kofi Boateng", 2028, "Public Health", "Worcester, MA", "Staying in Rich 822. Choir, clinic shifts, early nights.", ["choir", "volunteering", "puzzles"], "early", 5, 3, 290],
  ["p53", "Yusuf Karim", 2027, "Chemistry", "Dearborn, MI", "Staying in Danielsen 532. Lab partner energy, very tidy.", ["chemistry", "soccer", "coffee"], "early", 5, 3, 55],
  ["p54", "Ella Murphy", 2029, "English", "Burlington, VT", "Staying in Danielsen 731. Bookworm with a kettle.", ["novels", "knitting", "tea"], "early", 4, 2, 145],
  ["p55", "Camila Torres", 2027, "Advertising", "Los Angeles, CA", "Staying in Warren A 1408. Designs posters for every club.", ["design", "salsa", "film photography"], "late", 3, 4, 15],
  ["p56", "Nora Lindqvist", 2029, "Classics", "Duluth, MN", "Staying in Claflin 306. Greek tutor, early bird.", ["Greek", "running", "board games"], "early", 4, 3, 85],
  ["p57", "Andrea Thomas", 2028, "Finance", "Newark, NJ", "Staying in Rich 1110. Trading club and late-night wings.", ["investing", "basketball", "wings"], "late", 3, 4, 205],
  ["p58", "Victor Ng", 2028, "Political Science", "Quincy, MA", "Staying in Kilachand 610L. Model UN and karaoke.", ["Model UN", "karaoke", "dumplings"], "late", 3, 5, 245],
  ["p59", "Elijah Moore", 2027, "Electrical Engineering", "Hartford, CT", "Staying in Towers 805E. Builds synths in his spare time.", ["synths", "electronics", "running"], "late", 3, 2, 175],
  ["p60", "Henry Zhao", 2028, "Mathematics", "Sugar Land, TX", "Staying in Kilachand 417R. Puzzle hunts and dim sum.", ["puzzle hunts", "dim sum", "tennis"], "early", 4, 3, 155],
  ["p61", "Mohammed Saleh", 2028, "Mechanical Engineering", "Dearborn, MI", "Staying in Kilachand 417R. Robotics team and soccer.", ["robotics", "soccer", "coffee"], "early", 4, 4, 65],
  ["p62", "Julia Costa", 2027, "Sociology", "Fall River, MA", "Staying in 1019 405B. Yoga at 7, library at 8.", ["yoga", "poetry", "farmers markets"], "early", 5, 3, 335],
  ["p63", "Zara Ali", 2029, "Health Science", "Houston, TX", "Staying in 575 509. Pre-PT and gym regular.", ["gym", "pre-PT", "K-dramas"], "early", 4, 4, 315],
  ["p64", "Esme Clarke", 2029, "Health Science", "Pittsburgh, PA", "Staying in 575 509. Swim team, asleep by 10.", ["swimming", "baking", "crosswords"], "early", 5, 3, 100],
  ["p65", "Aiden Foster", 2027, "Economics", "Charlotte, NC", "Staying in Rich 312. Fantasy football commissioner.", ["fantasy football", "golf", "BBQ"], "late", 3, 5, 25],
  ["p66", "Kenji Watanabe", 2027, "Mathematics", "Torrance, CA", "Staying in Rich 312. Quiet, tidy, plays Go.", ["Go", "anime", "ramen"], "late", 5, 2, 220],
  ["p67", "Leila Farah", 2027, "Anthropology", "Dearborn, MI", "Staying in Danielsen 933. Field notes and pottery.", ["pottery", "travel", "tea"], "early", 4, 3, 30],
  ["p68", "Ruby Simmons", 2027, "Sociology", "Savannah, GA", "Staying in Danielsen 933. Runs a book club.", ["book club", "running", "baking"], "early", 4, 4, 350],
  ["p69", "Hannah Weiss", 2028, "Speech, Language and Hearing Sciences", "Albany, NY", "Staying in 575 210. ASL club and early mornings.", ["ASL", "hiking", "baking"], "early", 5, 3, 330],
  ["p70", "Ezra Cohen", 2029, "Archaeology", "Newton, MA", "Staying in Sleeper 1213. D&D dungeon master.", ["D&D", "history", "bouldering"], "late", 3, 4, 70],
  ["p71", "Lucas Moreau", 2029, "Film and Television", "Montreal, QC", "Staying in Sleeper 1213. Always editing something.", ["filmmaking", "skating", "coffee"], "late", 2, 4, 40],
];

// Instagram-style demo handle: first.l.demo (made up, never a link)
function handle(name) {
  const parts = name.toLowerCase().replace(/[^a-z ]/g, "").split(" ");
  return `${parts[0]}.${parts[parts.length - 1][0]}.demo`;
}

// Made-up students' genders, for BU's single-gender rooms (everyone not listed here is a man).
const WOMEN = new Set(["Ava", "Cleo", "Ines", "Lena", "Priya", "Quinn", "Rosa", "Zoe", "Jun", "Kai", "Sasha", "Amara", "Isla",
  "Mina", "Yara", "Chloe", "Lily", "Fatima", "Olivia", "Ella", "Camila", "Nora", "Julia", "Zara", "Esme", "Leila", "Ruby", "Hannah",
  "Noor", "Dana", "Mia", "Lucia", "Andrea", "Bea"]);

function person([id, name, year, major, hometown, bio, interests, sleep, tidy, social, hue]) {
  return {
    id, name, first: name.split(" ")[0], gender: WOMEN.has(name.split(" ")[0]) ? "f" : "m", year, major, hometown, bio, interests,
    vibe: { sleep, tidy, social },
    instagram: handle(name),
    avatar: { seed: id, hue },
  };
}

export const PEOPLE = P.map(person);

// ---------- rooms ----------
// [dormId, towerId|null, floor, number, type, occupants]
const R = [
  // Loop W: across the three Warren towers
  ["warren", "warren-fairfield", 9, "907", "double", ["p01", "p40"]],
  ["warren", "warren-marshall", 12, "1212", "double", ["p02"]],
  ["warren", "warren-shields", 6, "611", "single", ["p03"]],
  // Loop X: five dorms
  ["warren", "warren-shields", 15, "1505", "double", ["p04", "p42"]],
  ["kilachand", null, 8, "806R", "suite", ["p05", "p43"]],
  ["myles", null, 4, "406B", "suite", ["p06"]],
  ["claflin", null, 11, "1104", "double", ["p07", "p44"]],
  ["towers", null, 6, "615E", "double", ["p08", "p45"]],
  // Loop J: Miles, Jack (Jared stays), Theo
  ["warren", "warren-fairfield", 9, "911", "single", ["p09"]],
  ["kilachand", null, 7, "714L", "double", ["p10", "p46"]],
  ["towers", null, 3, "302W", "double", ["p11", "p47"]],
  // Loop S: floor to floor inside Sleeper
  ["sleeper", null, 2, "204", "double", ["p12", "p48"]],
  ["sleeper", null, 7, "716", "double", ["p13", "p49"]],
  ["sleeper", null, 11, "1108", "double", ["p14", "p50"]],
  ["sleeper", null, 4, "419", "double", ["p15", "p51"]],
  // Loop Y: You, Nate, Omar
  ["warren", "warren-shields", 7, "708", "double", ["p00", "p41"]],
  ["rich", null, 8, "822", "double", ["p16", "p52"]],
  ["danielsen", null, 5, "532", "double", ["p17", "p53"]],
  // Waiting for one more person (Loop L after the live add)
  ["rich", null, 10, "1026", "single", ["p18"]],
  ["danielsen", null, 7, "731", "double", ["p19", "p54"]],
  ["warren", "warren-fairfield", 14, "1408", "double", ["p20", "p55"]],
  // Direct pairs
  ["claflin", null, 3, "306", "double", ["p21", "p56"]],
  ["rich", null, 11, "1110", "double", ["p22", "p57"]],
  ["myles", null, 7, "705A", "suite", ["p23"]],
  ["kilachand", null, 6, "610L", "double", ["p24", "p58"]],
  ["towers", null, 8, "805E", "double", ["p25", "p59"]],
  ["575", null, 4, "416", "single", ["p26"]],
  // Not matched yet
  ["kilachand", null, 4, "417R", "triple", ["p27", "p60", "p61"]],
  ["1019", null, 4, "405B", "suite", ["p28", "p62"]],
  ["danielsen", null, 8, "823J", "single", ["p29"]],
  ["575", null, 5, "509", "triple", ["p30", "p63", "p64"]],
  ["warren", "warren-marshall", 8, "816", "double", ["p31", "p32"]],
  ["claflin", null, 9, "915", "double", ["p33"]],
  ["rich", null, 3, "312", "triple", ["p34", "p65", "p66"]],
  ["myles", null, 8, "802A", "suite", ["p35"]],
  ["towers", null, 4, "410W", "double", ["p36"]],
  ["danielsen", null, 9, "933", "triple", ["p37", "p67", "p68"]],
  ["575", null, 2, "210", "double", ["p38", "p69"]],
  ["sleeper", null, 12, "1213", "triple", ["p39", "p70", "p71"]],
];

function roomId(dormId, towerId, number) {
  return `${towerId || dormId}-${number}`;
}

function room([dormId, towerId, floor, number, type, occupants]) {
  return { id: roomId(dormId, towerId, number), dormId, towerId, floor, number, type, occupants };
}

export const ROOMS = R.map(room);

// ---------- listings ----------
const WEST = ["claflin", "sleeper", "rich", "1019"];

function wants(w = {}) {
  return {
    dorms: w.dorms || [], towers: w.towers || [],
    floorMin: w.floorMin ?? null, floorMax: w.floorMax ?? null,
    types: w.types || [], withPeople: w.withPeople || [], notDorms: w.notDorms || [],
  };
}

function roomOf(personId) {
  const r = ROOMS.find((x) => x.occupants.includes(personId));
  return r ? r.id : null;
}

// [listingId, personId, wants, note, postedDaysAgo]
const L = [
  ["l00", "p00", { dorms: WEST }, "Need a roommate who sleeps early and keeps it clean. West Campus would be great.", 1],
  ["l01", "p01", { towers: ["warren-marshall"], floorMin: 12 }, "I want a high floor in B Tower, where my lab group lives.", 6],
  ["l02", "p02", { towers: ["warren-shields"], types: ["single"] }, "Senior year, I just want a single. C Tower is fine.", 9],
  ["l03", "p03", { towers: ["warren-fairfield"], types: ["double"], floorMax: 10 }, "My single is too quiet. Want a double in A Tower, floor 10 or lower.", 4],
  ["l04", "p04", { dorms: ["kilachand"], types: ["suite"] }, "Got into Kilachand honors, looking for a suite there.", 12],
  ["l05", "p05", { dorms: ["myles"], floorMin: 4, floorMax: 5 }, "Want a Myles suite on 4 or 5, near my Model UN friends.", 7],
  ["l06", "p06", { dorms: ["claflin"] }, "Any Claflin room. My Formula SAE team is all on West.", 3],
  ["l07", "p07", { dorms: ["towers"], floorMin: 5, floorMax: 6 }, "The Towers, floor 5 or 6. My study group is there.", 5],
  ["l08", "p08", { towers: ["warren-shields"], floorMin: 12, types: ["double"] }, "C Tower, floor 12 or higher, for the skyline view.", 10],
  ["l09", "p09", { withPeople: ["p46"] }, "I'd move anywhere to room with Jared. Our schedules match.", 0],
  ["l10", "p10", { dorms: ["towers"], floorMax: 4 }, "The Towers, low floor. Jared's staying, he's a great roommate.", 8],
  ["l11", "p11", { towers: ["warren-fairfield"], types: ["single"] }, "Need a single for late edits. A Tower is closest to COM.", 11],
  ["l12", "p12", { dorms: ["sleeper"], floorMin: 6, floorMax: 8 }, "Staying in Sleeper, just want floor 6 to 8.", 2],
  ["l13", "p13", { dorms: ["sleeper"], floorMin: 10 }, "Same building, higher floor. 10 or up for the quiet.", 6],
  ["l14", "p14", { dorms: ["sleeper"], floorMin: 3, floorMax: 5 }, "Want floor 3 to 5 in Sleeper so I can take the stairs.", 4],
  ["l15", "p15", { dorms: ["sleeper"], floorMax: 3 }, "Low floor in Sleeper, 3 or below. Hauling thrift racks.", 3],
  ["l16", "p16", { dorms: ["danielsen"], floorMax: 6 }, "Danielsen, floor 6 or lower. Closer to my clinic shifts.", 7],
  ["l17", "p17", { towers: ["warren-shields"], floorMax: 10, types: ["double"] }, "A double in C Tower, floor 10 or lower. Close to the chem labs.", 9],
  ["l18", "p18", { dorms: ["myles"], floorMax: 3 }, "Myles, low floor. My rowing friends all live there.", 5],
  ["l19", "p19", { dorms: ["rich"], types: ["single"] }, "Any single in Rich. I read late and need my own space.", 8],
  ["l20", "p20", { dorms: ["danielsen"], floorMin: 7, types: ["double"] }, "A Danielsen double, floor 7 or up. Near the T for my internship.", 6],
  ["l21", "p21", { dorms: ["rich"], types: ["double"], floorMin: 10 }, "Rich, floor 10 or higher. My Latin study group is up there.", 4],
  ["l22", "p22", { dorms: ["claflin"], floorMax: 4 }, "Claflin, floor 4 or lower. My study group is on 3.", 4],
  ["l23", "p23", { dorms: ["kilachand"], types: ["double"], floorMax: 6 }, "Want a classic Kilachand double, floor 6 or lower.", 13],
  ["l24", "p24", { dorms: ["myles"], floorMin: 6 }, "Myles, floor 6 or higher. Debate team is on 7.", 13],
  ["l25", "p25", { dorms: ["575"], types: ["single"] }, "A 575 single with its own bathroom, please.", 2],
  ["l26", "p26", { dorms: ["towers"], floorMin: 7 }, "The Towers, floor 7 or up, with my castmates.", 2],
  ["l27", "p27", { dorms: ["1019"] }, "A 1019 suite with a real common room.", 15],
  ["l28", "p28", { dorms: ["myles"], floorMin: 8 }, "Myles, top floors only. Thesis season needs quiet.", 10],
  ["l29", "p29", { dorms: ["575"], types: ["triple"] }, "A 575 triple so I can live with two teammates.", 6],
  ["l30", "p30", { dorms: ["claflin"], types: ["single"] }, "A Claflin single, close to FitRec.", 8],
  ["l31", "p31", { dorms: ["kilachand", "towers", "myles", "danielsen", "575"] }, "Anything in East Campus works. My friends all live out there.", 3],
  ["l32", "p32", { dorms: ["claflin", "sleeper", "rich"] }, "West Campus near the gym, please. I lift every morning.", 3],
  ["l33", "p33", { dorms: ["1019"] }, "Want a 1019 suite with a living room to paint in.", 5],
  ["l34", "p34", { dorms: ["rich", "sleeper"], types: ["single"], floorMin: 11 }, "A high single in Rich or Sleeper, floor 11 or up.", 12],
  ["l35", "p35", { dorms: ["danielsen"], types: ["single"], floorMin: 8 }, "A Danielsen single, floor 8 or up, for the river view.", 7],
  ["l36", "p36", { dorms: ["1019"] }, "A 1019 suite so my outing club friends can share gear.", 9],
  ["l37", "p37", { dorms: ["575"], types: ["single"] }, "A 575 single with my own bathroom.", 4],
  ["l38", "p38", { dorms: ["kilachand"], types: ["triple"] }, "A Kilachand triple for me and my two best friends.", 6],
  ["l39", "p39", { dorms: ["claflin", "1019"], types: ["single", "suite"] }, "A Claflin single or a 1019 suite. Done with triples.", 11],
];

export const LISTINGS = L.map(([id, personId, w, note, postedDaysAgo]) => ({
  id, personId, roomId: roomOf(personId), wants: wants(w), note, postedDaysAgo,
}));

export const ME = { personId: "p00", listingId: "l00" };

// ---------- demo script ----------
const noor = person(["p72", "Noor Rahman", 2029, "Statistics", "Sacramento, CA", "Rowing team cox. Lives for spreadsheets and sunrise practice.", ["rowing", "statistics", "baking", "true crime"], "early", 4, 3, 265]);

export const DEMO = {
  liveAdd: {
    person: noor,
    room: room(["myles", null, 3, "305C", "suite", ["p72"]]),
    listing: {
      id: "l40", personId: "p72", roomId: "myles-305C",
      wants: wants({ towers: ["warren-fairfield"], floorMin: 12 }),
      note: "Want a high floor in A Tower. My whole rowing team lives there.",
      postedDaysAgo: 0,
    },
    caption: "Noor posts her Myles room. Priya, Quinn and Rosa were one person short of a loop.",
  },
  scenes: [
    {
      id: "everyone", title: "Everyone who wants out",
      caption: "40 students want a different room.",
      sub: "Each one posted the room they have and the room they want.",
      showcase: [],
    },
    {
      id: "direct", title: "One-to-one swaps only",
      caption: "Swapping in pairs, only 6 of them move.",
      sub: "A pair only works if you want my room and I want yours. That almost never happens.",
      showcase: [["l21", "l22"], ["l23", "l24"], ["l25", "l26"]],
    },
    {
      id: "loops", title: "SwapChain finds loops",
      caption: "Ava wants B Tower. Bea wants C Tower. Cleo wants A Tower.",
      sub: "No pair works. The loop does. Then loops across dorms, and inside one dorm.",
      showcase: [["l01", "l02", "l03"], ["l04", "l05", "l06", "l07", "l08"], ["l12", "l13", "l14", "l15"], ["l00", "l16", "l17"]],
      beats: [
        { id: "towers", loop: ["l01", "l02", "l03"], caption: "Ava wants B Tower. Bea wants C Tower. Cleo wants A Tower.", sub: "No pair works. The loop does. All three move." },
        { id: "dorms", loop: ["l04", "l05", "l06", "l07", "l08"], caption: "Loops can cross the whole campus.", sub: "5 students, 5 dorms, everyone gets a room they asked for." },
        { id: "same-dorm", loop: ["l12", "l13", "l14", "l15"], caption: "Or stay in your building and just change floors.", sub: "4 students in Sleeper trade floors in one loop." },
        { id: "you", loop: ["l00", "l16", "l17"], caption: "And you're in one too.", sub: "Sam goes to Rich, Nate to Danielsen, Omar to Warren C." },
      ],
    },
    {
      id: "bu-swaps", title: "Four swaps BU can approve",
      caption: "BU only approves 2-person swaps. So a loop of 5 becomes 4 swaps.",
      sub: "Everyone confirms first, then the swaps are filed back to back. Fall window closes Nov 30.",
      showcase: [["l04", "l05", "l06", "l07", "l08"]],
    },
    {
      id: "social", title: "Room with someone, not just somewhere",
      caption: "Miles picks a roommate, not just a room.",
      sub: "He saw Jared is staying in Jack's room. That one choice closes a new loop.",
      showcase: [["l09", "l10", "l11"]],
      focus: { listingId: "l10", stayingPersonId: "p46", chooserListingId: "l09" },
    },
    {
      id: "live-add", title: "Live: one more post",
      caption: "Three students are one person away from a loop.",
      captionAfter: "One new post. Four people move.",
      sub: "Every new room can close loops that were waiting.",
      waiting: ["l18", "l19", "l20"],
      showcase: [["l18", "l40", "l20", "l19"]],
      usesLiveAdd: true,
    },
    {
      id: "closing", title: "The difference",
      caption: "Same students. Same rooms. More of them moved.",
      sub: "1-to-1 swaps move 6. SwapChain moves 28.",
      showcase: [
        ["l21", "l22"], ["l23", "l24"], ["l25", "l26"],
        ["l00", "l16", "l17"], ["l01", "l02", "l03"], ["l09", "l10", "l11"],
        ["l12", "l13", "l14", "l15"], ["l18", "l40", "l20", "l19"],
        ["l04", "l05", "l06", "l07", "l08"],
      ],
      usesLiveAdd: true,
    },
  ],
};
