import { assertWithin, quantity, withSource, type Quantity, type SourcedConst } from '../../contract';

/**
 * MSL(습기민감도등급) 판정 — **물리층. 합성 계수 0건.**
 * 출처: 원장 **S248** = IPC/JEDEC **J-STD-020F** Table 4 (Moisture Sensitivity Levels).
 * 골든값 **R199**(등급별 플로어 라이프·표준 소킹 조건).
 *
 * 🔴 **M-25 — 흡습량 임계 `M_crit = 0.11 wt%` 판정은 구현하지 않는다.**
 *    J-STD-020F 에는 wt% 판정 기준이 **없다.** 이 표준은 MSL 을
 *    **플로어 라이프 · 소킹 조건(온·습도·시간)** 으로만 규정한다.
 *    흡습량으로 합·부를 가르는 코드를 이 파일에 추가하면 M-25 위반이다.
 */

export type MslLevel = '1' | '2' | '2a' | '3' | '4' | '5' | '5a';

interface MslRow {
  readonly level: MslLevel;
  /** 플로어 라이프. 표준이 시간으로 적은 등급만 hours 를 가진다. */
  readonly floorLifeHours?: SourcedConst;
  readonly floorLifeLabel: string;
  readonly floorLifeTempC: SourcedConst;
  readonly floorLifeRhPct: SourcedConst;
  /** 표준 소킹 조건. */
  readonly soakHours: SourcedConst;
  readonly soakTempC: SourcedConst;
  readonly soakRhPct: SourcedConst;
}

/**
 * S248 J-STD-020F Table 4. **등급 순서 그대로** 둔다 — 순서 자체가 「민감도가 높아진다」는 정보다.
 * 🔴 별칭 함수로 줄여 쓰지 않는다. 온도·습도·시간 전부 문헌이 규정한 데이터다.
 * 🔴 Level 6(Time on Label)은 값이 라벨 의존이라 원장 R199 가 다루지 않는다 — 여기서도 뺀다.
 */
const MSL_TABLE: readonly MslRow[] = [
  {
    level: '1',
    floorLifeLabel: '무제한',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(85, '%RH', 'S248'),
    soakHours: withSource(168, 'h', 'S248'),
    soakTempC: withSource(85, '°C', 'S248'),
    soakRhPct: withSource(85, '%RH', 'S248'),
  },
  {
    level: '2',
    floorLifeLabel: '1년',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(168, 'h', 'S248'),
    soakTempC: withSource(85, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
  {
    level: '2a',
    floorLifeLabel: '4주',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(696, 'h', 'S248'),
    soakTempC: withSource(30, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
  {
    level: '3',
    floorLifeHours: withSource(168, 'h', 'S248'),
    floorLifeLabel: '168 h',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(192, 'h', 'S248'),
    soakTempC: withSource(30, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
  {
    level: '4',
    floorLifeHours: withSource(72, 'h', 'S248'),
    floorLifeLabel: '72 h',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(96, 'h', 'S248'),
    soakTempC: withSource(30, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
  {
    level: '5',
    floorLifeHours: withSource(48, 'h', 'S248'),
    floorLifeLabel: '48 h',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(72, 'h', 'S248'),
    soakTempC: withSource(30, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
  {
    level: '5a',
    floorLifeHours: withSource(24, 'h', 'S248'),
    floorLifeLabel: '24 h',
    floorLifeTempC: withSource(30, '°C', 'S248'),
    floorLifeRhPct: withSource(60, '%RH', 'S248'),
    soakHours: withSource(48, 'h', 'S248'),
    soakTempC: withSource(30, '°C', 'S248'),
    soakRhPct: withSource(60, '%RH', 'S248'),
  },
];

/** 원장 R199 가 다루는 등급 순서. */
export const MSL_LEVELS: readonly MslLevel[] = MSL_TABLE.map((r) => r.level);

/** 플로어 라이프가 **시간 단위로 규정된** 등급만. 시간축 비교는 여기서만 가능하다. */
export const MSL_HOURLY_LEVELS: readonly MslLevel[] = MSL_TABLE
  .filter((r) => r.floorLifeHours !== undefined)
  .map((r) => r.level);

export interface MslSpec {
  level: MslLevel;
  floorLifeLabel: string;
  floorLifeHours?: number;
  floorLifeTempC: number;
  floorLifeRhPct: number;
  soakHours: number;
  soakTempC: number;
  soakRhPct: number;
}

/** 등급 조회. 표에 없는 등급은 **보간하지 않고 거부**한다(원장 규칙 1). */
export function mslSpec(level: MslLevel): MslSpec {
  const row = MSL_TABLE.find((r) => r.level === level);
  if (!row) {
    throw new Error(
      `[S248] MSL Level "${level}" 은 원장 R199 가 다루지 않는다. ` +
      `사용 가능: ${MSL_LEVELS.join(', ')}. 보간하지 않는다.`,
    );
  }
  const spec: MslSpec = {
    level: row.level,
    floorLifeLabel: row.floorLifeLabel,
    floorLifeTempC: row.floorLifeTempC.value,
    floorLifeRhPct: row.floorLifeRhPct.value,
    soakHours: row.soakHours.value,
    soakTempC: row.soakTempC.value,
    soakRhPct: row.soakRhPct.value,
  };
  if (row.floorLifeHours) spec.floorLifeHours = row.floorLifeHours.value;
  return spec;
}

const HOURS_RANGE: [number, number] = [0, Number.MAX_VALUE];

/** 플로어 라이프 [h]. 시간으로 규정되지 않은 등급(1·2·2a)은 거부한다. */
export function floorLifeHours(level: MslLevel): Quantity {
  const spec = mslSpec(level);
  if (spec.floorLifeHours === undefined) {
    throw new Error(
      `[S248] MSL Level ${level} 의 플로어 라이프는 표준이 "${spec.floorLifeLabel}" 로 적었다 — ` +
      `시간 단위 환산값이 원장에 없다. 임의 환산하지 않는다.`,
    );
  }
  return quantity(spec.floorLifeHours, {
    modelId: 'packaging.msl.floorLife',
    unit: 'h',
    sourceId: 'S248',
    validRange: HOURS_RANGE,
    assumptions: [
      `플로어 라이프 조건 ${spec.floorLifeTempC} °C / ${spec.floorLifeRhPct} %RH`,
      '플로어 라이프는 습기·리플로우 관련 고장에만 관계한다(Table 4 NOTE 4)',
    ],
  });
}

/** 표준 소킹 시간 [h]. */
export function standardSoakHours(level: MslLevel): Quantity {
  const spec = mslSpec(level);
  return quantity(spec.soakHours, {
    modelId: 'packaging.msl.standardSoak',
    unit: 'h',
    sourceId: 'S248',
    validRange: HOURS_RANGE,
    assumptions: [`표준 소킹 조건 ${spec.soakTempC} °C / ${spec.soakRhPct} %RH`],
  });
}

/**
 * 가속 소킹(60 °C/60 %RH) 적용 가부 — S248 J-STD-020F Table 4 NOTE 1 · NOTE 5.
 * 🔴 **가속 소킹 시간값은 원장에 없으므로 돌려주지 않는다.** 적용 가부만 판정한다.
 */
const EA_WINDOW_LOW: readonly [SourcedConst, SourcedConst] = [
  withSource(0.3, 'eV', 'S248'), withSource(0.39, 'eV', 'S248'),
];
const EA_WINDOW_HIGH: readonly [SourcedConst, SourcedConst] = [
  withSource(0.4, 'eV', 'S248'), withSource(0.48, 'eV', 'S248'),
];

export const ACCELERATED_SOAK_TEMP_C = withSource(60, '°C', 'S248');
export const ACCELERATED_SOAK_RH_PCT = withSource(60, '%RH', 'S248');

export interface AcceleratedSoakVerdict {
  applicable: boolean;
  reason: string;
}

export function acceleratedSoakApplicable(args: {
  /** 패키지 재료의 수분확산 활성화에너지 [eV] (JESD22-A120 으로 구한다). */
  moistureDiffusionEaEv: number;
  /** 몰드 컴파운드에 필러가 들어 있는가. */
  moldCompoundHasFiller: boolean;
}): AcceleratedSoakVerdict {
  assertWithin('moistureDiffusionEaEv', args.moistureDiffusionEaEv, [0, Number.MAX_VALUE], 'eV');
  // 🔴 NOTE 5 — 필러 없는 몰드 컴파운드에는 가속 소킹 요건이 적용되지 않을 수 있다.
  if (!args.moldCompoundHasFiller) {
    return {
      applicable: false,
      reason: '🔴 필러가 없는 몰드 컴파운드에는 가속 소킹을 적용하지 않는다 (S248 Table 4 NOTE 5).',
    };
  }
  const ea = args.moistureDiffusionEaEv;
  const inLow = ea >= EA_WINDOW_LOW[0].value && ea <= EA_WINDOW_LOW[1].value;
  const inHigh = ea >= EA_WINDOW_HIGH[0].value && ea <= EA_WINDOW_HIGH[1].value;
  if (inLow || inHigh) {
    const band = inLow
      ? `${EA_WINDOW_LOW[0].value}–${EA_WINDOW_LOW[1].value} eV`
      : `${EA_WINDOW_HIGH[0].value}–${EA_WINDOW_HIGH[1].value} eV`;
    return {
      applicable: true,
      reason: `수분확산 활성화에너지가 ${band} 구간이므로 가속 소킹(${ACCELERATED_SOAK_TEMP_C.value} °C/${ACCELERATED_SOAK_RH_PCT.value} %RH)을 쓸 수 있다 (S248 Table 4 NOTE 1).`,
    };
  }
  return {
    applicable: false,
    reason:
      `수분확산 활성화에너지 ${ea} eV 는 표준이 허용한 두 구간` +
      `(${EA_WINDOW_LOW[0].value}–${EA_WINDOW_LOW[1].value} eV · ${EA_WINDOW_HIGH[0].value}–${EA_WINDOW_HIGH[1].value} eV) 밖이다. ` +
      '표준 소킹 조건과의 손상응답 상관성을 별도로 확립해야 한다 (S248 Table 4 NOTE 1).',
  };
}
