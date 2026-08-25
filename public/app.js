const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const nf=new Intl.NumberFormat("ja-JP"), pct=v=>`${(v*100).toFixed(1)}%`, signed=v=>`${v>0?"+":""}${nf.format(Math.round(v))}`;
let summary, allRows=[];

async function init(){
  summary=await fetch("./data/summary.json").then(r=>r.json());
  $("#period").textContent=`${summary.period.from} — ${summary.period.to}｜8/23 欠損`;
  $("#kpis").innerHTML=[
    ["取得日数",`${summary.days}日`,`全日301台`],["台別データ",nf.format(summary.rows),"日付×台番号"],
    ["機種変更",`${summary.changes.length}件`,`表記揺れ除外`],["欠損",`${summary.missingDates.length}日`,`8月23日`]
  ].map(x=>`<article class="kpi"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
  renderPatterns();renderChart();renderDaily();renderMachines();renderChanges();
  setupTabs();setupSearch();
}

function renderPatterns(){
  const order=["月曜日","火曜日","水曜日","木曜日","金曜日","土曜日","日曜日","7のつく日","22日"];
  const rows=summary.patterns.sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label));
  $("#patterns").innerHTML=rows.map(r=>`<article class="pattern"><h3>${r.label}</h3><strong class="${r.avg>=0?"positive":"negative"}">${signed(r.avg)}</strong><p>1日平均差枚・${r.days}日 / プラス率 ${pct(r.positiveRate)}</p></article>`).join("");
}

function renderChart(){
  const data=summary.daily,w=1000,h=230,p=12,max=Math.max(...data.map(d=>Math.abs(d.total)))*1.08;
  const x=i=>p+i*(w-p*2)/(data.length-1),y=v=>h/2-v*(h/2-p)/max;
  const line=data.map((d,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" ");
  const area=`${line} L${x(data.length-1)},${h/2} L${x(0)},${h/2} Z`;
  $("#dailyChart").innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#47e6c1" stop-opacity=".38"/><stop offset="1" stop-color="#47e6c1" stop-opacity="0"/></linearGradient></defs><line class="zero" x1="0" y1="${h/2}" x2="${w}" y2="${h/2}"/><path class="area" d="${area}"/><path class="line" d="${line}"/>${data.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.total)}" r="5" data-date="${d.date}" data-value="${d.total}"/>`).join("")}</svg>`;
  $("#dailyChart").addEventListener("pointerover",e=>{if(e.target.tagName!=="circle")return;const tip=document.createElement("div");tip.className="tooltip";tip.textContent=`${e.target.dataset.date}  ${signed(+e.target.dataset.value)}枚`;document.body.append(tip);tip.style.left=`${e.clientX+10}px`;tip.style.top=`${e.clientY-38}px`;e.target.onpointerout=()=>tip.remove()});
}

function renderDaily(q=""){$("#dailyRows").innerHTML=[...summary.daily].reverse().filter(d=>d.date.includes(q)).map(d=>`<tr><td>${d.date}</td><td class="${d.total>=0?"positive":"negative"}">${signed(d.total)}</td><td>${signed(d.avg)}</td><td>${nf.format(Math.round(d.avgGames))}</td><td>${pct(d.winRate)}</td></tr>`).join("")}
function renderMachines(q="",sort="count"){$("#machineRows").innerHTML=[...summary.machineSummary].filter(m=>m.name.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b[sort]-a[sort]).map(m=>`<tr><td class="machine">${m.name}</td><td>${nf.format(m.count)}</td><td class="${m.avg>=0?"positive":"negative"}">${signed(m.avg)}</td><td>${nf.format(Math.round(m.avgGames))}</td><td>${pct(m.winRate)}</td></tr>`).join("")}
function renderChanges(q=""){$("#changeRows").innerHTML=summary.changes.filter(c=>`${c.no}${c.from}${c.to}`.toLowerCase().includes(q.toLowerCase())).map(c=>`<article class="change"><b>${c.no}番台</b><span>${c.date}</span><span>${c.from}</span><span class="arrow">→</span><span class="to">${c.to}</span></article>`).join("")}

function setupTabs(){$$(".tab").forEach(b=>b.onclick=()=>{$$(".tab,.panel").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(`#${b.dataset.tab}`).classList.add("active")})}
function setupSearch(){
  $("#dailySearch").oninput=e=>renderDaily(e.target.value.trim());
  const rm=()=>renderMachines($("#machineSearch").value.trim(),$("#machineSort").value);$("#machineSearch").oninput=rm;$("#machineSort").onchange=rm;
  $("#changeSearch").oninput=e=>renderChanges(e.target.value.trim());
  $("#numberButton").onclick=loadNumber;$("#numberSearch").onkeydown=e=>{if(e.key==="Enter")loadNumber()};
}
async function ensureRows(){if(allRows.length)return;const chunks=await Promise.all(summary.months.map(m=>fetch(`./data/${m}.json`).then(r=>r.json())));allRows=chunks.flat()}
async function loadNumber(){
  const no=Number($("#numberSearch").value);if(!no)return;$("#numberResult").className="empty";$("#numberResult").textContent="読み込み中…";await ensureRows();
  const rows=allRows.filter(r=>r[1]===no).sort((a,b)=>b[0].localeCompare(a[0]));if(!rows.length){$("#numberResult").textContent="該当する台番号がありません。";return}
  const avg=rows.reduce((s,r)=>s+r[3],0)/rows.length,win=rows.filter(r=>r[3]>0).length/rows.length;
  $("#numberResult").className="number-card";$("#numberResult").innerHTML=`<h3>${no}番台</h3><div class="number-stats"><span>平均差枚<strong class="${avg>=0?"positive":"negative"}">${signed(avg)}</strong></span><span>勝率<strong>${pct(win)}</strong></span><span>記録<strong>${rows.length}日</strong></span></div><div class="table-wrap"><table><thead><tr><th>日付</th><th>機種</th><th>差枚</th><th>G数</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td class="machine">${r[2]}</td><td class="${r[3]>=0?"positive":"negative"}">${signed(r[3])}</td><td>${nf.format(r[4])}</td></tr>`).join("")}</tbody></table></div>`;
}
init().catch(e=>{$("main").innerHTML=`<div class="empty">データを読み込めませんでした。再読み込みしてください。</div>`;console.error(e)});
