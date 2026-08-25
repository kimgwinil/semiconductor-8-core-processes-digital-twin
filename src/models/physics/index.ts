// 🔴 등급 리졸버를 반드시 설치한다. 이 import 가 없으면 화면 배지가 기본 문자열로 샌다.
import '../registry';
import { registerDirectionModel, registerRules } from '../direction';
import { EDS_PROCESS_ID, EDS_RULES, edsModel } from './eds/rules';
import { OXIDATION_PROCESS_ID, OXIDATION_RULES, oxidationModel } from './oxidation/rules';
import { PHOTO_PROCESS_ID, PHOTO_RULES, photoModel } from './photo/rules';
import { ETCH_PROCESS_ID, ETCH_RULES, etchModel } from './etch/rules';
import { METAL_PROCESS_ID, METAL_RULES, metalModel } from './metal/rules';
import { PACKAGING_PROCESS_ID, PACKAGING_RULES, packagingModel } from './packaging/rules';
import { DEPOSITION_PROCESS_ID, DEPOSITION_RULES, depositionModel } from './deposition/rules';
import { WAFER_PROCESS_ID, WAFER_RULES, waferModel } from './wafer/rules';

/** 물리층 배럴 — 방향성 규칙과 모델 어댑터를 등록한다. */
export function registerPhysics(): void {
  registerRules([...EDS_RULES, ...OXIDATION_RULES, ...PHOTO_RULES, ...ETCH_RULES, ...METAL_RULES, ...PACKAGING_RULES, ...DEPOSITION_RULES, ...WAFER_RULES]);
  // 🔴 공정 ID 리터럴을 이 배럴에 두지 않는다(C1). 각 모듈이 자기 ID 를 내보낸다.
  registerDirectionModel(EDS_PROCESS_ID, edsModel);
  registerDirectionModel(OXIDATION_PROCESS_ID, oxidationModel);
  registerDirectionModel(PHOTO_PROCESS_ID, photoModel);
  registerDirectionModel(ETCH_PROCESS_ID, etchModel);
  registerDirectionModel(METAL_PROCESS_ID, metalModel);
  registerDirectionModel(PACKAGING_PROCESS_ID, packagingModel);
  registerDirectionModel(DEPOSITION_PROCESS_ID, depositionModel);
  registerDirectionModel(WAFER_PROCESS_ID, waferModel);
}

export * from './oxidation/dealGrove';
export * from './photo/rayleigh';
export * from './eds/yieldModels';
export * from './eds/statistics';
export * from './eds/probeOperations';
export * from './metal/cmp';
export * from './metal/resistance';
export * from './metal/fourPointProbe';
export * from './metal/rcDelay';
export * from './metal/electromigration';
export * from './metal/electroplating';
export * from './packaging/thermal';
export * from './packaging/msl';
export * from './packaging/solderBallShear';
export * from './packaging/bondStrength';
export * from './packaging/reliability';
export * from './packaging/waferThinning';
export * from './packaging/underfill';
export * from './packaging/windTunnel';
export * from './deposition/ald';
export * from './deposition/diffusion';
export * from './deposition/cvd';
export * from './deposition/stoney';
export * from './deposition/sputter';
export * from './deposition/implant';
export * from './etch/dryEtch';
export * from './etch/oes';
export * from './etch/plasma';
export * from './etch/wetEtch';
export * from './wafer/czochralski';
export * from './wafer/pointDefect';
export * from './wafer/probe';
export * from './wafer/resistivity';
export * from './wafer/wireSaw';
