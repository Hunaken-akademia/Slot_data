const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const nf=new Intl.NumberFormat("ja-JP"), pct=v=>`${(v*100).toFixed(1)}%`, signed=v=>`${v>0?"+":""}${nf.format(Math.round(v))}`;
const weekdays=["日","月","火","水","木","金","土"], norm=s=>String(s).normalize("NFKC").replace(/[\s　]+/g,"");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let summary, allRows=[], selectedMachine="";

async function init(){
  summary=await fetch("./data/summary.json").then(r=>r.json());
  $("#period").textContent=`${summary.period.from} — ${summary.period.to}｜8/23 欠損`;
  $("#kpis").innerHTML=[
    ["取得日数",`${summary.days}日`,"全日301台"],["台別データ",nf.format(summary.rows),"日付×台番号"],
    ["機種変更",`${summary.changes.length}件`,"日付ごとに照合"],["欠損",`${summary.missingDates.length}日`,"8月23日"]
  ].map(x=>`<article class="kpi"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
  renderRecommendations();renderPatterns();renderChart();renderDaily();renderMachines();renderChanges();setupMachinePicker();setupTabs();setupSearch();
}

function renderRecommendations(){
  const wd=new Date().getDay(), rows=(summary.weekdayMachines?.[wd]||[]).slice(0,3);
  $("#todayTitle").textContent=`今日は${weekdays[wd]}曜日｜注目機種`;
  $("#recommendations").innerHTML=rows.length?rows.map((r,i)=>`<button class="recommend" data-machine="${encodeURIComponent(r.name)}"><span class="rank">${i+1}</span><small>${weekdays[wd]}曜実績 ${r.days}日・${r.count}台日</small><h3>${esc(r.name)}</h3><div><strong class="${r.avg>=0?"positive":"negative"}">${signed(r.avg)}</strong><span>平均差枚</span></div><p>勝率 ${pct(r.winRate)} / 平均 ${nf.format(Math.round(r.avgGames))}G</p></button>`).join(""):"<div class='empty'>十分なサンプルがありません。</div>";
  $$(".recommend").forEach(b=>b.onclick=()=>openMachine(decodeURIComponent(b.dataset.machine)));
}

function renderPatterns(){
  const order=["月曜日","火曜日","水曜日","木曜日","金曜日","土曜日","日曜日","7のつく日","22日"];
  const rows=[...summary.patterns].sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label));
  $("#patterns").innerHTML=rows.map(r=>`<article class="pattern"><h3>${r.label}</h3><strong class="${r.avg>=0?"positive":"negative"}">${signed(r.avg)}</strong><p>1日平均差枚・${r.days}日 / プラス率 ${pct(r.positiveRate)}</p></article>`).join("");
}

function renderChart(){
  const data=summary.daily,w=1000,h=230,p=12,max=Math.max(...data.map(d=>Math.abs(d.total)))*1.08;
  const x=i=>p+i*(w-p*2)/(data.length-1),y=v=>h/2-v*(h/2-p)/max;
  const line=data.map((d,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(" "),area=`${line} L${x(data.length-1)},${h/2} L${x(0)},${h/2} Z`;
  $("#dailyChart").innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#47e6c1" stop-opacity=".38"/><stop offset="1" stop-color="#47e6c1" stop-opacity="0"/></linearGradient></defs><line class="zero" x1="0" y1="${h/2}" x2="${w}" y2="${h/2}"/><path class="area" d="${area}"/><path class="line" d="${line}"/>${data.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.total)}" r="5" data-date="${d.date}" data-value="${d.total}"/>`).join("")}</svg>`;
  $("#dailyChart").addEventListener("pointerover",e=>{if(e.target.tagName!=="circle")return;const tip=document.createElement("div");tip.className="tooltip";tip.textContent=`${e.target.dataset.date}  ${signed(+e.target.dataset.value)}枚`;document.body.append(tip);tip.style.left=`${e.clientX+10}px`;tip.style.top=`${e.clientY-38}px`;e.target.onpointerout=()=>tip.remove()});
}

function renderDaily(q=""){$("#dailyRows").innerHTML=[...summary.daily].reverse().filter(d=>d.date.includes(q)).map(d=>`<tr><td>${d.date}</td><td class="${d.total>=0?"positive":"negative"}">${signed(d.total)}</td><td>${signed(d.avg)}</td><td>${nf.format(Math.round(d.avgGames))}</td><td>${pct(d.winRate)}</td></tr>`).join("")}
function renderMachines(q="",sort="count"){
  $("#machineRows").innerHTML=[...summary.machineSummary].filter(m=>m.name.toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b[sort]-a[sort]).map(m=>`<tr class="machine-row" data-machine="${encodeURIComponent(m.name)}"><td class="machine"><button>${esc(m.name)}</button></td><td>${nf.format(m.count)}</td><td class="${m.avg>=0?"positive":"negative"}">${signed(m.avg)}</td><td>${nf.format(Math.round(m.avgGames))}</td><td>${pct(m.winRate)}</td></tr>`).join("");
  $$(".machine-row").forEach(r=>r.onclick=()=>openMachine(decodeURIComponent(r.dataset.machine),false));
}
function renderChanges(q=""){$("#changeRows").innerHTML=summary.changes.filter(c=>`${c.no}${c.from}${c.to}`.toLowerCase().includes(q.toLowerCase())).map(c=>`<article class="change"><b>${c.no}番台</b><span>${c.date}</span><span>${esc(c.from)}</span><span class="arrow">→</span><span class="to">${esc(c.to)}</span></article>`).join("")}

function setupMachinePicker(){
  $("#machinePicker").innerHTML=`<option value="">機種名を選んでください</option>${[...summary.machineSummary].sort((a,b)=>a.name.localeCompare(b.name,"ja")).map(m=>`<option value="${encodeURIComponent(m.name)}">${esc(m.name)}</option>`).join("")}`;
  $("#machinePicker").onchange=e=>{if(e.target.value)openMachine(decodeURIComponent(e.target.value),false)};
}
function activateTab(id){$$('.tab,.panel').forEach(x=>x.classList.remove('active'));$(`.tab[data-tab="${id}"]`).classList.add('active');$(`#${id}`).classList.add('active')}
function setupTabs(){$$(".tab").forEach(b=>b.onclick=()=>activateTab(b.dataset.tab))}
function setupSearch(){
  $("#dailySearch").oninput=e=>renderDaily(e.target.value.trim());
  const rm=()=>renderMachines($("#machineSearch").value.trim(),$("#machineSort").value);$("#machineSearch").oninput=rm;$("#machineSort").onchange=rm;
  $("#changeSearch").oninput=e=>renderChanges(e.target.value.trim());
  $("#numberButton").onclick=loadNumber;$("#numberSearch").onkeydown=e=>{if(e.key==="Enter")loadNumber()};
}
async function ensureRows(){if(allRows.length)return;const chunks=await Promise.all(summary.months.map(m=>fetch(`./data/${m}.json`).then(r=>r.json())));allRows=chunks.flat()}

async function openMachine(name,switchTab=true){
  selectedMachine=name;if(switchTab)activateTab("machines");$("#machinePicker").value=encodeURIComponent(name);
  $("#machineExplorer").className="empty";$("#machineExplorer").textContent="台番号と傾向を集計中…";await ensureRows();if(selectedMachine!==name)return;
  const rows=allRows.filter(r=>norm(r[2])===norm(name));renderMachineExplorer(name,rows);$("#machineExplorer").scrollIntoView({behavior:"smooth",block:"start"});
}

function weekdayStats(rows){
  return weekdays.map((label,wd)=>{const a=rows.filter(r=>new Date(`${r[0]}T00:00:00Z`).getUTCDay()===wd);return{label,rows:a,count:a.length,days:new Set(a.map(r=>r[0])).size,avg:a.length?a.reduce((s,r)=>s+r[3],0)/a.length:0,win:a.length?a.filter(r=>r[3]>0).length/a.length:0,games:a.length?a.reduce((s,r)=>s+r[4],0)/a.length:0}})
}
function spacingStats(rows){
  const dates=new Map();for(const r of rows){if(!dates.has(r[0]))dates.set(r[0],[]);dates.get(r[0]).push(r)}
  const gaps=new Map();
  for(const [date,list] of dates){const strong=list.filter(r=>r[3]>=2000&&r[4]>=3000).sort((a,b)=>a[1]-b[1]);for(let i=1;i<strong.length;i++){const gap=strong[i][1]-strong[i-1][1];if(gap<1||gap>5)continue;if(!gaps.has(gap))gaps.set(gap,{gap,pairs:0,days:new Set(),examples:[]});const g=gaps.get(gap);g.pairs++;g.days.add(date);if(g.examples.length<3)g.examples.push(`${strong[i-1][1]}–${strong[i][1]}`)}}
  return [...gaps.values()].map(g=>({...g,dayCount:g.days.size})).sort((a,b)=>b.dayCount-a.dayCount||b.pairs-a.pairs);
}
const gapLabel=g=>g===1?"隣接":`${g-1}台おき`;

function renderMachineExplorer(name,rows){
  const byNo=new Map();for(const r of rows){if(!byNo.has(r[1]))byNo.set(r[1],[]);byNo.get(r[1]).push(r)}
  const nums=[...byNo].map(([no,a])=>({no,rows:a,avg:a.reduce((s,r)=>s+r[3],0)/a.length,win:a.filter(r=>r[3]>0).length/a.length,last:[...a].sort((x,y)=>y[0].localeCompare(x[0]))[0][0]})).sort((a,b)=>a.no-b.no);
  const ws=weekdayStats(rows), best=[...ws].filter(w=>w.days>=3).sort((a,b)=>b.avg-a.avg)[0], gaps=spacingStats(rows);
  const avg=rows.reduce((s,r)=>s+r[3],0)/rows.length,win=rows.filter(r=>r[3]>0).length/rows.length,active=nums.filter(n=>n.last===summary.period.to).length;
  $("#machineExplorer").className="machine-explorer";
  $("#machineExplorer").innerHTML=`
    <div class="explorer-head"><div><p class="eyebrow">SELECTED MACHINE</p><h3>${esc(name)}</h3><p>${nums.length}台番で記録 / 最終日稼働 ${active}台 / ${new Set(rows.map(r=>r[0])).size}日</p></div><div class="headline-stat"><span>3ヶ月平均</span><strong class="${avg>=0?"positive":"negative"}">${signed(avg)}</strong><small>勝率 ${pct(win)}</small></div></div>
    <div class="insight-grid">
      <article class="insight"><span>強い曜日候補</span><strong>${best?`${best.label}曜日`:"判定不可"}</strong><p>${best?`平均 ${signed(best.avg)}枚・勝率 ${pct(best.win)}・${best.days}日 / ${best.count}台日`:"サンプル不足"}</p></article>
      <article class="insight"><span>配置パターン候補</span><strong>${gaps[0]?gapLabel(gaps[0].gap):"明確な傾向なし"}</strong><p>${gaps[0]?`${gaps[0].dayCount}日・${gaps[0].pairs}組（例 ${gaps[0].examples.join("、")}）`:"条件を満たす組み合わせなし"}</p></article>
    </div>
    <div class="subsection"><h4>曜日別の強さ</h4><div class="weekday-grid">${ws.map(w=>`<article><span>${w.label}</span><strong class="${w.avg>=0?"positive":"negative"}">${signed(w.avg)}</strong><small>${w.days}日 / ${w.count}台日<br>勝率 ${pct(w.win)}</small></article>`).join("")}</div></div>
    <div class="subsection"><h4>高差枚台の番号間隔</h4><p class="definition">+2,000枚以上・3,000G以上の台を高差枚台として集計</p><div class="spacing-list">${gaps.length?gaps.slice(0,4).map(g=>`<span><b>${gapLabel(g.gap)}</b>${g.dayCount}日 / ${g.pairs}組</span>`).join(""):"<span>該当なし</span>"}</div></div>
    <div class="subsection"><h4>台番号をタップ</h4><div class="number-grid">${nums.map(n=>`<button class="number-chip ${n.last===summary.period.to?"current":"past"}" data-no="${n.no}"><b>${n.no}</b><span class="${n.avg>=0?"positive":"negative"}">${signed(n.avg)}</span><small>${n.last===summary.period.to?"最終日設置":"入替前"}</small></button>`).join("")}</div></div>
    <div id="machineNumberDetail" class="empty">台番号を選ぶと、この機種だった期間だけを分析します。</div>`;
  $$("#machineExplorer .number-chip").forEach(b=>b.onclick=()=>renderMachineNumber(name,+b.dataset.no,byNo.get(+b.dataset.no),rows));
}

function renderMachineNumber(name,no,rows,machineRows){
  $$("#machineExplorer .number-chip").forEach(b=>b.classList.toggle("selected",+b.dataset.no===no));
  const sorted=[...rows].sort((a,b)=>b[0].localeCompare(a[0])), avg=rows.reduce((s,r)=>s+r[3],0)/rows.length,win=rows.filter(r=>r[3]>0).length/rows.length,games=rows.reduce((s,r)=>s+r[4],0)/rows.length;
  const recent=sorted.slice(0,10),recentAvg=recent.reduce((s,r)=>s+r[3],0)/recent.length,ws=weekdayStats(rows),best=[...ws].filter(w=>w.count>=3).sort((a,b)=>b.avg-a.avg)[0];
  let spacedDays=0;for(const date of new Set(rows.map(r=>r[0]))){const strong=machineRows.filter(r=>r[0]===date&&r[3]>=2000&&r[4]>=3000).map(r=>r[1]);if(strong.includes(no)&&strong.some(n=>n!==no&&Math.abs(n-no)<=5))spacedDays++}
  const el=$("#machineNumberDetail");el.className="number-card";el.innerHTML=`<div class="number-title"><div><p class="eyebrow">NUMBER DETAIL</p><h3>${no}番台</h3><p>${esc(name)}として ${sorted.at(-1)[0]}〜${sorted[0][0]}</p></div></div><div class="number-stats"><span>平均差枚<strong class="${avg>=0?"positive":"negative"}">${signed(avg)}</strong></span><span>勝率<strong>${pct(win)}</strong></span><span>平均G<strong>${nf.format(Math.round(games))}</strong></span><span>直近10件<strong class="${recentAvg>=0?"positive":"negative"}">${signed(recentAvg)}</strong></span></div><div class="detail-callout"><b>${best?`${best.label}曜日が最良`:"曜日判定不可"}</b><span>${best?`平均 ${signed(best.avg)}枚・${best.count}台日`:"サンプル不足"} / 高差枚の近接配置に ${spacedDays}日参加</span></div><div class="table-wrap"><table><thead><tr><th>日付</th><th>曜日</th><th>差枚</th><th>G数</th></tr></thead><tbody>${sorted.map(r=>`<tr><td>${r[0]}</td><td>${weekdays[new Date(`${r[0]}T00:00:00Z`).getUTCDay()]}</td><td class="${r[3]>=0?"positive":"negative"}">${signed(r[3])}</td><td>${nf.format(r[4])}</td></tr>`).join("")}</tbody></table></div>`;el.scrollIntoView({behavior:"smooth",block:"nearest"});
}

async function loadNumber(){
  const no=Number($("#numberSearch").value);if(!no)return;$("#numberResult").className="empty";$("#numberResult").textContent="読み込み中…";await ensureRows();
  const rows=allRows.filter(r=>r[1]===no).sort((a,b)=>b[0].localeCompare(a[0]));if(!rows.length){$("#numberResult").textContent="該当する台番号がありません。";return}
  const avg=rows.reduce((s,r)=>s+r[3],0)/rows.length,win=rows.filter(r=>r[3]>0).length/rows.length;
  $("#numberResult").className="number-card";$("#numberResult").innerHTML=`<h3>${no}番台</h3><div class="number-stats"><span>平均差枚<strong class="${avg>=0?"positive":"negative"}">${signed(avg)}</strong></span><span>勝率<strong>${pct(win)}</strong></span><span>記録<strong>${rows.length}日</strong></span></div><div class="table-wrap"><table><thead><tr><th>日付</th><th>機種</th><th>差枚</th><th>G数</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td class="machine">${esc(r[2])}</td><td class="${r[3]>=0?"positive":"negative"}">${signed(r[3])}</td><td>${nf.format(r[4])}</td></tr>`).join("")}</tbody></table></div>`;
}
init().catch(e=>{$("main").innerHTML=`<div class="empty">データを読み込めませんでした。再読み込みしてください。</div>`;console.error(e)});
