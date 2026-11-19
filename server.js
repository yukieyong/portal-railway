// Student Coding & AI Progress Portal — server
// Zero dependencies (Node built-ins only) so it deploys to Railway with just `npm start`.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || "admin";
const DATA_DIR = process.env.DATA_DIR || __dirname; // set to a mounted Railway volume path for persistent storage
const DATA_FILE = path.join(DATA_DIR, "data.json");

// ---------- Database (JSON file) ----------
const seedStudents = [
  { id: "s1", name: "Aisyah Rahman", school: "SMK Taman Melati, Kuala Lumpur", pass: "1234", status: "On Track" },
  { id: "s2", name: "Wei Jian Tan",  school: "SMK Convent Taiping, Perak",     pass: "1234", status: "Ahead" },
  { id: "s3", name: "Nurul Hidayah", school: "SMK Agama Miri, Sarawak",        pass: "1234", status: "Needs Help" },
];
const seedItems = [
  { id: "t1", type: "topic",  cat: "Coding",  title: "HTML Basics: My First Webpage", xp: 20, doneBy: ["s1", "s2"] },
  { id: "t2", type: "topic",  cat: "Coding",  title: "Python: Loops & Lists",         xp: 25, doneBy: ["s2"] },
  { id: "t3", type: "topic",  cat: "AI",      title: "What Is AI? Recognising Patterns", xp: 20, doneBy: ["s1", "s2"] },
  { id: "t4", type: "topic",  cat: "AI",      title: "Training a Simple Chatbot",     xp: 30, doneBy: [] },
  { id: "t5", type: "topic",  cat: "Coding",  title: "CSS Styling: Colourful Cards",  xp: 20, doneBy: [] },
  { id: "p1", type: "project", cat: "project", title: "Project: Kampung Food Guide Website", xp: 50, doneBy: [] },
  { id: "p2", type: "project", cat: "project", title: "Project: AI Batik Pattern Classifier", xp: 60, doneBy: ["s2"] },
];

let db;
function loadDB() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(db.students) || !Array.isArray(db.items)) throw new Error("bad shape");
  } catch (e) {
    db = { students: seedStudents, items: seedItems };
    saveDB();
  }
}
function saveDB() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
loadDB();

// ---------- Sessions (in-memory tokens; survive until server restart) ----------
const sessions = new Map(); // token -> { role: "student"|"admin", studentId }
function newToken(role, studentId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { role, studentId: studentId || null });
  return token;
}
function auth(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  return token ? sessions.get(token) : null;
}

// ---------- Helpers ----------
const doneItems = sid => db.items.filter(i => i.doneBy.includes(sid));
const totalXP = sid => doneItems(sid).reduce((s, i) => s + i.xp, 0);
function publicStudent(st) {
  const { pass, ...rest } = st;
  return { ...rest, xp: totalXP(st.id), done: doneItems(st.id).length, totalItems: db.items.length };
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 1e6) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on("error", reject);
  });
}

// ---------- Static files ----------
const STATIC = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(__dirname, urlPath));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": STATIC[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}

// ---------- API ----------
async function handleAPI(req, res, pathname) {
  const body = await readBody(req);
  const session = auth(req);

  // Public: list of student names for the login dropdown
  if (req.method === "GET" && pathname === "/api/names") {
    return json(res, 200, { names: db.students.map(s => ({ id: s.id, name: s.name })) });
  }

  // Public: student login
  if (req.method === "POST" && pathname === "/api/login") {
    const st = db.students.find(s => s.name.toLowerCase() === String(body.name || "").toLowerCase());
    if (!st || st.pass !== String(body.password || "")) return json(res, 401, { ok: false, error: "Wrong name or password." });
    const token = newToken("student", st.id);
    return json(res, 200, { ok: true, token, student: publicStudent(st) });
  }

  // Public: admin login with PIN
  if (req.method === "POST" && pathname === "/api/admin/login") {
    if (String(body.pin || "") !== ADMIN_PIN) return json(res, 401, { ok: false, error: "Wrong PIN." });
    return json(res, 200, { ok: true, token: newToken("admin") });
  }

  // Authenticated: who am I?
  if (req.method === "GET" && pathname === "/api/me") {
    if (!session) return json(res, 401, { error: "Not logged in." });
    const st = session.role === "student" ? db.students.find(s => s.id === session.studentId) : null;
    return json(res, 200, { role: session.role, student: st ? publicStudent(st) : null });
  }

  // Authenticated: full app data
  if (req.method === "GET" && pathname === "/api/data") {
    if (!session) return json(res, 401, { error: "Not logged in." });
    return json(res, 200, {
      role: session.role,
      students: db.students.map(publicStudent),
      items: db.items,
    });
  }

  // Student: mark item done / undone
  if (req.method === "POST" && pathname === "/api/progress") {
    if (!session || session.role !== "student") return json(res, 403, { error: "Students only." });
    const item = db.items.find(i => i.id === body.itemId);
    if (!item) return json(res, 404, { error: "Unknown item." });
    const sid = session.studentId;
    if (body.done && !item.doneBy.includes(sid)) item.doneBy.push(sid);
    if (!body.done) item.doneBy = item.doneBy.filter(id => id !== sid);
    saveDB();
    const st = db.students.find(s => s.id === sid);
    return json(res, 200, { ok: true, student: publicStudent(st), item });
  }

  // Admin: add student
  if (req.method === "POST" && pathname === "/api/students") {
    if (!session || session.role !== "admin") return json(res, 403, { error: "Admins only." });
    const name = String(body.name || "").trim();
    const school = String(body.school || "").trim();
    const pass = String(body.pass || "").trim();
    if (!name || !school || !pass) return json(res, 400, { error: "All fields are required." });
    if (db.students.some(s => s.name.toLowerCase() === name.toLowerCase())) return json(res, 400, { error: "A student with that name already exists." });
    const st = { id: "s" + Date.now().toString(36), name, school, pass, status: "Just Started" };
    db.students.push(st);
    saveDB();
    return json(res, 200, { ok: true, student: publicStudent(st) });
  }

  // Admin: delete student
  if (req.method === "POST" && pathname === "/api/students/delete") {
    if (!session || session.role !== "admin") return json(res, 403, { error: "Admins only." });
    const before = db.students.length;
    db.students = db.students.filter(s => s.id !== body.id);
    db.items.forEach(i => (i.doneBy = i.doneBy.filter(id => id !== body.id)));
    if (db.students.length === before) return json(res, 404, { error: "Student not found." });
    saveDB();
    return json(res, 200, { ok: true });
  }

  // Admin: change status
  if (req.method === "POST" && pathname === "/api/status") {
    if (!session || session.role !== "admin") return json(res, 403, { error: "Admins only." });
    const st = db.students.find(s => s.id === body.id);
    const allowed = ["Just Started", "On Track", "Needs Help", "Ahead"];
    if (!st || !allowed.includes(body.status)) return json(res, 400, { error: "Invalid." });
    st.status = body.status;
    saveDB();
    return json(res, 200, { ok: true, student: publicStudent(st) });
  }

  // Admin: add / delete a topic or project (bonus)
  if (req.method === "POST" && pathname === "/api/items") {
    if (!session || session.role !== "admin") return json(res, 403, { error: "Admins only." });
    const title = String(body.title || "").trim();
    const type = body.type === "project" ? "project" : "topic";
    const cat = type === "project" ? "project" : (body.cat === "AI" ? "AI" : "Coding");
    const xp = Math.max(5, Math.min(200, parseInt(body.xp, 10) || 20));
    if (!title) return json(res, 400, { error: "Title is required." });
    const item = { id: "i" + Date.now().toString(36), type, cat, title, xp, doneBy: [] };
    db.items.push(item);
    saveDB();
    return json(res, 200, { ok: true, item });
  }
  if (req.method === "POST" && pathname === "/api/items/delete") {
    if (!session || session.role !== "admin") return json(res, 403, { error: "Admins only." });
    db.items = db.items.filter(i => i.id !== body.id);
    saveDB();
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Unknown API route." });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;
  if (pathname.startsWith("/api/")) {
    handleAPI(req, res, pathname).catch(() => json(res, 500, { error: "Server error." }));
  } else {
    serveStatic(req, res);
  }
});
server.listen(PORT, () => console.log("Portal running on port " + PORT));
