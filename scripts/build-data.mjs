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

const dailyMap=new Map(),machineMap=new Map(),numberMap=new Map(),machineWeekdayMap=new Map();
for(const r of compact){
  const [date,no,name,diff,games]=r;
  if(!dailyMap.has(date))dailyMap.set(date,{date,total:0,games:0,wins:0,count:0});
  const d=dailyMap.get(date);d.total+=diff;d.games+=games;d.wins+=diff>0?1:0;d.count++;
  const nk=norm(name);
  if(!machineMap.has(nk))machineMap.set(nk,{name,days:new Set(),sum:0,games:0,wins:0,count:0});
  const m=machineMap.get(nk);m.days.add(date);m.sum+=diff;m.games+=games;m.wins+=diff>0?1:0;m.count++;
  const wd=new Date(`${date}T00:00:00Z`).getUTCDay(),wk=`${nk}|${wd}`;
  if(!machineWeekdayMap.has(wk))machineWeekdayMap.set(wk,{name,weekday:wd,days:new Set(),sum:0,games:0,wins:0,count:0});
  const mw=machineWeekdayMap.get(wk);mw.days.add(date);mw.sum+=diff;mw.games+=games;mw.wins+=diff>0?1:0;mw.count++;
  if(!numberMap.has(no))numberMap.set(no,[]);numberMap.get(no).push(r);
}
const daily=[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,avg:d.total/d.count,avgGames:d.games/d.count,winRate:d.wins/d.count}));
const machines=[...machineMap.values()].map(m=>({name:m.name,days:m.days.size,count:m.count,total:m.sum,avg:m.sum/m.count,avgGames:m.games/m.count,wins:m.wins,winRate:m.wins/m.count})).sort((a,b)=>b.count-a.count);
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
for(let wd=0;wd<7;wd++)weekdayMachines[wd]=[...machineWeekdayMap.values()].filter(m=>m.weekday===wd&&m.days.size>=4&&m.count>=8&&m.games/m.count>=1500).map(m=>{
  const avg=m.sum/m.count,winRate=m.wins/m.count,avgGames=m.games/m.count,reliability=Math.min(1,m.count/40);
  return{name:m.name,days:m.days.size,count:m.count,avg,avgGames,winRate,score:avg*(.45+.55*reliability)+(winRate-.5)*700+Math.min(avgGames,6000)/40};
}).sort((a,b)=>b.score-a.score).slice(0,5);

const from=daily[0].date,to=daily.at(-1).date,missingDates=[];
for(let date=from;date<=to;){if(!dailyMap.has(date))missingDates.push(date);const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10)}
const maxMachines=Math.max(...daily.map(d=>d.count));
await fs.writeFile(path.join(DATA_DIR,"summary.json"),JSON.stringify({
  slug:STORE.slug,store:STORE.name,shortName:STORE.shortName,period:{from,to},days:daily.length,rows:compact.length,machines:maxMachines,
  missingDates,months:files.map(f=>f.slice(0,7)),daily,machineSummary:machines,weekdayMachines,patterns,changes,
  generatedAt:new Date().toISOString()
}));
console.log(JSON.stringify({store:STORE.slug,period:{from,to},months:files.length,days:daily.length,rows:compact.length,machines:maxMachines,changes:changes.length,missingDates}));
