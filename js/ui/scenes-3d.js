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
  const loader=new THREE.TextureLoader();let moonTex=null;try{moonTex=loader.load('models/moonsurface.jpg');}catch(e){console.warn('No se pudo cargar models/moonsurface.jpg',e);}const geometry=new THREE.SphereGeometry(400,64,64),mat=new THREE.MeshStandardMaterial({map:moonTex,roughness:1,metalness:0});const ground=new THREE.Mesh(geometry,mat);ground.position.set(0,-413,0);scene.add(ground);

}
function createSky3D(){
  if(!THREE) throw new Error('Three.js is unavailable.');
  const host=$('skyScene');const scene=new THREE.Scene();const skyLoader=new THREE.TextureLoader();let skyTex=null;try{skyTex=skyLoader.load('models/starssky.jpg');skyTex.mapping=THREE.EquirectangularReflectionMapping;scene.background=skyTex;}catch(e){console.warn('No se pudo cargar models/starssky.jpg',e);scene.background=new THREE.Color(0x0b0718);}

  const camera=new THREE.PerspectiveCamera(67,host.clientWidth/host.clientHeight,.1,500);camera.position.set(0,1,0);camera.rotation.order='YXZ';camera.rotation.x=-.045;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff,.25));makeGround(scene);
  const sunLight=new THREE.DirectionalLight(0xffffff,3);sunLight.target.position.set(0,0,0);scene.add(sunLight);scene.add(sunLight.target);
  const sunLoader=new THREE.TextureLoader();let sunTex=null;try{sunTex=sunLoader.load('models/sunsurface.jpg');}catch(e){console.warn('No se pudo cargar models/sunsurface.jpg',e);}const sun=new THREE.Mesh(new THREE.SphereGeometry(3.4,32,32),new THREE.MeshBasicMaterial({map:sunTex}));scene.add(sun);const sunLabel=makeLabelSprite('SUN','#ffd27a');scene.add(sunLabel);
  const earthLoader=new THREE.TextureLoader();let earthTex=null;try{earthTex=earthLoader.load('models/earthsurface.jpg');}catch(e){console.warn('No se pudo cargar models/earthsurface.jpg',e);}const earth=new THREE.Group();const earthMesh=new THREE.Mesh(new THREE.SphereGeometry(3.7,40,32),new THREE.MeshBasicMaterial({map:earthTex}));earth.add(earthMesh);scene.add(earth);const earthLabel=makeLabelSprite('EARTH','#81d4ff');scene.add(earthLabel);
  let dragging=false,px=0,py=0,yaw=0,pitch=-.05,zoom=1;
  const down=e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!dragging)return;yaw-=(e.clientX-px)*.005;pitch=clamp(pitch+(e.clientY-py)*.005,-1.25,1.25);px=e.clientX;py=e.clientY;camera.rotation.set(pitch,yaw,0,'YXZ');};
  const up=()=>dragging=false;
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',up);
  renderer.domElement.addEventListener('wheel',e=>{zoom=clamp(zoom+(e.deltaY>0?.07:-.07),.65,1.7);camera.fov=67/zoom;camera.updateProjectionMatrix();},{passive:true});
  function positionBody(mesh,label,el,az,r){const e=el*Math.PI/180,a=az*Math.PI/180;const v=new THREE.Vector3(r*Math.cos(e)*Math.sin(a),r*Math.sin(e),-r*Math.cos(e)*Math.cos(a));mesh.position.copy(v);label.position.copy(v.clone().add(new THREE.Vector3(0,8,0)));}
  function update(row){positionBody(sun,sunLabel,row.sun.elevation,row.sun.azimuth,100);positionBody(earth,earthLabel,row.earth.elevation,row.earth.azimuth,103);sunLight.position.copy(sun.position);}
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};new ResizeObserver(resize).observe(host);
  const animate=()=>{requestAnimationFrame(animate);sun.rotation.y+=0.0015;earth.rotation.y+=.0015;renderer.render(scene,camera);};animate();return {scene,camera,renderer,update};
}

// 3D Moon globe: crater-texture is procedural, not LOLA.
async function createMoon3D(){
  if(!THREE) throw new Error('Three.js is unavailable.');
  if(!GLTFLoader) throw new Error('GLTFLoader is unavailable.');
  const host=$('moonScene'),scene=new THREE.Scene();scene.background=new THREE.Color(0x0b0718);
  const camera=new THREE.PerspectiveCamera(43,host.clientWidth/host.clientHeight,.1,100);let radius=3.5,theta=.5,phi=1.1;
  const updateCam=()=>{camera.position.set(radius*Math.sin(phi)*Math.sin(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(0,0,0);};updateCam();
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff,.25));
  const siteTarget=new THREE.Object3D();scene.add(siteTarget);
  const siteLight=new THREE.SpotLight(0xfff0d0,12,18,Math.PI*8/180,.5,1);siteLight.target=siteTarget;scene.add(siteLight);
  let moonMesh=null;
  await new Promise((resolve,reject)=>{new GLTFLoader().load('models/moon.glb',gltf=>{const model=gltf.scene;model.scale.set(1.27,1.27,1.27);scene.add(model);moonMesh=model;resolve();},undefined,reject);});
  const axes=new THREE.AxesHelper(1.65);axes.material.transparent=true;axes.material.opacity=.22;scene.add(axes);
  let dragging=false,px=0,py=0;renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);});renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;theta-=(e.clientX-px)*.007;phi=clamp(phi+(e.clientY-py)*.007,.15,Math.PI-.15);px=e.clientX;py=e.clientY;updateCam();});renderer.domElement.addEventListener('pointerup',()=>dragging=false);renderer.domElement.addEventListener('pointercancel',()=>dragging=false);renderer.domElement.addEventListener('wheel',e=>{radius=clamp(radius+(e.deltaY>0?.18:-.18),1.8,7);updateCam();},{passive:true});
  function update(site){const lat=site.lat*Math.PI/180,lon=site.lon*Math.PI/180;const n=new THREE.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon));const p=n.clone().multiplyScalar(1.30);siteLight.position.copy(n).multiplyScalar(2.6);siteTarget.position.copy(p);$('moonStatus').textContent=`${number(site.lat,2)}° / ${number(site.lon,2)}°`}
  const resize=()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);};new ResizeObserver(resize).observe(host);
  const animate=()=>{requestAnimationFrame(animate);if(moonMesh)moonMesh.rotation.y+=.0007;renderer.render(scene,camera);};animate();return {scene,camera,renderer,update};
}
function updateSky3D(row){if(sky3d)sky3d.update(row);else fallbackVisuals?.updateSky(row)}function updateMoon3D(site){if(moon3d)moon3d.update(site);else fallbackVisuals?.updateMoon(site)}
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
