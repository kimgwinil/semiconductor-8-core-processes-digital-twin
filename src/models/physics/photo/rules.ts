import type { DirectionRule } from '../../direction';
import { dofRatio, requiredK1, resolution } from './rayleigh';

/** A12 — 포토 방향성 규칙 **선언**. 상충 관계(해상도↔DOF)가 핵심이다. */
export const PHOTO_RULES: DirectionRule[] = [
  {
    id: 'PH-D6',
    processId: 'photo',
    statement: '초점 오프셋의 절대값이 커질수록 CD 오차가 커지므로 영점을 가로지르면 U자형 비단조 응답이 된다.',
    inputName: 'focusOffsetNm',
    expect: [{ output: 'cdNm', trend: 'non-monotonic' }],
    sourceId: 'S140',
    scope: 'lab',
    note: '기초 실습의 초점 감도 공식은 ΔF² 항을 쓴다. 스윕은 0 nm 양쪽을 모두 포함한다.',
  },
  {
    id: 'PH-D1',
    processId: 'photo',
    statement: 'NA 를 올리면 해상도가 개선(CD 감소)되지만 초점심도(DOF)는 함께 줄어든다 — 상충.',
    inputName: 'na',
    expect: [
      { output: 'cdNm', trend: 'decreasing' },
      { output: 'dofNm', trend: 'decreasing' },
    ],
    sourceId: 'S140',
    note: 'R = k₁λ/NA 는 1/NA, DOF ∝ 1/NA². 얻는 것과 잃는 것이 동시에 움직인다.',
  },
  {
    id: 'PH-D2',
    processId: 'photo',
    statement: '파장이 길수록 같은 조건에서 해상도가 나빠진다(CD 증가).',
    inputName: 'lambdaNm',
    expect: [{ output: 'cdNm', trend: 'increasing' }],
    sourceId: 'S140',
  },
  {
    id: 'PH-D3',
    processId: 'photo',
    statement: 'k₁ 을 낮추면 CD 가 작아진다. 다만 물리 하한 0.25 아래로는 갈 수 없다.',
    inputName: 'k1',
    expect: [{ output: 'cdNm', trend: 'increasing' }],
    sourceId: 'S140',
    note: '하한 0.25 는 단조성 면제 구간이 아니라 **범위 밖**이다 — assertWithin 이 막는다(설계서 §13-3).',
  },
  {
    id: 'PH-D4',
    processId: 'photo',
    statement: '같은 CD 를 더 큰 NA 로 만들면 요구되는 k₁ 이 커진다 — 공정 난이도가 내려간다.',
    inputName: 'na',
    expect: [{ output: 'requiredK1For45nm', trend: 'increasing' }],
    sourceId: 'S140',
  },
  {
    id: 'PH-D5',
    processId: 'photo',
    statement: 'NA 를 올리면 DOF 는 NA² 에 반비례해 줄어든다 — 상수 없이 비율로 성립한다.',
    inputName: 'na',
    expect: [{ output: 'dofNm', trend: 'decreasing' }],
    sourceId: 'S143',
    note: 'k₂ 가 약분되므로 출처 없는 상수 없이 EUV 조건에서도 쓸 수 있다(원장 §4-1).',
  },
];

export function photoModel(inputs: Record<string, number>): Record<string, number> {
  const lambdaNm = req(inputs, 'lambdaNm');
  const na = req(inputs, 'na');
  const k1 = req(inputs, 'k1');
  const targetCdNm = req(inputs, 'targetCdNm');
  /* 🔴 출력 키 이름은 **랩 출력 id**(A12 정본 = 화면의 Y)를 따른다.
   *    값·단위는 물리층 그대로다 — 규칙은 단조성만 선언하므로 환산하지 않는다.
   *    (그래서 이름의 단위 접미사와 값의 실제 단위가 다를 수 있다. 값을 갖다 쓰지 말고 방향만 본다.) */
  const focusOffsetNm = inputs['focusOffsetNm'];
  return {
    cdNm: focusOffsetNm === undefined ? resolution({ lambdaNm, na, k1 }).value : focusOffsetNm * focusOffsetNm,
    // 🔴 dofRatio(from, to) = DOF(to)/DOF(from) 이다.
    //    「기준 NA 대비 현재 NA 의 DOF」이므로 from=기준, to=현재 여야 한다.
    //    (인자 순서를 뒤집으면 NA 를 올릴수록 DOF 가 늘어나는 반대 거동이 나온다 — A12 가 잡았다.)
    dofNm: dofRatio({ naFrom: REF_NA, naTo: na }).value,
    requiredK1For45nm: requiredK1({ targetCdNm, lambdaNm, na }).value,
  };
}

/** 상대 DOF 의 기준 NA. 물리 상수가 아니라 표시 기준점이다. */
const REF_NA = 1;

function req(inputs: Record<string, number>, key: string): number {
  const v = inputs[key];
  if (v === undefined) throw new Error(`[direction] missing input "${key}"`);
  return v;
}

/** 이 모듈이 담당하는 공정 ID. 배럴이 리터럴을 갖지 않게 하려고 여기서 내보낸다(C1). */
export const PHOTO_PROCESS_ID = 'photo';
