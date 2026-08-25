/**
 * `ingotSlicing` 장면의 계산 정본. 물리 계산을 새로 만들지 않고 랩이 넘긴
 * 0~1 값(직경·직경편차·품질)을 화면 기하로만 변환한다.
 */
import type { SceneParams } from '../../renderer';
import { pick } from '../common';

export const IS_INGOT_X0 = 0.08;
export const IS_INGOT_X1 = 0.52;
export const IS_AXIS_Y = 0.56;
export const IS_RADIUS_MIN = 0.095;
export const IS_RADIUS_MAX = 0.155;
export const IS_WIRE_X0 = 0.18;
export const IS_WIRE_X1 = 0.59;
export const IS_WIRE_COUNT = 13;
export const IS_OUTPUT_X0 = 0.63;
export const IS_OUTPUT_X1 = 0.94;
export const IS_OUTPUT_COUNT = 8;

export interface IngotSlicingModel {
  diameter: number;
  deviation: number;
  quality: number;
  radius: number;
  wobble: number;
  goodFraction: number;
}

export function ingotSlicingModel(params: SceneParams): IngotSlicingModel {
  const diameter = pick(params, 'diameter', 0.5);
  const deviation = pick(params, 'deviation', 0);
  const quality = pick(params, 'quality', 0.75);
  return {
    diameter,
    deviation,
    quality,
    radius: IS_RADIUS_MIN + diameter * (IS_RADIUS_MAX - IS_RADIUS_MIN),
    wobble: deviation * 0.018,
    goodFraction: quality,
  };
}
