# Metallization and CMP realistic assets

## `interior-v2.png`

- Created with the built-in OpenAI image generation tool on 2026-08-25.
- Purpose: educational photorealistic visualization of a copper ECP cell and a face-down CMP module.
- It is not a photograph of a named commercial tool. The labelled engineering diagram below the image remains the reference for component identification.

## `applied-cmp-contact-v5.png`

- Created with the built-in OpenAI image generation tool on 2026-08-25 using `applied-cmp-contact-v4.png` as a composition reference.
- Purpose: correct the CMP stack so that the carrier head holds the wafer face-down against the slurry-coated pad, with the retaining ring and platen visible.
- It is an educational visualization, not a photograph of a named commercial tool.

---

## `cmp-module-v2.jpg` — 2026-09-01 재제작 (DSN)

> 🔴 **이 파일은 2026-09-01 이전까지 이 대장에 항목이 없었다.** 2026-08-25 에 `applied-cmp-contact-v5.png` 가
> 「캐리어 헤드가 웨이퍼를 면 아래로 잡도록 CMP 스택을 정정」하며 만들어질 때 **함께 정정되지 않고 남은 파일**이다.
> 결함 원본은 `이미지/_결함원본_20260901/cmp-module-v2.ORIGINAL.jpg` 에 보존했다(md5 `3df071b3696ff34c2fa106bd4c6a3744`).

### 1. 에셋

| 항목 | 값 |
|---|---|
| 배포 파일 | `app/public/assets/simulator-realistic/metal/cmp-module-v2.jpg` · 1600×900 · sRGB |
| 마스터 소스 | `이미지/단면도해/src/sim_cmp_module.svg` (viewBox `0 0 1600 900`) |
| 렌더러 | `이미지/_render_sim.py` — Chrome 헤드리스 → PNG → `sips` JPEG q88 |
| 무손실 원본 | `이미지/생성원본/cmp_module.png` |
| 노출 위치 | `#/p/metal/lab-basic` **1곳** (`app/src/viz/realisticBackdrops.json:95`). `polishProfile` 의 `stageAssets` 에 `basic` 이 없어 `asset` 으로 폴백된다. 화면에서는 WebGL 씬 뒤의 **감광된 배경**으로 쓰인다 |
| 문자 | **0개** — `<text>`·`<tspan>` 노드 없음(`_render_sim.py` 가 렌더 전 차단). 라벨은 앱이 얹는다 |

### 2. 생성 엔진·모델명

**생성형 이미지 모델 미사용 — 벡터(SVG) 직접 작도.** 제작 도구: Claude Code(DSN 팀장 직접 작도) + Chrome 헤드리스 렌더.
시드 해당 없음(절차적·결정적 렌더 — 같은 SVG는 같은 결과를 낸다).

🔴 **왜 생성형을 쓰지 않았는가 (2가지가 겹쳤다):**
1. **규정상:** `06_시각자산명세.md` §0-3(D-009) — 「원리 도해는 🔴 금지, **벡터 도해로**」. 이 자산이 가르치는 것은 장비 외관이 아니라 **패드–웨이퍼–슬러리의 상하 관계**이며 그것이 바로 원본이 틀렸던 지점이다. 생성형은 구조를 보증하지 못한다 — **이번 결함 자체가 그 증거다.**
2. **실행상:** 승인된 생성 경로인 Gemini 유료 등급(D-017)이 **크레딧 소진으로 차단**됐다. 2026-09-01 실측: `gemini-3-pro-image`·`gemini-2.5-flash-image`·`gemini-3.1-flash-lite-image` **3종 전부 `RESOURCE_EXHAUSTED`** (`"Your prepayment credits are depleted"`).

### 3. 프롬프트 원문 전체

**해당 없음 — 프롬프트가 없다.** 벡터 작도이므로 재현 단위는 프롬프트가 아니라 **마스터 SVG 파일 그 자체**다.
재현: `python3 이미지/_render_sim.py cmp_module`

### 4. 참조한 공개 자료 — A13 근거

| 근거 | 뒷받침하는 형상 | 반영 위치 |
|---|---|---|
| Cornell NanoScale Facility, *CMP Primer*(2007) | 패드는 회전 폴리싱 테이블 위에 붙고, 암이 캐리어 헤드를 눌러 연마한다. 리테이너링은 **헤드 쪽 부품**이며 진공 없이 웨이퍼를 포켓에 잡는다 | 캐리어=위 / 패드+플래튼=아래 · 리테이너 링 |
| Zheng·Zhao·Lu, *Micromachines* 14(9) 1683 (2023) — 이 원장 **S467** 로 기등재 | "The polishing pad is **glued on a platen**" · 헤드와 플래튼은 **같은 방향으로 편심 회전** · 헤드는 플래튼 반경 방향 오실레이션 · 컨디셔너 디스크 108 mm, 스윕 반경 83~308 mm | 접착층 · **동일 방향** 회전 화살표 · 편심 배치 · 컨디셔너 위치와 스윕 |
| Fujita & Watanabe, *ECS JSS* (2019) | 300 mm 웨이퍼용 **패드 지름 756 mm** · 슬러리 노즐은 패드 중심에서 반경 30 mm · 슬러리는 패드 홈과 원심력으로 퍼진다 | 패드:웨이퍼 = **2.5:1** · 노즐을 중심 가까이 · 패드 그루빙 |
| 특허 US9511470B2 (GlobalFoundries) | "The wafer surface that is to be polished **faces the polishing pad**" | 웨이퍼 face-down |
| 특허 US6361422B1 (Applied Materials) | 양산 반송에서 웨이퍼를 "**feature side down**" 으로 놓는다 | 웨이퍼 연마면(구리)이 아래 |
| Ensinger, CMP retaining rings 제품자료 | 12인치용 링 **OD350 / ID300 mm** → 반경방향 폭 25 mm | 링 외경 = 웨이퍼의 **1.17배** |
| Fraunhofer ENAS + Axus, NCCAVS CMPUG 2020 | 캐리어 = 리테이너링 + **멤브레인** + 이너 플레이트 3층 · 플래튼 63 rpm / 캐리어 57 rpm(거의 동속·동방향) | 다중 구역 공압 멤브레인 · 동일 방향 회전 |
| 특허 US9056382B2 (Rogers) | 패드 지름이 **플래튼 지름과 일치**한다 | 플래튼을 패드보다 약간만 크게 |
| 특허 US11440161B2 (Ebara) · US6361647B1 (Strasbaugh) | CMP를 **face-up / face-down 두 범주**로 정의. face-up 은 **웨이퍼보다 작은 패드를 위에서 내려놓는** 별개 구성이며 중심부 결과가 나쁘다 | 🔴 **반증 확인용** — 아래 §5-2 |

S번호 등재는 `refs/공개출처_반도체전공정_서지목록.md` §2-9-E 를 따른다.
🔴 **상표·모델명·로고 0건.** 장비 유형명(회전식 CMP 폴리셔)으로만 그렸다.

### 5. 검수조 전달 사항

**5-1. 고지**
- 개념 도해다. **실제 사진이 아니다.** 특정 제조사 장비의 복제가 아니다.
- **현업 검증 전**(D-009). 제작자 ≠ 검수자 원칙에 따라 별도 조의 판정이 필요하다.

**5-2. 🔴 미확인·추정 — 「뒤집혔다」 판정의 반증까지 확인했다**
- **face-up 방식 CMP 장비는 실재한다**(Ebara US11440161B2 가 범주로 정의). 따라서 「face-up 은 세상에 없다」고 말하면 그것은 거짓이다.
- 그러나 **face-up 은 웨이퍼보다 작은 패드가 위에서 내려오는 정반대 구성**이라, 원본의 「큰 패드가 위 · 웨이퍼가 아래」 그림은 face-up 으로도 설명되지 않는다.
- **양산 실리콘 CMP 표준은 face-down 이다.** 이 도해는 그것을 그렸다.
- 🔴 **플래튼 지름은 원문으로 직접 확인된 값이 없다.** 확인된 것은 패드 756 mm(S3) 하나이며, 플래튼≈패드(US9056382B2)로 이었다.
- 🔴 **다운포스 수치는 도해에 표기하지 않았다** — 확인된 값(4~10 psi)이 2007년 3~6인치 연구장비 기준이라 300 mm 양산에 그대로 못 쓴다.

**5-3. 과장한 치수와 실제 비**

| 요소 | 도해 비 | 실제 비 | 사유 |
|---|---|---|---|
| 패드 두께 / 웨이퍼 지름 | 28/446 = **6.3 %** | 3.5 mm / 300 mm = **1.2 %** | 다공질·그루빙을 판독 가능하게 |
| 웨이퍼 두께 / 웨이퍼 지름 | 18/446 = **4.0 %** | ≈0.26 % `[미확인]` | 1 px 미만이면 보이지 않는다 |
| 패드 지름 / 웨이퍼 지름 | 1116/446 = **2.50** | **2.52** (S3) | 🟢 실측대로 |
| 리테이너 링 외경 / 웨이퍼 | 522/446 = **1.17** | **1.17** (Ensinger) | 🟢 실측대로 |
| 컨디셔너 디스크 / 웨이퍼 | 160/446 = **0.36** | **0.36** (S467) | 🟢 실측대로 |
| 컨디셔너 중심 위치 | 패드 반경의 **0.77** | 스윕 0.22~0.81 (S467) | 🟢 범위 안 |

**5-4. 문자·구도 규칙** — 래스터에 문자를 굽지 않았다(ko/en 공유). 배경으로 감광돼 쓰이므로 하단·좌우에 여백을 두었다.

### 6. 제작자 / 검수자

| 항목 | 값 |
|---|---|
| 제작자 | `DSN-svg(sim_cmp_module)` — 디자인팀장 직접 작도 |
| 검수자 | 🔴 **미배정** — 제작자와 다른 조가 판정해야 한다(§7 독립성) |
| 검수일 | — |
| 판정 | 🔵 **검수 대기** |

### Z. 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-08-25 이전 | Codex 내장 이미지 생성으로 제작(프롬프트 원문 미보존). **CMP 상하 반전** — 패드가 위, 웨이퍼가 아래. 같은 폴더 `applied-cmp-contact-v5.png` 와 정반대 구조 |
| 2026-09-01 | 🔴 **전면 재제작.** 벡터 마스터로 교체. 회전 보정이 아니라 재작도 — 원본이 중력적으로 자기일관적이라 회전하면 슬러리가 위로 솟는 그림이 되어 **더 틀려진다**(DEV 확증) |
