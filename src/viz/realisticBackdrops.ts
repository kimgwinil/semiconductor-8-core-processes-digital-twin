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
.sceneBox[data-four-d=true] .sceneBox__canvas{position:relative;z-index:2;opacity:var(--s4-canvas-opacity,.90)!important;background:transparent!important;filter:saturate(1.28) contrast(1.22) drop-shadow(0 0 7px rgba(90,210,255,.22));mix-blend-mode:normal}
.sceneBox[data-stage=basic] .scene4d__equipment{inset:0;width:100%;height:100%;animation-duration:10s}
.sceneBox[data-stage=basic] .scene4d__rail{opacity:.35}.sceneBox[data-stage=basic] .scene4d__scan{opacity:.45}
.sceneBox[data-stage=applied] .scene4d__equipment{inset:0;width:100%;height:100%}
.sceneBox[data-stage=applied] .scene4d__rail{inset:5%}
.sceneBox[data-stage=advanced] .scene4d__equipment{inset:0;width:100%;height:100%;filter:contrast(1.24) saturate(1.22) brightness(.82)}
.sceneBox[data-stage=advanced] .scene4d__depth{background:repeating-linear-gradient(0deg,rgba(75,210,255,.07) 0 1px,transparent 1px 38px),repeating-linear-gradient(90deg,rgba(75,210,255,.06) 0 1px,transparent 1px 38px),radial-gradient(circle at var(--fx) var(--fy),transparent 0 18%,rgba(2,7,16,.12) 46%,rgba(2,7,16,.68) 100%)}
.sceneBox[data-stage=advanced] .scene4d__rail{inset:3%;opacity:1}.sceneBox[data-stage=advanced] .scene4d__core{animation-duration:1.55s}
.sceneBox[data-scene=crystalGrowth][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=crystalGrowth][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=crystalGrowth][data-stage=advanced]{--s4-canvas-opacity:.88;--s4-photo-brightness:.42}
.sceneBox[data-scene=aerialImage][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=aerialImage][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=aerialImage][data-stage=advanced]{--s4-canvas-opacity:.88;--s4-photo-brightness:.42}
.sceneBox[data-scene=plasma][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=plasma][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=plasma][data-stage=advanced]{--s4-canvas-opacity:.88;--s4-photo-brightness:.42}
.sceneBox[data-scene=ionTrajectory][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=ionTrajectory][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=ionTrajectory][data-stage=advanced]{--s4-canvas-opacity:.88;--s4-photo-brightness:.42}
.sceneBox[data-scene=polishProfile][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=polishProfile][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=polishProfile][data-stage=advanced]{--s4-canvas-opacity:.88;--s4-photo-brightness:.42}
/* 🔴 2026-09-01 변수 전환에서 **되살린 규칙 2종.** 위 블록을 변수화하며 범위 삭제로 함께 사라졌던 것을
 * 팀장이 원본 대조로 찾아 복원했다. 둘 다 불투명도가 아니라 **씬 요소별 연출 결정**이라 변수와 무관하다.
 * (같은 범위에 있던 polishProfile[advanced] .sceneBox__canvas 의 display:block!important 는 복원하지 않았다 —
 *  .sceneBox__canvas 기본 규칙이 이미 display:block 이고(index.css:508) 이 트리에서 캔버스에
 *  display:none 을 거는 곳이 0곳임을 확인했다. 방어용 잔재였다.) */
.sceneBox[data-scene=polishProfile][data-stage=applied] .scene4d__scan{display:none}
.sceneBox[data-scene=probeScrub][data-stage=basic] .scene4d__core{opacity:.28}
.sceneBox[data-scene=probeScrub][data-stage=advanced] .scene4d__core{opacity:.22}
.sceneBox[data-scene=aldCycle][data-stage=basic]{--s4-canvas-opacity:.82;--s4-photo-brightness:.55}
.sceneBox[data-scene=aldCycle][data-stage=applied]{--s4-canvas-opacity:.85;--s4-photo-brightness:.48}
.sceneBox[data-scene=aldCycle][data-stage=advanced]{--s4-canvas-opacity:.82;--s4-photo-brightness:.42}
.sceneBox[data-scene=filmGrowth][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=filmGrowth][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=filmGrowth][data-stage=advanced]{--s4-canvas-opacity:.95;--s4-photo-brightness:.44}
.sceneBox[data-scene=waferMap][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=waferMap][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=waferMap][data-stage=advanced]{--s4-canvas-opacity:.95;--s4-photo-brightness:.44}
.sceneBox[data-scene=packageThermal][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=packageThermal][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=packageThermal][data-stage=advanced]{--s4-canvas-opacity:.95;--s4-photo-brightness:.44}
.sceneBox[data-scene=moistureSoak][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=moistureSoak][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=moistureSoak][data-stage=advanced]{--s4-canvas-opacity:.95;--s4-photo-brightness:.44}
.sceneBox[data-scene=shearTest][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=shearTest][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=shearTest][data-stage=advanced]{--s4-canvas-opacity:.95;--s4-photo-brightness:.44}
.sceneBox[data-scene=probeScrub][data-stage=basic]{--s4-canvas-opacity:.90;--s4-photo-brightness:.62}
.sceneBox[data-scene=probeScrub][data-stage=applied]{--s4-canvas-opacity:.92;--s4-photo-brightness:.52}
.sceneBox[data-scene=probeScrub][data-stage=advanced]{--s4-canvas-opacity:.89;--s4-photo-brightness:.44}
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
.sceneBox[data-four-d=true] .scene4d__equipment{filter:contrast(1.08) saturate(.82) brightness(var(--s4-photo-brightness,.55))!important}
.sceneBox[data-four-d=true] .scene4d__depth{background:radial-gradient(circle at var(--fx) var(--fy),rgba(2,7,16,.12) 0 16%,rgba(2,7,16,.48) 44%,rgba(2,7,16,.82) 100%),linear-gradient(110deg,rgba(255,255,255,.04),transparent 28% 72%,rgba(80,180,255,.06))!important}
.sceneBox[data-four-d=true] .sceneBox__titlebar{background:rgba(5,12,24,.92)!important;color:#eef8ff!important;border:1px solid rgba(126,211,255,.28);box-shadow:0 5px 18px rgba(0,0,0,.32)}
.sceneBox[data-four-d=true][data-backdrop-ready=false] .scene4d,
.sceneBox[data-four-d=true][data-backdrop-ready=false] .sceneBox__canvas{opacity:0!important}
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

/**
 * 스타일시트가 겨누는 `.sceneBox` 를 찾는다. **없으면 `null`.**
 *
 * 🔴 `canvas.closest()` 를 직접 부르지 않는 이유(2026-09-01 회귀로 실제로 터졌다):
 *    폴백 2D 테스트 하네스(`tests/unit/viz-fallback-parity.test.ts`)는 진짜 DOM 대신
 *    `getContext` 만 갖춘 **캔버스 스텁**을 넘긴다. 거기엔 `closest` 가 없어
 *    `TypeError: canvas.closest is not a function` 으로 **58건이 한꺼번에 깨졌다.**
 *    이 파일은 브라우저 전용이 아니라 **그 하네스도 통과하는 경로**여야 한다.
 */
function sceneBoxOf(canvas:HTMLCanvasElement):HTMLElement|null{
  return typeof canvas.closest==='function' ? canvas.closest<HTMLElement>('.sceneBox') : null;
}

/** 장비 사진(깊이)·시간 반응·WebGL 물리층을 동일 랜드마크 좌표로 조립한다. */
export function applyRealisticBackdrop(canvas:HTMLCanvasElement,sceneId:string,stage?:string):void{
  const p=PROFILES[sceneId],stageKey=(stage??'basic').replace(/^lab-/,'');
  const stageAsset=p?.stageAssets?.[stageKey];
  const url=p&&(stageAsset?assetUrl(stageAsset):p.asset?assetUrl(p.asset):realisticBackdropUrl(p.processId));
  if(!p||!url||!canvas.style){
    /* 🔴 배경이 없는 씬으로 갈아탈 때 표지를 지운다. 표지가 `.sceneBox` 로 올라간 뒤로는
     * 남은 `data-four-d` 가 `{background:#050914;overflow:hidden}` 를 칸 전체에 걸어
     * **배경도 없는데 칸이 까매지는** 새 결함이 된다(종전에는 canvasWrap 에만 걸려 눈에 덜 띄었다).
     * 레이어 자체는 `LabRunner.tsx:716` 의 `useLayoutEffect` 가 이미 지운다. */
    const stale=sceneBoxOf(canvas);
    if(stale){delete stale.dataset.fourD; delete stale.dataset.backdropReady; delete stale.dataset.motion; delete stale.dataset.stage; delete stale.dataset.scene;}
    return;
  }
  const focus=p.stageFocus?.[stageKey]??p;
  /* 🔴 2026-09-01 결함 수정 — **표지를 붙이는 곳과 레이어가 들어갈 곳은 다른 요소다.**
   *
   * 종전에는 `host = canvas.parentElement` 하나로 둘을 겸했다. 그런데 캔버스의 부모는
   * `.sceneBox__canvasWrap`(`LabRunner.tsx` 의 `<div className="sceneBox__canvasWrap">`)이고,
   * 이 파일이 주입하는 스타일시트(`ensureStyle`)의 규칙은 **전부 `.sceneBox[data-four-d=true]`** 로
   * 쓰여 있다(위 34·35·42·74·84~89·99행). `sceneBox__canvasWrap` 은 `sceneBox` 클래스를 갖지
   * 않으므로(BEM 상 별개 클래스명이다) **그 규칙 전부가 0개 요소에 걸렸다.**
   *
   * 결과(2026-09-01 헤드리스 실측 · 조용한 트리 · 29개 캔버스):
   *   · `document.querySelectorAll('.sceneBox[data-four-d="true"]').length` = **0**
   *   · 캔버스를 사진 위로 올리는 `{position:relative;z-index:2}` 가 죽어 캔버스는 `position:static`,
   *     `.scene4d__equipment` 는 `position:absolute` → **positioned 인 사진이 static 인 캔버스 위에 그려졌다.**
   *   · 사진층 유무 A/B 픽셀 대조에서 **26개 캔버스가 가림도 98.3~100 %**(중앙값 99.56 %).
   *     즉 학습자가 보는 픽셀의 99 % 가 물리 출력이 아니었다.
   *   · 예외가 원인을 못박는다 — `.sceneBox--slicing .sceneBox__canvas{position:relative;z-index:1}`
   *     (`index.css:518`)로 **명시적으로 위로 올려 둔 slicing 칸만** 상대적으로 덜 가려졌다.
   *
   * 🔴 선택자를 `.sceneBox__canvasWrap[...]` 로 바꾸는 것은 **오답**이다 — 같은 스타일시트가
   *    `figcaption`(:74)·`.sceneBox__titlebar`(:87)도 겨누는데 그 둘은 canvasWrap 의 자손이 아니라
   *    `.sceneBox` 의 자식이다. 그래서 **표지를 `.sceneBox` 로 올리는 쪽**이 원저자 의도에 맞는다.
   *
   * 레이어(`.scene4d`)는 **종전대로 canvasWrap 안에** 넣는다 — 배경이 타이틀바까지 덮으면 안 되고,
   * `.sceneBox__canvasWrap{position:relative}`(`index.css:509`)가 이미 있어 `.scene4d{position:absolute}`
   * 의 기준 상자가 캔버스 영역으로 정확히 잡힌다. */
  const wrap=canvas.parentElement,doc=canvas.ownerDocument; if(!wrap||!doc?.head)return; ensureStyle(doc);
  /** 주입 스타일시트가 실제로 겨누는 요소. 못 찾으면 종전 동작으로 안전 퇴각한다. */
  const host=sceneBoxOf(canvas)??wrap;
  host.dataset.fourD='true'; host.dataset.motion=p.stageMotion?.[stageKey]??p.motion; host.dataset.stage=stageKey; host.dataset.scene=sceneId;
  host.dataset.backdropReady='false';
  host.style.setProperty('--fx',`${focus.x}%`); host.style.setProperty('--fy',`${focus.y}%`); host.style.setProperty('--hue',p.hue);
  let layer=wrap.querySelector<HTMLElement>(':scope > .scene4d');
  if(!layer){
    layer=doc.createElement('div'); layer.className='scene4d'; layer.setAttribute('aria-hidden','true');
    const img=doc.createElement('img'); img.className='scene4d__equipment'; img.alt=''; img.decoding='async';
    const depth=doc.createElement('span');depth.className='scene4d__depth'; const core=doc.createElement('span');core.className='scene4d__core';
    const scan=doc.createElement('span');scan.className='scene4d__scan'; const rail=doc.createElement('span');rail.className='scene4d__rail';
    /* 레이어는 canvasWrap 안, 캔버스 바로 앞에 둔다(종전과 같은 자리).
     * 시차(parallax) 기준 상자도 canvasWrap 이어야 손끝 위치와 그림이 맞는다 —
     * `.sceneBox` 로 올리면 타이틀바·설명 높이까지 분모에 들어가 어긋난다.
     * `--px`·`--py` 는 상속되므로 wrap 에 얹어도 레이어 자손이 그대로 읽는다. */
    layer.append(img,depth,core,scan,rail,...Array.from({length:18},(_,i)=>makeParticle(doc,i))); wrap.insertBefore(layer,canvas);
    wrap.addEventListener('pointermove',event=>{const box=wrap.getBoundingClientRect();wrap.style.setProperty('--px',`${(.5-(event.clientX-box.left)/box.width)*10}px`);wrap.style.setProperty('--py',`${(.5-(event.clientY-box.top)/box.height)*7}px`)},{passive:true});
    wrap.addEventListener('pointerleave',()=>{wrap.style.setProperty('--px','0px');wrap.style.setProperty('--py','0px')},{passive:true});
  }
  const img=layer.querySelector<HTMLImageElement>('.scene4d__equipment');
  if(img){
    const expected=new URL(url,doc.baseURI).href;
    const reveal=():void=>{if(img.src===expected)host.dataset.backdropReady='true'};
    img.onload=reveal;
    img.onerror=()=>{if(img.src===expected)host.dataset.backdropReady='error'};
    if(img.src!==expected)img.src=url;
    if(img.complete&&img.naturalWidth>0)reveal();
  }
  layer.dataset.scene=sceneId;
}
