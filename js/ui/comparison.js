'use strict';
// Mission comparison studio and candidate explorer.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Mission comparison studio: independent snapshots, 4 slots, 3D previews and telemetry.
// -----------------------------------------------------------------------------
let comparisonCounter = 0;
const comparisonIndices = new Map();
const comparisonScenes = new Map();

function scenarioRecord(site,data,summary,startMs,hours){
  const terrainApplied = !!(horizonProfile && horizonProfileSite &&
    Math.abs(site.lat-horizonProfileSite.lat)<1e-5 && Math.abs(site.lon-horizonProfileSite.lon)<1e-5);
  const stepSeconds = data.length>1 ? (data[1].sec-data[0].sec) : 0;
  return {id:++comparisonCounter,site:{...site},data:data.map(r=>({...r,sun:{...r.sun},earth:{...r.earth}})),summary,startMs,hours,mode:dataMode,meta:ephemeris?.meta ? {...ephemeris.meta} : null,terrainApplied,stepSeconds};
}
function comparisonKey(record){
  const s=record.site;
  return [s.name,s.lat,s.lon,s.alt,s.tilt,s.panelAz,s.efficiency,record.startMs,record.hours,record.mode].join('|');
}
function addCurrentComparison(){
  if(!currentScenario || !rows.length){showNotice('Run an analysis before adding this mission to the comparison.','warn');return;}
  if(comparison.length>=4){showNotice('The comparison board is full (4 of 4). Remove a mission before adding another.','warn');return;}
  const record=scenarioRecord(currentScenario.site,rows,currentScenario.summary,currentScenario.startMs,currentScenario.hours);
  record.key=comparisonKey(record);
  if(comparison.some(c=>c.key===record.key)){showNotice('This exact mission configuration is already in the comparison. Change its site, date or array settings to add a different run.','warn');return;}
  comparison.push(record);
  comparisonIndices.set(record.id,Math.floor((record.data.length-1)/2));
  renderComparison();
  showNotice(`Mission ${comparison.length}/4 saved to the comparison studio. Its telemetry is stored independently of the active mission.`,'good');
}

function comparisonViewVisible(){
  const overlay=document.getElementById('novaViewOverlay');
  const view=document.querySelector('.nova-view[data-view="comparison"]');
  return !!(overlay?.classList.contains('is-open') && view?.classList.contains('is-active'));
}
function disposeComparisonScenes(){
  for(const entry of comparisonScenes.values()){
    try{if(entry.dispose)entry.dispose();else{entry.ro?.disconnect();entry.renderer?.setAnimationLoop(null);entry.renderer?.dispose();entry.renderer?.domElement?.remove();}}catch(e){console.warn('Could not dispose comparison preview:',e);}
  }
  comparisonScenes.clear();
}
function compareScenePosition(target,azimuth,elevation,radius){
  const az=azimuth*Math.PI/180,el=elevation*Math.PI/180;
  target.position.set(Math.sin(az)*Math.cos(el)*radius,Math.sin(el)*radius+0.5,-Math.cos(az)*Math.cos(el)*radius);
}
function createComparison3D(host,record,row){
  if(!THREE || !host)return null;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x071321);
  const camera=new THREE.PerspectiveCamera(48,1,.1,180);camera.position.set(0,11,35);camera.lookAt(0,7,0);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label',`3D local sky preview for ${record.site.name}`);
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff,.8));
  const ground=new THREE.Mesh(new THREE.CircleGeometry(30,96),new THREE.MeshStandardMaterial({color:0x252f3c,roughness:1,metalness:.04}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.55;scene.add(ground);
  const horizon=new THREE.Mesh(new THREE.TorusGeometry(29.5,.105,5,120),new THREE.MeshBasicMaterial({color:0x4aabbd,transparent:true,opacity:.65}));
  horizon.rotation.x=Math.PI/2;horizon.position.y=-.45;scene.add(horizon);
  // Atmospheric star field and a subtle local meridian grid.
  const starGeometry=new THREE.BufferGeometry(),starPositions=[];
  for(let i=0;i<420;i++){
    const a=Math.random()*Math.PI*2, y=3+Math.random()*45, r=42+Math.random()*34;
    starPositions.push(Math.cos(a)*r,y,Math.sin(a)*r);
  }
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xd9eaff,size:.65,transparent:true,opacity:.78})));
  const guideMat=new THREE.LineBasicMaterial({color:0x47748b,transparent:true,opacity:.20});
  for(let x=-20;x<=20;x+=10){const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,-.38,-24),new THREE.Vector3(x,-.38,24)]);scene.add(new THREE.Line(g,guideMat));}
  const sun=new THREE.Mesh(new THREE.SphereGeometry(1.28,24,18),new THREE.MeshBasicMaterial({color:0xffc66d}));
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1.48,28,20),new THREE.MeshStandardMaterial({color:0x3c9cdb,emissive:0x102f5b,roughness:.75}));
  scene.add(sun,earth);
  const sunHalo=new THREE.Mesh(new THREE.SphereGeometry(1.8,20,16),new THREE.MeshBasicMaterial({color:0xffbd62,transparent:true,opacity:.13,side:THREE.BackSide}));scene.add(sunHalo);
  const earthHalo=new THREE.Mesh(new THREE.SphereGeometry(1.98,20,16),new THREE.MeshBasicMaterial({color:0x4baeff,transparent:true,opacity:.12,side:THREE.BackSide}));scene.add(earthHalo);
  const sunLabel=makeLabelSprite('SUN','#ffd27a');sunLabel.scale.set(5.5,1.55,1);scene.add(sunLabel);
  const earthLabel=makeLabelSprite('EARTH','#81d4ff');earthLabel.scale.set(6.5,1.55,1);scene.add(earthLabel);
  const siteMarker=new THREE.Mesh(new THREE.SphereGeometry(.23,12,10),new THREE.MeshBasicMaterial({color:0x78e8bd}));siteMarker.position.set(0,-.32,0);scene.add(siteMarker);
  function update(nextRow){
    if(!nextRow)return;
    compareScenePosition(sun,nextRow.sun.azimuth,nextRow.sun.elevation,19);
    compareScenePosition(earth,nextRow.earth.azimuth,nextRow.earth.elevation,21);
    sunHalo.position.copy(sun.position);earthHalo.position.copy(earth.position);
    sunLabel.position.copy(sun.position).add(new THREE.Vector3(0,2.3,0));
    earthLabel.position.copy(earth.position).add(new THREE.Vector3(0,2.5,0));
    sun.visible=!!nextRow.sun.limbVisible;sunHalo.visible=sun.visible;sunLabel.visible=sun.visible;
    earth.visible=!!nextRow.earth.limbVisible;earthHalo.visible=earth.visible;earthLabel.visible=earth.visible;
  }
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
  const ro=new ResizeObserver(resize);ro.observe(host);resize();update(row);
  let spin=0;renderer.setAnimationLoop(()=>{spin+=.001;sun.rotation.y+=.0012;earth.rotation.y+=.0011;renderer.render(scene,camera);});
  const dispose=()=>{ro.disconnect();renderer.setAnimationLoop(null);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});}});renderer.dispose();renderer.domElement.remove();};
  return {renderer,update,dispose};
}
function ensureComparisonScenes(){
  if(!comparisonViewVisible() || !comparison.length)return;
  for(const record of comparison){
    const host=document.querySelector(`[data-compare-preview="${record.id}"]`);
    if(!host)continue;
    const existing=comparisonScenes.get(record.id);
    if(existing && existing.host===host)continue;
    existing?.dispose?.();
    const idx=comparisonIndices.get(record.id)??Math.floor((record.data.length-1)/2);
    const row=record.data[Math.max(0,Math.min(record.data.length-1,idx))];
    const scene=createComparison3D(host,record,row);
    if(scene)comparisonScenes.set(record.id,{...scene,host});
  }
}
function selectedComparisonRow(record){
  const idx=comparisonIndices.get(record.id)??Math.floor((record.data.length-1)/2);
  return {idx,row:record.data[Math.max(0,Math.min(record.data.length-1,idx))]};
}
function updateComparisonCard(record,index){
  const idx=clamp(Number(index)||0,0,record.data.length-1);comparisonIndices.set(record.id,idx);
  const row=record.data[idx],scene=comparisonScenes.get(record.id);
  scene?.update?.(row);
  const root=document.querySelector(`[data-compare-card="${record.id}"]`);if(!root)return;
  const time=root.querySelector('[data-compare-time]');if(time)time.textContent=isoAt(row.dateMs).replace(' UTC','');
  const readout=root.querySelector('[data-compare-readout]');if(readout)readout.innerHTML=`<span><b>SUN</b> ${number(row.sun.elevation,1)}° / ${number(row.sun.azimuth,0)}°</span><span><b>EARTH</b> ${number(row.earth.elevation,1)}° / ${number(row.earth.azimuth,0)}°</span>`;
}
function renderComparison(){
  const count=document.getElementById('compareCount');
  if(count)count.textContent=`${String(comparison.length).padStart(2,'0')} / 04 MISSIONS STORED`;
  disposeComparisonScenes();
  const list=$('compareList'),body=$('compareTable');
  if(!comparison.length){
    list.innerHTML='<div class="compare-empty compare-empty--studio"><strong>Your comparison board is empty.</strong><span>Analyse a mission, then choose “Add to comparison”. You can keep up to four independent mission runs here.</span></div>';
    body.innerHTML='<tr><td colspan="9" class="compare-matrix-empty">No missions saved yet.</td></tr>';
    $('compare').classList.remove('is-detail-open');$('compareMissionDetail').hidden=true;$('compareMissionDetail').innerHTML='';
    return;
  }
  list.innerHTML=comparison.map((c,i)=>{
    const idx=comparisonIndices.get(c.id)??Math.floor((c.data.length-1)/2),row=c.data[idx];
    const mode=c.mode==='spice'?'SPICE / REAL':'DEMO / SYNTHETIC';
    const kernel=c.meta?.ephemeris_kernel||'synthetic vectors';
    return `<article class="mission-compare-card" data-compare-card="${c.id}">
      <div class="mission-compare-card__head"><span class="mission-compare-card__index">M${String(i+1).padStart(2,'0')}</span><div class="mission-compare-card__identity"><strong title="${escapeHtml(c.site.name)}">${escapeHtml(c.site.name)}</strong><small>${escapeHtml(mode)} · ${escapeHtml(kernel)}</small></div><button class="mission-compare-card__remove" type="button" data-remove="${c.id}" aria-label="Remove ${escapeHtml(c.site.name)}">×</button></div>
      <div class="compare-preview"><div class="compare-preview__tag">LOCAL SKY / 3D · SCHEMATIC HORIZON</div><div class="compare-preview__quality">${c.mode==='spice'?'SPICE':'DEMO'} · ${c.data.length} SAMPLES</div><div data-compare-preview="${c.id}" style="position:absolute;inset:0"></div><div class="compare-preview__readout" data-compare-readout><span><b>SUN</b> ${number(row.sun.elevation,1)}° / ${number(row.sun.azimuth,0)}°</span><span><b>EARTH</b> ${number(row.earth.elevation,1)}° / ${number(row.earth.azimuth,0)}°</span></div></div>
      <div class="compare-card-scrubber"><input type="range" min="0" max="${c.data.length-1}" value="${idx}" data-compare-slider="${c.id}" aria-label="Select mission time for ${escapeHtml(c.site.name)}"><span data-compare-time>${isoAt(row.dateMs).replace(' UTC','')}</span></div>
      <div class="compare-card-kpis"><div class="compare-card-kpi"><span>Sun disk visible</span><strong>${fmtHours(c.summary.sunLimb*60)}</strong></div><div class="compare-card-kpi"><span>Earth disk visible</span><strong>${fmtHours(c.summary.earthLimb*60)}</strong></div><div class="compare-card-kpi"><span>Peak array · est.</span><strong>${number(c.summary.maxPower.output,0)} W/m²</strong></div></div>
      <div class="mission-compare-card__meta"><span>${number(c.site.lat,3)}° / ${number(c.site.lon,3)}°</span><span>${new Date(c.startMs).toISOString().slice(0,16).replace('T',' ')} UTC</span><span>${c.hours} H WINDOW</span><span>${c.terrainApplied?'HORIZON MASK':'FLAT HORIZON'}</span></div>
      <div class="mission-compare-card__actions"><button class="btn primary small" type="button" data-details="${c.id}">View telemetry & details ↗</button></div>
    </article>`;
  }).join('');
  body.innerHTML=comparison.map(c=>`<tr><td>${escapeHtml(c.site.name)}</td><td>${number(c.site.lat,2)}° / ${number(c.site.lon,2)}°</td><td>${new Date(c.startMs).toISOString().slice(0,16).replace('T',' ')}</td><td>${fmtHours(c.summary.sunCenter*60)} / ${fmtHours(c.summary.sunLimb*60)}</td><td>${fmtHours(c.summary.earthCenter*60)} / ${fmtHours(c.summary.earthLimb*60)}</td><td>${number(c.summary.maxSun.sun.elevation,1)}°</td><td>${number(c.summary.maxEarth.earth.elevation,1)}°</td><td>${number(c.summary.maxPower.output,0)} W/m²</td><td>${c.mode==='spice'?'SPICE':'DEMO'}</td></tr>`).join('');
  list.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{
    const id=Number(b.dataset.remove),entry=comparisonScenes.get(id);entry?.dispose?.();comparisonScenes.delete(id);
    const index=comparison.findIndex(c=>c.id===id);if(index>=0)comparison.splice(index,1);comparisonIndices.delete(id);renderComparison();
  }));
  list.querySelectorAll('[data-compare-slider]').forEach(input=>input.addEventListener('input',()=>{
    const record=comparison.find(c=>c.id===Number(input.dataset.compareSlider));if(record)updateComparisonCard(record,input.value);
  }));
  list.querySelectorAll('[data-details]').forEach(button=>button.addEventListener('click',()=>openComparisonDetails(Number(button.dataset.details))));
  if(comparisonViewVisible())requestAnimationFrame(()=>ensureComparisonScenes());
}
function formatMissionUtc(sec){return new Date(J2000_MS+sec*1000).toISOString().replace('T',' ').slice(0,19)+' UTC';}
function intervalDetailHtml(label,intervals,color){
  const items=intervals||[];
  const content=items.length?items.map((it,i)=>`<span>${String(i+1).padStart(2,'0')} · ${formatMissionUtc(it.start).slice(11,16)} — ${formatMissionUtc(it.end).slice(11,16)} UTC (${fmtHours(it.minutes)})</span>`).join(''):'<span>No visible interval in this analysis window.</span>';
  return `<div class="compare-interval-card" style="border-top:2px solid ${color}"><strong>${label}</strong>${content}</div>`;
}
function drawMissionLineChart(canvas,data,series,range){
  if(!canvas||!data?.length)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(320,Math.floor(rect.width||canvas.clientWidth||520)),h=Math.max(150,Math.floor(rect.height||190));
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const pad={l:43,r:12,t:12,b:27},min=range?.min??Math.min(...series.flatMap(s=>data.map(r=>s.get(r)))) ,max=range?.max??Math.max(...series.flatMap(s=>data.map(r=>s.get(r))));
  const span=Math.max(1e-6,max-min),x=i=>pad.l+(i/Math.max(1,data.length-1))*(w-pad.l-pad.r),y=v=>pad.t+(1-(v-min)/span)*(h-pad.t-pad.b);
  ctx.font='8px "IBM Plex Mono",monospace';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let k=0;k<=4;k++){const value=min+span*k/4,yy=y(value);ctx.strokeStyle='rgba(134,174,213,.16)';ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#7f97b4';ctx.fillText(value.toFixed(range?.digits??1),pad.l-6,yy);}
  ctx.textAlign='center';ctx.textBaseline='top';for(let k=0;k<=4;k++){const idx=Math.round((data.length-1)*k/4);const elapsed=(data[idx].sec-data[0].sec)/3600;ctx.fillStyle='#718aa8';ctx.fillText(`${elapsed.toFixed(0)}h`,x(idx),h-pad.b+7);}
  for(const s of series){ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();data.forEach((r,i)=>{const px=x(i),py=y(s.get(r));if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();}
}
function openComparisonDetails(id){
  const c=comparison.find(x=>x.id===id);if(!c)return;
  const root=$('compareMissionDetail'),main=$('compareMain');const {idx,row}=selectedComparisonRow(c);
  const stepMin=c.stepSeconds/60,source=c.meta?.ephemeris_kernel||'Synthetic / demo';
  const visibleLabel=c.mode==='spice'?'SPICE EPHEMERIS':'SYNTHETIC DEMO DATA';
  root.hidden=false;$('compare').classList.add('is-detail-open');
  root.innerHTML=`<div class="compare-detail__top"><div class="compare-detail__identity"><small>MISSION DETAIL / ${visibleLabel}</small><h4>${escapeHtml(c.site.name)}</h4><p>${number(c.site.lat,4)}° latitude · ${number(c.site.lon,4)}° longitude · ${c.hours} h mission window · ${new Date(c.startMs).toISOString().replace('T',' ').slice(0,16)} UTC</p></div><div class="compare-detail__top-actions"><button type="button" class="btn small ghost" data-detail-export="json">Export mission JSON</button><button type="button" class="btn small ghost" data-detail-export="csv">Export telemetry CSV</button><button type="button" class="btn small primary" id="backToComparison">← All missions</button></div></div>
    <div class="compare-detail-slider"><strong>TIME</strong><input id="detailMissionSlider" type="range" min="0" max="${c.data.length-1}" value="${idx}"><span id="detailMissionTime">${isoAt(row.dateMs)}</span></div>
    <div class="compare-detail__grid">
      <section class="compare-detail-card"><h5>01 / Mission configuration</h5><div class="compare-detail-fields">
        <div class="compare-detail-field"><span>Landing site</span><strong>${escapeHtml(c.site.name)}</strong></div><div class="compare-detail-field"><span>Coordinates</span><strong>${number(c.site.lat,4)}° / ${number(c.site.lon,4)}°</strong></div>
        <div class="compare-detail-field"><span>Altitude</span><strong>${number(c.site.alt,3)} km</strong></div><div class="compare-detail-field"><span>Mission start</span><strong>${new Date(c.startMs).toISOString().slice(0,16)} UTC</strong></div>
        <div class="compare-detail-field"><span>Analysis duration</span><strong>${c.hours} h</strong></div><div class="compare-detail-field"><span>Sample spacing</span><strong>${number(stepMin,1)} min</strong></div>
        <div class="compare-detail-field"><span>Solar array tilt / azimuth</span><strong>${number(c.site.tilt,1)}° / ${number(c.site.panelAz,1)}°</strong></div><div class="compare-detail-field"><span>Panel efficiency</span><strong>${number(c.site.efficiency,1)}%</strong></div>
        <div class="compare-detail-field"><span>Source</span><strong>${escapeHtml(source)}</strong></div><div class="compare-detail-field"><span>Horizon model</span><strong>${c.terrainApplied?'Local horizon profile':'Flat 0° horizon'}</strong></div>
      </div></section>
      <section class="compare-detail-card"><h5>02 / Selected UTC telemetry</h5><div class="compare-detail-fields">
        <div class="compare-detail-field"><span>Sun elevation / azimuth</span><strong class="sun">${number(row.sun.elevation,3)}° / ${number(row.sun.azimuth,3)}°</strong></div><div class="compare-detail-field"><span>Earth elevation / azimuth</span><strong class="earth">${number(row.earth.elevation,3)}° / ${number(row.earth.azimuth,3)}°</strong></div>
        <div class="compare-detail-field"><span>Sun center / disk</span><strong>${row.sun.centerVisible?'Center visible':'Center below'} / ${row.sun.limbVisible?'Limb visible':'Disk hidden'}</strong></div><div class="compare-detail-field"><span>Earth center / disk</span><strong>${row.earth.centerVisible?'Center visible':'Center below'} / ${row.earth.limbVisible?'Limb visible':'Disk hidden'}</strong></div>
        <div class="compare-detail-field"><span>Earth distance</span><strong>${number(row.earth.distance,2)} km</strong></div><div class="compare-detail-field"><span>One-way light time</span><strong>${number(row.earth.distance/C_KM_S,3)} s</strong></div>
        <div class="compare-detail-field"><span>Incident irradiance</span><strong class="power">${number(row.irradiance,2)} W/m²</strong></div><div class="compare-detail-field"><span>Estimated array output</span><strong class="power">${number(row.output,2)} W/m²</strong></div>
        <div class="compare-detail-field"><span>Round-trip propagation</span><strong>${number(row.roundTrip,3)} s</strong></div><div class="compare-detail-field"><span>Sun / Earth horizon</span><strong>${number(row.sun.horizon,2)}° / ${number(row.earth.horizon,2)}°</strong></div>
      </div></section>
    </div>
    <div class="compare-detail-section-title"><strong>03 / FULL-WINDOW TELEMETRY</strong><span>${c.data.length} SAMPLES · ${visibleLabel}</span></div>
    <div class="compare-chart-grid"><section class="compare-chart-card"><h5>SUN & EARTH ELEVATION / DEGREES</h5><canvas id="missionElevationChart"></canvas><div class="chart-legend"><span><i style="background:#ffc66d"></i> Sun elevation</span><span><i style="background:#69bfff"></i> Earth elevation</span></div></section><section class="compare-chart-card"><h5>ESTIMATED SOLAR ARRAY OUTPUT / W·m⁻²</h5><canvas id="missionPowerChart"></canvas><div class="chart-legend"><span><i style="background:#8ce5bd"></i> Array output</span></div></section></div>
    <div class="compare-detail-section-title"><strong>04 / VISIBILITY WINDOWS</strong><span>LINEARLY INTERPOLATED CROSSINGS · GEOMETRIC</span></div>
    <div class="compare-interval-grid">${intervalDetailHtml('SUN CENTER',c.summary.sunCenterIntervals,'#ffc66d')}${intervalDetailHtml('SUN DISK',c.summary.sunLimbIntervals,'#e7a94b')}${intervalDetailHtml('EARTH CENTER',c.summary.earthCenterIntervals,'#64baff')}${intervalDetailHtml('EARTH DISK',c.summary.earthLimbIntervals,'#7ad8ff')}</div>
    <div class="compare-detail-section-title"><strong>05 / SAMPLE-BY-SAMPLE TELEMETRY</strong><span>RAW DERIVED SERIES / UTC</span></div>
    <div class="compare-telemetry-wrap"><table class="compare-telemetry-table"><thead><tr><th>#</th><th>UTC</th><th>Sun el.</th><th>Sun az.</th><th>Earth el.</th><th>Earth az.</th><th>Earth range km</th><th>Irradiance W/m²</th><th>Array W/m²</th><th>RTT s</th></tr></thead><tbody>${c.data.map((r,i)=>`<tr><td>${i+1}</td><td>${new Date(r.dateMs).toISOString().replace('T',' ').slice(0,19)}</td><td>${number(r.sun.elevation,3)}°</td><td>${number(r.sun.azimuth,3)}°</td><td>${number(r.earth.elevation,3)}°</td><td>${number(r.earth.azimuth,3)}°</td><td>${number(r.earth.distance,2)}</td><td>${number(r.irradiance,2)}</td><td>${number(r.output,2)}</td><td>${number(r.roundTrip,3)}</td></tr>`).join('')}</tbody></table></div>
    <div class="status-note warn" style="margin-top:12px">Scientific note: geometric visibility uses the stored horizon mask (or a flat horizon if none was applied). Array output is a simplified irradiance × efficiency estimate. Earth visibility is not an RF link budget.</div>`;
  root.querySelector('#backToComparison').addEventListener('click',()=>{root.hidden=true;$('compare').classList.remove('is-detail-open');});
  root.querySelectorAll('[data-detail-export]').forEach(b=>b.addEventListener('click',()=>exportComparisonMission(c,b.dataset.detailExport)));
  const slider=root.querySelector('#detailMissionSlider');
  slider.addEventListener('input',()=>{
    const index=Number(slider.value);comparisonIndices.set(c.id,index);const selected=c.data[index];
    root.querySelector('#detailMissionTime').textContent=isoAt(selected.dateMs);
    updateDetailSelectedTelemetry(root,c,selected);
  });
  const elevationCanvas=root.querySelector('#missionElevationChart'),powerCanvas=root.querySelector('#missionPowerChart');
  drawMissionLineChart(elevationCanvas,c.data,[{get:r=>r.sun.elevation,color:'#ffc66d'},{get:r=>r.earth.elevation,color:'#69bfff'}],{min:-90,max:90,digits:0});
  const maxOutput=Math.max(1,...c.data.map(r=>r.output));
  drawMissionLineChart(powerCanvas,c.data,[{get:r=>r.output,color:'#8ce5bd'}],{min:0,max:maxOutput*1.1,digits:0});
}
function updateDetailSelectedTelemetry(root,c,row){
  const fields=root.querySelectorAll('.compare-detail__grid .compare-detail-card:nth-child(2) .compare-detail-field strong');
  const values=[`${number(row.sun.elevation,3)}° / ${number(row.sun.azimuth,3)}°`,`${number(row.earth.elevation,3)}° / ${number(row.earth.azimuth,3)}°`,`${row.sun.centerVisible?'Center visible':'Center below'} / ${row.sun.limbVisible?'Limb visible':'Disk hidden'}`,`${row.earth.centerVisible?'Center visible':'Center below'} / ${row.earth.limbVisible?'Limb visible':'Disk hidden'}`,`${number(row.earth.distance,2)} km`,`${number(row.earth.distance/C_KM_S,3)} s`,`${number(row.irradiance,2)} W/m²`,`${number(row.output,2)} W/m²`,`${number(row.roundTrip,3)} s`,`${number(row.sun.horizon,2)}° / ${number(row.earth.horizon,2)}°`];
  fields.forEach((el,i)=>{if(values[i]!==undefined)el.textContent=values[i];});
}
function exportComparisonMission(record,format){
  const base=(record.site.name||'mission').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'mission';
  if(format==='json'){
    const payload={application:'LUNARA',mission:{name:record.site.name,site:record.site,start_utc:new Date(record.startMs).toISOString(),duration_hours:record.hours,sample_step_minutes:record.stepSeconds/60,data_mode:record.mode,ephemeris_metadata:record.meta,terrain_horizon_applied:record.terrainApplied},summary:{sun_center_visible_hours:record.summary.sunCenter,sun_disk_visible_hours:record.summary.sunLimb,earth_center_visible_hours:record.summary.earthCenter,earth_disk_visible_hours:record.summary.earthLimb,peak_sun_elevation_deg:record.summary.maxSun.sun.elevation,peak_earth_elevation_deg:record.summary.maxEarth.earth.elevation,peak_estimated_array_output_W_m2:record.summary.maxPower.output},samples:record.data.map(r=>({utc:new Date(r.dateMs).toISOString(),sun_elevation_deg:r.sun.elevation,sun_azimuth_deg:r.sun.azimuth,sun_horizon_deg:r.sun.horizon,earth_elevation_deg:r.earth.elevation,earth_azimuth_deg:r.earth.azimuth,earth_horizon_deg:r.earth.horizon,earth_distance_km:r.earth.distance,incident_irradiance_W_m2:r.irradiance,estimated_array_output_W_m2:r.output,round_trip_geometric_light_time_s:r.roundTrip}))};
    download(`lunara_${base}_mission.json`,JSON.stringify(payload,null,2),'application/json');return;
  }
  const headers=['sample','utc','sun_elevation_deg','sun_azimuth_deg','sun_horizon_deg','earth_elevation_deg','earth_azimuth_deg','earth_horizon_deg','earth_distance_km','incident_irradiance_W_m2','estimated_array_output_W_m2','round_trip_geometric_light_time_s'];
  const lines=record.data.map((r,i)=>[i+1,new Date(r.dateMs).toISOString(),r.sun.elevation,r.sun.azimuth,r.sun.horizon,r.earth.elevation,r.earth.azimuth,r.earth.horizon,r.earth.distance,r.irradiance,r.output,r.roundTrip]);
  const csv=[headers,...lines].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');download(`lunara_${base}_telemetry.csv`,csv,'text/csv');
}

function candidateGrid(){
  const reqSun=Number($('minSun').value),reqEarth=Number($('minEarth').value),north=Number($('maxLat').value),step=Number($('gridStep').value);
  if(!Number.isFinite(reqSun)||!Number.isFinite(reqEarth)||!Number.isFinite(north)||north< -89||north> -70||reqSun<0||reqEarth<0)throw new Error('Invalid search parameters. The northern latitude limit must be between −89° and −70°.');
  const startMs=new Date($('date').value+':00Z').getTime(),hours=Number($('duration').value),dt=Number($('sampleStep').value);
  const out=[];
  for(let lat=-90;lat<=north+1e-6;lat+=step){for(let lon=-180;lon<180;lon+=step){const site={name:`Candidate ${lat.toFixed(1)} / ${lon.toFixed(1)}`,lat,lon,alt:Number($('alt').value),tilt:Number($('tilt').value),panelAz:Number($('panelAz').value),efficiency:Number($('efficiency').value)};try{const d=makeRows(site,startMs,hours,Math.max(30,dt),false);const s=calculateSummary(d);if(s.sunCenter>=reqSun&&s.earthLimb>=reqEarth)out.push({site,s});}catch(e){throw e;}}}
  out.sort((a,b)=>{const sa=(a.s.sunCenter/Math.max(hours,1))+(a.s.earthLimb/Math.max(hours,1));const sb=(b.s.sunCenter/Math.max(hours,1))+(b.s.earthLimb/Math.max(hours,1));return sb-sa;});return out.slice(0,9);
}
function renderCandidates(list){if(!list.length){$('searchResults').innerHTML='<div class="compare-empty" style="grid-column:1/-1">No sites matched both filters on this grid. Lower the thresholds or expand the search region.</div>';return;}
  $('searchResults').innerHTML=list.map((x,i)=>`<div class="candidate"><strong>#${i+1} · ${number(x.site.lat,1)}°, ${number(x.site.lon,1)}°</strong><p>Planetocentric coordinates · altitude ${number(x.site.alt,2)} km</p><div class="candidate-values"><span>☼ ${fmtHours(x.s.sunCenter*60)}</span><span>◎ ${fmtHours(x.s.earthLimb*60)}</span></div><button class="btn small ghost" data-candidate="${i}">Load site</button></div>`).join('');
  $('searchResults').querySelectorAll('[data-candidate]').forEach(b=>b.addEventListener('click',()=>{const x=list[Number(b.dataset.candidate)];$('lat').value=x.site.lat;$('lon').value=x.site.lon;$('siteName').value=x.site.name;$('preset').value='custom';calculate();}));
}


// The comparison workbench is moved into a hidden overlay by the layout controller.
// Delay WebGL initialisation until that workspace is visible so each preview gets real dimensions.
document.querySelector('[data-open-view=\"comparison\"]')?.addEventListener('click',()=>requestAnimationFrame(()=>requestAnimationFrame(ensureComparisonScenes)));
window.addEventListener('resize',()=>{if(comparisonViewVisible())requestAnimationFrame(ensureComparisonScenes);});
