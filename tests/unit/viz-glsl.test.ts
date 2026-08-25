/**
 * T1 — 셰이더 정적 검사.
 * GLSL 문법 오류는 런타임(WebGL 컴파일)에서만 드러나므로, 컴파일 전에 잡을 수 있는 것만이라도 잡는다.
 * 겸사겸사 **씬 모듈이 최상위에서 DOM 을 만지지 않는다**는 것도 확인한다
 * (이 테스트는 environment: 'node' 에서 돈다 — document/window 가 없다).
 */
import { describe, expect, it } from 'vitest';

import { FILM_GROWTH_FS, createScene as createFilm } from '@/viz/gl/scenes/filmGrowth';
import { PLASMA_FS, createScene as createPlasma } from '@/viz/gl/scenes/plasma';
import { POLISH_FS, createScene as createPolish } from '@/viz/gl/scenes/polishProfile';
import {
  ION_BG_FS, ION_PARTICLE_VS, ION_PARTICLE_FS, ION_PROFILE_VS, ION_PROFILE_FS,
  createScene as createIon,
} from '@/viz/gl/scenes/ionTrajectory';
import { ALD_CYCLE_FS, createScene as createAld } from '@/viz/gl/scenes/aldCycle';
import { STEP_COVERAGE_FS, createScene as createStep } from '@/viz/gl/scenes/stepCoverage';
/* 🔴 2026-08-22 추가 — wafer·photo 신규 2종. 2026-08-21 에 씬이 들어왔는데 이 파일의
   `CASES`·`factories` 에는 **오르지 않아** 정적 검사를 한 번도 받지 않았다(DEV 실측).
   `grep -rln "crystalGrowth" tests/` 적중 파일이 **0개**였다. */
import { CRYSTAL_GROWTH_FS, createScene as createCrystal } from '@/viz/gl/scenes/crystalGrowth';
import { AERIAL_IMAGE_FS, createScene as createAerial } from '@/viz/gl/scenes/aerialImage';
/* 🔴 2026-08-22 추가 — eds·packaging 신설 5종. `crystalGrowth`·`aerialImage` 때와 **같은 사고**를
   반복하지 않으려고 씬 신설과 같은 날 등재한다. 다섯 모두 상수를 TS 에서 `${glslFloat(...)}` 로
   주입받아 **문자열이 새로 조립**되므로 보간 잔재 위험 등급이 `ALD_CYCLE_FS` 와 같다. */
import { PROBE_SCRUB_FS, createScene as createProbeScrub } from '@/viz/gl/scenes/probeScrub';
import { WAFER_MAP_FS, createScene as createWaferMap } from '@/viz/gl/scenes/waferMap';
import { PACKAGE_THERMAL_FS, createScene as createPackageThermal } from '@/viz/gl/scenes/packageThermal';
import { MOISTURE_SOAK_FS, createScene as createMoistureSoak } from '@/viz/gl/scenes/moistureSoak';
import { SHEAR_TEST_FS, createScene as createShearTest } from '@/viz/gl/scenes/shearTest';
import { FULLSCREEN_VS } from '@/viz/gl/scenes/common';

type Stage = 'vert' | 'frag';

interface ShaderCase {
  name: string;
  src: string;
  stage: Stage;
}

const CASES: ShaderCase[] = [
  { name: 'FULLSCREEN_VS', src: FULLSCREEN_VS, stage: 'vert' },
  { name: 'FILM_GROWTH_FS', src: FILM_GROWTH_FS, stage: 'frag' },
  { name: 'PLASMA_FS', src: PLASMA_FS, stage: 'frag' },
  { name: 'POLISH_FS', src: POLISH_FS, stage: 'frag' },
  { name: 'ION_BG_FS', src: ION_BG_FS, stage: 'frag' },
  { name: 'ION_PARTICLE_VS', src: ION_PARTICLE_VS, stage: 'vert' },
  { name: 'ION_PARTICLE_FS', src: ION_PARTICLE_FS, stage: 'frag' },
  { name: 'ION_PROFILE_VS', src: ION_PROFILE_VS, stage: 'vert' },
  { name: 'ION_PROFILE_FS', src: ION_PROFILE_FS, stage: 'frag' },
  // 🔴 2026-08-21 추가 — 셰이더 7종 중 5종만 검사 중이었다. 특히 이 둘이 사각지대였다:
  //    · ALD_CYCLE_FS  : 상수를 TS 에서 주입받아 **문자열이 새로 조립**된다(보간 잔재 위험 최대)
  //    · STEP_COVERAGE_FS : 애초에 목록에 없었다
  { name: 'ALD_CYCLE_FS', src: ALD_CYCLE_FS, stage: 'frag' },
  { name: 'STEP_COVERAGE_FS', src: STEP_COVERAGE_FS, stage: 'frag' },
  /* 🔴 2026-08-22 추가 — 이 둘도 상수를 TS 에서 주입받아 **문자열이 새로 조립**된다
     (보간 잔재 위험이 `ALD_CYCLE_FS` 와 같은 등급이다). */
  { name: 'CRYSTAL_GROWTH_FS', src: CRYSTAL_GROWTH_FS, stage: 'frag' },
  { name: 'AERIAL_IMAGE_FS', src: AERIAL_IMAGE_FS, stage: 'frag' },
  /* 🔴 2026-08-22 추가 — 신설 5종. 씬이 들어온 당일 등재한다(종전엔 하루 늦어 정적 검사 0건이었다). */
  { name: 'PROBE_SCRUB_FS', src: PROBE_SCRUB_FS, stage: 'frag' },
  { name: 'WAFER_MAP_FS', src: WAFER_MAP_FS, stage: 'frag' },
  { name: 'PACKAGE_THERMAL_FS', src: PACKAGE_THERMAL_FS, stage: 'frag' },
  { name: 'MOISTURE_SOAK_FS', src: MOISTURE_SOAK_FS, stage: 'frag' },
  { name: 'SHEAR_TEST_FS', src: SHEAR_TEST_FS, stage: 'frag' },
];

/** 주석과 문자열을 지운 소스(괄호 균형 검사용). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function unbalanced(src: string): string | null {
  const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
  const open = new Set(['(', '{', '[']);
  const stack: string[] = [];
  for (const ch of src) {
    if (open.has(ch)) stack.push(ch);
    else if (ch in pairs) {
      const want = pairs[ch];
      const got = stack.pop();
      if (got !== want) return `'${ch}' 짝이 맞지 않음 (열린 것: ${got ?? '없음'})`;
    }
  }
  return stack.length === 0 ? null : `닫히지 않은 괄호 ${stack.length}개: ${stack.join('')}`;
}

function functionNames(src: string): string[] {
  const re = /^\s*(?:float|int|vec2|vec3|vec4|mat2|mat3|mat4|bool|void)\s+([A-Za-z_]\w*)\s*\(/gm;
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(src);
  while (m) {
    const name = m[1];
    if (name) out.push(name);
    m = re.exec(src);
  }
  return out;
}

describe('GLSL 셰이더 정적 검사', () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const clean = stripComments(c.src);

      it('#version 300 es 가 첫 줄이다', () => {
        const first = c.src.split('\n').find((l) => l.trim().length > 0) ?? '';
        expect(first.trim()).toBe('#version 300 es');
      });

      it('보간 잔재(${...})가 남아 있지 않다', () => {
        expect(c.src.includes('${')).toBe(false);
      });

      /* 🔴 2026-08-22 신설 — 위 검사는 **템플릿이 통째로 안 펼쳐진 경우**만 잡는다.
         상수를 `${glslFloat(x)}` 로 주입하는 씬(ALD·crystalGrowth·aerialImage·신설 5종)에서
         정작 잦은 사고는 **펼쳐지긴 했는데 값이 없는 것**이다 — `x` 가 undefined 면
         `"undefined"` 가, NaN·∞ 면 `"NaN"`·`"Infinity"` 가 GLSL 리터럴 자리에 그대로 박힌다.
         셋 다 GLSL 의 토큰이 아니므로 나타나는 즉시 컴파일 실패이고, 화면은 통째로 검게 남는다.
         전 셰이더 공통으로 본다.
         🔴 주석은 걷어낸 `clean` 을 본다 — 여러 씬이 GLSL 주석에 「uDefined = 0(NaN·∞)」처럼
            **설명으로** 그 낱말을 적어 두고 있어서, 원문을 보면 설명이 사고로 오진된다. */
      it('보간 실패 잔재(undefined·NaN·Infinity)가 GLSL 토큰 자리에 없다', () => {
        const bad = [...clean.matchAll(/\b(?:undefined|NaN|Infinity)\b/g)].map((m) => m[0]);
        expect(bad, `주입된 상수가 값을 잃었다: ${bad.join(', ')}`).toEqual([]);
      });

      it('괄호가 균형을 이룬다', () => {
        expect(unbalanced(clean)).toBeNull();
      });

      it('void main() 이 정확히 1개다', () => {
        const mains = clean.match(/\bvoid\s+main\s*\(/g) ?? [];
        expect(mains.length).toBe(1);
      });

      it('GLSL ES 1.00 잔재를 쓰지 않는다', () => {
        for (const legacy of ['gl_FragColor', 'texture2D(', 'varying ', 'attribute ']) {
          expect(clean.includes(legacy)).toBe(false);
        }
      });

      it('함수가 중복 정의되지 않는다(조각 이중 삽입 방지)', () => {
        const names = functionNames(clean).filter((n) => n !== 'main');
        expect(new Set(names).size).toBe(names.length);
      });

      if (c.stage === 'frag') {
        it('정밀도 한정자와 out 변수를 선언한다', () => {
          expect(/precision\s+(lowp|mediump|highp)\s+float\s*;/.test(clean)).toBe(true);
          expect(/^\s*out\s+vec4\s+\w+\s*;/m.test(clean)).toBe(true);
        });
      } else {
        it('gl_Position 에 값을 쓴다', () => {
          expect(clean.includes('gl_Position')).toBe(true);
        });
      }
    });
  }
});

describe('씬 모듈 (DOM 없는 환경에서 로드·생성된다)', () => {
  const factories = [
    ['filmGrowth', createFilm],
    ['plasma', createPlasma],
    ['ionTrajectory', createIon],
    ['polishProfile', createPolish],
    ['stepCoverage', createStep],
    ['aldCycle', createAld],
    ['crystalGrowth', createCrystal],
    ['aerialImage', createAerial],
    ['probeScrub', createProbeScrub],
    ['waferMap', createWaferMap],
    ['packageThermal', createPackageThermal],
    ['moistureSoak', createMoistureSoak],
    ['shearTest', createShearTest],
  ] as const;

  it('전역 document/window 없이 import 된다', () => {
    expect(typeof globalThis.document).toBe('undefined');
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
  });

  for (const [id, factory] of factories) {
    it(`${id}: createScene() 이 계약을 만족한다`, () => {
      const scene = factory();
      expect(scene.id).toBe(id);
      expect(typeof scene.init).toBe('function');
      expect(typeof scene.update).toBe('function');
      expect(typeof scene.draw).toBe('function');
      expect(typeof scene.dispose).toBe('function');
      // init 전에는 draw 가 조용히 무시된다(루프가 먼저 돌아도 죽지 않는다)
      expect(() => scene.draw(0)).not.toThrow();
      expect(() => scene.update({ thickness: 0.9, power: 0.2, energy: 0.7, pressure: 0.3 })).not.toThrow();
      scene.dispose();
    });
  }
});
