/**
 * 다중 와이어 슬라이싱 4D 장면.
 * 좌측 원통형 잉곳이 평행 와이어 웹을 통과하고 우측에 얇은 웨이퍼가 연속 배출된다.
 * 입력은 랩에서 정규화된 diameter·deviation·quality 세 키뿐이다.
 */
import type { GLContext, Scene, SceneParams } from '../renderer';
import { FULLSCREEN_VS, FRAG_HEAD, clear, setCommonUniforms } from './common';
import { readVizPalette } from './theme';
import {
  IS_OUTPUT_COUNT, ingotSlicingModel, type IngotSlicingModel,
} from './models/ingotSlicing.model';

export const INGOT_SLICING_FS = `${FRAG_HEAD}
uniform vec3 uInk;
uniform vec3 uInfo;
uniform vec3 uS1;
uniform vec3 uS2;
uniform float uRadius;
uniform float uWobble;
uniform float uQuality;

float line(float d,float w){return 1.0-smoothstep(w,w+fwidth(d),abs(d));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float capsule(vec2 p,vec2 a,vec2 b,float r){
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
  return 1.0-smoothstep(r,r+fwidth(length(pa-ba*h)),length(pa-ba*h));
}
void paint(inout vec3 c,inout float a,vec3 s,float m){m=clamp(m,0.0,1.0);c=c*(1.0-m)+s*m;a=a*(1.0-m)+m;}

void main(){
  vec2 p=vUv; vec3 col=vec3(0.0); float alpha=0.0;
  float cycle=fract(uTime*0.10);
  float cut=smoothstep(0.04,0.68,cycle)*(1.0-smoothstep(0.88,1.0,cycle));
  float release=smoothstep(0.62,0.84,cycle)*(1.0-smoothstep(0.92,1.0,cycle));

  /* 사진 속 실제 와이어 위치에만 이동 광점이 흐른다. */
  float wireU=(p.x-0.245)/0.31;
  float wireCell=fract(wireU*22.0);
  float web=step(0.0,wireU)*step(wireU,1.0)*step(0.26,p.y)*step(p.y,0.77);
  float wires=line(wireCell-0.5,0.032)*web;
  float runner=pow(0.5+0.5*sin((p.y+uTime*0.54)*68.0),10.0);
  paint(col,alpha,uS2,wires*(0.06+0.70*runner));

  /* 절단 깊이는 조작값에 따른 잉곳 흔들림과 함께 실제 접촉부에서 진행한다. */
  float wob=uWobble*sin(uTime*2.2);
  float kerfY=mix(0.66,0.43,cut)+wob;
  float contact=line(p.y-kerfY,0.006)*step(0.29,p.x)*step(p.x,0.57);
  paint(col,alpha,uInfo,contact*(0.18+0.62*cut));

  /* 노즐에서 절단 계면으로 향하는 슬러리 입자. */
  vec2 cell=floor(p*vec2(92.0,70.0));
  float rnd=hash(cell);
  float fall=fract(rnd+uTime*(0.32+0.26*hash(cell+4.0)));
  vec2 particle=vec2((rnd-0.5)*0.12,fall*0.23);
  float jetA=capsule(p,vec2(0.565,0.69)-particle,vec2(0.535,0.53)-particle,0.0022);
  float jetB=capsule(p,vec2(0.615,0.67)-particle,vec2(0.565,0.52)-particle,0.0022);
  paint(col,alpha,uS2,(jetA+jetB)*step(0.70,rnd)*0.55);

  /* 배출 웨이퍼는 순서대로 점등되어 절단→분리→이송 흐름을 보여준다. */
  for(int k=0;k<${IS_OUTPUT_COUNT};k++){
    float fk=float(k)/float(${IS_OUTPUT_COUNT-1});
    vec2 c=vec2(mix(0.635,0.815,fk)+release*0.006*float(k),0.535-fk*0.015);
    vec2 q=(p-c)/vec2(0.010,0.142);
    float ring=line(length(q)-1.0,0.040);
    float good=step(fk,uQuality);
    float chase=1.0-smoothstep(0.0,0.20,abs(fract(cycle*1.3)-fk));
    paint(col,alpha,mix(uInfo,uS1,good),ring*(0.05+0.30*release+0.48*chase));
  }
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
