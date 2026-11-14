'use strict';
// Constants, shared state and small helpers.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

let THREE = null;      // set in js/boot.js
let GLTFLoader = null; // set in js/boot.js

// -----------------------------------------------------------------------------
// State and constants
// -----------------------------------------------------------------------------
const J2000_MS = Date.UTC(2000,0,1,12,0,0);
const AU_KM = 149597870.7, SUN_RADIUS_KM = 695700, EARTH_RADIUS_KM = 6371;
const SOLAR_CONSTANT = 1361, C_KM_S = 299792.458;
const MOON_A_DEFAULT = 1738.1, MOON_C_DEFAULT = 1736.0;
const PRESETS = {
  shackleton:{name:'Shackleton · reference',lat:-89.5,lon:0,alt:0},
  apollo:{name:'Apollo 11 · historical reference',lat:0.67,lon:23.47,alt:0},
  huygens:{name:'Mount Huygens · topographic reference',lat:19.9,lon:-2.9,alt:5.5},
  marius:{name:'Marius Hills · equatorial reference',lat:14,lon:-56,alt:0}
};
let ephemeris = null, dataMode = 'demo', currentScenario = null, rows = [], comparison = [], horizonProfile = null, horizonProfileSite = null;
let currentIndex = 0, playTimer = null, sky3d = null, moon3d = null, fallbackVisuals = null;
const $ = id => document.getElementById(id);
const number = (v,d=1) => Number.isFinite(v) ? v.toFixed(d) : '—';
const wrap360 = a => ((a%360)+360)%360;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const vec = (x,y,z) => new THREE.Vector3(x,y,z);
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = a => Math.hypot(a[0],a[1],a[2]);
const unit = a => {const n=norm(a)||1;return scale(a,1/n)};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function utcToSec(dateValue){return (new Date(dateValue+'Z').getTime()-J2000_MS)/1000;}
function isoAt(ms){return new Date(ms).toISOString().replace('T',' ').slice(0,19)+' UTC';}
function fmtHours(mins){return `${Math.floor(mins/60)}h ${String(Math.round(mins%60)).padStart(2,'0')}m`;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
