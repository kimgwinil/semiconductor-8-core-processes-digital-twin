# `scenes/models/` — 씬 계산식의 **정본**

여기 있는 모듈은 **GLSL 문자열을 절대 담지 않는다.** 순수 함수와 이름 있는 상수뿐이다.

## 왜 따로 두는가
`src/viz/gl/fallback2d.ts`(Canvas2D 폴백)는 WebGL2 미지원 기기가 실제로 타는 제품 경로다
(`LabRunner.tsx` → `viz.createFallback2D`, 설계서 §15 L4). 폴백이 씬 모듈(`scenes/*.ts`)을
static import 하면 셰이더 문자열까지 `@/viz` 청크로 끌려와 코드분할이 깨진다(A9 · 초기 JS 상한).

그래서 종전에는 폴백이 **계산식을 손으로 다시 적었다.** 정본이 둘이 되었고, 2026-08-21 실측에서
6종 전부가 갈려 있었다 — 최대 **23.06 배**(ALD 100 °C 사이클당 성장, 폴백 0.0394 vs 정본 0.9091),
플라즈마는 **전력 항 부호가 반대**였고 `bias` 항이 아예 없었다.

→ 해법은 「폴백이 씬을 import」가 아니라 **셰이더 없는 순수 모델 모듈을 씬과 폴백이 둘 다 import** 하는 것이다.

## 모듈 목록 (씬 **13종** = 모델 13개)

> 🔴 **stale 이력.** 이 표는 2026-08-22 까지 「씬 6종」으로 적혀 있었다 — `crystalGrowth`·`aerialImage`(2026-08-21 신설)가
> 빠져 있었고, 그 상태에서 두 씬은 `viz-glsl.test.ts`·`viz-fallback-parity.test.ts` 에도 안 올라 **검사를 한 번도 안 받았다.**
> 씬을 늘리면 **이 표부터 늘려라.** 표가 낡으면 다음 사람이 「이게 전부」로 읽는다.
| 모델 | 씬 | 폴백 |
|---|---|---|
| `filmGrowth.model.ts` | `scenes/filmGrowth.ts` | `drawFilmGrowth` |
| `plasma.model.ts` | `scenes/plasma.ts` | `drawPlasma` |
| `ionTrajectory.model.ts` | `scenes/ionTrajectory.ts` | `drawIonTrajectory` |
| `polishProfile.model.ts` | `scenes/polishProfile.ts` | `drawPolishProfile` |
| `stepCoverage.model.ts` | `scenes/stepCoverage.ts` | `drawStepCoverage` |
| `aldCycle.model.ts` | `scenes/aldCycle.ts` | `drawAldCycle` |
| `crystalGrowth.model.ts` | `scenes/crystalGrowth.ts` | `drawCrystalGrowth` |
| `aerialImage.model.ts` | `scenes/aerialImage.ts` | `drawAerialImage` |
| `probeScrub.model.ts` | `scenes/probeScrub.ts` | `drawProbeScrub` |
| `waferMap.model.ts` | `scenes/waferMap.ts` | `drawWaferMap` |
| `packageThermal.model.ts` | `scenes/packageThermal.ts` | `drawPackageThermal` |
| `moistureSoak.model.ts` | `scenes/moistureSoak.ts` | `drawMoistureSoak` |
| `shearTest.model.ts` | `scenes/shearTest.ts` | `drawShearTest` |
| `layout.model.ts` | (공용 배치 — 두 씬이 쓰는 대칭축) | — |
| `theme.ts`(모델 아님 · `scenes/`) | 전 씬 공용 **테마 색 판독기** | `palette()` |

## 규칙
1. 이 폴더의 모듈은 `scenes/*.ts`(셰이더를 가진 씬 모듈)를 **import 하지 않는다.** 역참조가 생기면
   폴백 청크로 셰이더가 되돌아온다.
2. 씬 모듈은 여기서 상수를 가져와 **GLSL 템플릿 리터럴로 주입**한다. GLSL 안에 숫자를 손으로 적지 않는다.
3. 폴백은 여기 함수를 **호출**한다. 식을 옮겨 적지 않는다.
4. 좌표계는 셰이더와 같은 **UV(세로 0~1, 위가 +)** 다. Canvas2D 는 세로가 뒤집혀 있으므로
   폴백의 `toY()` 한 곳에서만 변환한다.

## 🔴 무엇까지 같아야 하는가 — 「노이즈는 표현, 형상은 정본」
GL 은 `fbm`/`vnoise`/`hash11` 로, 폴백은 결정적 지터로 요철과 입자를 흩는다. **점 하나하나까지
같게 만들 수는 없고, 그럴 필요도 없다.** 같아야 하는 것은 다음이고 그 전부가 이 폴더에 있다:

- 기하 배치(표면·바닥·패널의 화면 높이와 폭)
- 파생값(막 두께 · 시스 두께 · 제거 깊이 · R_p · σ · 커버리지 · 사이클당 성장)
- **진폭**(거칠기·편차·산포의 크기) — 무늬는 달라도 진폭은 같다
- 파라미터→화면 매핑의 방향과 배율

## 결속 수단(정본이 다시 갈라지지 않게 하는 것)
- `tests/unit/viz-fallback-parity.test.ts` — 모델 모듈을 목(mock)으로 바꿔치기해 **폴백 그림이
  실제로 모델의 반환값을 따라 움직이는지** 본다. 「불렀다」가 아니라 「값을 썼다」를 단언한다.
- `scripts/check-fallback-purity.mjs` — 폴백이 물리를 다시 계산하면 실패시키는 게이트.
- 🔴 두 가지 모두 **부분문자열 검사를 쓰지 않는다.** 이 프로젝트에서 그 사고가 6번 났다.
