import type { ResultPayload } from './schema';
import {
  RESULT_CSV_FILENAME, RESULT_QUEUE_KEY, RESULT_STORE_KEY, RETIRED_RESULT_KEYS,
} from './keys';

/**
 * 🔴 D-038 파기·열람 경로 — LEG `11_파기절차.md` 를 **실행할 수 있는 구조**로 둔다.
 *
 * 법적 요구:
 *  - 파기 트리거로부터 **5일 내** 파기
 *  - 특정 가명 ID 의 레코드를 **찾아서** 지울 수 있을 것(열람·정정삭제·처리정지 대응)
 *
 * 🔴 시트에서 행만 지우는 것으로는 부족하다 — 버전 이력·휴지통에 잔존한다.
 *    원격 구현체가 붙을 때 `RemoteEraser` 가 그 절차(행 삭제 + 버전 이력 정리 + 휴지통 비우기)를
 *    수행해야 한다. **1단계에서는 로컬 구현체만 있다.**
 *
 * 🔴 **원장이 곧 파기 경로다(2026-08-21).** 예전에는 파기기가 자기가 아는 키만 지우고
 *    `STORAGE_LOCATIONS` 는 아무도 읽지 않는 장식이었다. 지금은 파기기가 원장을 순회한다.
 *    그래서 **원장에 없는 곳은 파기되지 않고, 파기되지 않는 곳은 원장에 남는다**가 구조로 성립한다.
 */

export interface ErasureResult {
  found: number;
  erased: number;
  /**
   * 🔴 이 파기기가 **지웠다고 보증하지 못하는** 위치의 id 목록.
   * **비어 있을 때에만 「완전 파기」다.** 쓰기 실패뿐 아니라
   *  - 원격 저장소(`remote: true`)
   *  - 코드로 지울 수 없는 위치(내려받은 CSV 등 `kind: 'uncontrolled'`)
   *  - 이 파기기가 다룰 줄 모르는 새 원장 항목
   * 도 전부 여기 남는다. **모르면 잔존으로 센다** — 반대로 두면 조용한 파기 실패가 된다.
   */
  remaining: string[];
}

export interface Eraser {
  readonly id: string;
  /** 열람 대응 — 해당 가명 ID 의 레코드를 찾아 돌려준다. */
  find(pseudonymId: string): Promise<ResultPayload[]>;
  /** 파기 대응. */
  erase(pseudonymId: string): Promise<ErasureResult>;
}

/** 원장 항목 공통. */
interface StorageLocationBase {
  readonly id: string;
  readonly desc: string;
  /** 원격(우리 서버·시트) 저장소인가. 로컬 파기기로는 지울 수 없다. */
  readonly remote: boolean;
}

/** 학습자 브라우저 localStorage — 로컬 파기기가 실제로 지울 수 있는 유일한 종류다. */
export interface LocalStorageLocation extends StorageLocationBase {
  readonly kind: 'localStorage';
  readonly remote: false;
  /** 🔴 실제 키. `id` 는 이 값에서 조립한다 — 문자열을 따로 적지 않는다. */
  readonly key: string;
}

/** 🔴 우리 통제 밖 — 코드로 지울 수 없고 사람 절차로만 완결된다. */
export interface UncontrolledLocation extends StorageLocationBase {
  readonly kind: 'uncontrolled';
  /** 이 자리를 실제로 파기하는 사람 절차의 위치. */
  readonly manualProcedure: string;
}

/** 원격 저장소(1단계에는 없다). 붙는 순간 `RemoteEraser` 가 필요하다. */
export interface RemoteLocation extends StorageLocationBase {
  readonly kind: 'remote';
  readonly remote: true;
}

export type StorageLocation = LocalStorageLocation | UncontrolledLocation | RemoteLocation;

/** 은퇴한 키도 원장에 실어 파기 순회가 계속 방문하게 한다(`keys.ts` 참조). */
const retiredLocations: readonly LocalStorageLocation[] = RETIRED_RESULT_KEYS.map((key) => ({
  kind: 'localStorage',
  id: `localStorage:${key}`,
  key,
  desc: '은퇴한 키 — 옛 데이터가 남아 있을 수 있어 파기 순회 대상으로 유지한다',
  remote: false,
}));

/**
 * 🔴 저장 위치 원장 — 파기 절차가 빠짐없이 돌려면 「어디에 남는가」가 명시돼 있어야 한다.
 * 1단계에서 개인 식별이 붙은 데이터가 존재할 수 있는 곳은 **아래가 전부**다.
 *
 * 🔴 이 배열은 문서가 아니라 **`LocalEraser.erase()` 가 실제로 순회하는 목록**이다.
 *    항목을 추가하면 파기 순회가 그 자리를 다루거나, 다루지 못하면 `remaining` 에 남긴다.
 */
export const STORAGE_LOCATIONS: readonly StorageLocation[] = [
  {
    kind: 'localStorage',
    id: `localStorage:${RESULT_STORE_KEY}`,
    key: RESULT_STORE_KEY,
    desc: '제출된 결과 본저장 (학습자 브라우저)',
    remote: false,
  },
  {
    kind: 'localStorage',
    id: `localStorage:${RESULT_QUEUE_KEY}`,
    key: RESULT_QUEUE_KEY,
    desc: '전송 실패 재시도 큐 (학습자 브라우저)',
    remote: false,
  },
  ...retiredLocations,
  {
    kind: 'uncontrolled',
    id: `download:${RESULT_CSV_FILENAME}`,
    desc: '교사가 내려받은 CSV — 내려받는 순간 우리 통제 밖이다',
    remote: false,
    manualProcedure: 'LEG 11_파기절차.md §3-B(C1~C5) · §4-1 S7',
  },
];

function read(key: string): ResultPayload[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const p: unknown = JSON.parse(raw);
    return Array.isArray(p) ? (p as ResultPayload[]) : [];
  } catch { return []; }
}

function write(key: string, rows: ResultPayload[]): boolean {
  try { localStorage.setItem(key, JSON.stringify(rows)); return true; } catch { return false; }
}

/**
 * 로컬 저장소 파기기.
 * 🔴 지울 대상을 스스로 알지 않는다 — **원장을 받아서 순회한다.** 기본값이 정본 원장이다.
 */
export class LocalEraser implements Eraser {
  readonly id = 'local';

  constructor(private readonly locations: readonly StorageLocation[] = STORAGE_LOCATIONS) {}

  async find(pseudonymId: string): Promise<ResultPayload[]> {
    const out: ResultPayload[] = [];
    for (const loc of this.locations) {
      if (loc.remote || loc.kind !== 'localStorage') continue;
      out.push(...read(loc.key).filter((r) => r.pseudonymId === pseudonymId));
    }
    return out;
  }

  async erase(pseudonymId: string): Promise<ErasureResult> {
    let found = 0;
    let erased = 0;
    const remaining: string[] = [];

    for (const loc of this.locations) {
      // 🔴 원격은 로컬 파기기 소관이 아니다. 「지웠다」로 세지 않는다.
      if (loc.remote) { remaining.push(loc.id); continue; }

      switch (loc.kind) {
        case 'localStorage': {
          const rows = read(loc.key);
          const keep = rows.filter((r) => r.pseudonymId !== pseudonymId);
          const hit = rows.length - keep.length;
          found += hit;
          if (hit === 0) break;
          if (write(loc.key, keep)) erased += hit;
          else remaining.push(loc.id);
          break;
        }
        case 'uncontrolled':
          // 🔴 코드로는 지울 수 없다. 사본이 있는지조차 우리는 알 수 없으므로 **항상** 잔존이다.
          //    여기서 빼면 `remaining: []` 이 「완전 파기」라는 뜻을 잃는다.
          remaining.push(loc.id);
          break;
        default:
          // 🔴 원장에 새 종류가 늘었는데 파기기가 배우지 못한 경우. 조용히 넘기지 않는다.
          remaining.push((loc as StorageLocation).id);
          break;
      }
    }
    return { found, erased, remaining };
  }
}
