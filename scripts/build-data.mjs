import fs from "node:fs/promises";
import path from "node:path";
import { selectedStore } from "./stores.mjs";

const STORE = selectedStore();
const DATA_DIR = STORE.absoluteDataDir;
const norm = s => String(s).normalize("NFKC").replace(/[\s　]+/g, "");
const files = (await fs.readdir(DATA_DIR)).filter(name => /^\d{4}-\d{2}\.json$/.test(name)).sort();
const compact = [];
for (const file of files) compact.push(...JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")));
compact.sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
if (!compact.length) throw new Error("No monthly data found");

// The source (min-repo.com) sometimes withholds 差枚 for a machine that has actually
// finished its session (masks it back to "-"/null instead of the real number). It does
// this selectively for negative results only, so a date where every non-null diff is
// >= 0 despite a healthy sample size is not "a lucky day with no losers" - it's almost
// certainly still-masked data. Exclude such dates from every aggregate below so a masked
// day never renders as if the parlor were purely non-negative that day; the raw rows stay
// in the monthly files untouched, only the derived stats/frontend view drop them.
const dateNonNull=new Map();
for(const [date,,,diff] of compact){
  if(diff==null)continue;
  const s=dateNonNull.get(date)||{total:0,neg:0};s.total++;if(diff<0)s.neg++;dateNonNull.set(date,s);
}
const unreliableDates=new Set([...dateNonNull].filter(([,s])=>s.total>=STORE.minRows*0.3&&s.neg===0).map(([date])=>date));

// diff/games can be null when the source hasn't tallied a machine's result yet (even with a G数 present).
// Track raw row volume (rows/gcount) separately from diff-valid samples (count) so nulls never get
// silently averaged in as 0.
const dailyMap=new Map(),machineMap=new Map(),numberMap=new Map(),machineWeekdayMap=new Map();
for(const r of compact){
  const [date,no,name,diff,games]=r;
  if(!numberMap.has(no))numberMap.set(no,[]);numberMap.get(no).push(r);
  if(unreliableDates.has(date))continue;
  const hasDiff=diff!=null,hasGames=games!=null;
  if(!dailyMap.has(date))dailyMap.set(date,{date,total:0,games:0,wins:0,count:0,rows:0,gcount:0});
  const d=dailyMap.get(date);d.rows++;if(hasDiff){d.total+=diff;d.wins+=diff>0?1:0;d.count++}if(hasGames){d.games+=games;d.gcount++}
  const nk=norm(name);
  if(!machineMap.has(nk))machineMap.set(nk,{name,days:new Set(),sum:0,games:0,wins:0,count:0,rows:0,gcount:0});
  const m=machineMap.get(nk);m.days.add(date);m.rows++;if(hasDiff){m.sum+=diff;m.wins+=diff>0?1:0;m.count++}if(hasGames){m.games+=games;m.gcount++}
  const wd=new Date(`${date}T00:00:00Z`).getUTCDay(),wk=`${nk}|${wd}`;
  if(!machineWeekdayMap.has(wk))machineWeekdayMap.set(wk,{name,nk,weekday:wd,days:new Set(),sum:0,games:0,wins:0,count:0,rows:0,gcount:0});
  const mw=machineWeekdayMap.get(wk);mw.days.add(date);mw.rows++;if(hasDiff){mw.sum+=diff;mw.wins+=diff>0?1:0;mw.count++}if(hasGames){mw.games+=games;mw.gcount++}
}
const daily=[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,avg:d.count?d.total/d.count:0,avgGames:d.gcount?d.games/d.gcount:0,winRate:d.count?d.wins/d.count:0}));
// The reliable window can legitimately be empty (a store whose every collected date is
// still masked, per unreliableDates above) - guard the date-range math for that case
// instead of throwing, so a fully-masked store still produces a usable (empty) summary.
const from=daily[0]?.date??null,to=daily.at(-1)?.date??null;
// A machine only counts as a "注目機種" candidate if it was actually on the floor on the
// most recent reliable day - a machine that was swapped out shouldn't keep recommending
// itself just because it used to perform well.
const activeNames=new Set(to?compact.filter(r=>r[0]===to).map(r=>norm(r[2])):[]);
const machines=[...machineMap.values()].map(m=>({name:m.name,days:m.days.size,count:m.rows,total:m.sum,avg:m.count?m.sum/m.count:0,avgGames:m.gcount?m.games/m.gcount:0,wins:m.wins,winRate:m.count?m.wins/m.count:0})).sort((a,b)=>b.count-a.count);
const changes=[];
for(const [no,list0] of numberMap){
  const list=[...list0].sort((a,b)=>a[0].localeCompare(b[0]));let prev=list[0];
  for(let i=1;i<list.length;i++){const cur=list[i];if(norm(cur[2])!==norm(prev[2]))changes.push({no,date:cur[0],from:prev[2],to:cur[2]});prev=cur}
}
changes.sort((a,b)=>b.date.localeCompare(a.date)||a.no-b.no);
const weekday=["日","月","火","水","木","金","土"],groups=new Map();
for(const d of daily){
  const w=weekday[new Date(`${d.date}T00:00:00Z`).getUTCDay()];
  for(const key of [`${w}曜日`,d.date.endsWith("-07")||d.date.endsWith("-17")||d.date.endsWith("-27")?"7のつく日":null,d.date.endsWith("-22")?"22日":null].filter(Boolean)){
    if(!groups.has(key))groups.set(key,{label:key,days:0,total:0,positive:0});
    const g=groups.get(key);g.days++;g.total+=d.total;g.positive+=d.total>0?1:0;
  }
}
const patterns=[...groups.values()].map(g=>({...g,avg:g.total/g.days,positiveRate:g.positive/g.days}));
const weekdayMachines={};
for(let wd=0;wd<7;wd++)weekdayMachines[wd]=[...machineWeekdayMap.values()].filter(m=>m.weekday===wd&&m.days.size>=4&&m.count>=8&&m.gcount&&m.games/m.gcount>=1500&&activeNames.has(m.nk)).map(m=>{
  const avg=m.sum/m.count,winRate=m.wins/m.count,avgGames=m.games/m.gcount,reliability=Math.min(1,m.count/40);
  return{name:m.name,days:m.days.size,count:m.count,avg,avgGames,winRate,score:avg*(.45+.55*reliability)+(winRate-.5)*700+Math.min(avgGames,6000)/40};
}).sort((a,b)=>b.score-a.score).slice(0,5);

const missingDates=[];
if(from){for(let date=from;date<=to;){if(!dailyMap.has(date))missingDates.push(date);const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10)}}
const maxMachines=daily.length?Math.max(...daily.map(d=>d.rows)):0;
const unreliableList=[...unreliableDates].sort();
await fs.writeFile(path.join(DATA_DIR,"summary.json"),JSON.stringify({
  slug:STORE.slug,store:STORE.name,shortName:STORE.shortName,period:{from,to},days:daily.length,rows:compact.length,machines:maxMachines,
  missingDates,unreliableDates:unreliableList,months:files.map(f=>f.slice(0,7)),daily,machineSummary:machines,weekdayMachines,patterns,changes,
  generatedAt:new Date().toISOString()
}));
console.log(JSON.stringify({store:STORE.slug,period:{from,to},months:files.length,days:daily.length,rows:compact.length,machines:maxMachines,changes:changes.length,missingDates,unreliableDates:unreliableList}));
