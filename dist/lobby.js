(()=>{"use strict";function _define_property(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}let ApiError=class ApiError extends Error{constructor(e,t,a,i=[]){super(a),_define_property(this,"status",void 0),_define_property(this,"code",void 0),_define_property(this,"fields",void 0),this.status=e,this.code=t,this.fields=i}};async function apiJson(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},a=new Headers(t.headers);!t.body||t.body instanceof FormData||a.has("content-type")||a.set("content-type","application/json");let i=await fetch(e,{...t,credentials:"same-origin",headers:a}),s=await i.json().catch(()=>({error:{code:"invalid_response",message:"服务响应无效"}}));if(!i.ok){var o,r,l,n,c;throw new ApiError(i.status,null!=(o=null==s||null==(n=s.error)?void 0:n.code)?o:"request_failed",null!=(r=null==s||null==(c=s.error)?void 0:c.message)?r:"请求失败",null!=(l=null==s?void 0:s.fields)?l:[])}return s}function isLocalDemo(){let e=globalThis.location.hostname;return("localhost"===e||"127.0.0.1"===e)&&"1"===new URLSearchParams(globalThis.location.search).get("platformDemo")}function demoSession(){return{session:{expiresAt:new Date(Date.now()+864e5).toISOString()},user:{id:"00000000-0000-4000-8000-000000000001",email:"demo@local.invalid",username:"future_player",displayName:"未来玩家",role:"admin",approvalStatus:"approved",visibility:"online",avatarUrl:null,bio:"",accent:"ocean",cueStyle:"heritage",tableStyle:"american-ivory",environmentStyle:"spectra",language:"zh-CN",mutedUntil:null,bannedUntil:null},preferences:{reduced_motion:0,quality:"high",desktop_shot_dock:"expanded",touch_shot_dock:"expanded",camera_mode:"top",master_volume:.8,social_drawer_open:1},capabilities:{offline:!0,online:!0,social:!0,admin:!0},turnstileSiteKey:null,announcements:[]}}function isPlatformPreview(){return new URLSearchParams(globalThis.location.search).has("platformPreview")}async function loadSession(){if(isLocalDemo())return demoSession();try{return await apiJson("/api/me")}catch(e){if(e instanceof ApiError&&401===e.status)return null;throw e}}let e=`#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`,t=`#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_motion;
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
  float t = u_time * 0.045 * u_motion;
  vec2 pointer = (u_pointer - 0.5) * vec2(0.38, 0.28);
  float field = fbm(p * 2.1 + vec2(t, -t * 0.72) + pointer);
  float cyanFog = fogOrb(p, vec2(-0.50, 0.22) + pointer * 0.3, 0.78, t);
  float violetFog = fogOrb(p, vec2(0.34, -0.27), 0.66, t + 4.0);
  float orangeFog = fogOrb(p, vec2(0.56, 0.18), 0.72, t + 8.0);
  float ribbon = sin((p.x + field * 0.42) * 6.4 - t * 3.6) * 0.5 + 0.5;
  ribbon = smoothstep(0.52, 0.92, ribbon) * smoothstep(0.02, 0.92, uv.y);
  vec3 paper = vec3(0.972, 0.982, 0.996);
  vec3 cyan = vec3(0.12, 0.84, 0.91);
  vec3 violet = vec3(0.47, 0.31, 0.98);
  vec3 orange = vec3(1.0, 0.50, 0.22);
  vec3 color = paper;
  color = mix(color, cyan, cyanFog * (0.16 + field * 0.12));
  color = mix(color, violet, violetFog * (0.12 + field * 0.10));
  color = mix(color, orange, orangeFog * (0.18 + ribbon * 0.13));
  float glassSweep = smoothstep(0.76, 0.98, ribbon + field * 0.22);
  color += glassSweep * vec3(0.035, 0.042, 0.055);
  float edge = smoothstep(1.25, 0.12, length(p * vec2(0.82, 1.05)));
  outColor = vec4(mix(paper, color, edge), 1.0);
}
`;function mountSpectraFx(a){var i;let s=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},o=matchMedia("(prefers-reduced-motion: reduce)").matches,r=null!=(i=s.quality)?i:"high",l=a.getContext("webgl2",{alpha:!1,antialias:!1,powerPreference:"low"===r?"low-power":"high-performance"});if(!l)return a.classList.add("spectra-fx--fallback"),{dispose(){}};let n=createProgram(l,e,t);if(!n)return a.classList.add("spectra-fx--fallback"),{dispose(){}};let c=l.createBuffer();l.bindBuffer(l.ARRAY_BUFFER,c),l.bufferData(l.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),l.STATIC_DRAW);let d=l.getAttribLocation(n,"a_position"),p=l.getUniformLocation(n,"u_resolution"),u=l.getUniformLocation(n,"u_time"),m=l.getUniformLocation(n,"u_pointer"),h=l.getUniformLocation(n,"u_motion");l.useProgram(n),l.enableVertexAttribArray(d),l.vertexAttribPointer(d,2,l.FLOAT,!1,0,0);let f={x:.5,y:.5},v=0,y=!1,b=!document.hidden,g=Math.min({low:.75,balanced:1.1,high:1.5}[r],globalThis.devicePixelRatio||1),render=e=>{if(!y){let t,i;t=Math.max(1,Math.round(a.clientWidth*g)),i=Math.max(1,Math.round(a.clientHeight*g)),(a.width!==t||a.height!==i)&&(a.width=t,a.height=i,l.viewport(0,0,t,i)),l.uniform2f(p,a.width,a.height),l.uniform1f(u,e/1e3),l.uniform2f(m,f.x,f.y),l.uniform1f(h,o||"low"===r?0:1),l.drawArrays(l.TRIANGLES,0,6),b&&!o&&"low"!==r&&(v=requestAnimationFrame(render))}},onPointer=e=>{if(!s.interactive)return;let t=a.getBoundingClientRect();f.x=(e.clientX-t.left)/Math.max(1,t.width),f.y=1-(e.clientY-t.top)/Math.max(1,t.height)},onVisibility=()=>{b=!document.hidden,cancelAnimationFrame(v),b&&(v=requestAnimationFrame(render))};return a.addEventListener("pointermove",onPointer,{passive:!0}),document.addEventListener("visibilitychange",onVisibility),v=requestAnimationFrame(render),{dispose(){y=!0,cancelAnimationFrame(v),a.removeEventListener("pointermove",onPointer),document.removeEventListener("visibilitychange",onVisibility),l.deleteBuffer(c),l.deleteProgram(n)}}}function createProgram(e,t,a){let i=compile(e,e.VERTEX_SHADER,t),s=compile(e,e.FRAGMENT_SHADER,a);if(!i||!s)return null;let o=e.createProgram();return o?(e.attachShader(o,i),e.attachShader(o,s),e.linkProgram(o),e.deleteShader(i),e.deleteShader(s),e.getProgramParameter(o,e.LINK_STATUS))?o:(e.deleteProgram(o),null):null}function compile(e,t,a){let i=e.createShader(t);return i?(e.shaderSource(i,a),e.compileShader(i),e.getShaderParameter(i,e.COMPILE_STATUS))?i:(e.deleteShader(i),null):null}let a=null;async function platformGate(){document.documentElement.classList.add("platform-loading");try{if(isPlatformPreview())return document.documentElement.classList.add("platform-gated"),await mountAuthGate(),null;let e=await loadSession();if(e)return applyPersonalisation(e),globalThis.__BREAK_BUILDER_SESSION__=e,document.documentElement.classList.remove("platform-gated"),e;return document.documentElement.classList.add("platform-gated"),await mountAuthGate(),null}finally{document.documentElement.classList.remove("platform-loading")}}function applyPersonalisation(e){var t,a,i,s,o,r,l,n;let c=document.documentElement;c.dataset.accent=e.user.accent,c.dataset.approval=e.user.approvalStatus,c.dataset.visibility=e.user.visibility,c.dataset.quality=e.preferences.quality,c.dataset.camera=e.preferences.camera_mode,c.classList.toggle("reduced-motion",!!e.preferences.reduced_motion);let d=(null==(a=(i=globalThis).matchMedia)?void 0:a.call(i,"(pointer: coarse)").matches)||(null!=(t=null==(s=globalThis.navigator)?void 0:s.maxTouchPoints)?t:0)>0?e.preferences.touch_shot_dock:e.preferences.desktop_shot_dock,p={aim:"3d",top:"2d",free:"free"}[e.preferences.camera_mode],u={"break-builder.cue-style":e.user.cueStyle,"break-builder.table-style":e.user.tableStyle,"break-builder.environment-style":e.user.environmentStyle,"break-builder.shot-dock":d,"break-builder.master-volume":String(e.preferences.master_volume),"break-builder.social-drawer":e.preferences.social_drawer_open?"open":"closed","billiards-camera-mode":p};try{for(let[e,t]of Object.entries(u))null==(n=globalThis.localStorage)||n.setItem(e,t);let t=JSON.parse(null!=(o=null==(r=globalThis.localStorage)?void 0:r.getItem("billiards-launcher-selection"))?o:"{}");null==(l=globalThis.localStorage)||l.setItem("billiards-launcher-selection",JSON.stringify({...t,quality:e.preferences.quality,cueStyle:e.user.cueStyle,tableStyle:e.user.tableStyle,environmentStyle:e.user.environmentStyle}))}catch{}}function accountChip(e){let t=approvalLabel(e.user.approvalStatus),a=e.user.displayName.trim().slice(0,1).toUpperCase()||"B";return`
    <a class="platform-account-chip" href="/account" aria-label="打开账号与个性化设置">
      <span class="platform-avatar" aria-hidden="true">`.concat(escapeHtml(a),`</span>
      <span><strong>`).concat(escapeHtml(e.user.displayName),"</strong><small>").concat(t,`</small></span>
      <i class="ph ph-caret-down" aria-hidden="true"></i>
    </a>`)}function approvalLabel(e){return({pending:"待审核 · 仅离线",approved:"在线权限已开启",rejected:"审核未通过 · 仅离线",revoked:"在线权限已撤销"})[e]}async function mountAuthGate(){let e=await apiJson("/api/config").catch(()=>({turnstileSiteKey:null,account:{minimumPasswordLength:10}})),t=document.createElement("section");t.id="platformGate",t.className="platform-gate",t.setAttribute("aria-label","Break Builder 账号入口"),t.innerHTML=`
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
        <section class="platform-auth-card" aria-labelledby="authTitle">
          <div class="platform-auth-tabs" role="tablist" aria-label="账号操作">
            <button type="button" role="tab" data-auth-tab="login" aria-selected="true">登录</button>
            <button type="button" role="tab" data-auth-tab="register" aria-selected="false">注册</button>
            <button type="button" role="tab" data-auth-tab="recover" aria-selected="false">重置密码</button>
          </div>
          <div id="authTitle" class="sr-only">账号操作</div>
          <form class="platform-auth-form" data-auth-panel="login">
            <header><p>欢迎回来</p><h2>继续你的下一杆</h2></header>
            <label><span>用户名</span><div class="platform-input"><i class="ph ph-user"></i><input name="username" required minlength="3" maxlength="24" autocomplete="username" /></div></label>
            <label><span>密码</span><div class="platform-input"><i class="ph ph-lock-key"></i><input name="password" type="password" required minlength="`.concat(e.account.minimumPasswordLength,`" maxlength="128" autocomplete="current-password" /></div></label>
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
            <label><span>密码</span><div class="platform-input"><i class="ph ph-password"></i><input name="password" type="password" required minlength="`).concat(e.account.minimumPasswordLength,'" maxlength="128" autocomplete="new-password" /></div><small>至少 ').concat(e.account.minimumPasswordLength,` 位。</small></label>
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
            <label><span>新密码</span><div class="platform-input"><i class="ph ph-lock-key-open"></i><input name="newPassword" type="password" required minlength="`).concat(e.account.minimumPasswordLength,`" maxlength="128" autocomplete="new-password" /></div></label>
            <div class="platform-turnstile" data-turnstile="recovery"></div>
            <p class="platform-form-status" aria-live="polite"></p>
            <button class="platform-primary" type="submit"><span>重置密码</span><i class="ph ph-arrow-counter-clockwise"></i></button>
            <p class="platform-form-note"><i class="ph ph-shield-warning"></i> 仅知道邮箱不能重置；必须同时提供用户名与未使用的恢复码。</p>
          </form>
        </section>
      </main>
      <footer class="platform-gate__footer"><span>\xa9 Break Builder</span><a href="/rules">规则与许可证</a><span>WebGL2 安全降级</span></footer>
    </div>`),document.body.append(t),mountSpectraFx(t.querySelector("canvas"),{interactive:!0}),initialiseTabs(t),initialiseAuthForms(t,e.turnstileSiteKey)}function initialiseTabs(e){let t=[...e.querySelectorAll("[data-auth-tab]")],a=[...e.querySelectorAll("[data-auth-panel]")];for(let e of t)e.addEventListener("click",()=>{var i,s;let o=e.dataset.authTab;for(let a of t)a.setAttribute("aria-selected",String(a===e));for(let e of a)e.hidden=e.dataset.authPanel!==o;null==(s=a.find(e=>!e.hidden))||null==(i=s.querySelector("input"))||i.focus()})}function initialiseAuthForms(e,t){let a=new Map,i=new Map;t&&loadTurnstile().then(s=>{for(let o of e.querySelectorAll("[data-turnstile]")){let e=o.dataset.turnstile,r=s.render(o,{sitekey:t,action:e,theme:"light",size:"flexible",callback:t=>a.set(e,t),"expired-callback":()=>a.delete(e),"error-callback":()=>a.delete(e)});i.set(e,r)}});let s=e.querySelector('[data-auth-panel="login"]'),o=e.querySelector('[data-auth-panel="register"]'),r=e.querySelector('[data-auth-panel="recover"]');for(let t of(s.addEventListener("submit",e=>{e.preventDefault(),submitForm(s,async e=>{var t,i,s,o,r;let l=await fetch("/api/auth/sign-in/username",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","X-Turnstile-Token":null!=(t=a.get("login"))?t:""},body:JSON.stringify({username:e.get("username"),password:e.get("password"),rememberMe:!0})});if(!l.ok){let e=await l.json().catch(()=>({}));throw new ApiError(l.status,null!=(i=null==e||null==(o=e.error)?void 0:o.code)?i:"login_failed",null!=(s=null==e||null==(r=e.error)?void 0:r.message)?s:"用户名或密码不正确")}globalThis.location.reload()})}),o.addEventListener("submit",t=>{t.preventDefault(),submitForm(o,async t=>{var i;let s=await apiJson("/api/register",{method:"POST",body:JSON.stringify({username:t.get("username"),displayName:t.get("displayName"),email:t.get("email"),password:t.get("password"),adminInvite:t.get("adminInvite")||void 0,turnstileToken:null!=(i=a.get("signup"))?i:""})});showRecoveryCodes(e,s.recoveryCodes,s.message)})}),r.addEventListener("submit",e=>{e.preventDefault(),submitForm(r,async e=>{var t;await apiJson("/api/recover",{method:"POST",body:JSON.stringify({email:e.get("email"),username:e.get("username"),recoveryCode:e.get("recoveryCode"),newPassword:e.get("newPassword"),turnstileToken:null!=(t=a.get("recovery"))?t:""})}),setStatus(r,"密码已重置，请切换到登录。","success")})}),[s,o,r]))t.addEventListener("platform:reset-turnstile",()=>{let e="register"===t.dataset.authPanel?"signup":t.dataset.authPanel,s=i.get(e);s&&globalThis.turnstile&&globalThis.turnstile.reset(s),a.delete(e)})}async function submitForm(e,t){var a,i;let s=e.querySelector('button[type="submit"]'),o=null!=(a=null==(i=s.querySelector("span"))?void 0:i.textContent)?a:"提交";s.disabled=!0,s.dataset.loading="true",s.querySelector("span")&&(s.querySelector("span").textContent="正在处理…"),setStatus(e,"","");try{await t(new FormData(e))}catch(t){setStatus(e,t instanceof Error?t.message:"操作失败，请稍后重试","error"),e.dispatchEvent(new CustomEvent("platform:reset-turnstile"))}finally{s.disabled=!1,delete s.dataset.loading,s.querySelector("span")&&(s.querySelector("span").textContent=o)}}function setStatus(e,t,a){let i=e.querySelector(".platform-form-status");i.textContent=t,i.dataset.state=a}function showRecoveryCodes(e,t,a){var i;let s=document.createElement("div");s.className="platform-modal",s.setAttribute("role","dialog"),s.setAttribute("aria-modal","true"),s.setAttribute("aria-labelledby","recoveryCodesTitle"),s.innerHTML=`
    <div class="platform-modal__card">
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
    </div>`,s.querySelector(".platform-modal__lede").textContent=a;let o=s.querySelector(".platform-recovery-grid");for(let e of t){let t=document.createElement("code");t.textContent=e,o.append(t)}let r=`Break Builder 一次性恢复码

`.concat(t.join(`
`),`

请离线安全保存。每个恢复码只能使用一次。`);s.querySelector("[data-copy-codes]").onclick=async()=>{await navigator.clipboard.writeText(r)},s.querySelector("[data-download-codes]").onclick=()=>{let e=document.createElement("a");e.href=URL.createObjectURL(new Blob([r],{type:"text/plain;charset=utf-8"})),e.download="break-builder-recovery-codes.txt",e.click(),URL.revokeObjectURL(e.href)},s.querySelector("[data-continue]").onclick=()=>{globalThis.location.reload()},e.append(s),null==(i=s.querySelector("[data-copy-codes]"))||i.focus()}function loadTurnstile(){return globalThis.turnstile?Promise.resolve(globalThis.turnstile):a||(a=new Promise((e,t)=>{let a=document.createElement("script");a.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",a.async=!0,a.defer=!0,a.onload=()=>{globalThis.turnstile?e(globalThis.turnstile):t(Error("人机验证加载失败"))},a.onerror=()=>t(Error("人机验证加载失败")),document.head.append(a)}))}function escapeHtml(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}function mountPlatformPage(e,t,a,i){return document.body.className="platform-app",document.body.innerHTML=`
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
        `).concat(accountChip(e),`
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
    <div id="platformToastRegion" class="platform-toast-region" aria-live="polite" aria-atomic="true"></div>`),document.querySelector(".platform-app__hero h1").textContent=a,document.querySelector(".platform-app__description").textContent=i,mountSpectraFx(document.querySelector(".platform-app__fx"),{quality:e.preferences.quality,interactive:!0}),document.querySelector("#platformPage")}function toast(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:"info",a=document.querySelector("#platformToastRegion");if(!a)return;let i=document.createElement("div");i.className="platform-toast",i.dataset.state=t;let s=document.createElement("i");s.className="ph ".concat({success:"ph-check-circle",error:"ph-warning-circle",info:"ph-info"}[t]);let o=document.createElement("span");o.textContent=e,i.append(s,o),a.append(i),globalThis.setTimeout(()=>i.remove(),4200)}function emptyState(e,t,a){let i=document.createElement("div");i.className="platform-empty";let s=document.createElement("i");s.className="ph ".concat(e);let o=document.createElement("strong");o.textContent=t;let r=document.createElement("p");return r.textContent=a,i.append(s,o,r),i}function avatarElement(e,t){let a=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"md",i=document.createElement("span");if(i.className="platform-user-avatar platform-user-avatar--".concat(a),t){let e=document.createElement("img");e.src=t,e.alt="",e.loading="lazy",i.append(e)}else i.textContent=e.trim().slice(0,1).toUpperCase()||"B";return i}function navLink(e,t,a,i,s){return'<a href="'.concat(a,'" ').concat(e===t?'aria-current="page"':"",'><i class="ph ').concat(i,'" aria-hidden="true"></i><span>').concat(s,"</span></a>")}function lobby_define_property(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}let SocialPage=class SocialPage{async init(){(this.root.innerHTML=`
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
      </div>`,this.bindStaticEvents(),this.renderMe(),this.session.capabilities.social)?(await this.loadAll(),this.connect()):this.renderLocked()}bindStaticEvents(){for(let e of this.root.querySelectorAll("[data-social-view]"))e.addEventListener("click",()=>this.setMobileView(e.dataset.socialView));this.root.querySelector("#socialAddFriend").onclick=()=>{let e=this.root.querySelector(".social-search-wrap");e.hidden=!e.hidden,e.hidden||this.root.querySelector("#socialUserSearch").focus()};let e=null;this.root.querySelector("#socialUserSearch").oninput=t=>{e&&clearTimeout(e);let a=t.currentTarget.value.trim();e=globalThis.setTimeout(()=>void this.searchUsers(a),250)},this.root.querySelector("#socialVisibility").onchange=e=>{let t=e.currentTarget.value;this.updateVisibility(t)},this.root.querySelector("#socialComposer").onsubmit=e=>{e.preventDefault(),this.sendMessage()},this.root.querySelector("#socialMessageInput").onkeydown=e=>{"Enter"!==e.key||e.shiftKey||(e.preventDefault(),this.sendMessage())},this.root.querySelector("#socialInviteCurrent").onclick=()=>void this.inviteSelected(),this.root.querySelector("#socialReportCurrent").onclick=()=>void this.reportSelected()}renderMe(){this.root.querySelector("#socialMeAvatar").replaceChildren(avatarElement(this.session.user.displayName,this.session.user.avatarUrl,"md")),this.root.querySelector(".social-me__copy strong").textContent=this.session.user.displayName,this.root.querySelector(".social-me__copy small").textContent="@".concat(this.session.user.username),this.root.querySelector("#socialVisibility").value=this.session.user.visibility}renderLocked(){let e="当前状态：".concat(this.session.user.approvalStatus,"。管理员通过注册审核后，好友、聊天、邀请与在线列表会自动开启。");this.root.querySelector("#socialFriendMeta").textContent="在线权限尚未开启",this.root.querySelector("#socialFriends").replaceChildren(emptyState("ph-lock-key","仅离线模式",e)),this.root.querySelector("#socialMessages").replaceChildren(emptyState("ph-hourglass","等待管理员审核","审核前仍可返回首页使用练习、AI 和同屏双人。")),this.root.querySelector("#socialAddFriend").disabled=!0,this.root.querySelector("#socialVisibility").disabled=!0}async loadAll(){if(isLocalDemo()){this.loadDemo(),this.renderAll();return}let[e,t,a]=await Promise.all([apiJson("/api/social/friends"),apiJson("/api/social/conversations"),apiJson("/api/invites")]);this.friends=e.friends,this.requests=e.requests,this.conversations=t.conversations,this.invites=a.invites,this.renderAll()}loadDemo(){this.friends=[{id:"10000000-0000-4000-8000-000000000001",username:"moonriver",displayName:"月影长河",avatarUrl:null},{id:"10000000-0000-4000-8000-000000000002",username:"orbit",displayName:"极光轨迹",avatarUrl:null},{id:"10000000-0000-4000-8000-000000000003",username:"wind",displayName:"风之诗人",avatarUrl:null}],this.presence=new Map([[this.friends[0].id,{userId:this.friends[0].id,displayName:this.friends[0].displayName,avatarUrl:null,visibility:"online"}],[this.friends[1].id,{userId:this.friends[1].id,displayName:this.friends[1].displayName,avatarUrl:null,visibility:"dnd"}],[this.session.user.id,{userId:this.session.user.id,displayName:this.session.user.displayName,avatarUrl:null,visibility:"online"}]]),this.conversations=[{id:"20000000-0000-4000-8000-000000000001",kind:"direct",room_id:null,other_user_id:this.friends[0].id,other_name:this.friends[0].displayName,other_avatar:null,last_message_body:"今晚一起打一局？",last_message_at:Date.now()-6e4}],this.requests=[{id:"30000000-0000-4000-8000-000000000001",sender_id:this.friends[2].id,receiver_id:this.session.user.id,username:this.friends[2].username,display_name:this.friends[2].displayName,avatar_key:null,created_at:Date.now()-12e4}]}renderAll(){this.renderFriends(),this.renderPresence(),this.renderRequests(),this.renderInvites(),this.renderConversations(),this.selectedConversation||this.renderChatEmpty()}renderFriends(){let e=this.root.querySelector("#socialFriends");e.replaceChildren();let t=this.friends.filter(e=>this.presence.has(e.id)).length;if(this.root.querySelector("#socialFriendMeta").textContent="".concat(this.friends.length," 位好友"),this.root.querySelector("#socialOnlineCount").textContent="".concat(t," 在线"),!this.friends.length)return void e.append(emptyState("ph-user-plus","还没有好友","搜索准确用户名或显示名，发送第一份好友申请。"));for(let t of this.friends){var a;let i=this.presence.get(t.id),s=document.createElement("li");s.className="platform-list-item social-friend",s.append(avatarElement(t.displayName,t.avatarUrl,"md"));let o=document.createElement("div");o.className="platform-list-item__copy";let r=document.createElement("strong");r.textContent=t.displayName;let l=document.createElement("small");l.textContent=i?statusLabel(i.visibility):"@".concat(t.username," · 离线"),o.append(r,l);let n=document.createElement("span");n.className="platform-status-dot",n.dataset.state=null!=(a=null==i?void 0:i.visibility)?a:"offline";let c=iconButton("ph-chat-circle-dots","打开私聊");c.onclick=()=>void this.openFriend(t);let d=iconButton("ph-sword","邀请比赛");d.onclick=()=>void this.inviteFriend(t),s.append(o,n,c,d),e.append(s)}}renderPresence(){let e=this.root.querySelector("#socialPresence");e.replaceChildren();let t=[...this.presence.values()].filter(e=>e.userId!==this.session.user.id&&!e.invisible);if(this.root.querySelector("#socialVisibleCount").textContent=String(t.length+1),!t.length)return void e.append(emptyState("ph-radar","大厅很安静","好友上线后会实时出现在这里。"));for(let a of t.slice(0,12)){let t=document.createElement("li");t.className="platform-list-item",t.append(avatarElement(a.displayName,a.avatarUrl,"sm"));let i=document.createElement("div");i.className="platform-list-item__copy";let s=document.createElement("strong");s.textContent=a.displayName;let o=document.createElement("small");o.textContent=statusLabel(a.visibility),i.append(s,o);let r=document.createElement("span");r.className="platform-status-dot",r.dataset.state=a.visibility,t.append(i,r),e.append(t)}}renderRequests(){let e=this.root.querySelector("#socialRequests");if(e.replaceChildren(),!this.requests.length)return void e.append(emptyState("ph-handshake","暂无申请","新的好友申请会实时到达。"));let t=document.createElement("ul");for(let e of(t.className="platform-list",this.requests)){let a=e.receiver_id===this.session.user.id,i=document.createElement("li");i.className="platform-list-item",i.append(avatarElement(e.display_name,e.avatar_key?"/media/avatar/".concat(e.sender_id):null,"sm"));let s=document.createElement("div");s.className="platform-list-item__copy";let o=document.createElement("strong");o.textContent=e.display_name;let r=document.createElement("small");if(r.textContent=a?"请求添加你为好友":"等待对方处理",s.append(o,r),i.append(s),a){let t=iconButton("ph-check","接受");t.onclick=()=>void this.actOnRequest(e.id,"accept");let a=iconButton("ph-x","拒绝");a.onclick=()=>void this.actOnRequest(e.id,"decline"),i.append(t,a)}else{let t=iconButton("ph-x","取消");t.onclick=()=>void this.actOnRequest(e.id,"cancel"),i.append(t)}t.append(i)}e.append(t)}renderInvites(){let e=this.root.querySelector("#socialInvites");if(e.replaceChildren(),!this.invites.length)return void e.append(emptyState("ph-sword","暂无比赛邀请","从好友列表邀请一位好友加入等待房间。"));let t=document.createElement("ul");for(let e of(t.className="platform-list",this.invites)){let a=e.challengee_id===this.session.user.id,i=document.createElement("li");i.className="platform-list-item";let s=document.createElement("span");s.className="social-rule-badge",s.textContent=ruleShort(e.rule_type);let o=document.createElement("div");o.className="platform-list-item__copy";let r=document.createElement("strong");r.textContent=a?e.challenger_name:e.challengee_name;let l=document.createElement("small");if(l.textContent="".concat(ruleLabel(e.rule_type)," · 房间 ").concat(e.room_code),o.append(r,l),i.append(s,o),a){let t=iconButton("ph-check","接受比赛");t.onclick=()=>void this.actOnInvite(e,"accept");let a=iconButton("ph-x","拒绝");a.onclick=()=>void this.actOnInvite(e,"decline"),i.append(t,a)}else{let t=iconButton("ph-x","取消邀请");t.onclick=()=>void this.actOnInvite(e,"cancel"),i.append(t)}t.append(i)}e.append(t)}renderConversations(){let e=this.root.querySelector("#socialConversations");if(e.replaceChildren(),!this.conversations.length)return void e.append(emptyState("ph-chats","暂无对话","与好友开启私聊后会出现在这里。"));for(let s of this.conversations.slice(0,8)){var t,a,i;let o=document.createElement("li");o.className="platform-list-item social-conversation",o.tabIndex=0,o.append(avatarElement(null!=(t=s.other_name)?t:"房",s.other_avatar?"/media/avatar/".concat(s.other_user_id):null,"sm"));let r=document.createElement("div");r.className="platform-list-item__copy";let l=document.createElement("strong");l.textContent="room"===s.kind?"房间聊天":null!=(a=s.other_name)?a:"好友";let n=document.createElement("small");n.textContent=null!=(i=s.last_message_body)?i:"开始对话",r.append(l,n),o.append(r),o.onclick=()=>void this.selectConversation(s),o.onkeydown=e=>{"Enter"===e.key&&this.selectConversation(s)},e.append(o)}}renderChatEmpty(){this.root.querySelector("#socialMessages").replaceChildren(emptyState("ph-chat-circle-dots","选择一位好友","私聊消息只会投递给会话成员，并保留 30 天。"))}renderMessages(){let e=this.root.querySelector("#socialMessages");if(e.replaceChildren(),!this.messages.length)return void e.append(emptyState("ph-sparkle","开始第一句话","消息不会广播到公共大厅。"));for(let t of this.messages){let a=t.sender_id===this.session.user.id,i=document.createElement("article");i.className="social-message",i.dataset.mine=String(a);let s=document.createElement("header"),o=document.createElement("strong");o.textContent=a?"我":t.sender_name;let r=document.createElement("time");r.dateTime=new Date(t.created_at).toISOString(),r.textContent=new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit"}).format(t.created_at),s.append(o,r);let l=document.createElement("p");l.textContent=t.body,i.append(s,l),e.append(i)}e.scrollTop=e.scrollHeight}async searchUsers(e){let t=this.root.querySelector("#socialSearchResults");if(t.replaceChildren(),e.length<2)return;let a=isLocalDemo()?this.friends.filter(t=>t.displayName.includes(e)||t.username.includes(e)):(await apiJson("/api/users/search?q=".concat(encodeURIComponent(e)))).users,i=document.createElement("ul");for(let e of(i.className="platform-list social-search-results",a)){let t=document.createElement("li");t.className="platform-list-item",t.append(avatarElement(e.displayName,e.avatarUrl,"sm"));let a=document.createElement("div");a.className="platform-list-item__copy";let s=document.createElement("strong");s.textContent=e.displayName;let o=document.createElement("small");o.textContent="@".concat(e.username),a.append(s,o);let r=iconButton("ph-user-plus","发送好友申请");r.onclick=()=>void this.addFriend(e.id),t.append(a,r),i.append(t)}a.length?t.append(i):t.append(emptyState("ph-magnifying-glass","没有结果","请检查用户名或尝试完整显示名。"))}async addFriend(e){isLocalDemo()||(await apiJson("/api/social/friends",{method:"POST",body:JSON.stringify({userId:e})}),await this.loadAll()),toast("好友申请已发送","success")}async actOnRequest(e,t){isLocalDemo()?(this.requests=this.requests.filter(t=>t.id!==e),this.renderRequests()):(await apiJson("/api/social/friend-requests/".concat(e),{method:"PATCH",body:JSON.stringify({action:t})}),await this.loadAll()),toast("accept"===t?"已成为好友":"申请已处理","success")}async openFriend(e){let t=this.conversations.find(t=>t.other_user_id===e.id);t||(t={id:isLocalDemo()?crypto.randomUUID():(await apiJson("/api/social/conversations",{method:"POST",body:JSON.stringify({userId:e.id})})).conversationId,kind:"direct",room_id:null,other_user_id:e.id,other_name:e.displayName,other_avatar:e.avatarUrl,last_message_body:null,last_message_at:null},this.conversations.unshift(t),this.renderConversations()),await this.selectConversation(t)}async selectConversation(e){var t;this.selectedConversation=e,this.root.querySelector("#socialChatTitle").textContent="room"===e.kind?"房间聊天":null!=(t=e.other_name)?t:"好友",this.root.querySelector("#socialComposer").hidden=!1,this.root.querySelector("#socialInviteCurrent").hidden="direct"!==e.kind,this.root.querySelector("#socialReportCurrent").hidden="direct"!==e.kind,this.messages=isLocalDemo()?[{id:crypto.randomUUID(),sender_id:e.other_user_id,sender_name:e.other_name,body:"今晚一起打球吗？",created_at:Date.now()-12e4},{id:crypto.randomUUID(),sender_id:this.session.user.id,sender_name:this.session.user.displayName,body:"好啊，等你来挑战。",created_at:Date.now()-6e4}]:(await apiJson("/api/social/conversations/".concat(e.id,"/messages"))).messages,this.renderMessages(),this.setMobileView("chat")}sendMessage(){var e;let t=this.root.querySelector("#socialMessageInput"),a=t.value.trim();if(!a||!this.selectedConversation)return;let i=crypto.randomUUID().replaceAll("-","_");if(isLocalDemo())this.messages.push({id:crypto.randomUUID(),sender_id:this.session.user.id,sender_name:this.session.user.displayName,body:a,created_at:Date.now()}),this.renderMessages();else{if((null==(e=this.socket)?void 0:e.readyState)!==WebSocket.OPEN)return void toast("实时连接正在恢复，请稍后再试","error");this.socket.send(JSON.stringify({type:"chat.send",conversationId:this.selectedConversation.id,clientMessageId:i,text:a}))}t.value=""}async inviteSelected(){let e=this.friends.find(e=>{var t;return e.id===(null==(t=this.selectedConversation)?void 0:t.other_user_id)});e&&await this.inviteFriend(e)}async inviteFriend(e){if(isLocalDemo())return void toast("已向 ".concat(e.displayName," 发送八球邀请"),"success");let t=await apiJson("/api/rooms",{method:"POST",body:JSON.stringify({ruleType:"eightball",options:{source:"friend-invite"},tableStyle:this.session.user.tableStyle,environmentStyle:this.session.user.environmentStyle})});await apiJson("/api/invites",{method:"POST",body:JSON.stringify({challengeeId:e.id,roomId:t.room.id,expiresInSeconds:120})}),toast("已向 ".concat(e.displayName," 发送比赛邀请"),"success"),await this.loadAll()}async actOnInvite(e,t){(isLocalDemo()||await apiJson("/api/invites/".concat(e.id),{method:"PATCH",body:JSON.stringify({action:t})}),"accept"===t)?globalThis.location.assign("/?roomId=".concat(encodeURIComponent(e.room_id),"&tableId=").concat(encodeURIComponent(e.room_id),"&roomCode=").concat(encodeURIComponent(e.room_code),"&roomVersion=2&ruletype=").concat(encodeURIComponent(e.rule_type),"&practice=false&play=1")):(this.invites=this.invites.filter(t=>t.id!==e.id),this.renderInvites(),toast("邀请已处理","success"))}async reportSelected(){var e,t;let a=null==(e=this.selectedConversation)?void 0:e.other_user_id;if(!a)return;let i=null==(t=globalThis.prompt("请简要说明举报原因（不超过 1000 字）"))?void 0:t.trim();i&&(isLocalDemo()||await apiJson("/api/social/reports",{method:"POST",body:JSON.stringify({targetUserId:a,reason:"用户举报",details:i})}),toast("举报已提交给管理员","success"))}async updateVisibility(e){if(!isLocalDemo()){var t;await apiJson("/api/me",{method:"PATCH",body:JSON.stringify({visibility:e})}),(null==(t=this.socket)?void 0:t.readyState)===WebSocket.OPEN&&this.socket.send(JSON.stringify({type:"presence.set",visibility:e}))}this.session.user.visibility=e,toast("invisible"===e?"已隐身；不会出现在普通用户在线列表中":"状态已切换为".concat(statusLabel(e)),"success")}connect(){if(isLocalDemo()||!this.session.capabilities.social)return;let e="https:"===globalThis.location.protocol?"wss:":"ws:",t=new WebSocket("".concat(e,"//").concat(globalThis.location.host,"/ws/social"));this.socket=t,t.onopen=()=>{this.reconnectTimer&&clearTimeout(this.reconnectTimer),this.reconnectTimer=null},t.onmessage=e=>this.receiveRealtime(e.data),t.onclose=e=>{this.socket===t&&(this.socket=null),4403!==e.code&&(this.reconnectTimer=globalThis.setTimeout(()=>this.connect(),1800))},t.onerror=()=>t.close()}receiveRealtime(e){var t,a,i,s;let o;if("string"==typeof e){try{o=JSON.parse(e)}catch{return}if("presence.snapshot"===o.type)this.presence=new Map(o.users.map(e=>[e.userId,e])),this.renderFriends(),this.renderPresence();else if("chat.message"===o.type){let e=o.message;e.conversationId===(null==(t=this.selectedConversation)?void 0:t.id)&&(this.messages.push({id:e.id,sender_id:e.senderId,sender_name:e.senderName,body:e.body,created_at:e.createdAt}),this.renderMessages()),this.refreshRealtimeLists()}else["friend.requested","friend.accepted","friend.removed"].includes(o.type)||["invite.created","invite.updated","invite.expired"].includes(o.type)?this.refreshRealtimeLists():"approval.changed"===o.type||"moderation.session_revoked"===o.type?(toast(null!=(a=null!=(i=o.note)?i:o.reason)?a:"在线权限已变更","error"),globalThis.setTimeout(()=>globalThis.location.reload(),1200)):"error"===o.type&&toast(null!=(s=o.message)?s:"实时操作失败","error")}}async refreshRealtimeLists(){isLocalDemo()||await this.loadAll()}setMobileView(e){for(let t of(this.mobileView=e,this.root.dataset.mobileView=e,this.root.querySelectorAll("[data-social-view]")))t.setAttribute("aria-selected",String(t.dataset.socialView===e))}constructor(e,t){lobby_define_property(this,"session",void 0),lobby_define_property(this,"root",void 0),lobby_define_property(this,"friends",void 0),lobby_define_property(this,"requests",void 0),lobby_define_property(this,"conversations",void 0),lobby_define_property(this,"invites",void 0),lobby_define_property(this,"presence",void 0),lobby_define_property(this,"selectedConversation",void 0),lobby_define_property(this,"messages",void 0),lobby_define_property(this,"socket",void 0),lobby_define_property(this,"reconnectTimer",void 0),lobby_define_property(this,"mobileView",void 0),this.session=e,this.root=t,this.friends=[],this.requests=[],this.conversations=[],this.invites=[],this.presence=new Map,this.selectedConversation=null,this.messages=[],this.socket=null,this.reconnectTimer=null,this.mobileView="friends"}};function iconButton(e,t){let a=document.createElement("button");a.type="button",a.className="platform-icon-button",a.setAttribute("aria-label",t);let i=document.createElement("i");return i.className="ph ".concat(e),a.append(i),a}function statusLabel(e){var t;return null!=(t=({online:"在线",away:"暂离",dnd:"勿扰",invisible:"隐身"})[e])?t:"离线"}function ruleLabel(e){var t;return null!=(t=({eightball:"八球",nineball:"九球",fourball:"四球追分",snooker:"斯诺克",threecushion:"三库"})[e])?t:e}function ruleShort(e){var t;return null!=(t=({eightball:"8",nineball:"9",fourball:"4",snooker:"S",threecushion:"3"})[e])?t:"B"}(async function(){let e=await platformGate();if(!e)return;let t=mountPlatformPage(e,"lobby","社交大厅","看见实时在线好友，选择隐身，发起私聊或邀请一场比赛。");await new SocialPage(e,t).init()})().catch(e=>{toast(e instanceof Error?e.message:"社交大厅加载失败","error")})})();