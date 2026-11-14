'use strict';
// Sun/Earth positions: synthetic demo and positions.json (SPICE) ingestion.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Synthetic demo. Always labeled; it is not a substitute for SPICE ephemerides.
// -----------------------------------------------------------------------------
function syntheticVectors(dateMs){
  const days=(dateMs-J2000_MS)/86400000;
  const syn=29.530588853, anomalistic=27.55455, draconic=27.21222;
  const sunLon=wrap360((days/syn*360)+145);
  const sunLat=1.54*Math.sin(2*Math.PI*days/draconic+0.4);
  const earthLon=7.2*Math.sin(2*Math.PI*days/27.55+0.8)+1.8*Math.sin(2*Math.PI*days/365.25);
  const earthLat=6.7*Math.sin(2*Math.PI*days/draconic+1.1);
  const toVec=(lat,lon,r)=>{const p=lat*Math.PI/180,l=lon*Math.PI/180;return [r*Math.cos(p)*Math.cos(l),r*Math.cos(p)*Math.sin(l),r*Math.sin(p)]};
  const au=1.0+0.0167*Math.cos(2*Math.PI*days/365.256);
  const sun=toVec(sunLat,sunLon,AU_KM*au);
  const earth=toVec(earthLat,earthLon,384400+21000*Math.cos(2*Math.PI*days/anomalistic));
  return {sun,earth};
}
function demoSampleAt(sec){return syntheticVectors(J2000_MS+sec*1000);}

// -----------------------------------------------------------------------------
// Ingest and validate positions.json (original LUNARA or v2 format).
// -----------------------------------------------------------------------------
function normalizeDataset(raw){
  const samples=Array.isArray(raw)?raw:(raw?.samples||raw?.data||[]);
  if(!Array.isArray(samples)||samples.length<2)throw new Error('The JSON must contain at least two valid samples.');
  const normalized=samples.map((r,i)=>{
    const t=Number(r.t_utc_s ?? r.t ?? (r.utc?((Date.parse(r.utc)-J2000_MS)/1000):NaN));
    const sun=r.sun||r.sun_moon_km, earth=r.earth||r.earth_moon_km;
    if(!Number.isFinite(t)||!Array.isArray(sun)||!Array.isArray(earth)||sun.length<3||earth.length<3)throw new Error(`Sample ${i} is incomplete: t, sun[3] and earth[3] are required.`);
    if(![...sun.slice(0,3),...earth.slice(0,3)].every(Number.isFinite))throw new Error(`Sample ${i} contains non-numeric vectors.`);
    return {t,sun:sun.slice(0,3).map(Number),earth:earth.slice(0,3).map(Number)};
  }).sort((a,b)=>a.t-b.t);
  for(let i=1;i<normalized.length;i++)if(normalized[i].t<=normalized[i-1].t)throw new Error('Timestamps must be unique and strictly increasing.');
  const meta=Array.isArray(raw)?{}:(raw.meta||raw.metadata||{});
  const stepMedian=normalized.slice(1).map((r,i)=>r.t-normalized[i].t).sort((a,b)=>a-b)[Math.floor((normalized.length-2)/2)];
  return {samples:normalized,meta,step:stepMedian||3600,start:normalized[0].t,end:normalized.at(-1).t};
}
function interpolateVector(sec,key){
  if(!ephemeris) return demoSampleAt(sec)[key];
  const a=ephemeris.samples;
  if(sec<a[0].t-1e-6||sec>a.at(-1).t+1e-6)throw new Error('Date is outside SPICE file coverage. Positions are not extrapolated.');
  let lo=0,hi=a.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(a[mid].t<=sec)lo=mid;else hi=mid;}
  if(Math.abs(sec-a[lo].t)<1e-6)return a[lo][key];
  if(Math.abs(sec-a[hi].t)<1e-6)return a[hi][key];
  const f=(sec-a[lo].t)/(a[hi].t-a[lo].t);
  return a[lo][key].map((v,i)=>v+(a[hi][key][i]-v)*f);
}
