'use strict';
// Local geometry, horizon mask, visibility intervals.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Local ellipsoidal geometry: planetocentric latitude input, IAU_MOON frame.
// -----------------------------------------------------------------------------
function getMoonRadii(){
  const m=ephemeris?.meta||{};
  const rr=m.moon_radii_km||m.radii_km;
  if(Array.isArray(rr)&&rr.length>=3)return {a:Number(rr[0]),b:Number(rr[1]),c:Number(rr[2])};
  return {a:MOON_A_DEFAULT,b:MOON_A_DEFAULT,c:MOON_C_DEFAULT};
}
function surfaceFrame(latDeg,lonDeg,altKm){
  const {a,b,c}=getMoonRadii(),lat=latDeg*Math.PI/180,lon=lonDeg*Math.PI/180;
  const cp=Math.cos(lat),sp=Math.sin(lat),cl=Math.cos(lon),sl=Math.sin(lon);
  // Intersection of the planetocentric ray with the triaxial ellipsoid.
  const r=1/Math.sqrt((cp*cl)**2/(a*a)+(cp*sl)**2/(b*b)+(sp*sp)/(c*c));
  let site=[r*cp*cl,r*cp*sl,r*sp];
  const up=unit([site[0]/(a*a),site[1]/(b*b),site[2]/(c*c)]);
  site=add(site,scale(up,altKm));
  const east=unit([-sl,cl,0]);
  const north=unit(cross(up,east));
  return {site,up,east,north};
}
function horizonAt(az){
  if(!horizonProfile?.length)return 0;
  const sorted=horizonProfile; const a=wrap360(az);
  let hi=sorted.findIndex(p=>p.az>=a);if(hi<0)hi=0;
  const lo=(hi-1+sorted.length)%sorted.length,p0=sorted[lo],p1=sorted[hi];
  let a0=p0.az,a1=p1.az,aa=a;
  if(hi===0)a1+=360;if(a<a0)aa+=360;
  if(Math.abs(a1-a0)<1e-9)return p0.el;
  const f=clamp((aa-a0)/(a1-a0),0,1);return p0.el+(p1.el-p0.el)*f;
}
function targetGeometry(position,frame,bodyRadius,site,useTerrain=true){
  const v=sub(position,frame.site),distance=norm(v),u=unit(v);
  const n=dot(u,frame.north),e=dot(u,frame.east),up=dot(u,frame.up);
  const elevation=Math.atan2(up,Math.hypot(n,e))*180/Math.PI;
  const azimuth=wrap360(Math.atan2(e,n)*180/Math.PI);
  const angularRadius=Math.asin(clamp(bodyRadius/Math.max(distance,bodyRadius),-1,1))*180/Math.PI;
  const sameSite=horizonProfileSite&&Math.abs(site.lat-horizonProfileSite.lat)<1e-5&&Math.abs(site.lon-horizonProfileSite.lon)<1e-5;
  const h=(useTerrain&&horizonProfile&&sameSite)?horizonAt(azimuth):0;
  return {elevation,azimuth,distance,angularRadius,horizon:h,centerVisible:elevation>h,limbVisible:elevation+angularRadius>h,fullDiskVisible:elevation-angularRadius>h,clearance:elevation-h,vector:u};
}
function panelNormal(tiltDeg,azDeg,frame){
  const t=tiltDeg*Math.PI/180,a=azDeg*Math.PI/180;
  return unit(add(add(scale(frame.up,Math.cos(t)),scale(frame.north,Math.sin(t)*Math.cos(a))),scale(frame.east,Math.sin(t)*Math.sin(a))));
}
function computeInstant(sec,site,useTerrain=true){
  const frame=surfaceFrame(site.lat,site.lon,site.alt);
  const sunPos=interpolateVector(sec,'sun'),earthPos=interpolateVector(sec,'earth');
  const sun=targetGeometry(sunPos,frame,SUN_RADIUS_KM,site,useTerrain),earth=targetGeometry(earthPos,frame,EARTH_RADIUS_KM,site,useTerrain);
  const solarNormal=panelNormal(site.tilt,site.panelAz,frame);
  const cosInc=sun.centerVisible?Math.max(0,dot(sun.vector,solarNormal)):0;
  const irradiance=SOLAR_CONSTANT*Math.pow(AU_KM/norm(sub(sunPos,frame.site)),2)*cosInc;
  const output=irradiance*(site.efficiency/100);
  return {sec,dateMs:J2000_MS+sec*1000,sun,earth,irradiance,output,roundTrip:2*earth.distance/C_KM_S};
}
function makeRows(site,startMs,hours,stepMin,useTerrain=true){
  const start=(startMs-J2000_MS)/1000,end=start+hours*3600,step=stepMin*60,out=[];
  if(ephemeris&&(start<ephemeris.start-1e-6||end>ephemeris.end+1e-6))throw new Error(`The full UTC window is not covered. File coverage: ${isoAt(J2000_MS+ephemeris.start*1000)} — ${isoAt(J2000_MS+ephemeris.end*1000)}.`);
  for(let t=start;t<end-1e-6;t+=step)out.push(computeInstant(t,site,useTerrain));
  out.push(computeInstant(end,site,useTerrain));return out;
}
function intervalsFor(data,predicate){
  const ints=[];let start=null;
  for(let i=0;i<data.length;i++){
    const yes=predicate(data[i]);
    if(yes&&start===null)start=data[i].sec;
    const last=i===data.length-1;
    if(start!==null&&(!yes||last)){
      let end=yes&&last?data[i].sec:data[i-1].sec;
      if(i>0&&!yes){const p=data[i-1],c=data[i];const v0=p._metric??predicate.metric?.(p)??1,v1=c._metric??predicate.metric?.(c)??-1;let f=.5;if(Number.isFinite(v0)&&Number.isFinite(v1)&&v0!==v1)f=clamp(v0/(v0-v1),0,1);end=p.sec+(c.sec-p.sec)*f;}
      if(end>=start)ints.push({start,end,minutes:(end-start)/60});start=null;
    }
  }
  return ints;
}
function calculateSummary(data){
  const durationMin=(data.at(-1).sec-data[0].sec)/60;
  const sunCenterIntervals=buildIntervals(data,r=>r.sun.elevation-r.sun.horizon);
  const sunLimbIntervals=buildIntervals(data,r=>r.sun.elevation+r.sun.angularRadius-r.sun.horizon);
  const earthCenterIntervals=buildIntervals(data,r=>r.earth.elevation-r.earth.horizon);
  const earthLimbIntervals=buildIntervals(data,r=>r.earth.elevation+r.earth.angularRadius-r.earth.horizon);
  const hours=ints=>ints.reduce((sum,it)=>sum+it.minutes,0)/60;
  const sunCenter=hours(sunCenterIntervals),sunLimb=hours(sunLimbIntervals);
  const earthCenter=hours(earthCenterIntervals),earthLimb=hours(earthLimbIntervals);
  const maxSun=data.reduce((a,b)=>b.sun.elevation>a.sun.elevation?b:a),maxEarth=data.reduce((a,b)=>b.earth.elevation>a.earth.elevation?b:a),maxPower=data.reduce((a,b)=>b.output>a.output?b:a);
  return {durationMin,sunCenter,sunLimb,earthCenter,earthLimb,maxSun,maxEarth,maxPower,sunCenterIntervals,sunLimbIntervals,earthCenterIntervals,earthLimbIntervals};
}
function durationHours(data,pred){
  let mins=0;for(let i=1;i<data.length;i++){const dt=(data[i].sec-data[i-1].sec)/60;if(pred(data[i-1])&&pred(data[i]))mins+=dt;else if(pred(data[i-1])!==pred(data[i]))mins+=dt*.5;}return mins/60;
}
function buildIntervals(data,metricFn){
  const out=[];if(!data.length)return out;
  let active=metricFn(data[0])>0,start=active?data[0].sec:null;
  for(let i=1;i<data.length;i++){
    const p=data[i-1],c=data[i],v0=metricFn(p),v1=metricFn(c),pOn=v0>0,cOn=v1>0;
    if(!pOn&&cOn){const f=clamp(v0/(v0-v1),0,1);start=p.sec+(c.sec-p.sec)*f;active=true;}
    else if(pOn&&!cOn){const f=clamp(v0/(v0-v1),0,1),crossing=p.sec+(c.sec-p.sec)*f;if(active&&start!==null)out.push({start,end:crossing,minutes:(crossing-start)/60});active=false;start=null;}
  }
  if(active&&start!==null){const end=data.at(-1).sec;out.push({start,end,minutes:(end-start)/60});}
  return out;
}
function nextCrossing(ints,nowSec){
  for(const it of ints){if(it.start>nowSec+1)return {label:'Rises',sec:it.start};if(it.end>nowSec+1)return {label:'Sets',sec:it.end};}
  return null;
}
function dateFromSec(sec){return new Date(J2000_MS+sec*1000).toISOString();}
function localTime(sec){const d=new Date(J2000_MS+sec*1000);return d.toISOString().slice(11,16)+' UTC';}
