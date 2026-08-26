import { load } from "cheerio";

const url = process.env.DIAG_URL;
if (!url) throw new Error("DIAG_URL env var required");
const USER_AGENT = "SlotDataArchive/1.0 (+https://github.com/Hunaken-akademia/Slot_data)";
const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml", "accept-language": "ja,en;q=0.8" } });
console.log(`status=${response.status}`);
const html = await response.text();
console.log(`bodyLength=${html.length}`);
const $ = load(html);
const table = $("table").filter((_, t) => {
  let tr = $(t).children("tbody").children("tr");
  if (!tr.length) tr = $(t).children("tr");
  const headers = tr.first().children("th").map((__, th) => $(th).text().trim()).get();
  return ["機種", "台番", "差枚", "G数", "出率"].every((h, i) => headers[i] === h);
}).first();
let tr = table.children("tbody").children("tr");
if (!tr.length) tr = table.children("tr");
console.log(`rows=${tr.length - 1}`);
let pos = 0, neg = 0, zero = 0, dash = 0;
const negSamples = [];
for (let i = 1; i < tr.length; i++) {
  const cells = $(tr[i]).children("td").map((__, td) => $(td).text().trim()).get();
  if (!cells[2]) continue;
  if (cells[2] === "-") dash++;
  else {
    const n = Number(cells[2].replace(/,/g, ""));
    if (n < 0) { neg++; if (negSamples.length < 5) negSamples.push(cells); }
    else if (n === 0) zero++;
    else pos++;
  }
}
console.log(`pos=${pos} zero=${zero} neg=${neg} dash=${dash}`);
console.log(`negSamples=${JSON.stringify(negSamples)}`);
