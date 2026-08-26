import rawManifest from './realisticBackdrops.json';

type Motion = 'rise'|'fall'|'scan'|'orbit'|'pulse'|'em';
type Profile = Readonly<{
  processId:string;
  x:number;
  y:number;
  hue:string;
  motion:Motion;
  asset?:string;
  stageAssets?:Readonly<Record<string,string>>;
  stageFocus?:Readonly<Record<string,Readonly<{x:number;y:number}>>>;
  stageMotion?:Readonly<Record<string,Motion>>;
}>;
const manifest = rawManifest as unknown as {
  backdrops: Readonly<Record<string, string>>;
  profiles: Readonly<Record<string, Profile>>;
};
const BACKDROPS = manifest.backdrops;
const PROFILES = manifest.profiles;

export function realisticBackdropUrl(processId:string):string|undefined {
  const file=BACKDROPS[processId]; if(!file)return undefined;
  return `${import.meta.env?.BASE_URL??'/'}assets/simulator-realistic/${file}`;
}
function assetUrl(file:string):string{return `${import.meta.env?.BASE_URL??'/'}assets/simulator-realistic/${file}`}
export function hasRealisticBackdrop(processId:string):boolean{return Object.hasOwn(BACKDROPS,processId)}
export const REALISTIC_BACKDROP_PROCESS_IDS:readonly string[]=Object.freeze(Object.keys(BACKDROPS));

const STYLE_ID='scene-4d-runtime-style';
function ensureStyle(doc:Document):void{
  if(doc.getElementById(STYLE_ID))return;
  const style=doc.createElement('style'); style.id=STYLE_ID; style.textContent=`
.sceneBox[data-four-d=true]{position:relative;isolation:isolate;overflow:hidden;background:#050914;perspective:900px}
.sceneBox[data-four-d=true] .scene4d{position:absolute;inset:0 auto auto 0;inline-size:100%;aspect-ratio:16/10;z-index:0;overflow:hidden;pointer-events:none;transform-style:preserve-3d;background:#050914;border-radius:8px}
.scene4d__equipment{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--fx) var(--fy);filter:contrast(1.16) saturate(1.14) brightness(.88);animation:s4-breathe 8s ease-in-out infinite alternate}
.scene4d__depth{position:absolute;inset:0;background:radial-gradient(circle at var(--fx) var(--fy),transparent 0 18%,rgba(2,7,16,.08) 42%,rgba(2,7,16,.64) 100%),linear-gradient(110deg,rgba(255,255,255,.1),transparent 25% 74%,rgba(80,180,255,.1));transform:translateZ(5px)}
.scene4d__core{position:absolute;left:calc(var(--fx) - 14%);top:calc(var(--fy) - 18%);width:28%;height:36%;border-radius:50%;background:radial-gradient(ellipse,color-mix(in srgb,var(--hue) 66%,transparent),transparent 68%);filter:blur(7px);mix-blend-mode:screen;animation:s4-core 2.4s ease-in-out infinite}
.scene4d__scan{position:absolute;left:8%;right:8%;top:var(--fy);height:2px;background:linear-gradient(90deg,transparent,var(--hue),#fff,var(--hue),transparent);box-shadow:0 0 13px var(--hue),0 0 32px var(--hue);animation:s4-scan 3.8s ease-in-out infinite}
.scene4d__particle{position:absolute;left:calc(var(--fx) + var(--dx));top:calc(var(--fy) + var(--dy));width:var(--s);height:var(--s);border-radius:50%;background:#fff;box-shadow:0 0 7px 2px var(--hue);animation:s4-particle var(--dur) linear infinite;animation-delay:var(--delay);opacity:0}
.scene4d__rail{position:absolute;inset:7%;border:1px solid color-mix(in srgb,var(--hue) 42%,transparent);box-shadow:inset 0 0 18px color-mix(in srgb,var(--hue) 12%,transparent);clip-path:polygon(0 0,14% 0,14% 2px,2px 2px,2px 16%,0 16%,0 0,100% 0,100% 16%,calc(100% - 2px) 16%,calc(100% - 2px) 2px,86% 2px,86% 0,100% 0,100% 100%,86% 100%,86% calc(100% - 2px),calc(100% - 2px) calc(100% - 2px),calc(100% - 2px) 84%,100% 84%,100% 100%,0 100%,0 84%,2px 84%,2px calc(100% - 2px),14% calc(100% - 2px),14% 100%);opacity:.8}
.sceneBox[data-four-d=true] .sceneBox__canvas{position:relative;z-index:2;opacity:.46!important;background:transparent!important;filter:saturate(1.12) contrast(1.04);mix-blend-mode:normal}
.sceneBox[data-stage=basic] .scene4d__equipment{inset:0;width:100%;height:100%;animation-duration:10s}
.sceneBox[data-stage=basic] .scene4d__rail{opacity:.35}.sceneBox[data-stage=basic] .scene4d__scan{opacity:.45}
.sceneBox[data-stage=applied] .scene4d__equipment{inset:0;width:100%;height:100%}
.sceneBox[data-stage=applied] .scene4d__rail{inset:5%}
.sceneBox[data-stage=advanced] .scene4d__equipment{inset:0;width:100%;height:100%;filter:contrast(1.24) saturate(1.22) brightness(.82)}
.sceneBox[data-stage=advanced] .scene4d__depth{background:repeating-linear-gradient(0deg,rgba(75,210,255,.07) 0 1px,transparent 1px 38px),repeating-linear-gradient(90deg,rgba(75,210,255,.06) 0 1px,transparent 1px 38px),radial-gradient(circle at var(--fx) var(--fy),transparent 0 18%,rgba(2,7,16,.12) 46%,rgba(2,7,16,.68) 100%)}
.sceneBox[data-stage=advanced] .scene4d__rail{inset:3%;opacity:1}.sceneBox[data-stage=advanced] .scene4d__core{animation-duration:1.55s}
.sceneBox[data-scene=filmGrowth] .sceneBox__canvas{opacity:.22!important}.sceneBox[data-scene=aldCycle] .sceneBox__canvas{opacity:.20!important}
.sceneBox[data-scene=filmGrowth][data-stage=basic] .sceneBox__canvas{opacity:.12!important}
.sceneBox[data-scene=filmGrowth][data-stage=applied] .sceneBox__canvas{opacity:.10!important}
.sceneBox[data-scene=aldCycle][data-stage=basic] .sceneBox__canvas{opacity:.11!important}.sceneBox[data-scene=aldCycle][data-stage=advanced] .sceneBox__canvas{opacity:.08!important}.sceneBox[data-scene=ionTrajectory][data-stage=advanced] .sceneBox__canvas{opacity:.14!important}
.sceneBox[data-scene=crystalGrowth] .sceneBox__canvas,.sceneBox[data-scene=aerialImage] .sceneBox__canvas,.sceneBox[data-scene=plasma] .sceneBox__canvas,.sceneBox[data-scene=ionTrajectory] .sceneBox__canvas{opacity:.34!important}
.sceneBox[data-scene=crystalGrowth][data-stage=basic] .sceneBox__canvas{opacity:.20!important}.sceneBox[data-scene=crystalGrowth][data-stage=applied] .sceneBox__canvas{opacity:.16!important}
.sceneBox[data-scene=aerialImage][data-stage=basic] .sceneBox__canvas{opacity:.20!important}
.sceneBox[data-scene=aerialImage][data-stage=applied] .sceneBox__canvas{opacity:.16!important}
.sceneBox[data-scene=crystalGrowth][data-stage=advanced] .sceneBox__canvas{opacity:.08!important}.sceneBox[data-scene=filmGrowth][data-stage=advanced] .sceneBox__canvas{opacity:.08!important}.sceneBox[data-scene=aerialImage][data-stage=advanced] .sceneBox__canvas{opacity:.14!important}
.sceneBox[data-scene=plasma][data-stage=advanced] .sceneBox__canvas{opacity:.18!important}
.sceneBox[data-scene=plasma][data-stage=applied] .sceneBox__canvas{opacity:.24!important}
.sceneBox[data-scene=polishProfile][data-stage=applied] .scene4d__scan{display:none}
.sceneBox[data-scene=waferMap][data-stage=applied] .sceneBox__canvas{opacity:.16!important}.sceneBox[data-scene=waferMap][data-stage=advanced] .sceneBox__canvas{opacity:.12!important}
.sceneBox[data-scene=probeScrub][data-stage=basic] .sceneBox__canvas{opacity:.18!important}.sceneBox[data-scene=probeScrub][data-stage=advanced] .sceneBox__canvas{opacity:.16!important}
.sceneBox[data-scene=probeScrub][data-stage=basic] .scene4d__core{opacity:.28}.sceneBox[data-scene=probeScrub][data-stage=advanced] .scene4d__core{opacity:.22}
.sceneBox[data-scene=polishProfile] .sceneBox__canvas,.sceneBox[data-scene=probeScrub] .sceneBox__canvas,.sceneBox[data-scene=waferMap] .sceneBox__canvas,.sceneBox[data-scene=packageThermal] .sceneBox__canvas,.sceneBox[data-scene=moistureSoak] .sceneBox__canvas,.sceneBox[data-scene=shearTest] .sceneBox__canvas{opacity:.42!important}
.sceneBox[data-scene=polishProfile][data-stage=applied] .sceneBox__canvas{opacity:.18!important}
/* 금속배선·CMP 심화: 캔버스를 display:none 하면 장면의 높이 기준도 사라져
   절대배치 실사 레이어까지 흰 공백 뒤로 숨는다. 실사 설비·4D CMP 단면을 함께 보이된,
   배경의 EM 손상 위치가 읽히도록 오버레이만 절제한다. */
.sceneBox[data-scene=polishProfile][data-stage=advanced] .sceneBox__canvas{display:block!important;opacity:.28!important}
.sceneBox[data-scene=packageThermal][data-stage=basic] .sceneBox__canvas{opacity:.22!important}
.sceneBox[data-scene=moistureSoak][data-stage=applied] .sceneBox__canvas{opacity:.18!important}
.sceneBox[data-scene=shearTest][data-stage=advanced] .sceneBox__canvas{opacity:.20!important}
.sceneBox[data-four-d=true] figcaption{position:relative;z-index:4;background:var(--surface,#fff)!important;margin-top:0!important;padding-top:8px!important}
.sceneBox[data-motion=orbit] .scene4d__scan{animation:s4-orbit 4.2s linear infinite;left:calc(var(--fx) - 12%);right:auto;top:calc(var(--fy) - 12%);width:24%;height:24%;border:2px solid var(--hue);border-radius:50%;background:transparent}
.sceneBox[data-motion=pulse] .scene4d__scan{animation:s4-pulse 2.5s ease-out infinite;left:calc(var(--fx) - 4%);right:auto;top:calc(var(--fy) - 6%);width:8%;height:12%;border:2px solid var(--hue);border-radius:50%;background:transparent}
.sceneBox[data-motion=rise] .scene4d__particle{animation-name:s4-particle-rise}
.sceneBox[data-motion=em] .scene4d__scan{left:18%;right:auto;top:39%;width:62%;height:2px;border:0;border-radius:0;background:linear-gradient(90deg,transparent,#ffb061 14%,#fff 48%,#ff8a3d 82%,transparent);box-shadow:0 0 8px #ff9a4a;animation:s4-em-scan 2.8s linear infinite}
.sceneBox[data-motion=em] .scene4d__core{left:69%;top:35%;width:13%;height:15%;background:radial-gradient(ellipse,rgba(255,90,38,.72),rgba(255,150,62,.20) 42%,transparent 72%);animation:s4-void 2.2s ease-in-out infinite}
.sceneBox[data-motion=em] .scene4d__particle{left:calc(18% + var(--dx));top:calc(41% + var(--dy));background:#ffd19a;box-shadow:0 0 6px 1px #ff8a3d;animation-name:s4-em-flow}
.sceneBox[data-scene=plasma][data-stage=advanced] .scene4d__particle{width:calc(var(--s) + 1px);height:calc(var(--s) + 3px);border-radius:45%;background:#efe4ff;box-shadow:0 0 9px 2px #a76bff}
.sceneBox[data-scene=waferMap][data-stage=applied] .scene4d__core,.sceneBox[data-scene=waferMap][data-stage=advanced] .scene4d__core{opacity:.22;animation-duration:3.8s}.sceneBox[data-scene=waferMap][data-stage=applied] .scene4d__particle,.sceneBox[data-scene=waferMap][data-stage=advanced] .scene4d__particle{opacity:.35}
/* 실사 배경은 맥락, 물리 캔버스는 학습 대상이다. 신호가 배경에 묻히지 않게 전 씬의 최소 불투명도를 보장한다. */
.sceneBox[data-four-d=true] .scene4d__equipment{filter:contrast(1.08) saturate(.82) brightness(.48)!important}
.sceneBox[data-four-d=true] .scene4d__depth{background:radial-gradient(circle at var(--fx) var(--fy),rgba(2,7,16,.12) 0 16%,rgba(2,7,16,.48) 44%,rgba(2,7,16,.82) 100%),linear-gradient(110deg,rgba(255,255,255,.04),transparent 28% 72%,rgba(80,180,255,.06))!important}
.sceneBox[data-four-d=true] .sceneBox__canvas{opacity:.74!important;filter:saturate(1.28) contrast(1.22) drop-shadow(0 0 7px rgba(90,210,255,.22))!important}
.sceneBox[data-four-d=true] .sceneBox__titlebar{background:rgba(5,12,24,.92)!important;color:#eef8ff!important;border:1px solid rgba(126,211,255,.28);box-shadow:0 5px 18px rgba(0,0,0,.32)}
@keyframes s4-breathe{to{filter:contrast(1.2) saturate(1.2) brightness(.96)}}
@keyframes s4-core{0%,100%{opacity:.35;transform:scale(.84)}50%{opacity:.92;transform:scale(1.16)}}
@keyframes s4-scan{0%,100%{transform:translateY(-105px);opacity:0}15%,85%{opacity:.8}50%{transform:translateY(105px)}}
@keyframes s4-particle{0%{opacity:0;transform:translate3d(0,-55px,0) scale(.4)}18%{opacity:.9}82%{opacity:.55}100%{opacity:0;transform:translate3d(0,70px,40px) scale(1.5)}}
@keyframes s4-particle-rise{0%{opacity:0;transform:translate3d(0,55px,0) scale(.4)}18%{opacity:.9}82%{opacity:.55}100%{opacity:0;transform:translate3d(0,-70px,40px) scale(1.5)}}
@keyframes s4-em-scan{0%{transform:translateX(-18%);opacity:0}15%,82%{opacity:.88}100%{transform:translateX(18%);opacity:0}}
@keyframes s4-em-flow{0%{opacity:0;transform:translate3d(-90px,0,0) scale(.6)}20%{opacity:.95}78%{opacity:.65}100%{opacity:0;transform:translate3d(115px,0,18px) scale(1.1)}}
@keyframes s4-void{0%,100%{opacity:.30;transform:scale(.82)}50%{opacity:.88;transform:scale(1.18)}}
@keyframes s4-orbit{to{transform:rotate(360deg) scale(.88)}}@keyframes s4-pulse{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(5)}}
@media(prefers-reduced-motion:reduce){.scene4d *{animation-play-state:paused!important}.sceneBox[data-four-d=true] .sceneBox__canvas{transform:none}}
`; doc.head.appendChild(style);
}

function makeParticle(doc:Document,i:number):HTMLSpanElement{
  const dot=doc.createElement('span'); dot.className='scene4d__particle';
  const angle=i*2.39996,radius=5+(i%5)*3;
  dot.style.setProperty('--dx',`${Math.cos(angle)*radius}%`); dot.style.setProperty('--dy',`${Math.sin(angle)*radius*.45}%`);
  dot.style.setProperty('--s',`${2+i%4}px`); dot.style.setProperty('--dur',`${2.1+(i%5)*.42}s`); dot.style.setProperty('--delay',`${-i*.31}s`);
  return dot;
}

/** 장비 사진(깊이)·시간 반응·WebGL 물리층을 동일 랜드마크 좌표로 조립한다. */
export function applyRealisticBackdrop(canvas:HTMLCanvasElement,sceneId:string,stage?:string):void{
  const p=PROFILES[sceneId],stageKey=(stage??'basic').replace(/^lab-/,'');
  const stageAsset=p?.stageAssets?.[stageKey];
  const url=p&&(stageAsset?assetUrl(stageAsset):p.asset?assetUrl(p.asset):realisticBackdropUrl(p.processId)); if(!p||!url||!canvas.style)return;
  const focus=p.stageFocus?.[stageKey]??p;
  const host=canvas.parentElement,doc=canvas.ownerDocument; if(!host||!doc?.head)return; ensureStyle(doc);
  host.dataset.fourD='true'; host.dataset.motion=p.stageMotion?.[stageKey]??p.motion; host.dataset.stage=stageKey; host.dataset.scene=sceneId;
  host.style.setProperty('--fx',`${focus.x}%`); host.style.setProperty('--fy',`${focus.y}%`); host.style.setProperty('--hue',p.hue);
  let layer=host.querySelector<HTMLElement>(':scope > .scene4d');
  if(!layer){
    layer=doc.createElement('div'); layer.className='scene4d'; layer.setAttribute('aria-hidden','true');
    const img=doc.createElement('img'); img.className='scene4d__equipment'; img.alt=''; img.decoding='async';
    const depth=doc.createElement('span');depth.className='scene4d__depth'; const core=doc.createElement('span');core.className='scene4d__core';
    const scan=doc.createElement('span');scan.className='scene4d__scan'; const rail=doc.createElement('span');rail.className='scene4d__rail';
    layer.append(img,depth,core,scan,rail,...Array.from({length:18},(_,i)=>makeParticle(doc,i))); host.insertBefore(layer,canvas);
    host.addEventListener('pointermove',event=>{const box=host.getBoundingClientRect();host.style.setProperty('--px',`${(.5-(event.clientX-box.left)/box.width)*10}px`);host.style.setProperty('--py',`${(.5-(event.clientY-box.top)/box.height)*7}px`)},{passive:true});
    host.addEventListener('pointerleave',()=>{host.style.setProperty('--px','0px');host.style.setProperty('--py','0px')},{passive:true});
  }
  const img=layer.querySelector<HTMLImageElement>('.scene4d__equipment'); if(img&&img.src!==new URL(url,doc.baseURI).href)img.src=url;
  layer.dataset.scene=sceneId;
}
