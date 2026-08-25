/**
 * 다중 와이어 슬라이싱 4D 장면.
 * 좌측 원통형 잉곳이 평행 와이어 웹을 통과하고 우측에 얇은 웨이퍼가 연속 배출된다.
 * 입력은 랩에서 정규화된 diameter·deviation·quality 세 키뿐이다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, clear, setCommonUniforms } from './common';
import { readVizPalette } from './theme';
import {
  IS_AXIS_Y, IS_INGOT_X0, IS_INGOT_X1, IS_OUTPUT_COUNT, IS_OUTPUT_X0, IS_OUTPUT_X1,
  IS_WIRE_COUNT, IS_WIRE_X0, IS_WIRE_X1, ingotSlicingModel, type IngotSlicingModel,
} from './models/ingotSlicing.model';

const f = (v: number): string => Number.isInteger(v) ? v.toFixed(1) : String(v);

export const INGOT_SLICING_FS = `${FRAG_HEAD}
uniform vec3 uInk;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uRadius;
uniform float uWobble;
uniform float uQuality;

float aa(float d){return 1.0-smoothstep(-fwidth(d),fwidth(d),d);}
float box(vec2 p,vec2 c,vec2 h){vec2 d=abs(p-c)-h;return aa(max(d.x,d.y));}
float line(float d,float w){return 1.0-smoothstep(w,w+fwidth(d),abs(d));}
float ring(vec2 p,vec2 c,vec2 r,float w){vec2 q=(p-c)/r;return line(length(q)-1.0,w);}
float circle(vec2 p,vec2 c,float r){return aa(length(p-c)-r);}
void paint(inout vec3 c,inout float a,vec3 s,float m){m=clamp(m,0.0,1.0);c=c*(1.0-m)+s*m;a=a*(1.0-m)+m;}

void main(){
  vec2 p=vUv; vec3 col=vec3(0.0); float alpha=0.0;
  float phase=fract(uTime*0.12);
  /* 0~62%: 잉곳이 와이어 면으로 하강, 62~82%: 완전 절단, 82~100%: 리셋. */
  float cut=smoothstep(0.05,0.62,phase)*(1.0-smoothstep(0.82,1.0,phase));
  float release=smoothstep(0.62,0.82,phase)*(1.0-smoothstep(0.90,1.0,phase));
  float axis=${f(IS_AXIS_Y)}+mix(0.105,-0.015,cut);
  float wirePlane=${f(IS_AXIS_Y)}-uRadius+0.018;

  /* 설비 프레임·가이드 롤러. 와이어가 돌아가는 다중 와이어 쏘임을 먼저 보여준다. */
  paint(col,alpha,uInk,box(p,vec2(0.38,0.11),vec2(0.31,0.010))*.55);
  paint(col,alpha,uInk,box(p,vec2(0.38,0.92),vec2(0.31,0.010))*.55);
  paint(col,alpha,uS2,ring(p,vec2(0.12,0.16),vec2(0.042,0.065),0.045));
  paint(col,alpha,uS2,ring(p,vec2(0.66,0.16),vec2(0.042,0.065),0.045));
  paint(col,alpha,uS2,ring(p,vec2(0.12,0.87),vec2(0.042,0.065),0.045));
  paint(col,alpha,uS2,ring(p,vec2(0.66,0.87),vec2(0.042,0.065),0.045));

  /* 원통형 단결정 잉곳: 와이어 면으로 수직 하강하는 이송을 직접 보여준다. */
  float wob=uWobble*sin((p.x-${f(IS_INGOT_X0)})*32.0+uTime*2.2);
  float body=box(vec2(p.x,p.y-wob),vec2(${f((IS_INGOT_X0+IS_INGOT_X1)/2)},axis),vec2(${f((IS_INGOT_X1-IS_INGOT_X0)/2)},uRadius));
  float shade=0.20+0.30*smoothstep(axis-uRadius,axis+uRadius,p.y);
  paint(col,alpha,uS1,body*shade);
  paint(col,alpha,uInk,line(abs(p.y-axis-wob)-uRadius,0.002)*step(${f(IS_INGOT_X0)},p.x)*step(p.x,${f(IS_INGOT_X1)}));
  paint(col,alpha,uInfo,ring(p,vec2(${f(IS_INGOT_X0)},axis),vec2(0.030,uRadius),0.035));
  paint(col,alpha,uInfo,line(p.x-${f(IS_INGOT_X0)},0.002)*step(abs(p.y-axis),uRadius));

  /* 다중 와이어 웹: 상·하 롤러 사이를 빠르게 주행하는 평행 와이어. */
  float web=step(0.17,p.y)*step(p.y,0.86);
  float wireU=(p.x-${f(IS_WIRE_X0)})/${f(IS_WIRE_X1-IS_WIRE_X0)};
  float wireCell=fract(wireU*${f(IS_WIRE_COUNT)});
  float wires=line(wireCell-0.5,0.042)*step(0.0,wireU)*step(wireU,1.0)*web;
  float travelling=0.52+0.48*sin((p.y+phase*2.0)*52.0)*sin((p.y+phase*2.0)*52.0);
  /* 잉곳 앞을 와이어 전체가 관통하는 격자처럼 보이지 않게 한다.
     잉곳 밖의 주행 와이어와 내부의 절단 커프를 별개 형상으로 분리한다. */
  paint(col,alpha,uS2,wires*travelling*(1.0-body));
  /* 절단 홈은 와이어 접촉면에서 잉곳 위쪽으로 진행한다. 잉곳 전체에
     선을 겹치지 않고, 현재 절단 깊이까지만 콤프를 열어 실제 절단으로 읽힌다. */
  float kerfTop=mix(axis+uRadius,axis-uRadius-0.006,cut);
  float kerfMask=body*step(kerfTop,p.y);
  float kerfs=wires*kerfMask;
  paint(col,alpha,vec3(0.01),kerfs*.96);
  float contact=wires*line(p.y-kerfTop,0.010)*body;
  paint(col,alpha,uS2,contact*(0.55+0.45*sin(uTime*7.0)*sin(uTime*7.0)));

  /* 이송 방향 화살표: 내려가는 잉곳과 양방향 와이어 주행을 구분. */
  float feedArrow=line(p.x-0.035,0.002)*step(0.25,p.y)*step(p.y,0.48)
    +line(abs(p.x-0.035)-(p.y-0.25)*0.20,0.002)*step(0.25,p.y)*step(p.y,0.30);
  paint(col,alpha,uInfo,feedArrow*.85);
  float wireArrow=line(p.y-0.20,0.002)*step(0.23,p.x)*step(p.x,0.55)
    +line(abs(p.y-0.20)-(0.55-p.x)*0.15,0.002)*step(0.50,p.x)*step(p.x,0.56);
  paint(col,alpha,uS2,wireArrow*.85);

  /* 완전 절단 후: 각 웨이퍼가 잉곳 축 방향으로 간격을 벌리며 분리된다. */
  for(int k=0;k<${IS_OUTPUT_COUNT};k++){
    float fk=float(k)/float(${IS_OUTPUT_COUNT-1});
    float x=mix(${f(IS_OUTPUT_X0)},${f(IS_OUTPUT_X1)},fk)+release*0.025*float(k);
    float yy=${f(IS_AXIS_Y)}+(fk-0.5)*0.025;
    float disc=ring(p,vec2(x,yy),vec2(0.016,uRadius*0.92),0.065);
    float good=step(fk,uQuality);
    /* 이전 주기에서 생성된 웨이퍼를 항상 남겨 입력→절단→출력을
       한 화면에서 읽게 한다. 현재 주기의 분리 시점에만 밝기와 간격이 커진다. */
    paint(col,alpha,mix(uInfo,uS1,good),disc*(0.34+0.66*release)*(0.55+0.45*good));
  }
  /* 이송 레일 */
  paint(col,alpha,uInk,line(p.y-(axis-uRadius-0.055),0.002)*step(${f(IS_OUTPUT_X0-0.04)},p.x)*step(p.x,${f(IS_OUTPUT_X1+0.02)}));
  fragColor=vec4(col,alpha);
}`;

interface Uniforms { res: WebGLUniformLocation|null; time: WebGLUniformLocation|null; ink: WebGLUniformLocation|null; info: WebGLUniformLocation|null; s1: WebGLUniformLocation|null; s2: WebGLUniformLocation|null; radius: WebGLUniformLocation|null; wobble: WebGLUniformLocation|null; quality: WebGLUniformLocation|null }

export function createScene(): Scene {
  let ctx: GLContext|null=null, prog: WebGLProgram|null=null, u: Uniforms|null=null;
  let m: IngotSlicingModel=ingotSlicingModel({});
  return {
    id:'ingotSlicing', animated:true,
    init(gl){ctx=gl;prog=gl.program('ingotSlicing',FULLSCREEN_VS,INGOT_SLICING_FS);u={res:gl.uniform(prog,'uRes'),time:gl.uniform(prog,'uTime'),ink:gl.uniform(prog,'uInk'),info:gl.uniform(prog,'uInfo'),s1:gl.uniform(prog,'uS1'),s2:gl.uniform(prog,'uS2'),radius:gl.uniform(prog,'uRadius'),wobble:gl.uniform(prog,'uWobble'),quality:gl.uniform(prog,'uQuality')};},
    update(params:SceneParams){m=ingotSlicingModel(params);},
    draw(t){if(!ctx||ctx.lost||!prog||!u)return;const gl=ctx.gl;clear(gl);gl.useProgram(prog);setCommonUniforms(gl,u.res,u.time,ctx.size.width,ctx.size.height,t);const p=readVizPalette(ctx.canvas);const s1=p.series[0]??p.ink,s2=p.series[1]??p.info;if(u.ink)gl.uniform3fv(u.ink,p.ink);if(u.info)gl.uniform3fv(u.info,p.info);if(u.s1)gl.uniform3fv(u.s1,s1);if(u.s2)gl.uniform3fv(u.s2,s2);if(u.radius)gl.uniform1f(u.radius,m.radius);if(u.wobble)gl.uniform1f(u.wobble,m.wobble);if(u.quality)gl.uniform1f(u.quality,m.goodFraction);ctx.drawFullscreen();},
    dispose(){ctx=null;prog=null;u=null;},
  };
}
