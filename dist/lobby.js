(()=>{"use strict";var e={"./packages/table-tennis/src/browser/glass-styles.ts"(e,t,a){let r=`
[data-glass-theme] {
  --glass-ink: #172d40;
  --glass-muted: #455c70;
  --glass-tint: rgb(229 248 253 / 8%);
  --glass-rim: rgb(255 255 255 / 76%);
  --glass-accent: #087586;
  --glass-edge-light: #53d7e1, #a6a3f5 42%, #ee9cd9 74%, transparent;
  --glass-shadow: 0 10px 30px rgb(25 59 82 / 11%);
}

[data-glass-theme="dark"] {
  --glass-ink: #eef8ff;
  --glass-muted: #bfd0e0;
  --glass-tint: rgb(14 28 45 / 10%);
  --glass-rim: rgb(222 242 255 / 38%);
  --glass-accent: #74e1e6;
  --glass-edge-light: white, rgb(255 255 255 / 80%) 40%, transparent;
  --glass-shadow: 0 12px 36px rgb(0 0 0 / 16%);
}

[data-glass-palette="violet"] { --glass-accent: #7854b5; }
[data-glass-theme="dark"][data-glass-palette="violet"] { --glass-accent: #d1b6ff; }
[data-glass-palette="sunrise"] { --glass-accent: #a94c22; }
[data-glass-theme="dark"][data-glass-palette="sunrise"] { --glass-accent: #ffbb8e; }

.caesar-optical-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100dvh;
  pointer-events: none;
}

.caesar-surface {
  --glass-energy: 0;
}

.caesar-surface--static { position: relative; }

.caesar-surface::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  padding: 1.5px;
  border-radius: inherit;
  background: radial-gradient(190px circle at var(--glass-x, 50%) var(--glass-y, 50%), var(--glass-edge-light));
  content: "";
  pointer-events: none;
  opacity: var(--glass-energy);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  transition: opacity 450ms ease-out;
}

[data-glass-rim="false"] .caesar-surface::after,
[data-glass-motion="false"] .caesar-surface::after { display: none; }
[data-glass-rim="true"][data-glass-motion="true"] :is(input,select,textarea).caesar-surface {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--glass-accent) calc(var(--glass-energy) * 65%), transparent);
}

[data-glass] {
  border: 1px solid var(--glass-rim);
  background: var(--glass-tint);
  color: var(--glass-ink);
  box-shadow: var(--glass-shadow), inset 0 1px rgb(255 255 255 / 42%), inset 0 -1px rgb(30 56 77 / 12%);
  backdrop-filter: blur(5px) saturate(1.06);
}

[data-optical-ready="true"] { backdrop-filter: none; }
[data-optical-ready="true"] { background: transparent; }
[data-glass-motion="false"] *, [data-glass-motion="false"] *::before, [data-glass-motion="false"] *::after {
  animation: none !important;
  transition: none !important;
}
[data-glass-motion="false"] :is(button,a,summary):active { transform: none !important; scale: 1 !important; }
.tt-modal > .tt-panel, .platform-modal > .platform-modal__card { position: relative; z-index: 1; }
.tt-modal > .tt-panel[data-optical-ready="true"] { background: rgb(6 16 25 / 14%); text-shadow: 0 1px 2px rgb(0 8 16 / 28%); }
.tt-modal > .caesar-optical-layer, .platform-modal > .caesar-optical-layer { z-index: 0; }
[data-glass-motion="true"] button.caesar-surface { transition: box-shadow 250ms, scale 180ms cubic-bezier(.2,.8,.3,1.3); }
[data-glass-motion="true"] button.caesar-surface[data-glass-pressed] { scale: .985; }

@media (prefers-reduced-motion: reduce) {
  .caesar-surface, .caesar-surface::after { transition: none !important; }
}
`;a.d(t,["d",0,r])},"./packages/table-tennis/src/browser/glass.ts"(e,t,a){a.d(t,{IW:()=>mountGlassOverlay,XE:()=>readGlassPreferences,rG:()=>isDarkGlass});var r=a("./packages/table-tennis/src/browser/glass-styles.ts");let s="bb-glass-change";function readGlassPreferences(){let e={};try{e=JSON.parse(localStorage.getItem("break-builder-glass-v1")||"{}")||{}}catch{}return{theme:["light","dark"].includes(e.theme||"")?e.theme:"system",palette:["violet","sunrise"].includes(e.palette||"")?e.palette:"lagoon",atmosphere:"classic"===e.atmosphere?"classic":"fluid",rimLight:!1!==e.rimLight,materialMotion:!1!==e.materialMotion,aurora:!1!==e.aurora,meteors:!1!==e.meteors}}function isDarkGlass(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:readGlassPreferences();return"dark"===e.theme||"system"===e.theme&&matchMedia("(prefers-color-scheme: dark)").matches}let i=`#version 300 es
in vec2 position;
void main(){ gl_Position=vec4(position,0.,1.); }`,o=`#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
uniform vec4 sourceBounds;
uniform vec4 region;
uniform float radius;
uniform float strength;
uniform float edgeWidth;
uniform vec3 pointer;
uniform float dark;
uniform float time;
uniform float motion;
uniform float modal;
out vec4 color;
float roundedDistance(vec2 p, vec2 halfSize, float r){
  vec2 q=abs(p)-(halfSize-r);
  return length(max(q,0.))+min(max(q.x,q.y),0.)-r;
}
void main(){
  vec2 p=gl_FragCoord.xy;
  vec2 local=p-region.xy-region.zw*.5;
  vec2 halfSize=region.zw*.5;
  float d=roundedDistance(local,halfSize,radius);
  if(d>0.) discard;
  // The SDF gradient follows the actual rounded edge, not a radial oval.
  vec2 normal=normalize(vec2(
    roundedDistance(local+vec2(.5,0.),halfSize,radius)-roundedDistance(local-vec2(.5,0.),halfSize,radius),
    roundedDistance(local+vec2(0.,.5),halfSize,radius)-roundedDistance(local-vec2(0.,.5),halfSize,radius)
  )+vec2(.00001));
  float band=1.-smoothstep(0.,edgeWidth,-d);
  float bevel=sin(clamp(-d/edgeWidth,0.,1.)*3.14159);
  float touch=exp(-length(p-pointer.xy)/140.)*pointer.z;
  float flow=sin(dot(p,vec2(.018,.012))-time*.7)*.12*motion;
  vec2 uv=(p-sourceBounds.xy)/sourceBounds.zw;
  // The centre is an undistorted sample; only the narrow bevel bends the scene.
  vec2 offset=normal*bevel*strength*(1.+touch*.35+flow)/sourceBounds.zw;
  vec3 refracted=vec3(texture(scene,clamp(uv+offset*1.18,.001,.999)).r,
    texture(scene,clamp(uv+offset,.001,.999)).g,
    texture(scene,clamp(uv+offset*.82,.001,.999)).b);
  if(modal>.5){
    // Match the surrounding scrim's soft scene, rather than cut a sharp window
    // through it. Bright armour must not compete with small white labels.
    vec2 soft=vec2(5.)/sourceBounds.zw;
    vec2 sampleAt=uv+offset;
    refracted=refracted*.4+
      texture(scene,clamp(sampleAt+vec2(soft.x,soft.y),.001,.999)).rgb*.15+
      texture(scene,clamp(sampleAt+vec2(-soft.x,soft.y),.001,.999)).rgb*.15+
      texture(scene,clamp(sampleAt+vec2(soft.x,-soft.y),.001,.999)).rgb*.15+
      texture(scene,clamp(sampleAt-soft,.001,.999)).rgb*.15;
    if(dark>.5) refracted=refracted/(vec3(1.)+refracted*1.3);
    else refracted=mix(refracted,vec3(.88,.94,.96),.38);
  }
  float outer=exp(-abs(d+1.)*1.4);
  float inner=exp(-abs(d+edgeWidth*.8)*1.1);
  float light=max(0.,dot(normal,normalize(vec2(-.7,1.))));
  float reflection=outer*(.14+light*.18)+inner*.045+band*touch*.12;
  vec3 reflected=mix(vec3(.65,.91,1.),vec3(1.),dark);
  refracted*=1.-bevel*.07;
  color=vec4(refracted+reflected*reflection,(1.-smoothstep(-1.,0.,d))*.98);
}`;function compile(e,t,a){let r=e.createShader(t);return(e.shaderSource(r,a),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS))?r:(e.deleteShader(r),null)}function opticalPriority(e){return e.closest("[role='dialog'],.platform-modal,.tt-modal")?100:e.closest("details[open]")?80:e.matches(".holo-topbar,.tt-scoreboard")?30:10}function mountGlassOverlay(e,t){let a=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{},n=a.selector||"[data-glass], button, a, input, select, textarea, summary",l=document.createElement("style");l.textContent=r.d,e.append(l);let c=document.createElement("canvas");c.className="caesar-optical-layer",c.setAttribute("aria-hidden","true"),e.prepend(c);let d="low"===a.quality?null:c.getContext("webgl2",{alpha:!0,antialias:!1,depth:!1,powerPreference:"low-power"}),p=null,u=null,m=null,h={},f=!1,initialize=()=>{if(!d)return;let e=compile(d,d.VERTEX_SHADER,i),t=compile(d,d.FRAGMENT_SHADER,o);if(!e||!t){e&&d.deleteShader(e),t&&d.deleteShader(t);return}if(p=d.createProgram(),d.attachShader(p,e),d.attachShader(p,t),d.linkProgram(p),d.deleteShader(e),d.deleteShader(t),!d.getProgramParameter(p,d.LINK_STATUS)){d.deleteProgram(p),p=null;return}d.useProgram(p),m=d.createBuffer(),d.bindBuffer(d.ARRAY_BUFFER,m),d.bufferData(d.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),d.STATIC_DRAW);let a=d.getAttribLocation(p,"position");d.enableVertexAttribArray(a),d.vertexAttribPointer(a,2,d.FLOAT,!1,0,0),u=d.createTexture(),d.bindTexture(d.TEXTURE_2D,u),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MIN_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_MAG_FILTER,d.LINEAR),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_S,d.CLAMP_TO_EDGE),d.texParameteri(d.TEXTURE_2D,d.TEXTURE_WRAP_T,d.CLAMP_TO_EDGE),d.pixelStorei(d.UNPACK_FLIP_Y_WEBGL,!0),h=Object.fromEntries(["scene","resolution","sourceBounds","region","radius","strength","edgeWidth","pointer","dark","time","motion","modal"].map(e=>[e,d.getUniformLocation(p,e)]))};initialize();let v=readGlassPreferences(),g=matchMedia("(prefers-reduced-motion: reduce)"),y=matchMedia("(prefers-color-scheme: dark)"),b=[],_=null,w=!1,S=-1/0,x=0,E={x:innerWidth/2,y:innerHeight/2,energy:0},T={...E},L=0,k=performance.now(),updateTheme=()=>{v=readGlassPreferences(),e.dataset.glassTheme=isDarkGlass(v)?"dark":"light",e.dataset.glassPalette=v.palette,e.dataset.glassMotion=String(v.materialMotion&&!g.matches&&!a.reducedMotion),e.dataset.glassRim=String(v.rimLight),S=-1/0,v.rimLight&&"false"!==e.dataset.glassMotion||clearPointer()},clearPointer=()=>{null==_||_.style.setProperty("--glass-energy","0"),null==_||_.removeAttribute("data-glass-pressed"),_=null,T.energy=0},discover=()=>{e.querySelectorAll(".tt-panel,.platform-modal__card").forEach(e=>{e.dataset.glass="optical"}),(b=Array.from(e.querySelectorAll(n))).forEach(e=>{e.classList.add("caesar-surface"),"static"===getComputedStyle(e).position&&e.classList.add("caesar-surface--static")}),S=-1/0,a.inGame||window.dispatchEvent(new Event("bb-glass-redraw"))},onPointer=t=>{var a;if(!v.rimLight||"false"===e.dataset.glassMotion)return;let r=null==(a=t.target)?void 0:a.closest(n);if(r!==_&&clearPointer(),!r||!e.contains(r))return;_=r,T.x=t.clientX,T.y=t.clientY,T.energy=1;let s=r.getBoundingClientRect();r.style.setProperty("--glass-x","".concat(t.clientX-s.left,"px")),r.style.setProperty("--glass-y","".concat(t.clientY-s.top,"px")),r.style.setProperty("--glass-energy","1"),r.toggleAttribute("data-glass-pressed",t.buttons>0)},release=e=>{"touch"===e.pointerType||"pointercancel"===e.type?clearPointer():(null==_||_.removeAttribute("data-glass-pressed"),T.energy=.45)};updateTheme(),discover();let P=new MutationObserver(e=>{e.some(e=>"attributes"===e.type&&e.target instanceof Element&&e.target.matches("[data-glass],details,.tt-modal,.platform-modal,[role='dialog']")||[...e.addedNodes,...e.removedNodes].some(e=>e instanceof Element))&&discover()});P.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["hidden","open","aria-hidden"]}),e.addEventListener("pointermove",onPointer,{passive:!0}),e.addEventListener("pointerdown",onPointer,{passive:!0}),e.addEventListener("pointerup",release,{passive:!0}),e.addEventListener("pointercancel",release,{passive:!0}),e.addEventListener("pointerleave",clearPointer),window.addEventListener("blur",clearPointer),window.addEventListener(s,updateTheme),window.addEventListener("storage",updateTheme),g.addEventListener("change",updateTheme),y.addEventListener("change",updateTheme);let onLost=e=>{e.preventDefault(),f=!0,b.forEach(e=>e.removeAttribute("data-optical-ready"))},onRestored=()=>{f=!1,initialize(),S=-1/0};c.addEventListener("webglcontextlost",onLost),c.addEventListener("webglcontextrestored",onRestored);let onScroll=()=>{S=-1/0,cancelAnimationFrame(x),x=requestAnimationFrame(()=>{a.inGame||window.dispatchEvent(new Event("bb-glass-redraw"))})};return window.addEventListener("scroll",onScroll,{passive:!0,capture:!0}),e.addEventListener("toggle",onScroll,!0),{render:function(){var r;let s=arguments.length>0&&void 0!==arguments[0]?arguments[0]:performance.now();if(w||!d||!p||f||document.hidden||s-S<1e3/30||!t.width||t.classList.contains("spectra-fx--fallback"))return;S=s;let i=Math.min(.1,Math.max(0,s-k)/1e3);k=s;let o="true"===e.dataset.glassMotion;o&&(L+=i);let n=1-Math.exp(-(18*i));E.x+=(T.x-E.x)*n,E.y+=(T.y-E.y)*n,E.energy+=((o?T.energy:0)-E.energy)*n;let l=Math.min(devicePixelRatio||1,"high"===a.quality?1.25:1),m=b.filter(e=>"optical"===e.dataset.glass&&e.getClientRects().length>0&&!e.closest("details:not([open]),[hidden],[aria-hidden='true']")).filter(e=>{let t=e.getBoundingClientRect();return t.bottom>0&&t.top<innerHeight&&t.right>0&&t.left<innerWidth}).sort((e,t)=>opticalPriority(t)-opticalPriority(e)).slice(0,3),g=null==(r=m.find(e=>e.closest("[role='dialog'],.platform-modal,.tt-modal")))?void 0:r.closest("[role='dialog'],.platform-modal,.tt-modal");m=m.filter(e=>!g||g.contains(e));let y=g||e;c.parentElement!==y&&y.prepend(c);let _=c.getBoundingClientRect(),x=Math.max(1,Math.round(_.width*l)),P=Math.max(1,Math.round(_.height*l));(c.width!==x||c.height!==P)&&(c.width=x,c.height=P);let C=x/Math.max(1,_.width),R=P/Math.max(1,_.height);if(d.viewport(0,0,x,P),d.disable(d.SCISSOR_TEST),d.clearColor(0,0,0,0),d.clear(d.COLOR_BUFFER_BIT),b.forEach(e=>{m.includes(e)||e.removeAttribute("data-optical-ready")}),!m.length)return;d.useProgram(p),d.bindTexture(d.TEXTURE_2D,u);try{d.texImage2D(d.TEXTURE_2D,0,d.RGBA,d.RGBA,d.UNSIGNED_BYTE,t)}catch{b.forEach(e=>e.removeAttribute("data-optical-ready"));return}d.uniform1i(h.scene,0),d.uniform2f(h.resolution,x,P);let q=t.getBoundingClientRect();for(let e of(d.uniform4f(h.sourceBounds,(q.left-_.left)*C,(_.bottom-q.bottom)*R,q.width*C,q.height*R),d.uniform1f(h.strength,(a.inGame?2.2:11)*l),d.uniform1f(h.edgeWidth,(a.inGame?7:14)*l),d.uniform3f(h.pointer,(E.x-_.left)*C,(_.bottom-E.y)*R,E.energy),d.uniform1f(h.dark,Number(a.inGame||isDarkGlass(v))),d.uniform1f(h.time,L),d.uniform1f(h.motion,o&&!a.inGame?1:0),d.uniform1f(h.modal,+!!g),d.enable(d.SCISSOR_TEST),m)){let t=e.getBoundingClientRect(),a=(t.left-_.left)*C,r=(_.bottom-t.bottom)*R;d.scissor(Math.max(0,Math.floor(a)),Math.max(0,Math.floor(r)),Math.ceil(t.width*C),Math.ceil(t.height*R)),d.uniform4f(h.region,a,r,t.width*C,t.height*R),d.uniform1f(h.radius,Math.min(parseFloat(getComputedStyle(e).borderTopLeftRadius)||0,t.height/2)*l),d.drawArrays(d.TRIANGLES,0,6),e.dataset.opticalReady="true"}d.disable(d.SCISSOR_TEST)},dispose(){w=!0,cancelAnimationFrame(x),P.disconnect(),clearPointer(),e.removeEventListener("pointermove",onPointer),e.removeEventListener("pointerdown",onPointer),e.removeEventListener("pointerup",release),e.removeEventListener("pointercancel",release),e.removeEventListener("pointerleave",clearPointer),window.removeEventListener("blur",clearPointer),window.removeEventListener(s,updateTheme),window.removeEventListener("storage",updateTheme),window.removeEventListener("scroll",onScroll,!0),e.removeEventListener("toggle",onScroll,!0),g.removeEventListener("change",updateTheme),y.removeEventListener("change",updateTheme),c.removeEventListener("webglcontextlost",onLost),c.removeEventListener("webglcontextrestored",onRestored),b.forEach(e=>{e.classList.remove("caesar-surface","caesar-surface--static"),e.removeAttribute("data-optical-ready")}),d&&(d.deleteTexture(u),d.deleteBuffer(m),d.deleteProgram(p)),c.remove(),l.remove()}}}a.d(t,["fZ",0,s])},"./src/launcherconfig.ts"(e,t,a){a.d(t,{iv:()=>buildGameUrl,wX:()=>tableTennisRoomUrl});var r=a("./src/network/client/roomidentity.ts");function tableTennisRoomUrl(e){let t=new URLSearchParams({mode:"online",room:e.id,code:e.code,environment:e.environmentStyle});return"/table-tennis?".concat(t)}function normaliseRoomCode(e){try{return(0,r.FV)(e)}catch{return e.normalize("NFKC").trim().replace(/\s+/gu," ")}}async function buildGameUrl(e,t){var a,r,s;let i=new URL(t);if(i.search="",i.hash="",i.searchParams.set("play","1"),i.searchParams.set("ruletype",e.rule),i.searchParams.set("quality",e.quality),i.searchParams.set("camera","2d"),e.cueStyle&&i.searchParams.set("cueStyle",e.cueStyle),e.tableStyle&&i.searchParams.set("tableStyle",e.tableStyle),e.environmentStyle&&i.searchParams.set("environment",e.environmentStyle),"practice"===e.opponent)i.searchParams.set("practice","true");else if("local"===e.opponent)i.searchParams.set("local","true"),i.searchParams.set("practice","false"),i.searchParams.set("p1Name",(null==(a=e.player1Name)?void 0:a.trim())||"玩家一"),i.searchParams.set("p2Name",(null==(r=e.player2Name)?void 0:r.trim())||"玩家二"),i.searchParams.set("p1Cue",e.player1Cue||"heritage"),i.searchParams.set("p2Cue",e.player2Cue||"jade");else if("online"===e.opponent){if(!e.roomInstanceId)throw Error("在线房间尚未创建或加入");i.searchParams.set("practice","false"),i.searchParams.set("roomId",e.roomInstanceId),i.searchParams.set("tableId",e.roomInstanceId),i.searchParams.set("roomCode",normaliseRoomCode(null!=(s=e.roomCode)?s:"")),i.searchParams.set("roomVersion",String(2)),i.searchParams.set("roomInstance",e.roomInstanceId),i.searchParams.set("rack","1")}else{let t=Math.max(1,Math.min(11,Math.round(e.botLevel)));i.searchParams.set("bot",t>=6?"TheFarJaw":"ClawBreak"),i.searchParams.set("botLevel",t.toString()),i.searchParams.set("practice","false")}return i.toString()}},"./src/network/client/roomidentity.ts"(e,t,a){function isForbiddenRoomCodeCharacter(e){var t;let a=null!=(t=e.codePointAt(0))?t:0;return a<=31||173===a||1564===a||6158===a||a>=127&&a<=159||8203===a||8204===a||8206===a||8207===a||a>=8234&&a<=8238||8288===a||a>=8294&&a<=8297||65279===a}function visibleCharacterCount(e){let t=Intl.Segmenter;return t?Array.from(new t(void 0,{granularity:"grapheme"}).segment(e)).length:Array.from(e).length}function normaliseDisplayRoomCode(e){let t=e.normalize("NFKC").trim().replace(/\s+/gu," ");if(Array.from(t).some(isForbiddenRoomCodeCharacter))throw Error("房间码不能包含控制字符或不可见方向字符");let a=visibleCharacterCount(t);if(0===a)throw Error("请输入房间码");if(a>24)throw Error("房间码最多 ".concat(24," 个字符"));return t}a.d(t,{FV:()=>normaliseDisplayRoomCode})},"./src/platform/api.ts"(e,t,a){function _define_property(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}a.d(t,{L6:()=>loadSession,S9:()=>isPlatformPreview,TR:()=>apiJson,hD:()=>ApiError,x5:()=>isLocalDemo});let ApiError=class ApiError extends Error{constructor(e,t,a,r=[]){super(a),_define_property(this,"status",void 0),_define_property(this,"code",void 0),_define_property(this,"fields",void 0),this.status=e,this.code=t,this.fields=r}};async function apiJson(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},a=new Headers(t.headers);!t.body||t.body instanceof FormData||a.has("content-type")||a.set("content-type","application/json");let r=await fetch(e,{...t,credentials:"same-origin",headers:a}),s=await r.json().catch(()=>({error:{code:"invalid_response",message:"服务响应无效"}}));if(!r.ok){var i,o,n,l,c;throw new ApiError(r.status,null!=(i=null==s||null==(l=s.error)?void 0:l.code)?i:"request_failed",null!=(o=null==s||null==(c=s.error)?void 0:c.message)?o:"请求失败",null!=(n=null==s?void 0:s.fields)?n:[])}return s}function isLocalDemo(){let e=globalThis.location.hostname;return("localhost"===e||"127.0.0.1"===e)&&"1"===new URLSearchParams(globalThis.location.search).get("platformDemo")}function demoSession(){return{session:{expiresAt:new Date(Date.now()+864e5).toISOString()},user:{id:"00000000-0000-4000-8000-000000000001",email:"demo@local.invalid",username:"future_player",displayName:"未来玩家",role:"admin",approvalStatus:"approved",visibility:"online",avatarUrl:null,bio:"",accent:"ocean",cueStyle:"heritage",tableStyle:"american-ivory",environmentStyle:"spectra",language:"zh-CN",mutedUntil:null,bannedUntil:null},preferences:{reduced_motion:0,quality:"high",desktop_shot_dock:"expanded",touch_shot_dock:"expanded",camera_mode:"top",master_volume:.8,social_drawer_open:1,admin_demo_offline_enabled:0,admin_demo_online_enabled:0,admin_demo_level:11},capabilities:{offline:!0,online:!0,social:!0,admin:!0,adminDemoAssist:!0},turnstileSiteKey:null,announcements:[]}}function isPlatformPreview(){return new URLSearchParams(globalThis.location.search).has("platformPreview")}async function loadSession(){if(isLocalDemo())return demoSession();try{return await apiJson("/api/me")}catch(e){if(e instanceof ApiError&&401===e.status)return null;throw e}}},"./src/platform/fx.ts"(e,t,a){a.d(t,{W:()=>mountSpectraFx});var r=a("./packages/table-tennis/src/browser/glass.ts");let s=`#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`,i=`#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_motion;
uniform float u_dark;
uniform float u_palette;
uniform float u_fluid;
uniform float u_aurora;
uniform float u_meteors;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.62, 1.21, -1.21, 1.62) * p + 0.17;
    amplitude *= 0.5;
  }
  return value;
}

float fogOrb(vec2 p, vec2 center, float radius, float warp) {
  vec2 q = p - center;
  q += (fbm(p * 2.5 + warp) - 0.5) * 0.23;
  return smoothstep(radius, 0.0, length(q));
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.045;
  vec2 pointer = (u_pointer - 0.5) * vec2(0.38, 0.28);
  float field = fbm(p * 2.1 + vec2(t, -t * 0.72) + pointer);
  float cyanFog = fogOrb(p, vec2(-0.50, 0.22) + pointer * 0.3, 0.78, t);
  float violetFog = fogOrb(p, vec2(0.34, -0.27), 0.66, t + 4.0);
  float orangeFog = fogOrb(p, vec2(0.56, 0.18), 0.72, t + 8.0);
  float ribbon = sin((p.x + field * 0.42) * 6.4 - t * 3.6) * 0.5 + 0.5;
  ribbon = smoothstep(0.52, 0.92, ribbon) * smoothstep(0.02, 0.92, uv.y);
  vec3 paper = vec3(0.88, 0.94, 0.96);
  vec3 cyan = vec3(0.12, 0.84, 0.91);
  vec3 violet = vec3(0.47, 0.31, 0.98);
  vec3 orange = vec3(.94, .63, .81);
  if(u_palette > .5 && u_palette < 1.5) { cyan=vec3(.55,.58,.92); violet=vec3(.73,.40,.86); orange=vec3(.96,.67,.70); }
  if(u_palette > 1.5) { cyan=vec3(.95,.76,.51); violet=vec3(.91,.48,.49); orange=vec3(.95,.64,.34); }
  vec3 color = paper;
  color = mix(color, cyan, cyanFog * (0.23 + field * 0.12));
  color = mix(color, violet, violetFog * (0.18 + field * 0.10));
  color = mix(color, orange, orangeFog * (0.18 + ribbon * 0.13));
  float glassSweep = smoothstep(0.76, 0.98, ribbon + field * 0.22);
  color += glassSweep * vec3(0.035, 0.042, 0.055);
  float edge = smoothstep(1.25, 0.12, length(p * vec2(0.82, 1.05)));
  color = mix(paper, color, edge * mix(.65, 1., u_fluid));
  // A structured satin fold gives the glass a real silhouette to refract.
  float foldLine=sin(p.x*3.2+t*.65)*.16;
  float fold=exp(-pow((p.y-foldLine+.06)*9.,2.));
  float seam=exp(-pow((p.y-foldLine+.09)*85.,2.));
  color=mix(color,mix(cyan,violet,uv.x),fold*.13*u_fluid);
  color+=seam*.045*u_fluid;
  if(u_dark > .5) {
    vec3 night=vec3(.025,.044,.083);
    float wave=p.y + sin(p.x*3. + t)*.18 + sin(p.x*7. - t*.6)*.06;
    float curtain=exp(-pow((wave-.12-field*.15)*5.,2.));
    float folds=.45+.55*sin(p.x*17.+field*7.+t);
    vec3 fluidNight=night+mix(cyan,violet,smoothstep(-.7,.5,p.x))*curtain*folds*.32*u_aurora;
    float classicBand=exp(-pow((p.y-.1-sin(p.x*1.6+t*.18)*.035)*4.8,2.));
    vec3 classicNight=night+mix(cyan,violet,uv.x)*classicBand*.09*u_aurora;
    color=mix(classicNight,fluidNight,u_fluid);
    vec2 grid=floor(uv*vec2(160.,100.));
    float star=step(.994,hash(grid))*pow(max(0.,1.-length(fract(uv*vec2(160.,100.))-.5)*2.),6.);
    color+=star*.48;
    float phase=fract(u_time*.065*u_motion);
    vec2 meteor=uv-vec2(1.-phase*1.3,.88-phase*.45);
    float tail=exp(-abs(meteor.y-meteor.x*.35)*650.)*smoothstep(-.13,0.,meteor.x)*smoothstep(.035,0.,meteor.x);
    color+=tail*.28*u_meteors*u_motion;
  }
  outColor = vec4(color, 1.0);
}
`;function mountSpectraFx(e){var t;let a,o=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},n=matchMedia("(prefers-reduced-motion: reduce)"),l=matchMedia("(prefers-color-scheme: dark)"),c=(0,r.XE)(),motionEnabled=()=>c.materialMotion&&!n.matches&&!o.reducedMotion&&"low"!==d,d=null!=(t=o.quality)?t:"high",p=e.getContext("webgl2",{alpha:!1,antialias:!1,powerPreference:"low"===d?"low-power":"high-performance"});if(!p)return e.classList.add("spectra-fx--fallback"),{dispose(){}};let u=createProgram(p,s,i);if(!u)return e.classList.add("spectra-fx--fallback"),{dispose(){}};let m=p.createBuffer();p.bindBuffer(p.ARRAY_BUFFER,m),p.bufferData(p.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),p.STATIC_DRAW);let h=p.getAttribLocation(u,"a_position"),f=p.getUniformLocation(u,"u_resolution"),v=p.getUniformLocation(u,"u_time"),g=p.getUniformLocation(u,"u_pointer"),y=p.getUniformLocation(u,"u_motion"),b=p.getUniformLocation(u,"u_dark"),_=p.getUniformLocation(u,"u_palette"),w=p.getUniformLocation(u,"u_fluid"),S=p.getUniformLocation(u,"u_aurora"),x=p.getUniformLocation(u,"u_meteors");p.useProgram(u),p.enableVertexAttribArray(h),p.vertexAttribPointer(h,2,p.FLOAT,!1,0,0);let E={x:.5,y:.5},T=0,L=!1,k=!1,P=0,C=performance.now(),R=!document.hidden,q=!0,A=-1/0,N=1e3/30,M=Math.min({low:.75,balanced:1.1,high:1.5}[d],globalThis.devicePixelRatio||1),render=t=>{if(!L&&!k){if(motionEnabled()&&(P+=Math.min(.1,Math.max(0,t-C)/1e3)),C=t,t-A>=N||A<0){var a;let s,i;A=t,s=Math.max(1,Math.round(e.clientWidth*M)),i=Math.max(1,Math.round(e.clientHeight*M)),(e.width!==s||e.height!==i)&&(e.width=s,e.height=i,p.viewport(0,0,s,i)),p.uniform2f(f,e.width,e.height),p.uniform1f(v,P),p.uniform2f(g,E.x,E.y),p.uniform1f(y,+!!motionEnabled()),p.uniform1f(b,+!!(0,r.rG)(c)),p.uniform1f(_,["lagoon","violet","sunrise"].indexOf(c.palette)),p.uniform1f(w,+("fluid"===c.atmosphere)),p.uniform1f(S,+!!c.aurora),p.uniform1f(x,+!!c.meteors),p.drawArrays(p.TRIANGLES,0,6),null==(a=o.onRender)||a.call(o,t)}R&&q&&motionEnabled()&&(T=requestAnimationFrame(render))}},onPointer=t=>{if(!o.interactive||!motionEnabled())return;let a=e.getBoundingClientRect();E.x=(t.clientX-a.left)/Math.max(1,a.width),E.y=1-(t.clientY-a.top)/Math.max(1,a.height)},onVisibility=()=>{R=!document.hidden,cancelAnimationFrame(T),C=performance.now(),R&&q&&!k&&(T=requestAnimationFrame(render))},onPreferences=()=>{c=(0,r.XE)(),A=-1/0,onVisibility()},onContextLost=t=>{t.preventDefault(),k=!0,cancelAnimationFrame(T),e.classList.add("spectra-fx--fallback")},onContextRestored=()=>{disposeCurrent(),e.classList.remove("spectra-fx--fallback"),a=mountSpectraFx(e,o)},I=new IntersectionObserver(e=>{var t,a;q=null==(t=null==(a=e[0])?void 0:a.isIntersecting)||t,cancelAnimationFrame(T),R&&q&&(T=requestAnimationFrame(render))});function disposeCurrent(){L||(L=!0,cancelAnimationFrame(T),I.disconnect(),globalThis.removeEventListener("pointermove",onPointer),document.removeEventListener("visibilitychange",onVisibility),window.removeEventListener(r.fZ,onPreferences),window.removeEventListener("bb-glass-redraw",onPreferences),window.removeEventListener("resize",onPreferences),n.removeEventListener("change",onPreferences),l.removeEventListener("change",onPreferences),e.removeEventListener("webglcontextlost",onContextLost),e.removeEventListener("webglcontextrestored",onContextRestored),null==p||p.deleteBuffer(m),null==p||p.deleteProgram(u))}return I.observe(e),globalThis.addEventListener("pointermove",onPointer,{passive:!0}),document.addEventListener("visibilitychange",onVisibility),window.addEventListener(r.fZ,onPreferences),window.addEventListener("bb-glass-redraw",onPreferences),window.addEventListener("resize",onPreferences),n.addEventListener("change",onPreferences),l.addEventListener("change",onPreferences),e.addEventListener("webglcontextlost",onContextLost),e.addEventListener("webglcontextrestored",onContextRestored),T=requestAnimationFrame(render),{dispose(){null==a||a.dispose(),disposeCurrent()}}}function createProgram(e,t,a){let r=compile(e,e.VERTEX_SHADER,t),s=compile(e,e.FRAGMENT_SHADER,a);if(!r||!s)return r&&e.deleteShader(r),s&&e.deleteShader(s),null;let i=e.createProgram();return i?(e.attachShader(i,r),e.attachShader(i,s),e.linkProgram(i),e.deleteShader(r),e.deleteShader(s),e.getProgramParameter(i,e.LINK_STATUS))?i:(e.deleteProgram(i),null):(e.deleteShader(r),e.deleteShader(s),null)}function compile(e,t,a){let r=e.createShader(t);return r?(e.shaderSource(r,a),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS))?r:(e.deleteShader(r),null):null}},"./src/platform/page.ts"(e,t,a){a.d(t,{K7:()=>mountPlatformPage,oR:()=>toast,p$:()=>emptyState,sJ:()=>avatarElement});var r=a("./src/platform/shell.ts"),s=a("./src/platform/fx.ts"),i=a("./src/platform/viewport.ts");function mountPlatformPage(e,t,a,o){return document.body.className="platform-app",(0,i.u)(),document.body.innerHTML=`
    <canvas class="platform-app__fx" aria-hidden="true"></canvas>
    <div class="platform-app__shell">
      <header class="platform-app__header">
        <a class="platform-wordmark" href="/" aria-label="Break Builder 首页">
          <span class="platform-wordmark__mark"><i class="ph ph-circle-dashed" aria-hidden="true"></i></span>
          <span>BREAK BUILDER</span>
        </a>
        <nav class="platform-app__nav" aria-label="主导航">
          `.concat(navLink("play",t,"/","ph-game-controller","开球"),`
          `).concat(navLink("lobby",t,"/lobby","ph-users-three","社交"),`
          `).concat(navLink("account",t,"/account","ph-sliders-horizontal","个性化"),`
          `).concat(e.capabilities.admin?navLink("admin",t,"/admin","ph-shield-checkered","管理"):"",`
        </nav>
        `).concat((0,r.G7)(e),`
      </header>
      <main class="platform-app__main">
        <section class="platform-app__hero">
          <div>
            <p class="platform-eyebrow">BREAK BUILDER / `).concat(t.toUpperCase(),`</p>
            <h1></h1>
            <p class="platform-app__description"></p>
          </div>
          <div class="platform-app__signal" aria-hidden="true">
            <span>LIVE SYSTEM</span><i class="ph ph-wave-sine"></i>
          </div>
        </section>
        <div id="platformPage" class="platform-page"></div>
      </main>
      <footer class="platform-app__footer">
        <span>Break Builder \xb7 GPL-3.0</span>
        <a href="/rules">规则与许可证</a>
        <span>账号状态由服务器验证</span>
      </footer>
    </div>
    <div id="platformToastRegion" class="platform-toast-region" aria-live="polite" aria-atomic="true"></div>`),document.querySelector(".platform-app__hero h1").textContent=a,document.querySelector(".platform-app__description").textContent=o,(0,s.W)(document.querySelector(".platform-app__fx"),{quality:e.preferences.quality,interactive:!0}),document.querySelector("#platformPage")}function toast(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"info",a=document.querySelector("#platformToastRegion");if(!a)return;let r=document.createElement("div");r.className="platform-toast",r.dataset.state=t;let s=document.createElement("i");s.className="ph ".concat({success:"ph-check-circle",error:"ph-warning-circle",info:"ph-info"}[t]);let i=document.createElement("span");i.textContent=e,r.append(s,i),a.append(r),globalThis.setTimeout(()=>r.remove(),4200)}function emptyState(e,t,a){let r=document.createElement("div");r.className="platform-empty";let s=document.createElement("i");s.className="ph ".concat(e);let i=document.createElement("strong");i.textContent=t;let o=document.createElement("p");return o.textContent=a,r.append(s,i,o),r}function avatarElement(e,t){let a=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"md",r=document.createElement("span");if(r.className="platform-user-avatar platform-user-avatar--".concat(a),t){let e=document.createElement("img");e.src=t,e.alt="",e.loading="lazy",r.append(e)}else r.textContent=e.trim().slice(0,1).toUpperCase()||"B";return r}function navLink(e,t,a,r,s){return'<a href="'.concat(a,'" ').concat(e===t?'aria-current="page"':"",'><i class="ph ').concat(r,'" aria-hidden="true"></i><span>').concat(s,"</span></a>")}},"./src/platform/shell.ts"(e,t,a){a.d(t,{G7:()=>accountChip,ZU:()=>platformGate});var r=a("./src/platform/api.ts"),s=a("./src/platform/fx.ts"),i=a("./packages/table-tennis/src/browser/glass.ts"),o=a("./src/view/renderquality.ts");let n=null,l=null;async function platformGate(){document.documentElement.classList.add("platform-loading");try{if((0,r.S9)())return document.documentElement.classList.add("platform-gated"),await mountAuthGate(),null;let t=await (0,r.L6)();if(t){var e;return null==l||l(),null==(e=document.getElementById("platformGate"))||e.remove(),applyPersonalisation(t),globalThis.__BREAK_BUILDER_SESSION__=t,document.documentElement.classList.remove("platform-gated"),t}return document.documentElement.classList.add("platform-gated"),await mountAuthGate(),null}finally{document.documentElement.classList.remove("platform-loading")}}function applyPersonalisation(e){var t,a,r,s,i,n,l,c;let d=document.documentElement,p=(0,o.lQ)(e.preferences.quality);d.dataset.accent=e.user.accent,d.dataset.approval=e.user.approvalStatus,d.dataset.visibility=e.user.visibility,d.dataset.quality=(0,o.Z6)(p),d.dataset.qualityMode=p,d.dataset.camera=e.preferences.camera_mode,d.classList.toggle("reduced-motion",!!e.preferences.reduced_motion);let u=(null==(a=(r=globalThis).matchMedia)?void 0:a.call(r,"(pointer: coarse)").matches)||(null!=(t=null==(s=globalThis.navigator)?void 0:s.maxTouchPoints)?t:0)>0?e.preferences.touch_shot_dock:e.preferences.desktop_shot_dock,m={aim:"3d",top:"2d",free:"free"}[e.preferences.camera_mode],h={"break-builder.cue-style":e.user.cueStyle,"break-builder.table-style":e.user.tableStyle,"break-builder.environment-style":e.user.environmentStyle,"break-builder.shot-dock":u,"break-builder.master-volume":String(e.preferences.master_volume),"break-builder.social-drawer":e.preferences.social_drawer_open?"open":"closed",[o.nF]:p,"billiards-camera-mode":m};try{for(let[e,t]of Object.entries(h))null==(c=globalThis.localStorage)||c.setItem(e,t);let t=JSON.parse(null!=(i=null==(n=globalThis.localStorage)?void 0:n.getItem("billiards-launcher-selection"))?i:"{}");null==(l=globalThis.localStorage)||l.setItem("billiards-launcher-selection",JSON.stringify({...t,quality:p,cueStyle:e.user.cueStyle,tableStyle:e.user.tableStyle,environmentStyle:e.user.environmentStyle}))}catch{}}function accountChip(e){let t=approvalLabel(e.user.approvalStatus),a=e.user.displayName.trim().slice(0,1).toUpperCase()||"B";return`
    <a class="platform-account-chip" href="/account" aria-label="打开账号与个性化设置">
      <span class="platform-avatar" aria-hidden="true">`.concat(escapeHtml(a),`</span>
      <span><strong>`).concat(escapeHtml(e.user.displayName),"</strong><small>").concat(t,`</small></span>
      <i class="ph ph-caret-down" aria-hidden="true"></i>
    </a>`)}function approvalLabel(e){return({pending:"待审核 · 仅离线",approved:"在线权限已开启",rejected:"审核未通过 · 仅离线",revoked:"在线权限已撤销"})[e]}async function mountAuthGate(){var e;null==l||l(),null==(e=document.getElementById("platformGate"))||e.remove();let t=await (0,r.TR)("/api/config").catch(()=>({turnstileSiteKey:null,account:{minimumPasswordLength:10}})),a=document.createElement("section");a.id="platformGate",a.className="platform-gate",a.setAttribute("aria-label","Break Builder 账号入口"),a.innerHTML=`
    <canvas class="platform-gate__fx" aria-hidden="true"></canvas>
    <div class="platform-gate__shell">
      <header class="platform-gate__brand">
        <a class="platform-wordmark" href="/" aria-label="Break Builder 首页">
          <span class="platform-wordmark__mark"><i class="ph ph-circle-dashed" aria-hidden="true"></i></span>
          <span>BREAK BUILDER</span>
        </a>
        <span class="platform-gate__secure"><i class="ph ph-shield-check" aria-hidden="true"></i> 私有账号系统</span>
      </header>
      <main class="platform-auth-layout">
        <section class="platform-auth-intro">
          <p class="platform-eyebrow">实时 3D 台球空间</p>
          <h1>让每一杆<br />流动起来</h1>
          <p>登录后进入你的球台。球杆、球台、环境、画质与操作偏好会跟随账号同步。</p>
          <div class="platform-spectra-card" aria-hidden="true">
            <span>LIVE SPECTRA</span><strong>WEBGL / GLSL</strong>
            <i class="ph ph-wave-sine"></i>
          </div>
          <ul class="platform-auth-features">
            <li><i class="ph ph-circles-three-plus"></i><span><strong>离线完整可玩</strong>练习、AI 与同屏双人</span></li>
            <li><i class="ph ph-users-three"></i><span><strong>审核后开启在线</strong>好友、邀请、聊天与房间</span></li>
            <li><i class="ph ph-sliders-horizontal"></i><span><strong>跨设备个性化</strong>外观与操作一起同步</span></li>
          </ul>
        </section>
        <section class="platform-auth-card" data-glass="optical" aria-labelledby="authTitle">
          <div class="platform-auth-tabs" role="tablist" aria-label="账号操作">
            <button type="button" role="tab" data-auth-tab="login" aria-selected="true">登录</button>
            <button type="button" role="tab" data-auth-tab="register" aria-selected="false">注册</button>
            <button type="button" role="tab" data-auth-tab="recover" aria-selected="false">重置密码</button>
          </div>
          <div id="authTitle" class="sr-only">账号操作</div>
          <form class="platform-auth-form" data-auth-panel="login">
            <header><p>欢迎回来</p><h2>继续你的下一杆</h2></header>
            <label><span>用户名</span><div class="platform-input"><i class="ph ph-user"></i><input name="username" required minlength="3" maxlength="24" autocomplete="username" /></div></label>
            <label><span>密码</span><div class="platform-input"><i class="ph ph-lock-key"></i><input name="password" type="password" required minlength="`.concat(t.account.minimumPasswordLength,`" maxlength="128" autocomplete="current-password" /></div></label>
            <div class="platform-turnstile" data-turnstile="login" hidden></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>登录并进入</span><i class="ph ph-arrow-right"></i></button>
          </form>
          <form class="platform-auth-form" data-auth-panel="register" hidden>
            <header><p>创建球员档案</p><h2>从离线模式开始</h2></header>
            <div class="platform-form-grid">
              <label><span>用户名</span><div class="platform-input"><i class="ph ph-at"></i><input name="username" required minlength="3" maxlength="24" autocomplete="username" /></div></label>
              <label><span>显示名</span><div class="platform-input"><i class="ph ph-identification-card"></i><input name="displayName" required minlength="2" maxlength="24" autocomplete="nickname" /></div></label>
            </div>
            <label><span>私有邮箱</span><div class="platform-input"><i class="ph ph-envelope-simple"></i><input name="email" type="email" required maxlength="254" autocomplete="email" /></div><small>仅用于你凭恢复码重置密码，不公开，不发送邮件。</small></label>
            <label><span>密码</span><div class="platform-input"><i class="ph ph-password"></i><input name="password" type="password" required minlength="`).concat(t.account.minimumPasswordLength,'" maxlength="128" autocomplete="new-password" /></div><small>至少 ').concat(t.account.minimumPasswordLength,` 位。</small></label>
            <details class="platform-bootstrap"><summary>管理员首次初始化</summary><label><span>一次性管理员邀请码</span><div class="platform-input"><i class="ph ph-key"></i><input name="adminInvite" maxlength="128" autocomplete="off" /></div></label></details>
            <div class="platform-turnstile" data-turnstile="signup"></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>创建账号</span><i class="ph ph-arrow-right"></i></button>
            <p class="platform-form-note"><i class="ph ph-clock"></i> 注册后可立即玩离线；管理员通过审核后开启在线功能。</p>
          </form>
          <form class="platform-auth-form" data-auth-panel="recover" hidden>
            <header><p>无需邮件服务</p><h2>使用一次性恢复码</h2></header>
            <div class="platform-form-grid">
              <label><span>注册邮箱</span><div class="platform-input"><i class="ph ph-envelope-simple"></i><input name="email" type="email" required autocomplete="email" /></div></label>
              <label><span>用户名</span><div class="platform-input"><i class="ph ph-user"></i><input name="username" required autocomplete="username" /></div></label>
            </div>
            <label><span>一次性恢复码</span><div class="platform-input"><i class="ph ph-ticket"></i><input name="recoveryCode" required minlength="8" maxlength="64" autocomplete="one-time-code" /></div></label>
            <label><span>新密码</span><div class="platform-input"><i class="ph ph-lock-key-open"></i><input name="newPassword" type="password" required minlength="`).concat(t.account.minimumPasswordLength,`" maxlength="128" autocomplete="new-password" /></div></label>
            <div class="platform-turnstile" data-turnstile="recovery"></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>重置密码</span><i class="ph ph-arrow-counter-clockwise"></i></button>
            <p class="platform-form-note"><i class="ph ph-shield-warning"></i> 仅知道邮箱不能重置；必须同时提供用户名与未使用的恢复码。</p>
          </form>
        </section>
      </main>
      <footer class="platform-gate__footer"><span>\xa9 Break Builder</span><a href="/rules">规则与许可证</a><span>WebGL2 安全降级</span></footer>
    </div>`),document.body.append(a);let o=a.querySelector("canvas"),n=(0,i.IW)(a,o),c=(0,s.W)(o,{interactive:!0,onRender:e=>n.render(e)}),onPageHide=e=>{e.persisted||null==l||l()};l=()=>{window.removeEventListener("pagehide",onPageHide),c.dispose(),n.dispose(),l=null},window.addEventListener("pagehide",onPageHide),initialiseTabs(a),initialiseAuthForms(a,t.turnstileSiteKey)}function initialiseTabs(e){let t=[...e.querySelectorAll("[data-auth-tab]")],a=[...e.querySelectorAll("[data-auth-panel]")];for(let e of t)e.addEventListener("click",()=>{var r,s;let i=e.dataset.authTab;for(let a of t)a.setAttribute("aria-selected",String(a===e));for(let e of a)e.hidden=e.dataset.authPanel!==i;null==(s=a.find(e=>!e.hidden))||null==(r=s.querySelector("input"))||r.focus()})}function initialiseAuthForms(e,t){let a=new Map,s=new Map;t&&loadTurnstile().then(r=>{for(let i of e.querySelectorAll("[data-turnstile]")){let e=i.dataset.turnstile,o=r.render(i,{sitekey:t,action:e,theme:"light",size:"flexible",callback:t=>a.set(e,t),"expired-callback":()=>a.delete(e),"error-callback":()=>a.delete(e)});s.set(e,o)}});let i=e.querySelector('[data-auth-panel="login"]'),o=e.querySelector('[data-auth-panel="register"]'),n=e.querySelector('[data-auth-panel="recover"]');for(let t of(i.addEventListener("submit",e=>{e.preventDefault(),submitForm(i,async e=>{var t,s,i,o,n;let l=await fetch("/api/auth/sign-in/username",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","X-Turnstile-Token":null!=(t=a.get("login"))?t:""},body:JSON.stringify({username:e.get("username"),password:e.get("password"),rememberMe:!0})});if(!l.ok){let e=await l.json().catch(()=>({}));throw new r.hD(l.status,null!=(s=null==e||null==(o=e.error)?void 0:o.code)?s:"login_failed",null!=(i=null==e||null==(n=e.error)?void 0:n.message)?i:"用户名或密码不正确")}globalThis.location.reload()})}),o.addEventListener("submit",t=>{t.preventDefault(),submitForm(o,async t=>{var s;let i=await (0,r.TR)("/api/register",{method:"POST",body:JSON.stringify({username:t.get("username"),displayName:t.get("displayName"),email:t.get("email"),password:t.get("password"),adminInvite:t.get("adminInvite")||void 0,turnstileToken:null!=(s=a.get("signup"))?s:""})});showRecoveryCodes(e,i.recoveryCodes,i.message)})}),n.addEventListener("submit",e=>{e.preventDefault(),submitForm(n,async e=>{var t;await (0,r.TR)("/api/recover",{method:"POST",body:JSON.stringify({email:e.get("email"),username:e.get("username"),recoveryCode:e.get("recoveryCode"),newPassword:e.get("newPassword"),turnstileToken:null!=(t=a.get("recovery"))?t:""})}),setStatus(n,"密码已重置，请切换到登录。","success")})}),[i,o,n]))t.addEventListener("platform:reset-turnstile",()=>{let e="register"===t.dataset.authPanel?"signup":t.dataset.authPanel,r=s.get(e);r&&globalThis.turnstile&&globalThis.turnstile.reset(r),a.delete(e)})}async function submitForm(e,t){var a,r;let s=e.querySelector('button[type="submit"]'),i=null!=(a=null==(r=s.querySelector("span"))?void 0:r.textContent)?a:"提交";s.disabled=!0,s.dataset.loading="true",s.querySelector("span")&&(s.querySelector("span").textContent="正在处理…"),setStatus(e,"","");try{await t(new FormData(e))}catch(t){setStatus(e,t instanceof Error?t.message:"操作失败，请稍后重试","error"),e.dispatchEvent(new CustomEvent("platform:reset-turnstile"))}finally{s.disabled=!1,delete s.dataset.loading,s.querySelector("span")&&(s.querySelector("span").textContent=i)}}function setStatus(e,t,a){let r=e.querySelector(".platform-form-status");r.textContent=t,r.dataset.state=a}function showRecoveryCodes(e,t,a){var r;let s=document.createElement("div");s.className="platform-modal",s.setAttribute("role","dialog"),s.setAttribute("aria-modal","true"),s.setAttribute("aria-labelledby","recoveryCodesTitle"),s.innerHTML=`
    <div class="platform-modal__card" data-glass="optical">
      <span class="platform-modal__icon"><i class="ph ph-key"></i></span>
      <p class="platform-eyebrow">账号创建成功</p>
      <h2 id="recoveryCodesTitle">保存一次性恢复码</h2>
      <p class="platform-modal__lede"></p>
      <div class="platform-recovery-grid"></div>
      <p class="platform-form-note"><i class="ph ph-warning"></i> 离开后不会再次显示。每个恢复码只能使用一次。</p>
      <div class="platform-modal__actions">
        <button type="button" data-copy-codes><i class="ph ph-copy"></i> 复制全部</button>
        <button type="button" data-download-codes><i class="ph ph-download-simple"></i> 下载文本</button>
        <button type="button" class="platform-primary" data-continue><span>我已安全保存</span><i class="ph ph-arrow-right"></i></button>
      </div>
    </div>`,s.querySelector(".platform-modal__lede").textContent=a;let i=s.querySelector(".platform-recovery-grid");for(let e of t){let t=document.createElement("code");t.textContent=e,i.append(t)}let o=`Break Builder 一次性恢复码

`.concat(t.join(`
`),`

请离线安全保存。每个恢复码只能使用一次。`);s.querySelector("[data-copy-codes]").onclick=async()=>{await navigator.clipboard.writeText(o)},s.querySelector("[data-download-codes]").onclick=()=>{let e=document.createElement("a");e.href=URL.createObjectURL(new Blob([o],{type:"text/plain;charset=utf-8"})),e.download="break-builder-recovery-codes.txt",e.click(),URL.revokeObjectURL(e.href)},s.querySelector("[data-continue]").onclick=()=>{globalThis.location.reload()},e.append(s),null==(r=s.querySelector("[data-copy-codes]"))||r.focus()}function loadTurnstile(){return globalThis.turnstile?Promise.resolve(globalThis.turnstile):n||(n=new Promise((e,t)=>{let a=document.createElement("script");a.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",a.async=!0,a.defer=!0,a.onload=()=>{globalThis.turnstile?e(globalThis.turnstile):t(Error("人机验证加载失败"))},a.onerror=()=>t(Error("人机验证加载失败")),document.head.append(a)}))}function escapeHtml(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}},"./src/platform/viewport.ts"(e,t,a){let r;function mountViewportCoordinator(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};null==r||r();let t=document.documentElement,a=document.body,s=globalThis.visualViewport,update=()=>{var e,a;let r=globalThis.innerHeight,i=null!=(e=null==s?void 0:s.height)?e:r,o=null!=(a=null==s?void 0:s.offsetTop)?a:0,n=Math.max(0,r-i-o),l=globalThis.innerWidth>i;t.style.setProperty("--bb-visual-height","".concat(i,"px")),t.style.setProperty("--bb-viewport-top","".concat(o,"px")),t.style.setProperty("--bb-keyboard-height","".concat(n,"px")),t.dataset.viewportOrientation=l?"landscape":"portrait",t.dataset.viewportHeight=i<520?"compact":"regular",t.classList.toggle("bb-keyboard-open",n>120)};a.classList.toggle("game-viewport",!0===e.game),t.classList.toggle("game-viewport-root",!0===e.game),update(),null==s||s.addEventListener("resize",update),null==s||s.addEventListener("scroll",update),globalThis.addEventListener("resize",update),globalThis.addEventListener("orientationchange",update);let dispose=()=>{null==s||s.removeEventListener("resize",update),null==s||s.removeEventListener("scroll",update),globalThis.removeEventListener("resize",update),globalThis.removeEventListener("orientationchange",update),r===dispose&&(r=void 0)};return r=dispose,dispose}a.d(t,{u:()=>mountViewportCoordinator})},"./src/view/renderquality.ts"(e,t,a){a.d(t,{Z6:()=>serverQualityForRenderMode,lQ:()=>renderQualityModeForPreference});let r="break-builder.render-quality";function isQualityName(e){return"low"===e||"balanced"===e||"high"===e}function renderQualityMode(){var e,t,a;let s=arguments.length>0&&void 0!==arguments[0]?arguments[0]:new URLSearchParams(null!=(e=null==(t=globalThis.location)?void 0:t.search)?e:""),i=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"adaptive",o=s.get("quality");if(isQualityName(o))return o;if("adaptive"===o||"auto"===o)return"adaptive";try{let e=null==(a=globalThis.localStorage)?void 0:a.getItem(r);if("adaptive"===e||isQualityName(e))return e}catch{}return i}function renderQualityModeForPreference(e){var t,a;let r=arguments.length>1&&void 0!==arguments[1]?arguments[1]:new URLSearchParams(null!=(t=null==(a=globalThis.location)?void 0:a.search)?t:"");return renderQualityMode(r,"high"===e?"adaptive":e)}function serverQualityForRenderMode(e){return"adaptive"===e?"high":e}new WeakMap,a.d(t,["nF",0,r])}};let t={};function __webpack_require__(a){let r=t[a];if(void 0!==r)return r.exports;let s=t[a]={exports:{}};return e[a](s,s.exports,__webpack_require__),s.exports}__webpack_require__.d=(e,t)=>{if(Array.isArray(t))for(var a=0;a<t.length;){var r=t[a++],s=t[a++];__webpack_require__.o(e,r)?0===s&&a++:0===s?Object.defineProperty(e,r,{enumerable:!0,value:t[a++]}):Object.defineProperty(e,r,{enumerable:!0,get:s})}else for(var r in t)__webpack_require__.o(t,r)&&!__webpack_require__.o(e,r)&&Object.defineProperty(e,r,{enumerable:!0,get:t[r]})},__webpack_require__.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t);var a=__webpack_require__("./src/platform/api.ts"),r=__webpack_require__("./src/platform/page.ts"),s=__webpack_require__("./src/platform/shell.ts"),i=__webpack_require__("./src/launcherconfig.ts"),o=__webpack_require__("./src/view/renderquality.ts");function _define_property(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}let SocialPage=class SocialPage{async init(){(this.root.innerHTML=`
      <div class="social-mobile-tabs" role="tablist" aria-label="社交页面区域">
        <button type="button" data-social-view="friends" aria-selected="true"><i class="ph ph-users"></i>好友</button>
        <button type="button" data-social-view="chat" aria-selected="false"><i class="ph ph-chats"></i>消息</button>
        <button type="button" data-social-view="activity" aria-selected="false"><i class="ph ph-bell"></i>动态</button>
      </div>
      <div class="social-layout">
        <aside class="platform-panel social-people" data-social-pane="friends">
          <header class="platform-panel__header">
            <div><h2>好友</h2><p id="socialFriendMeta">正在同步</p></div>
            <button id="socialAddFriend" class="platform-icon-button" type="button" aria-label="搜索并添加好友"><i class="ph ph-user-plus"></i></button>
          </header>
          <div class="social-me">
            <div id="socialMeAvatar"></div>
            <div class="social-me__copy"><strong></strong><small></small></div>
            <label class="social-visibility">
              <span class="sr-only">在线可见性</span>
              <select id="socialVisibility">
                <option value="online">在线</option>
                <option value="away">暂离</option>
                <option value="dnd">勿扰</option>
                <option value="invisible">隐身</option>
              </select>
            </label>
          </div>
          <div class="social-search-wrap" hidden>
            <div class="platform-search"><i class="ph ph-magnifying-glass"></i><input id="socialUserSearch" type="search" placeholder="搜索用户名或显示名" maxlength="40" /></div>
            <div id="socialSearchResults"></div>
          </div>
          <div class="social-section-heading"><span>我的好友</span><span id="socialOnlineCount">0 在线</span></div>
          <ul id="socialFriends" class="platform-list social-scroll"></ul>
        </aside>

        <section class="platform-panel social-chat" data-social-pane="chat">
          <header class="platform-panel__header social-chat__header">
            <div><h2 id="socialChatTitle">选择一位好友</h2><p id="socialChatMeta">私聊仅双方可见 \xb7 保留 30 天</p></div>
            <div class="platform-button-row">
              <button id="socialInviteCurrent" class="platform-soft-button" type="button" hidden><i class="ph ph-sword"></i>邀请比赛</button>
              <button id="socialReportCurrent" class="platform-icon-button" type="button" aria-label="举报用户" hidden><i class="ph ph-flag"></i></button>
            </div>
          </header>
          <div id="socialMessages" class="social-messages"></div>
          <form id="socialComposer" class="platform-chat-composer" hidden>
            <textarea id="socialMessageInput" maxlength="1000" rows="1" placeholder="输入消息…" aria-label="私聊消息"></textarea>
            <button class="platform-primary" type="submit" aria-label="发送消息"><i class="ph ph-paper-plane-tilt"></i><span>发送</span></button>
          </form>
        </section>

        <aside class="social-activity" data-social-pane="activity">
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>实时在线</h2><p>隐身用户不会出现在这里</p></div><span id="socialVisibleCount" class="social-count-pill">0</span></header>
            <ul id="socialPresence" class="platform-list platform-panel__body social-presence"></ul>
          </section>
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>好友申请</h2><p>接受后即可私聊与邀请</p></div></header>
            <div id="socialRequests" class="platform-panel__body"></div>
          </section>
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>比赛邀请</h2><p>邀请最长保留 10 分钟</p></div></header>
            <div id="socialInvites" class="platform-panel__body"></div>
          </section>
          <section class="platform-panel social-conversations-panel">
            <header class="platform-panel__header"><div><h2>最近消息</h2><p>点击继续对话</p></div></header>
            <ul id="socialConversations" class="platform-list platform-panel__body"></ul>
          </section>
        </aside>
      </div>`,this.bindStaticEvents(),this.renderMe(),this.session.capabilities.social)?(await this.loadAll(),this.connect()):this.renderLocked()}bindStaticEvents(){for(let e of this.root.querySelectorAll("[data-social-view]"))e.addEventListener("click",()=>this.setMobileView(e.dataset.socialView));this.root.querySelector("#socialAddFriend").onclick=()=>{let e=this.root.querySelector(".social-search-wrap");e.hidden=!e.hidden,e.hidden||this.root.querySelector("#socialUserSearch").focus()};let e=null;this.root.querySelector("#socialUserSearch").oninput=t=>{e&&clearTimeout(e);let a=t.currentTarget.value.trim();e=globalThis.setTimeout(()=>void this.searchUsers(a),250)},this.root.querySelector("#socialVisibility").onchange=e=>{let t=e.currentTarget.value;this.updateVisibility(t)},this.root.querySelector("#socialComposer").onsubmit=e=>{e.preventDefault(),this.sendMessage()},this.root.querySelector("#socialMessageInput").onkeydown=e=>{"Enter"!==e.key||e.shiftKey||(e.preventDefault(),this.sendMessage())},this.root.querySelector("#socialInviteCurrent").onclick=()=>void this.inviteSelected(),this.root.querySelector("#socialReportCurrent").onclick=()=>void this.reportSelected()}renderMe(){this.root.querySelector("#socialMeAvatar").replaceChildren((0,r.sJ)(this.session.user.displayName,this.session.user.avatarUrl,"md")),this.root.querySelector(".social-me__copy strong").textContent=this.session.user.displayName,this.root.querySelector(".social-me__copy small").textContent="@".concat(this.session.user.username),this.root.querySelector("#socialVisibility").value=this.session.user.visibility}renderLocked(){let e="当前状态：".concat(this.session.user.approvalStatus,"。管理员通过注册审核后，好友、聊天、邀请与在线列表会自动开启。");this.root.querySelector("#socialFriendMeta").textContent="在线权限尚未开启",this.root.querySelector("#socialFriends").replaceChildren((0,r.p$)("ph-lock-key","仅离线模式",e)),this.root.querySelector("#socialMessages").replaceChildren((0,r.p$)("ph-hourglass","等待管理员审核","审核前仍可返回首页使用练习、AI 和同屏双人。")),this.root.querySelector("#socialAddFriend").disabled=!0,this.root.querySelector("#socialVisibility").disabled=!0}async loadAll(){if((0,a.x5)()){this.loadDemo(),this.renderAll();return}let[e,t,r]=await Promise.all([(0,a.TR)("/api/social/friends"),(0,a.TR)("/api/social/conversations"),(0,a.TR)("/api/invites")]);this.friends=e.friends,this.requests=e.requests,this.conversations=t.conversations,this.invites=r.invites,this.renderAll()}loadDemo(){this.friends=[{id:"10000000-0000-4000-8000-000000000001",username:"moonriver",displayName:"月影长河",avatarUrl:null},{id:"10000000-0000-4000-8000-000000000002",username:"orbit",displayName:"极光轨迹",avatarUrl:null},{id:"10000000-0000-4000-8000-000000000003",username:"wind",displayName:"风之诗人",avatarUrl:null}],this.presence=new Map([[this.friends[0].id,{userId:this.friends[0].id,displayName:this.friends[0].displayName,avatarUrl:null,visibility:"online"}],[this.friends[1].id,{userId:this.friends[1].id,displayName:this.friends[1].displayName,avatarUrl:null,visibility:"dnd"}],[this.session.user.id,{userId:this.session.user.id,displayName:this.session.user.displayName,avatarUrl:null,visibility:"online"}]]),this.conversations=[{id:"20000000-0000-4000-8000-000000000001",kind:"direct",room_id:null,other_user_id:this.friends[0].id,other_name:this.friends[0].displayName,other_avatar:null,last_message_body:"今晚一起打一局？",last_message_at:Date.now()-6e4}],this.requests=[{id:"30000000-0000-4000-8000-000000000001",sender_id:this.friends[2].id,receiver_id:this.session.user.id,username:this.friends[2].username,display_name:this.friends[2].displayName,avatar_key:null,created_at:Date.now()-12e4}]}renderAll(){this.renderFriends(),this.renderPresence(),this.renderRequests(),this.renderInvites(),this.renderConversations(),this.selectedConversation||this.renderChatEmpty()}renderFriends(){let e=this.root.querySelector("#socialFriends");e.replaceChildren();let t=this.friends.filter(e=>this.presence.has(e.id)).length;if(this.root.querySelector("#socialFriendMeta").textContent="".concat(this.friends.length," 位好友"),this.root.querySelector("#socialOnlineCount").textContent="".concat(t," 在线"),!this.friends.length)return void e.append((0,r.p$)("ph-user-plus","还没有好友","搜索准确用户名或显示名，发送第一份好友申请。"));for(let t of this.friends){var a;let s=this.presence.get(t.id),i=document.createElement("li");i.className="platform-list-item social-friend",i.append((0,r.sJ)(t.displayName,t.avatarUrl,"md"));let o=document.createElement("div");o.className="platform-list-item__copy";let n=document.createElement("strong");n.textContent=t.displayName;let l=document.createElement("small");l.textContent=s?statusLabel(s.visibility):"@".concat(t.username," · 离线"),o.append(n,l);let c=document.createElement("span");c.className="platform-status-dot",c.dataset.state=null!=(a=null==s?void 0:s.visibility)?a:"offline";let d=iconButton("ph-chat-circle-dots","打开私聊");d.onclick=()=>void this.openFriend(t);let p=iconButton("ph-sword","邀请比赛");p.onclick=()=>void this.inviteFriend(t),i.append(o,c,d,p),e.append(i)}}renderPresence(){let e=this.root.querySelector("#socialPresence");e.replaceChildren();let t=[...this.presence.values()].filter(e=>e.userId!==this.session.user.id&&!e.invisible);if(this.root.querySelector("#socialVisibleCount").textContent=String(t.length+1),!t.length)return void e.append((0,r.p$)("ph-radar","大厅很安静","好友上线后会实时出现在这里。"));for(let a of t.slice(0,12)){let t=document.createElement("li");t.className="platform-list-item",t.append((0,r.sJ)(a.displayName,a.avatarUrl,"sm"));let s=document.createElement("div");s.className="platform-list-item__copy";let i=document.createElement("strong");i.textContent=a.displayName;let o=document.createElement("small");o.textContent=statusLabel(a.visibility),s.append(i,o);let n=document.createElement("span");n.className="platform-status-dot",n.dataset.state=a.visibility,t.append(s,n),e.append(t)}}renderRequests(){let e=this.root.querySelector("#socialRequests");if(e.replaceChildren(),!this.requests.length)return void e.append((0,r.p$)("ph-handshake","暂无申请","新的好友申请会实时到达。"));let t=document.createElement("ul");for(let e of(t.className="platform-list",this.requests)){let a=e.receiver_id===this.session.user.id,s=document.createElement("li");s.className="platform-list-item",s.append((0,r.sJ)(e.display_name,e.avatar_key?"/media/avatar/".concat(e.sender_id):null,"sm"));let i=document.createElement("div");i.className="platform-list-item__copy";let o=document.createElement("strong");o.textContent=e.display_name;let n=document.createElement("small");if(n.textContent=a?"请求添加你为好友":"等待对方处理",i.append(o,n),s.append(i),a){let t=iconButton("ph-check","接受");t.onclick=()=>void this.actOnRequest(e.id,"accept");let a=iconButton("ph-x","拒绝");a.onclick=()=>void this.actOnRequest(e.id,"decline"),s.append(t,a)}else{let t=iconButton("ph-x","取消");t.onclick=()=>void this.actOnRequest(e.id,"cancel"),s.append(t)}t.append(s)}e.append(t)}renderInvites(){let e=this.root.querySelector("#socialInvites");if(e.replaceChildren(),!this.invites.length)return void e.append((0,r.p$)("ph-sword","暂无比赛邀请","从好友列表邀请一位好友加入等待房间。"));let t=document.createElement("ul");for(let e of(t.className="platform-list",this.invites)){let a=e.challengee_id===this.session.user.id,r=document.createElement("li");r.className="platform-list-item";let s=document.createElement("span");s.className="social-rule-badge",s.textContent=ruleShort(e.rule_type);let i=document.createElement("div");i.className="platform-list-item__copy";let o=document.createElement("strong");o.textContent=a?e.challenger_name:e.challengee_name;let n=document.createElement("small");if(n.textContent="".concat(ruleLabel(e.rule_type)," · 房间 ").concat(e.room_code),i.append(o,n),r.append(s,i),a){let t=iconButton("ph-check","接受比赛");t.onclick=()=>void this.actOnInvite(e,"accept");let a=iconButton("ph-x","拒绝");a.onclick=()=>void this.actOnInvite(e,"decline"),r.append(t,a)}else{let t=iconButton("ph-x","取消邀请");t.onclick=()=>void this.actOnInvite(e,"cancel"),r.append(t)}t.append(r)}e.append(t)}renderConversations(){let e=this.root.querySelector("#socialConversations");if(e.replaceChildren(),!this.conversations.length)return void e.append((0,r.p$)("ph-chats","暂无对话","与好友开启私聊后会出现在这里。"));for(let i of this.conversations.slice(0,8)){var t,a,s;let o=document.createElement("li");o.className="platform-list-item social-conversation",o.tabIndex=0,o.append((0,r.sJ)(null!=(t=i.other_name)?t:"房",i.other_avatar?"/media/avatar/".concat(i.other_user_id):null,"sm"));let n=document.createElement("div");n.className="platform-list-item__copy";let l=document.createElement("strong");l.textContent="room"===i.kind?"房间聊天":null!=(a=i.other_name)?a:"好友";let c=document.createElement("small");c.textContent=null!=(s=i.last_message_body)?s:"开始对话",n.append(l,c),o.append(n),o.onclick=()=>void this.selectConversation(i),o.onkeydown=e=>{"Enter"===e.key&&this.selectConversation(i)},e.append(o)}}renderChatEmpty(){this.root.querySelector("#socialMessages").replaceChildren((0,r.p$)("ph-chat-circle-dots","选择一位好友","私聊消息只会投递给会话成员，并保留 30 天。"))}renderMessages(){let e=this.root.querySelector("#socialMessages");if(e.replaceChildren(),!this.messages.length)return void e.append((0,r.p$)("ph-sparkle","开始第一句话","消息不会广播到公共大厅。"));for(let t of this.messages){let a=t.sender_id===this.session.user.id,r=document.createElement("article");r.className="social-message",r.dataset.mine=String(a);let s=document.createElement("header"),i=document.createElement("strong");i.textContent=a?"我":t.sender_name;let o=document.createElement("time");o.dateTime=new Date(t.created_at).toISOString(),o.textContent=new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit"}).format(t.created_at),s.append(i,o);let n=document.createElement("p");n.textContent=t.body,r.append(s,n),e.append(r)}e.scrollTop=e.scrollHeight}async searchUsers(e){let t=this.root.querySelector("#socialSearchResults");if(t.replaceChildren(),e.length<2)return;let s=(0,a.x5)()?this.friends.filter(t=>t.displayName.includes(e)||t.username.includes(e)):(await (0,a.TR)("/api/users/search?q=".concat(encodeURIComponent(e)))).users,i=document.createElement("ul");for(let e of(i.className="platform-list social-search-results",s)){let t=document.createElement("li");t.className="platform-list-item",t.append((0,r.sJ)(e.displayName,e.avatarUrl,"sm"));let a=document.createElement("div");a.className="platform-list-item__copy";let s=document.createElement("strong");s.textContent=e.displayName;let o=document.createElement("small");o.textContent="@".concat(e.username),a.append(s,o);let n=iconButton("ph-user-plus","发送好友申请");n.onclick=()=>void this.addFriend(e.id),t.append(a,n),i.append(t)}s.length?t.append(i):t.append((0,r.p$)("ph-magnifying-glass","没有结果","请检查用户名或尝试完整显示名。"))}async addFriend(e){(0,a.x5)()||(await (0,a.TR)("/api/social/friends",{method:"POST",body:JSON.stringify({userId:e})}),await this.loadAll()),(0,r.oR)("好友申请已发送","success")}async actOnRequest(e,t){(0,a.x5)()?(this.requests=this.requests.filter(t=>t.id!==e),this.renderRequests()):(await (0,a.TR)("/api/social/friend-requests/".concat(e),{method:"PATCH",body:JSON.stringify({action:t})}),await this.loadAll()),(0,r.oR)("accept"===t?"已成为好友":"申请已处理","success")}async openFriend(e){let t=this.conversations.find(t=>t.other_user_id===e.id);t||(t={id:(0,a.x5)()?crypto.randomUUID():(await (0,a.TR)("/api/social/conversations",{method:"POST",body:JSON.stringify({userId:e.id})})).conversationId,kind:"direct",room_id:null,other_user_id:e.id,other_name:e.displayName,other_avatar:e.avatarUrl,last_message_body:null,last_message_at:null},this.conversations.unshift(t),this.renderConversations()),await this.selectConversation(t)}async selectConversation(e){var t;this.selectedConversation=e,this.root.querySelector("#socialChatTitle").textContent="room"===e.kind?"房间聊天":null!=(t=e.other_name)?t:"好友",this.root.querySelector("#socialComposer").hidden=!1,this.root.querySelector("#socialInviteCurrent").hidden="direct"!==e.kind,this.root.querySelector("#socialReportCurrent").hidden="direct"!==e.kind,this.messages=(0,a.x5)()?[{id:crypto.randomUUID(),sender_id:e.other_user_id,sender_name:e.other_name,body:"今晚一起打球吗？",created_at:Date.now()-12e4},{id:crypto.randomUUID(),sender_id:this.session.user.id,sender_name:this.session.user.displayName,body:"好啊，等你来挑战。",created_at:Date.now()-6e4}]:(await (0,a.TR)("/api/social/conversations/".concat(e.id,"/messages"))).messages,this.renderMessages(),this.setMobileView("chat")}sendMessage(){var e;let t=this.root.querySelector("#socialMessageInput"),s=t.value.trim();if(!s||!this.selectedConversation)return;let i=crypto.randomUUID().replaceAll("-","_");if((0,a.x5)())this.messages.push({id:crypto.randomUUID(),sender_id:this.session.user.id,sender_name:this.session.user.displayName,body:s,created_at:Date.now()}),this.renderMessages();else{if((null==(e=this.socket)?void 0:e.readyState)!==WebSocket.OPEN)return void(0,r.oR)("实时连接正在恢复，请稍后再试","error");this.socket.send(JSON.stringify({type:"chat.send",conversationId:this.selectedConversation.id,clientMessageId:i,text:s}))}t.value=""}async inviteSelected(){let e=this.friends.find(e=>{var t;return e.id===(null==(t=this.selectedConversation)?void 0:t.other_user_id)});e&&await this.inviteFriend(e)}async inviteFriend(e){if((0,a.x5)())return void(0,r.oR)("已向 ".concat(e.displayName," 发送八球邀请"),"success");let t=await (0,a.TR)("/api/rooms",{method:"POST",body:JSON.stringify({ruleType:"eightball",options:{source:"friend-invite"},tableStyle:this.session.user.tableStyle,environmentStyle:this.session.user.environmentStyle})});await (0,a.TR)("/api/invites",{method:"POST",body:JSON.stringify({challengeeId:e.id,roomId:t.room.id,expiresInSeconds:120})}),(0,r.oR)("已向 ".concat(e.displayName," 发送比赛邀请"),"success"),await this.enterWaitingRoom(t.room,"create")}async actOnInvite(e,t){let s;if((0,a.x5)()||(s=(await (0,a.TR)("/api/invites/".concat(e.id),{method:"PATCH",body:JSON.stringify({action:t})})).room),"accept"===t){s||(s={id:e.room_id,code:e.room_code,status:"waiting",ruleType:e.rule_type,options:{},tableStyle:this.session.user.tableStyle,environmentStyle:this.session.user.environmentStyle,memberRole:"player",createdAt:Date.now()}),await this.enterWaitingRoom(s,"join");return}this.invites=this.invites.filter(t=>t.id!==e.id),this.renderInvites(),(0,r.oR)("邀请已处理","success")}async enterWaitingRoom(e,t){if("table-tennis"===e.gameType)return void globalThis.location.assign((0,i.wX)(e));let a={rule:e.ruleType,opponent:"online",botLevel:5,quality:(0,o.lQ)(this.session.preferences.quality),cueStyle:this.session.user.cueStyle,tableStyle:e.tableStyle,environmentStyle:e.environmentStyle,onlineAction:t,roomCode:e.code,roomInstanceId:e.id};globalThis.location.assign(await (0,i.iv)(a,globalThis.location.href))}async reportSelected(){var e,t;let s=null==(e=this.selectedConversation)?void 0:e.other_user_id;if(!s)return;let i=null==(t=globalThis.prompt("请简要说明举报原因（不超过 1000 字）"))?void 0:t.trim();i&&((0,a.x5)()||await (0,a.TR)("/api/social/reports",{method:"POST",body:JSON.stringify({targetUserId:s,reason:"用户举报",details:i})}),(0,r.oR)("举报已提交给管理员","success"))}async updateVisibility(e){if(!(0,a.x5)()){var t;await (0,a.TR)("/api/me",{method:"PATCH",body:JSON.stringify({visibility:e})}),(null==(t=this.socket)?void 0:t.readyState)===WebSocket.OPEN&&this.socket.send(JSON.stringify({type:"presence.set",visibility:e}))}this.session.user.visibility=e,(0,r.oR)("invisible"===e?"已隐身；不会出现在普通用户在线列表中":"状态已切换为".concat(statusLabel(e)),"success")}connect(){if((0,a.x5)()||!this.session.capabilities.social)return;let e="https:"===globalThis.location.protocol?"wss:":"ws:",t=new WebSocket("".concat(e,"//").concat(globalThis.location.host,"/ws/social"));this.socket=t,t.onopen=()=>{this.reconnectTimer&&clearTimeout(this.reconnectTimer),this.reconnectTimer=null},t.onmessage=e=>this.receiveRealtime(e.data),t.onclose=e=>{this.socket===t&&(this.socket=null),4403!==e.code&&(this.reconnectTimer=globalThis.setTimeout(()=>this.connect(),1800))},t.onerror=()=>t.close()}receiveRealtime(e){var t,a,s,i;let o;if("string"==typeof e){try{o=JSON.parse(e)}catch{return}if("presence.snapshot"===o.type)this.presence=new Map(o.users.map(e=>[e.userId,e])),this.renderFriends(),this.renderPresence();else if("chat.message"===o.type){let e=o.message;e.conversationId===(null==(t=this.selectedConversation)?void 0:t.id)&&(this.messages.push({id:e.id,sender_id:e.senderId,sender_name:e.senderName,body:e.body,created_at:e.createdAt}),this.renderMessages()),this.refreshRealtimeLists()}else["friend.requested","friend.accepted","friend.removed"].includes(o.type)||["invite.created","invite.updated","invite.expired"].includes(o.type)?this.refreshRealtimeLists():"approval.changed"===o.type||"moderation.session_revoked"===o.type?((0,r.oR)(null!=(a=null!=(s=o.note)?s:o.reason)?a:"在线权限已变更","error"),globalThis.setTimeout(()=>globalThis.location.reload(),1200)):"error"===o.type&&(0,r.oR)(null!=(i=o.message)?i:"实时操作失败","error")}}async refreshRealtimeLists(){(0,a.x5)()||await this.loadAll()}setMobileView(e){for(let t of(this.mobileView=e,this.root.dataset.mobileView=e,this.root.querySelectorAll("[data-social-view]")))t.setAttribute("aria-selected",String(t.dataset.socialView===e))}constructor(e,t){_define_property(this,"session",void 0),_define_property(this,"root",void 0),_define_property(this,"friends",void 0),_define_property(this,"requests",void 0),_define_property(this,"conversations",void 0),_define_property(this,"invites",void 0),_define_property(this,"presence",void 0),_define_property(this,"selectedConversation",void 0),_define_property(this,"messages",void 0),_define_property(this,"socket",void 0),_define_property(this,"reconnectTimer",void 0),_define_property(this,"mobileView",void 0),this.session=e,this.root=t,this.friends=[],this.requests=[],this.conversations=[],this.invites=[],this.presence=new Map,this.selectedConversation=null,this.messages=[],this.socket=null,this.reconnectTimer=null,this.mobileView="friends"}};function iconButton(e,t){let a=document.createElement("button");a.type="button",a.className="platform-icon-button",a.setAttribute("aria-label",t);let r=document.createElement("i");return r.className="ph ".concat(e),a.append(r),a}function statusLabel(e){var t;return null!=(t=({online:"在线",away:"暂离",dnd:"勿扰",invisible:"隐身"})[e])?t:"离线"}function ruleLabel(e){var t;return null!=(t=({eightball:"八球",nineball:"九球",fourball:"四球追分",snooker:"斯诺克",threecushion:"三库","singles-11":"乒乓球 · 11 分单打"})[e])?t:e}function ruleShort(e){var t;return null!=(t=({eightball:"8",nineball:"9",fourball:"4",snooker:"S",threecushion:"3","singles-11":"乒"})[e])?t:"B"}async function bootstrap(){let e=await (0,s.ZU)();if(!e)return;let t=(0,r.K7)(e,"lobby","社交大厅","看见实时在线好友，选择隐身，发起私聊或邀请一场比赛。");await new SocialPage(e,t).init()}document.querySelector("#appRoot")||bootstrap().catch(e=>{(0,r.oR)(e instanceof Error?e.message:"社交大厅加载失败","error")})})();