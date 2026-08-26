import fs from "node:fs/promises";
import path from "node:path";
const dir=path.resolve("public/data");
const files=(await fs.readdir(dir)).filter(name=>/^\d{4}-\d{2}\.json$/.test(name));
const seen=new Set(),byDate=new Map();
for(const file of files){
  const rows=JSON.parse(await fs.readFile(path.join(dir,file),"utf8"));
  for(const row of rows){
    if(!Array.isArray(row)||row.length<6||!/^\d{4}-\d{2}-\d{2}$/.test(row[0])||!Number.isInteger(row[1])||!row[2])throw new Error(`Invalid row in ${file}: ${JSON.stringify(row)}`);
    const key=`${row[0]}|${row[1]}`;if(seen.has(key))throw new Error(`Duplicate date/machine: ${key}`);seen.add(key);
    byDate.set(row[0],(byDate.get(row[0])||0)+1);
  }
}
const abnormal=[...byDate].filter(([,count])=>count<250||count>350);
if(abnormal.length)throw new Error(`Abnormal daily counts: ${JSON.stringify(abnormal)}`);
console.log(JSON.stringify({files:files.length,days:byDate.size,rows:seen.size,min:Math.min(...byDate.values()),max:Math.max(...byDate.values())}));
