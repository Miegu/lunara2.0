'use strict';
// Main calculate workflow, control listeners and section navigation.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Main calculate workflow
// -----------------------------------------------------------------------------
function buildSite(){const lat=Number($('lat').value),lon=Number($('lon').value),alt=Number($('alt').value),tilt=Number($('tilt').value),panelAz=Number($('panelAz').value),efficiency=Number($('efficiency').value);if(!Number.isFinite(lat)||lat< -90||lat>90)throw new Error('Latitude must be between −90° and +90°.');if(!Number.isFinite(lon)||lon< -180||lon>180)throw new Error('Longitude must be between −180° and +180°.');if(!Number.isFinite(alt)||alt< -5||alt>15)throw new Error('Altitude must be between −5 and +15 km.');if(!Number.isFinite(tilt)||tilt<0||tilt>90)throw new Error('Panel tilt must be between 0° and 90°.');if(!Number.isFinite(panelAz)||panelAz<0||panelAz>=360)throw new Error('Panel azimuth must be between 0° and 359°.');if(!Number.isFinite(efficiency)||efficiency<1||efficiency>50)throw new Error('Panel efficiency must be between 1% and 50%.');return {name:$('siteName').value.trim()||'Unnamed scenario',lat,lon,alt,tilt,panelAz,efficiency};}
function calculate(){
  currentScenario=null; rows=[];
  try{
    const site=buildSite(),dateVal=$('date').value;if(!dateVal)throw new Error('Select a UTC date and time.');const startMs=new Date(dateVal+':00Z').getTime();if(!Number.isFinite(startMs))throw new Error('The selected date is invalid.');const hours=Number($('duration').value),step=Number($('sampleStep').value);
    rows=makeRows(site,startMs,hours,step);currentIndex=0;const summary=calculateSummary(rows);currentScenario={site,summary,startMs,hours};
    renderAll();
    if(dataMode==='demo')showNotice('DEMO MODE: synthetic values are provided to test controls, animation and visualizations. They are not SPICE predictions and must not be used to select a real landing site.','warn');else showNotice(`SPICE ephemerides interpolated within dataset coverage. Original average step: ${number(ephemeris.step/60,1)} min; visual interpolation does not increase the underlying physical data resolution.`,'good');
  }catch(err){showNotice(err.message,'warn');$('skyStatus').textContent='No data available for this time window';console.error(err);}
}
$('calculate').addEventListener('click',calculate);$('timeSlider').addEventListener('input',e=>{currentIndex=Number(e.target.value);if(rows.length)renderAll();});$('play').addEventListener('click',()=>{if(playTimer){clearInterval(playTimer);playTimer=null;$('play').textContent='▶ Play';return;}if(!rows.length)return;$('play').textContent='Ⅱ Pause';playTimer=setInterval(()=>{const stepN=Math.max(1,Math.round(rows.length/300));currentIndex=(currentIndex+stepN)%rows.length;$('timeSlider').value=String(currentIndex);renderAll();},90);});$('addCompare').addEventListener('click',addCurrentComparison);$('compareAddCurrent')?.addEventListener('click',()=>$('addCompare').click());$('clearCompare').addEventListener('click',()=>{comparison=[];comparisonIndices.clear();disposeComparisonScenes();$('compare').classList.remove('is-detail-open');$('compareMissionDetail').hidden=true;$('compareMissionDetail').innerHTML='';renderComparison();});$('searchCandidates').addEventListener('click',()=>{try{$('searchResults').innerHTML='<div class="compare-empty" style="grid-column:1/-1">Scanning the polar grid…</div>';const list=candidateGrid();renderCandidates(list);}catch(e){$('searchResults').innerHTML=`<div class="compare-empty" style="grid-column:1/-1">${escapeHtml(e.message)}</div>`;}});
// Choosing a catalog site fills its coordinates; its precomputed LOLA horizon (if any) applies automatically.
$('preset').addEventListener('change',e=>{const p=PRESETS[e.target.value];if(!p)return;$('lat').value=p.lat;$('lon').value=p.lon;$('alt').value=p.alt;$('siteName').value=p.name;syncActiveHorizon();calculate();});
$('date').value='2026-11-10T12:00';

// Date range: start + end, any length from 1 hour to one year. #duration (hidden) holds the length in hours.
const MAX_WINDOW_HOURS=366*24;
const toInputValue=ms=>new Date(ms).toISOString().slice(0,16);
const inputMs=id=>new Date($(id).value+':00Z').getTime();
function setWindowHours(hours){
  hours=clamp(Math.round(hours),1,MAX_WINDOW_HOURS);
  $('duration').value=String(hours);
  $('endDate').value=toInputValue(inputMs('date')+hours*3600e3);
}
function fmtWindow(hours){return hours%24===0?`${hours/24} day${hours===24?'':'s'}`:`${hours} h`;}
function syncRangeChips(){const h=Number($('duration').value);document.querySelectorAll('[data-range-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rangeDays)*24===h)));}
// Time step is automatic: fine for short windows, coarse for long ones (also used for SPICE requests).
function autoStepMinutes(hours){return hours<=24?10:hours<=72?15:hours<=168?30:hours<=744?60:hours<=2208?180:360;}
function applyAutoTimeStep(){$('sampleStep').value=String(autoStepMinutes(Number($('duration').value)));}

// Recalculate as soon as the range changes (no need to press "Run analysis").
// With SPICE data loaded, first ask the local server for the new window; if that fails, fall back to demo data.
function ephemerisCoversWindow(){
  if(!ephemeris)return false;
  const start=(inputMs('date')-J2000_MS)/1000,end=start+Number($('duration').value)*3600;
  return ephemeris.start<=start+1e-6&&ephemeris.end>=end-1e-6;
}
async function recalculateForNewWindow(){
  applyAutoTimeStep();syncRangeChips();
  if(dataMode==='spice'&&!ephemerisCoversWindow()){
    await connectLocalSpice();
    if(!ephemerisCoversWindow()){ephemeris=null;dataMode='demo';updateDataBadge();}
    else return; // connectLocalSpice() already recalculated
  }
  calculate();
}
$('date').addEventListener('change',()=>{setWindowHours(Number($('duration').value));recalculateForNewWindow();}); // keeps the length, moves the end
$('endDate').addEventListener('change',()=>{
  const hours=(inputMs('endDate')-inputMs('date'))/3600e3;
  if(!(hours>=1)){setWindowHours(Number($('duration').value));showNotice('The end of the range must be after the start.','warn');return;}
  setWindowHours(hours);recalculateForNewWindow();
});
document.querySelectorAll('[data-range-days]').forEach(b=>b.addEventListener('click',()=>{setWindowHours(Number(b.dataset.rangeDays)*24);recalculateForNewWindow();}));
setWindowHours(Number($('duration').value));applyAutoTimeStep();syncRangeChips();

// "More options": typing coordinates switches the site to "Custom"; any change recalculates.
['lat','lon','alt'].forEach(id=>{$(id).addEventListener('input',()=>{$('preset').value='custom';});$(id).addEventListener('change',()=>{syncActiveHorizon();calculate();});});
['tilt','panelAz','efficiency','siteName'].forEach(id=>$(id).addEventListener('change',calculate));
// Radio settings only change the data rate: redraw, no need to recalculate the geometry.
['commsBand','commsDish','commsPower','commsGain'].forEach(id=>$(id)?.addEventListener('change',()=>{if(rows.length)renderAll();}));

// Section navigation: keep the selected destination highlighted during scroll/click.
const missionNavLinks = [...document.querySelectorAll('.mission-nav a')];
missionNavLinks.forEach(link => link.addEventListener('click', () => {
  missionNavLinks.forEach(item => item.classList.toggle('active', item === link));
}));
if ('IntersectionObserver' in window) {
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    missionNavLinks.forEach(link => link.classList.toggle('active', link.hash === `#${visible.target.id}`));
  }, { rootMargin: '-18% 0px -68% 0px', threshold: [0, .2, .45] });
  ['workspace','visuals','windows','compare','explorer','science'].forEach(id => {
    const section = document.getElementById(id);
    if (section) navObserver.observe(section);
  });
}
