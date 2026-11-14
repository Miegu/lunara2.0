'use strict';
// Rendering of metrics, chart and timeline.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// UI rendering
// -----------------------------------------------------------------------------
function setFlag(id,kind,label){$(id).className=`flag ${kind}`;$(id).textContent=label;}
function renderMetrics(row,summary){
  const sun=row.sun,earth=row.earth;
  $('kpiSun').textContent=`${number(sun.elevation,1)}°`;
  $('kpiSunSub').textContent=`Az ${number(sun.azimuth,0)}° · ${sun.centerVisible?'center visible':'center below horizon'}`;
  $('kpiEarth').textContent=`${number(earth.elevation,1)}°`;
  $('kpiEarthSub').textContent=`Disk ${earth.limbVisible?'partially / fully visible':'geometrically occulted'}`;
  $('kpiPower').textContent=`${number(row.output,0)} W/m²`;
  $('kpiPowerSub').textContent=`Incident irradiance ${number(row.irradiance,0)} W/m²`;
  $('kpiDelay').textContent=`${number(row.roundTrip,2)} s`;
  $('sunElevation').textContent=`${number(sun.elevation,2)}°`;$('sunAzimuth').textContent=`${number(sun.azimuth,1)}°`;
  $('earthElevation').textContent=`${number(earth.elevation,2)}°`;$('earthAzimuth').textContent=`${number(earth.azimuth,1)}°`;
  $('sunHours').textContent=fmtHours(summary.sunCenter*60);$('sunLimbHours').textContent=fmtHours(summary.sunLimb*60);
  $('earthHours').textContent=fmtHours(summary.earthCenter*60);$('earthLimbHours').textContent=fmtHours(summary.earthLimb*60);
  $('sunMax').textContent=`${number(summary.maxSun.sun.elevation,1)}° · ${localTime(summary.maxSun.sec)}`;
  $('earthMax').textContent=`${number(summary.maxEarth.earth.elevation,1)}° · ${localTime(summary.maxEarth.sec)}`;
  $('powerMax').textContent=`${number(summary.maxPower.output,0)} W/m²`;
  $('earthDistance').textContent=`${number(row.earth.distance,0)} km`;
  const ns=nextCrossing(summary.sunLimbIntervals,row.sec),ne=nextCrossing(summary.earthLimbIntervals,row.sec);
  $('sunNext').textContent=ns?`${ns.label} ${localTime(ns.sec)}`:'No upcoming crossing';$('earthNext').textContent=ne?`${ne.label} ${localTime(ne.sec)}`:'No upcoming crossing';
  setFlag('sunFlag',sun.centerVisible?'good':sun.limbVisible?'partial':'bad',sun.centerVisible?'Center visible':sun.limbVisible?'Limb only':'Below horizon');
  setFlag('earthFlag',earth.limbVisible?'good':'bad',earth.fullDiskVisible?'Full disk':earth.limbVisible?'Partial disk':'Disk occulted');
}
function drawChart(data,idx){
  const canvas=$('elevationChart'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad={l:50,r:18,t:15,b:33};ctx.clearRect(0,0,w,h);
  const x=i=>pad.l+i/(data.length-1)*(w-pad.l-pad.r),y=v=>pad.t+(90-clamp(v,-90,90))/180*(h-pad.t-pad.b);
  ctx.fillStyle='#100b1d';ctx.fillRect(0,0,w,h);
  ctx.font='12px "IBM Plex Mono", monospace';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let v=-90;v<=90;v+=30){ctx.strokeStyle=v===0?'#c7b3e6':'#403052';ctx.lineWidth=v===0?1.7:1;ctx.beginPath();ctx.moveTo(pad.l,y(v));ctx.lineTo(w-pad.r,y(v));ctx.stroke();ctx.fillStyle='#a895bd';ctx.fillText(`${v}°`,pad.l-9,y(v));}
  ctx.textAlign='center';ctx.textBaseline='top';for(let k=0;k<=6;k++){const i=Math.round(k*(data.length-1)/6);ctx.strokeStyle='#2c203e';ctx.beginPath();ctx.moveTo(x(i),pad.t);ctx.lineTo(x(i),h-pad.b);ctx.stroke();ctx.fillStyle='#a895bd';ctx.fillText(localTime(data[i].sec),x(i),h-pad.b+8);}
  if(horizonProfile){ctx.strokeStyle='#8d9fb9';ctx.setLineDash([4,4]);ctx.beginPath();data.forEach((r,i)=>{const val=r.sun.horizon;i?ctx.lineTo(x(i),y(val)):ctx.moveTo(x(i),y(val));});ctx.stroke();ctx.setLineDash([]);}
  const line=(getter,color)=>{ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.beginPath();data.forEach((r,i)=>{const yy=y(getter(r));i?ctx.lineTo(x(i),yy):ctx.moveTo(x(i),yy);});ctx.stroke();};
  line(r=>r.sun.elevation,'#ffc66d');line(r=>r.earth.elevation,'#55b9ff');
  const ix=x(idx);ctx.strokeStyle='#e5eef7';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(ix,pad.t);ctx.lineTo(ix,h-pad.b);ctx.stroke();ctx.setLineDash([]);
  for(const [get,color] of [[r=>r.sun.elevation,'#ffc66d'],[r=>r.earth.elevation,'#55b9ff']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(ix,y(get(data[idx])),4.5,0,Math.PI*2);ctx.fill();}
}
function makeTrack(label,intervals,color,start,end){
  const width=end-start,segments=intervals.map(it=>{const left=clamp((it.start-start)/width*100,0,100),right=clamp((it.end-start)/width*100,0,100);return `<i class="segment" style="left:${left}%;width:${Math.max(0,right-left)}%;background:${color}"></i>`;}).join('');
  return `<div class="track"><span class="track-name">${label}</span><div class="track-bar">${segments}</div></div>`;
}
function renderTimeline(summary,data){
  const start=data[0].sec,end=data.at(-1).sec;
  // Sun bar uses the solar centre (same criterion as the "Sun visible" card); Earth uses the visible disk.
  $('timeline').innerHTML=makeTrack('☀ Sun',summary.sunCenterIntervals,'linear-gradient(90deg,#f2a93f,#ffe18b)',start,end)+makeTrack('◉ Earth',summary.earthLimbIntervals,'linear-gradient(90deg,#2f8ee2,#8ad9ff)',start,end);
  $('timeSlider').max=String(data.length-1);$('timeSlider').value=String(currentIndex);
}

// "Over the whole window" cards in the right column (built in js/workspace-controller.js).
function fmtSpan(sec){
  const m=Math.max(0,Math.round(sec/60));
  if(m<60)return `${m} min`;
  const h=Math.floor(m/60);
  if(h<48)return m%60&&h<10?`${h} h ${m%60} min`:`${h} h`;
  return `${Math.floor(h/24)} d ${h%24} h`;
}
function visibilityNow(ints,nowSec,endSec,isVisible){
  const current=ints.find(it=>it.start<=nowSec+1&&it.end>nowSec+1);
  if(isVisible||current){
    const end=current?current.end:nowSec;
    return end>=endSec-1?'Visible now · until the end of the window':`Visible now · sets in ${fmtSpan(end-nowSec)}`;
  }
  const next=ints.find(it=>it.start>nowSec+1);
  return next?`Hidden now · rises in ${fmtSpan(next.start-nowSec)}`:'Hidden now · does not rise in this window';
}
function renderWindowSummary(row,summary){
  if(!$('winSun'))return;
  const totalH=Math.max(summary.durationMin/60,1e-9),endSec=rows.at(-1).sec;
  const pct=h=>clamp(h/totalH*100,0,100);
  const sunPct=pct(summary.sunCenter),earthPct=pct(summary.earthLimb);
  $('winRange').textContent=`${isoAt(rows[0].dateMs).slice(0,16)} UTC · ${currentScenario.hours} h`;
  $('winSun').textContent=fmtHours(summary.sunCenter*60);
  $('winSunPct').textContent=`${Math.round(sunPct)}% of the window`;
  $('winSunBar').style.width=`${sunPct}%`;
  $('winSunNext').textContent=visibilityNow(summary.sunCenterIntervals,row.sec,endSec,row.sun.centerVisible);
  $('winEarth').textContent=fmtHours(summary.earthLimb*60);
  $('winEarthPct').textContent=`${Math.round(earthPct)}% of the window`;
  $('winEarthBar').style.width=`${earthPct}%`;
  $('winEarthNext').textContent=visibilityNow(summary.earthLimbIntervals,row.sec,endSec,row.earth.limbVisible);
  const site=currentScenario.site,maxPossible=SOLAR_CONSTANT*site.efficiency/100;
  $('winPower').textContent=`${number(summary.maxPower.output,0)} W/m²`;
  $('winPowerSub').textContent=`panel tilt ${number(site.tilt,0)}° · ${number(site.efficiency,0)}% efficiency`;
  $('winPowerBar').style.width=`${clamp(summary.maxPower.output/maxPossible*100,0,100)}%`;
  $('winPowerNext').textContent=`Now ${number(row.output,0)} W/m²`;
}

function renderAll(){
  const row=rows[currentIndex],summary=currentScenario.summary;
  renderMetrics(row,summary);drawChart(rows,currentIndex);renderTimeline(summary,rows);renderWindowSummary(row,summary);
  $('timeReadout').textContent=isoAt(row.dateMs);$('chartSubtitle').textContent=`${currentScenario.site.name} · ${currentScenario.hours} h · UTC`;
  $('skyStatus').textContent=`Sun ${number(row.sun.elevation,1)}° / Earth ${number(row.earth.elevation,1)}°`;
  updateSky3D(row);updateMoon3D(currentScenario.site);
}
