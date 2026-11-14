'use strict';
// Three.js scenes: local sky and Moon globe, plus 2D fallback.
// Part of LUNARA's main app. Loaded as a classic deferred script: top-level
// declarations are shared with the other js/ files (see js/README.md for the order).

// -----------------------------------------------------------------------------
// Three.js: local 3D sky with schematic procedural terrain.
// -----------------------------------------------------------------------------
function makeLabelSprite(text,color){const c=document.createElement('canvas');c.width=320;c.height=90;const x=c.getContext('2d');x.fillStyle='rgba(12,7,25,.90)';x.fillRect(3,3,314,84);x.strokeStyle=color;x.lineWidth=4;x.strokeRect(3,3,314,84);x.fillStyle=color;x.font='600 34px "Space Grotesk", sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,160,45);const tex=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));s.scale.set(25,7,1);return s;}
function makeStarField(scene){const g=new THREE.BufferGeometry(),p=[];for(let i=0;i<1100;i++){const u=Math.random()*2-1,a=Math.random()*Math.PI*2,r=170,xy=Math.sqrt(1-u*u);p.push(r*xy*Math.cos(a),r*u,r*xy*Math.sin(a));}g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xd8e8ff,size:0.8,transparent:true,opacity:.78})));}
function makeGround(scene){
  const loader=new THREE.TextureLoader();let moonTex=null;try{moonTex=loader.load('models/moonsurface.jpg');}catch(e){console.warn('No se pudo cargar models/moonsurface.jpg',e);}const geometry=new THREE.SphereGeometry(400,64,64),mat=new THREE.MeshStandardMaterial({map:moonTex,roughness:1,metalness:0});const ground=new THREE.Mesh(geometry,mat);ground.position.set(0,-400,0);scene.add(ground);

}
function createSky3D(){
  if(!THREE) throw new Error('Three.js is unavailable.');
  const host=$('skyScene');const scene=new THREE.Scene();const skyLoader=new THREE.TextureLoader();let skyTex=null;try{skyTex=skyLoader.load('models/starssky.jpg');skyTex.mapping=THREE.EquirectangularReflectionMapping;scene.background=skyTex;}catch(e){console.warn('No se pudo cargar models/starssky.jpg',e);scene.background=new THREE.Color(0x0b0718);}

  const camera=new THREE.PerspectiveCamera(67,host.clientWidth/host.clientHeight,.1,500);camera.position.set(0,0,0);camera.rotation.order='YXZ';camera.rotation.x=0;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff,.15));makeGround(scene);
  const sunLight=new THREE.DirectionalLight(0xffffff,3);sunLight.target.position.set(0,0,0);scene.add(sunLight);scene.add(sunLight.target);
  const sunLoader=new THREE.TextureLoader();let sunTex=null;try{sunTex=sunLoader.load('models/sunsurface.jpg');}catch(e){console.warn('No se pudo cargar models/sunsurface.jpg',e);}const sun=new THREE.Mesh(new THREE.SphereGeometry(3.4,32,32),new THREE.MeshBasicMaterial({map:sunTex}));scene.add(sun);const sunLabel=makeLabelSprite('SUN','#ffd27a');scene.add(sunLabel);
  const earthLoader=new THREE.TextureLoader();let earthTex=null;try{earthTex=earthLoader.load('models/earthsurface.jpg');}catch(e){console.warn('No se pudo cargar models/earthsurface.jpg',e);}const earth=new THREE.Group();const earthMesh=new THREE.Mesh(new THREE.SphereGeometry(3.7,40,32),new THREE.MeshStandardMaterial({map:earthTex,roughness:0.75,metalness:0}));earth.add(earthMesh);scene.add(earth);const earthLabel=makeLabelSprite('EARTH','#81d4ff');scene.add(earthLabel);
  let dragging=false,px=0,py=0,yaw=0,pitch=-.05,zoom=1;
  const down=e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!dragging)return;yaw-=(e.clientX-px)*.005;pitch=clamp(pitch+(e.clientY-py)*.005,-1.25,1.25);px=e.clientX;py=e.clientY;camera.rotation.set(pitch,yaw,0,'YXZ');};
  const up=()=>dragging=false;
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  renderer.domElement.addEventListener('wheel',e=>{zoom=clamp(zoom+(e.deltaY>0?.07:-.07),.65,1.7);camera.fov=67/zoom;camera.updateProjectionMatrix();},{passive:true});
  // Directions are measured from the observer's eye (camera position), so on-screen elevations are the real ones.
  const EYE=camera.position.clone(),GROUND_Y=EYE.y-1; // observer's eyes 1 unit above the ground
  const dirFromEye=(el,az,r)=>{const e=el*Math.PI/180,a=az*Math.PI/180;return new THREE.Vector3(EYE.x+r*Math.cos(e)*Math.sin(a),EYE.y+r*Math.sin(e),EYE.z-r*Math.cos(e)*Math.cos(a));};
  function positionBody(mesh,label,el,az,r){const v=dirFromEye(el,az,r);mesh.position.copy(v);label.position.copy(v.clone().add(new THREE.Vector3(0,8,0)));}
  function update(row){positionBody(sun,sunLabel,row.sun.elevation,row.sun.azimuth,100);positionBody(earth,earthLabel,row.earth.elevation,row.earth.azimuth,103);sunLight.position.copy(sun.position);}

  // Terrain ring: the site's horizon silhouette (LOLA profile from js/data/terrain.js, or flat 0°) drawn all
  // around the observer at the same angles as the 2D panorama. It is closer than the Sun (r=100) and Earth (r=103),
  // so they disappear behind real terrain exactly when the calculation says they are hidden.
  // The terrain is a surface that rises from the observer's feet (ground plane y=0) to the horizon ridge at
  // distance TERRAIN_R, whose height gives exactly the horizon elevation of each azimuth.
  const TERRAIN_R=95,TERRAIN_STEPS=360;
  const RING_DIST=[95,86,76,66,56,47,39,32,26,21,16.5,12.5,9,6,3.6,1.8,.6];
  let terrainTex=null;try{terrainTex=new THREE.TextureLoader().load('models/moonsurface.jpg');terrainTex.wrapS=terrainTex.wrapT=THREE.RepeatWrapping;terrainTex.colorSpace=THREE.SRGBColorSpace;}catch(e){console.warn('No terrain texture',e);}
  const terrainMat=new THREE.MeshStandardMaterial({map:terrainTex,color:0xbdb8b0,roughness:1,metalness:0,side:THREE.DoubleSide});
  const ridgeMat=new THREE.LineBasicMaterial({color:0xa9c1dc,transparent:true,opacity:.7});
  // Hide the old smooth ground sphere: the terrain surface now covers everything below the horizon.
  scene.traverse(o=>{if(o.isMesh&&o.geometry?.parameters?.radius===400)o.visible=false;});
  let terrainGroup=null,terrainProfile;
  // Circular moving average of the ridge heights (window = 2*halfWidth+1 azimuth steps).
  function smoothRing(values,halfWidth){
    if(halfWidth<1)return values;
    const n=values.length,out=new Array(n);
    for(let i=0;i<n;i++){let s=0;for(let j=-halfWidth;j<=halfWidth;j++)s+=values[(i+j+n)%n];out[i]=s/(2*halfWidth+1);}
    return out;
  }
  function buildTerrain(profile){
    const N=TERRAIN_STEPS,rings=RING_DIST.length,pos=[],uv=[],idx=[],ridge=[];
    // Ridge height per azimuth: exactly the horizon angle of the profile (this is what hides the Sun/Earth).
    const yTop=Array.from({length:N},(_,i)=>EYE.y+TERRAIN_R*Math.tan((profile?horizonAt(i*360/N,profile):0)*Math.PI/180));
    // Closer rings use an increasingly smoothed ridge: the 0.5° steps of the profile would otherwise
    // run down the slope as thin bright/dark radial stripes under the directional sunlight.
    const ringHeights=RING_DIST.map((d,k)=>{
      const f=Math.pow(Math.max(0,(d-RING_DIST.at(-1))/(TERRAIN_R-RING_DIST.at(-1))),1.6);
      const smooth=smoothRing(yTop,k===0?0:Math.round(2+k*1.5));
      return smooth.map(y=>GROUND_Y+(y-GROUND_Y)*f);
    });
    for(let i=0;i<N;i++){
      const a=i*2*Math.PI/N,sinA=Math.sin(a),cosA=Math.cos(a);
      RING_DIST.forEach((d,k)=>{
        const x=EYE.x+d*sinA,z=EYE.z-d*cosA;
        pos.push(x,ringHeights[k][i],z);uv.push(x/9,z/9); // top-down texture projection: even detail everywhere
      });
      ridge.push(new THREE.Vector3(EYE.x+(TERRAIN_R-.3)*sinA,yTop[i]+.05,EYE.z-(TERRAIN_R-.3)*cosA));
    }
    ridge.push(ridge[0].clone());
    // The last column connects back to the first one (shared vertices: no lighting seam at north).
    for(let i=0;i<N;i++)for(let k=0;k<rings-1;k++){
      const a0=i*rings+k,a1=a0+1,b0=((i+1)%N)*rings+k,b1=b0+1;idx.push(a0,a1,b0,b0,a1,b1);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
    const centre=new THREE.Mesh(new THREE.CircleGeometry(RING_DIST.at(-1)+.05,48),terrainMat);centre.rotation.x=-Math.PI/2;centre.position.set(EYE.x,GROUND_Y,EYE.z);
    const group=new THREE.Group();group.add(new THREE.Mesh(geo,terrainMat),centre,new THREE.Line(new THREE.BufferGeometry().setFromPoints(ridge),ridgeMat));
    return group;
  }
  function setTerrain(profile){
    if(terrainGroup&&profile===terrainProfile)return;
    terrainProfile=profile;
    if(terrainGroup){scene.remove(terrainGroup);terrainGroup.traverse(o=>o.geometry?.dispose());}
    terrainGroup=buildTerrain(profile);scene.add(terrainGroup);
  }
  setTerrain(null);

  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};new ResizeObserver(resize).observe(host);
  const animate=()=>{requestAnimationFrame(animate);sun.rotation.y+=0.0015;earth.rotation.y+=.0015;renderer.render(scene,camera);};animate();return {scene,camera,renderer,update,setTerrain};
}

// "Link to Earth" 3D panel: a georeferenced Moon lit from the real Sun direction, the Earth in its real
// direction (turned so the hemisphere and DSN stations facing the Moon are right) and the line of sight
// from the landing site to the best DSN station (js/core/comms.js). Sizes and distance are schematic.
// Frames: IAU_MOON (x: prime meridian, z: north pole) -> three.js (x, y=z, z=-y).
async function createMoon3D(){
  if(!THREE) throw new Error('Three.js is unavailable.');
  const host=$('moonScene'),scene=new THREE.Scene();
  try{const sky=new THREE.TextureLoader().load('models/starssky.jpg');sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;scene.background=sky;}catch(e){scene.background=new THREE.Color(0x05070d);}
  const camera=new THREE.PerspectiveCamera(38,Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight),.05,300);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  const MOON_R=1,EARTH_R=1.1,EARTH_DIST=6.5,Y=new THREE.Vector3(0,1,0);
  const toThree=v=>new THREE.Vector3(v[0],v[2],-v[1]);
  const fromLatLon=(lat,lon,r=1)=>{const p=lat*DEG,l=lon*DEG;return new THREE.Vector3(r*Math.cos(p)*Math.cos(l),r*Math.sin(p),-r*Math.cos(p)*Math.sin(l));};
  const texture=path=>{try{const t=new THREE.TextureLoader().load(path);t.colorSpace=THREE.SRGBColorSpace;return t;}catch(e){console.warn('Missing texture',path,e);return null;}};

  // Lighting: the Sun is a directional light from its real direction (lunar day/night, Earth phases).
  scene.add(new THREE.AmbientLight(0xffffff,.16));
  const sunLight=new THREE.DirectionalLight(0xffffff,2.8);scene.add(sunLight,sunLight.target);

  const moon=new THREE.Mesh(new THREE.SphereGeometry(MOON_R,128,64),new THREE.MeshStandardMaterial({map:texture('models/moonsurface.jpg'),roughness:1,metalness:0}));
  scene.add(moon);

  const earth=new THREE.Group();scene.add(earth);
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_R,64,32),new THREE.MeshStandardMaterial({map:texture('models/earthsurface.jpg'),roughness:.85,metalness:0})));
  const stationMarkers=DSN_STATIONS.map(st=>{
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.06,16,12),new THREE.MeshBasicMaterial({color:0x8a94a6}));
    marker.position.copy(fromLatLon(st.lat,st.lon,EARTH_R*1.01));
    const label=makeLabelSprite(st.name.toUpperCase(),'#cfe3f7');label.scale.set(1.05,.3,1);label.position.copy(fromLatLon(st.lat,st.lon,EARTH_R*1.35));
    earth.add(marker,label);return {marker,label};
  });

  const site=new THREE.Group();scene.add(site);
  const siteDot=new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),new THREE.MeshBasicMaterial({color:0xff9e73}));
  const siteHalo=new THREE.Mesh(new THREE.SphereGeometry(.09,16,12),new THREE.MeshBasicMaterial({color:0xff9e73,transparent:true,opacity:.3}));
  site.add(siteDot,siteHalo);

  const linkGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]);
  const linkOk=new THREE.LineBasicMaterial({color:0x5ce0ae});
  const linkNo=new THREE.LineDashedMaterial({color:0xff7d89,dashSize:.18,gapSize:.12});
  const link=new THREE.Line(linkGeo,linkOk);scene.add(link);

  // Camera orbits around a point between the Moon and the Earth; drag to orbit, wheel to zoom.
  const target=new THREE.Vector3(EARTH_DIST*.5,-1.1,0); // lower target: bodies sit above the status box
  let radius=10.2,theta=0,phi=1.32;
  const updateCam=()=>{camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(target);};updateCam();
  let dragging=false,px=0,py=0;
  renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;theta-=(e.clientX-px)*.007;phi=clamp(phi+(e.clientY-py)*.007,.15,Math.PI-.15);px=e.clientX;py=e.clientY;updateCam();});
  renderer.domElement.addEventListener('pointerup',()=>dragging=false);renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
  renderer.domElement.addEventListener('wheel',e=>{radius=clamp(radius+(e.deltaY>0?.4:-.4),3,16);updateCam();},{passive:true});

  // Orthonormal basis whose first axis is `forward` and second axis is as close as possible to `upHint`.
  const basis=(forward,upHint)=>{const f=forward.clone().normalize();const u=upHint.clone().sub(f.clone().multiplyScalar(upHint.dot(f)));if(u.lengthSq()<1e-8)u.set(0,0,1);u.normalize();return new THREE.Matrix4().makeBasis(f,u,new THREE.Vector3().crossVectors(f,u));};

  function update(siteData,row){
    $('moonStatus').textContent=`${number(siteData.lat,2)}° / ${number(siteData.lon,2)}°`;
    site.position.copy(fromLatLon(siteData.lat,siteData.lon,MOON_R*1.003));
    if(!row)return;
    let sunPos,earthPos;try{sunPos=interpolateVector(row.sec,'sun');earthPos=interpolateVector(row.sec,'earth');}catch(e){return;}
    sunLight.position.copy(toThree(sunPos).normalize().multiplyScalar(30));
    const earthDir=toThree(earthPos).normalize();
    earth.position.copy(earthDir.clone().multiplyScalar(EARTH_DIST));
    // Turn the Earth so its sub-lunar point faces the Moon (north kept roughly up; schematic).
    const sl=subLunarPoint(row.dateMs);
    const rot=basis(earthDir.clone().negate(),Y).multiply(basis(fromLatLon(sl.lat,sl.lon),Y).transpose());
    earth.quaternion.setFromRotationMatrix(rot);
    // Stations and link
    const state=linkState(row);
    state.stations.forEach((st,i)=>stationMarkers[i].marker.material.color.set(st.inView?0x5ce0ae:0x8a94a6));
    earth.updateMatrixWorld(true);
    const end=state.best?stationMarkers[DSN_STATIONS.findIndex(s=>s.name===state.best.name)].marker.getWorldPosition(new THREE.Vector3()):earth.position.clone();
    linkGeo.setFromPoints([site.position.clone(),end]);
    link.material=state.ok?linkOk:linkNo;if(!state.ok)link.computeLineDistances();
    siteDot.material.color.set(state.ok?0x5ce0ae:0xff9e73);siteHalo.material.color.set(state.ok?0x5ce0ae:0xff9e73);
  }
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};new ResizeObserver(resize).observe(host);
  const animate=()=>{requestAnimationFrame(animate);renderer.render(scene,camera);};animate();
  return {scene,camera,renderer,update};
}
function updateSky3D(row){if(sky3d)sky3d.update(row);else fallbackVisuals?.updateSky(row)}function updateMoon3D(site,row){if(moon3d)moon3d.update(site,row);else fallbackVisuals?.updateMoon(site)}
function createFallbackVisuals(){
  function makeCanvas(host){const c=document.createElement('canvas');c.style.width='100%';c.style.height='100%';c.width=host.clientWidth*devicePixelRatio;c.height=host.clientHeight*devicePixelRatio;host.appendChild(c);return c;}
  const sky=makeCanvas($('skyScene')),moon=makeCanvas($('moonScene'));
  const skyCtx=sky.getContext('2d'),moonCtx=moon.getContext('2d');
  function resize(){for(const [c,host] of [[sky,$('skyScene')],[moon,$('moonScene')]]){c.width=Math.max(1,host.clientWidth*devicePixelRatio);c.height=Math.max(1,host.clientHeight*devicePixelRatio);}}
  new ResizeObserver(resize).observe($('skyScene'));new ResizeObserver(resize).observe($('moonScene'));
  function drawSky(row){resize();const w=sky.width,h=sky.height,ctx=skyCtx;ctx.clearRect(0,0,w,h);const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#0b0718');bg.addColorStop(.66,'#251638');bg.addColorStop(.67,'#393047');bg.addColorStop(1,'#090612');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);for(let i=0;i<180;i++){const x=(i*137.5%w),y=(i*67.3%h*.62);ctx.fillStyle=`rgba(210,230,255,${.2+(i%5)*.1})`;ctx.fillRect(x,y,2*devicePixelRatio,2*devicePixelRatio);}const hz=h*.68;ctx.strokeStyle='#5ce0ae';ctx.lineWidth=2*devicePixelRatio;ctx.beginPath();ctx.moveTo(0,hz);ctx.lineTo(w,hz);ctx.stroke();ctx.fillStyle='#393047';ctx.beginPath();ctx.moveTo(0,hz);for(let x=0;x<=w;x+=w/24)ctx.lineTo(x,hz-5*devicePixelRatio-Math.abs(Math.sin(x*.031))*12*devicePixelRatio);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();function body(b,color,label){const az=b.azimuth*Math.PI/180,el=b.elevation*Math.PI/180;const x=w/2+Math.sin(az)*(w*.43),y=hz-Math.tan(el)*(h*.68);ctx.strokeStyle=color;ctx.setLineDash([5*devicePixelRatio,5*devicePixelRatio]);ctx.beginPath();ctx.moveTo(x,hz);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18*devicePixelRatio;ctx.beginPath();ctx.arc(x,y,7*devicePixelRatio,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.font=`bold ${12*devicePixelRatio}px system-ui`;ctx.fillText(`${label} ${number(b.elevation,1)}°`,x+10*devicePixelRatio,y-8*devicePixelRatio);}body(row.sun,'#ffc66d','SUN');body(row.earth,'#55b9ff','EARTH');ctx.fillStyle='#b6a5cc';ctx.font=`${10*devicePixelRatio}px system-ui`;ctx.fillText('N',12*devicePixelRatio,hz+18*devicePixelRatio);ctx.fillText('S',w-20*devicePixelRatio,hz+18*devicePixelRatio);}
  function drawMoon(site){resize();const w=moon.width,h=moon.height,ctx=moonCtx;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b0718';ctx.fillRect(0,0,w,h);const r=Math.min(w,h)*.36,cx=w*.5,cy=h*.52;const g=ctx.createRadialGradient(cx-r*.35,cy-r*.4,r*.05,cx,cy,r);g.addColorStop(0,'#bec1c2');g.addColorStop(.65,'#747c84');g.addColorStop(1,'#303946');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();for(let i=0;i<90;i++){const a=i*2.399,rr=Math.sqrt((i+.5)/90)*r*.94,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr,cr=2+(i*7%13)*devicePixelRatio;ctx.fillStyle='rgba(25,31,39,.22)';ctx.beginPath();ctx.arc(x,y,cr,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(235,238,238,.16)';ctx.stroke();}const lat=site.lat*Math.PI/180,lon=site.lon*Math.PI/180;const x=cx+Math.cos(lat)*Math.sin(lon)*r,y=cy-Math.sin(lat)*r;ctx.fillStyle='#ff9872';ctx.shadowColor='#ff9872';ctx.shadowBlur=20*devicePixelRatio;ctx.beginPath();ctx.arc(x,y,6*devicePixelRatio,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#e9f1fa';ctx.font=`${11*devicePixelRatio}px system-ui`;ctx.fillText(`${number(site.lat,2)}° / ${number(site.lon,2)}°`,x+12*devicePixelRatio,y-9*devicePixelRatio);}
  return {updateSky:drawSky,updateMoon:drawMoon};
}
