import fs from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { selectedStore } from "./stores.mjs";

const STORE = selectedStore();
const START_DATE = "2026-05-25";
const TAG_URL = STORE.tagUrl;
const DATA_DIR = STORE.absoluteDataDir;
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS || 7);
const MAX_REPORTS = Number(process.env.MAX_REPORTS || 0);
const BACKFILL = process.env.BACKFILL !== "false";
const USER_AGENT = "SlotDataArchive/1.0 (+https://github.com/Hunaken-akademia/Slot_data)";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The source shows "-" for 差枚/出率 when a machine's result isn't tallied yet (even with a G数 present).
// Treat that as null ("no data") instead of NaN, so it never gets silently coerced to 0 downstream.
const number = value => {
  const raw = String(value).replace(/[,+%\s]/g, "");
  if (raw === "" || raw === "-" || raw === "－" || raw === "−") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

function jstToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shiftDate(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function inferDate(month, day, today) {
  const [year, currentMonth, currentDay] = today.split("-").map(Number);
  let candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (candidate > shiftDate(today, 7)) candidate = `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return candidate;
}
async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-language": "ja,en;q=0.8" },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError}`);
}
async function loadExisting() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const files = (await fs.readdir(DATA_DIR)).filter(name => /^\d{4}-\d{2}\.json$/.test(name));
  const rows = [];
  for (const file of files) rows.push(...JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")));
  return rows;
}
function discoverReports(html, today) {
  const $ = load(html);
  const reports = new Map();
  $("a").each((_, anchor) => {
    const text = $(anchor).text().replace(/\s+/g, "");
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\([日月火水木金土]\)$/);
    const href = $(anchor).attr("href") || "";
    if (!match || !/^https:\/\/min-repo\.com\/\d+\/?$/.test(href)) return;
    const date = inferDate(Number(match[1]), Number(match[2]), today);
    reports.set(date, href);
  });
  return reports;
}
function parseReport(html, date) {
  const $ = load(html);
  let rows = [];
  $("table").each((_, table) => {
    if (rows.length) return;
    let tableRows = $(table).children("tbody").children("tr");
    if (!tableRows.length) tableRows = $(table).children("tr");
    const headers = tableRows.first().children("th").map((__, th) => $(th).text().trim()).get();
    if (!["機種", "台番", "差枚", "G数", "出率"].every((header, i) => headers[i] === header)) return;
    rows = tableRows.slice(1).map((__, tr) => {
      const cells = $(tr).children("td").map((___, td) => $(td).text().trim()).get();
      if (!/^\d+$/.test(cells[1] || "")) return null;
      // Cheerio's map flattens returned arrays, so wrap each record first.
      return { row: [date, number(cells[1]), cells[0], number(cells[2]), number(cells[3]), number(cells[4])] };
    }).get().filter(Boolean).map(item => item.row);
  });
  const unique = new Set(rows.map(row => row[1]));
  if (rows.length < STORE.minRows || rows.length > STORE.maxRows || unique.size !== rows.length) {
    throw new Error(`${date}: invalid machine rows rows=${rows.length} unique=${unique.size}`);
  }
  return rows;
}

const today = jstToday();
const endDate = shiftDate(today, -1);
const existing = await loadExisting();
const existingDates = new Set(existing.map(row => row[0]));
const reports = discoverReports(await fetchText(TAG_URL), today);
const refreshFrom = shiftDate(endDate, -(REFRESH_DAYS - 1));
let targets = [...reports].filter(([date]) =>
  date >= START_DATE && date <= endDate && (BACKFILL ? !existingDates.has(date) || date >= refreshFrom : date >= refreshFrom)
).sort(([a], [b]) => a.localeCompare(b));
if(MAX_REPORTS>0)targets=targets.slice(0,MAX_REPORTS);

console.log(`store=${STORE.slug} reports=${reports.size} existing_dates=${existingDates.size} targets=${targets.length} range=${START_DATE}..${endDate}`);
const updates = new Map();
const failures = [];
let cursor = 0;
async function worker() {
  while (cursor < targets.length) {
    const [date, baseUrl] = targets[cursor++];
    try {
      const url = new URL(baseUrl);
      url.searchParams.set("kishu", "all");
      let rows,lastError;
      for(let attempt=1;attempt<=3;attempt++){
        try{rows=parseReport(await fetchText(url.href),date);break}
        catch(error){lastError=error;if(attempt<3)await sleep(attempt*5000)}
      }
      if(!rows)throw lastError;
      updates.set(date, rows);
      console.log(`OK ${date} rows=${rows.length}`);
    } catch (error) {
      failures.push({ date, error: error.message });
      console.error(`ERROR ${date} ${error.message}`);
    }
    await sleep(1200);
  }
}
await worker();

const merged = existing.filter(row => !updates.has(row[0]));
for (const rows of updates.values()) merged.push(...rows);
merged.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
const months = new Map();
for (const row of merged) {
  const month = row[0].slice(0, 7);
  if (!months.has(month)) months.set(month, []);
  months.get(month).push(row);
}
for (const [month, rows] of months) await fs.writeFile(path.join(DATA_DIR, `${month}.json`), JSON.stringify(rows));
await fs.writeFile(path.join(DATA_DIR, "update-status.json"), JSON.stringify({
  updatedAt: new Date().toISOString(), jstTargetThrough: endDate, discoveredReports: reports.size,
  attempted: targets.length, updatedDates: [...updates.keys()].sort(), failures
}, null, 2));
console.log(`updated_dates=${updates.size} total_rows=${merged.length} failures=${failures.length}`);
// Keep successful dates even when the source starts throttling mid-run.
// Missing dates remain eligible on the next scheduled/manual run.
if (targets.length && updates.size === 0) process.exitCode = 1;
