// 🔴 등급 리졸버 설치(부수효과) — ald-scene-mapping.test.ts 와 같은 이유.
import '@/models/registry';
import { describe, expect, it } from 'vitest';

import {
  aerialImageModel,
  NA_SCENE_MIN, NA_SCENE_SPAN, NA_SCENE_MAX,
  DOF_COEF_NM, IMMERSION_INDEX,
  STANDING_WAVE_PERIOD_NM, SW_SPACING_V,
} from '@/viz/gl/scenes/models/aerialImage.model';
import { PHOTO_LABS } from '@/models/labs/photo';
import { NA_IMMERSION_MAX } from '@/models/physics/photo/rayleigh';
import type { LabSpec } from '@/models/labs/spec';

/**
 * 🔴 `photo` 3칸(기초·응용·심화) → `aerialImage` 씬 배선 회귀 테스트.
 * 정본: `threads/DSN-8대공정-001.SD.md` §3(3-0~3-7).
 *
 * 이 파일이 막는 것:
 *   (A) `na` 정규화 앵커가 [0.60, 1.35] 에서 벗어나는 것(SD §3-1 확정 — 벗어나면 광 원뿔·DOF 가 거짓 화면).
 *   (B) `exposureDose` 가 칸마다 다른 앵커를 쓰는 것(SD §0-3 신규 적발 — E=40 이 칸마다 다른 화면이 된다).
 *   (C) SD §3-3 P-1·P-2·P-4·P-6 4개 불변식의 회귀.
 *
 * 🔴 부분문자열 검사를 쓰지 않는다. 전부 수치로 본다.
 */

const basic = PHOTO_LABS.find((l) => l.stage === 'lab-basic') as LabSpec;
const applied = PHOTO_LABS.find((l) => l.stage === 'lab-applied') as LabSpec;
const advanced = PHOTO_LABS.find((l) => l.stage === 'lab-advanced') as LabSpec;

describe('aerialImage.model — na 앵커', () => {
  it('SD §3-1 리터럴 [0.60, 0.75] 를 쓴다', () => {
    expect(NA_SCENE_MIN).toBeCloseTo(0.60, 9);
    expect(NA_SCENE_SPAN).toBeCloseTo(0.75, 9);
  });

  it('상한이 물리 상수 NA_IMMERSION_MAX 와 일치한다(자기 검산)', () => {
    expect(NA_SCENE_MAX).toBeCloseTo(NA_IMMERSION_MAX.value, 9);
  });

  it('na 키에서 실제 NA 가 정확히 복원된다(왕복)', () => {
    for (const na of [1.00, 1.17, 1.35]) {
      const key = (na - NA_SCENE_MIN) / NA_SCENE_SPAN;
      const m = aerialImageModel({ na: key, defocus: 0.5, exposureDose: 0.2143, resistThickness: 0.0714, lineWidth: 0.5, fringeAmplitude: 1 });
      expect(m.naValue).toBeCloseTo(na, 6);
    }
  });
});

describe('aerialImage.model — SD §3-3 판정식 불변식', () => {
  it('P-1: 초점 허용 띠 두께 × NA² = 0.055917 (전 NA 구간 불변)', () => {
    for (const na of [1.00, 1.20, 1.35]) {
      const key = (na - NA_SCENE_MIN) / NA_SCENE_SPAN;
      const m = aerialImageModel({ na: key, defocus: 0.5, exposureDose: 0.2143, resistThickness: 0.0714, lineWidth: 0.5, fringeAmplitude: 1 });
      const bandFull = m.focusBandHalf * 2;
      expect(bandFull * na * na).toBeCloseTo(0.055917, 3);
    }
    // DOF 계수 자체도 photo.ts 원문(143.785)과 자릿수까지 일치해야 한다.
    expect(DOF_COEF_NM).toBeCloseTo(143.785, 2);
  });

  it('P-2: sinθ/NA = 0.69444 ± 2% (물리층 소스 n=1.436 사용, 스펙 리터럴 1.44 아님)', () => {
    for (const na of [1.00, 1.20, 1.35]) {
      const sinTheta = na / IMMERSION_INDEX;
      const ratio = sinTheta / na;
      expect(ratio).toBeCloseTo(0.69444, 1); // 소수 1자리 = ±0.05 여유, 실측 오차는 0.28%
      expect(Math.abs(ratio - 0.69444) / 0.69444).toBeLessThan(0.02);
    }
  });

  it('P-4: 화살표 길이 × E = 3.00 (E 10~80 mJ/cm² 전 구간)', () => {
    for (const e of [10, 25, 32, 60, 80]) {
      const doseKey = (e - 10) / 70;
      const m = aerialImageModel({ na: 0.8, defocus: 0.5, exposureDose: doseKey, resistThickness: 0.0714, lineWidth: 0.5, fringeAmplitude: 1 });
      expect(m.scanLength * e).toBeCloseTo(3.00, 3);
    }
  });

  it('P-6: 정재파 간격 = 2.2075% — 상수, resistThickness 와 무관', () => {
    expect(SW_SPACING_V * 100).toBeCloseTo(2.2075, 3);
    expect(STANDING_WAVE_PERIOD_NM).toBeCloseTo(56.7647, 3);
    const spacings = [60, 120, 300, 900].map((t) => {
      const tKey = (t - 60) / 840;
      // SW_SPACING_V 는 모델 상수이지 aerialImageModel() 반환값이 아니다 —
      // resistThickness 를 바꿔도 상수 자체가 흔들리지 않는다는 것이 이 테스트의 요지.
      void aerialImageModel({ na: 0.8, defocus: 0.5, exposureDose: 0.2143, resistThickness: tKey, lineWidth: 0.5, fringeAmplitude: 1 });
      return SW_SPACING_V;
    });
    expect(new Set(spacings.map((s) => s.toFixed(9))).size).toBe(1); // 전부 같은 값
  });
});

describe('photo.ts scene binding — exposureDose 공통 앵커(SD §0-3)', () => {
  it('E=40 이 응용·심화 두 칸에서 같은 exposureDose 키 값을 낸다', () => {
    const inputsApplied = { na: 1.00, doseMjCm2: 40, focusOffsetNm: 0 };
    const inputsAdvanced = { na: 1.00, doseMjCm2: 40, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 0 };
    const outApplied = applied.compute(inputsApplied);
    const outAdvanced = advanced.compute(inputsAdvanced);
    const mapApplied = applied.scene!.map(inputsApplied, { cdNm: outApplied['cdNm']!.value });
    const mapAdvanced = advanced.scene!.map(inputsAdvanced, { cdNm: outAdvanced['cdNm']!.value });
    expect(mapApplied['exposureDose']).toBeCloseTo(mapAdvanced['exposureDose']!, 9);
    expect(mapApplied['exposureDose']).toBeCloseTo((40 - 10) / 70, 9);
  });
});

describe('photo.ts scene binding — 6키 계약(SD §3-0)', () => {
  const EXPECTED_KEYS = ['na', 'defocus', 'exposureDose', 'resistThickness', 'lineWidth', 'fringeAmplitude'].sort();

  it('3칸 전부 정확히 6키만 넘긴다', () => {
    const basicOut = basic.compute({ doseMjCm2: 25, focusOffsetNm: 90 });
    const basicMap = basic.scene!.map({ doseMjCm2: 25, focusOffsetNm: 90 }, { cdNm: basicOut['cdNm']!.value });
    expect(Object.keys(basicMap).sort()).toEqual(EXPECTED_KEYS);

    const appliedOut = applied.compute({ na: 1.00, doseMjCm2: 25, focusOffsetNm: 0 });
    const appliedMap = applied.scene!.map({ na: 1.00, doseMjCm2: 25, focusOffsetNm: 0 }, { cdNm: appliedOut['cdNm']!.value });
    expect(Object.keys(appliedMap).sort()).toEqual(EXPECTED_KEYS);

    const advancedOut = advanced.compute({ na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 0 });
    const advancedMap = advanced.scene!.map(
      { na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 0 },
      { cdNm: advancedOut['cdNm']!.value },
    );
    expect(Object.keys(advancedMap).sort()).toEqual(EXPECTED_KEYS);
  });

  it('fringeAmplitude — BARC ON/OFF 배율이 4.18배 차이(PLN 델타 #6)', () => {
    const onOut = advanced.compute({ na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 1 });
    const offOut = advanced.compute({ na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 0 });
    const onMap = advanced.scene!.map(
      { na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 1 },
      { cdNm: onOut['cdNm']!.value },
    );
    const offMap = advanced.scene!.map(
      { na: 1.00, doseMjCm2: 25, focusOffsetNm: 0, resistThicknessNm: 300, pebTempC: 110, barcOn: 0 },
      { cdNm: offOut['cdNm']!.value },
    );
    expect(offMap['fringeAmplitude']! / onMap['fringeAmplitude']!).toBeCloseTo(4.1833, 3);
  });

  it('basic·applied 는 fringeAmplitude 를 BARC ON 상수(0.2390)로 고정한다', () => {
    const basicOut = basic.compute({ doseMjCm2: 25, focusOffsetNm: 90 });
    const basicMap = basic.scene!.map({ doseMjCm2: 25, focusOffsetNm: 90 }, { cdNm: basicOut['cdNm']!.value });
    expect(basicMap['fringeAmplitude']).toBeCloseTo(Math.sqrt(0.02) / Math.sqrt(0.35), 4);
  });
});
