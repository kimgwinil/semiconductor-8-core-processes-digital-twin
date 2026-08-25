import { describe, expect, it } from 'vitest';
import { EQUIPMENT_MOTION_ROUTES } from '@/viz/equipment/EquipmentMotionOverlay';

const PROCESS_IDS = ['wafer', 'oxidation', 'photo', 'etch', 'deposition', 'metal', 'eds', 'packaging'] as const;

describe('장비 내부 동작 경로 정본', () => {
  it('현재 등록된 8개 공정은 각각 2개 이상의 내부 동작 경로를 갖는다', () => {
    expect(Object.keys(EQUIPMENT_MOTION_ROUTES).sort()).toEqual([...PROCESS_IDS].sort());
    for (const id of PROCESS_IDS) expect(EQUIPMENT_MOTION_ROUTES[id]?.length).toBeGreaterThanOrEqual(2);
  });

  it('모든 경로는 서로 다른 실제 라벨 노드를 2개 이상 연결한다', () => {
    for (const routes of Object.values(EQUIPMENT_MOTION_ROUTES)) {
      for (const route of routes) {
        expect(route.nodeIds.length).toBeGreaterThanOrEqual(2);
        expect(new Set(route.nodeIds).size).toBe(route.nodeIds.length);
        expect(route.durationS).toBeGreaterThan(0);
      }
    }
  });
});
