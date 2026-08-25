# PROVENANCE — `metal` (공정 06 금속배선·CMP)

| 항목 | 내용 |
|---|---|
| 대상 이미지 | `cross-section.webp` (마스터 소스 `이미지/단면도해/src/xs_metal.svg`, viewBox `0 0 1600 900`) |
| 컷 구성 | **좌우 2패널 1프레임** — 좌: 전해도금(ECD) 셀 수직 종단면 / 우: CMP 폴리셔 수직 종단면 |
| 생성 엔진·모델명 | **Claude Code / SVG 직접 제작 (생성형 미사용)** — 상세 **§0-A** |
| 프롬프트 원문 전체 | 🔴 **생성 프롬프트 없음 — SVG 직접 제작.** 무엇이 그 자리를 대신하는지는 **§0-B** 대응표 |
| 제작자 | **DSN-P6** — 상세 **§0-D** |
| 검수자 | **V3**(1차 · 반려) → **RV**(재검수 · 조건부) → **RV2-B**(최종 재검수 · 🔴 **회신 대기 — 판정 미확정**) — 상세 **§0-D** |
| 검수일 | **2026-08-20** |
| 클린룸 준수 | E-001 · D-026 금지 목록(`Semiconductor-Digital-Twin`, `semiconductor-8-process-simulator`, `~/AGENT/`, `archive/2026/교재구독-001/`)을 **열람·참고하지 않았다.** 입력은 `이미지/_조사/D_금속배선.md` 와 그 §G 출처뿐이다. |

---

> 🔴 **2026-08-20 보완 (A8 게이트 강화 대응).** 위 표에 내용은 있었으나 **`## ` 제목이 아니라 표의 한 칸**이라
> A8 필수 항목 검사에 잡히지 않았다. DEV 가 검사를 「본문 아무 데나 단어가 있으면 통과」에서
> **「제목으로 존재 + 그 아래에 실제 내용」** 으로 조이자 `생성 엔진 · 프롬프트 · 상업 · 제작자 · 검수자` **5건 누락**으로 걸렸다.
> **A8 이 여태 장부상으로만 충족돼 있었다.** 아래 절들이 실질을 채운다. 위 표는 요약으로 남긴다.

## 0-A. 생성 엔진·모델명

**Claude Code / SVG 직접 제작 — 생성형 이미지 모델 미사용.**

- 이미지 생성 모델(Diffusion · GPT-Image · Gemini `gemini-3-pro-image` · Midjourney 등)을 **한 번도 호출하지 않았다.**
- 모든 도형은 SVG 요소(`rect` `path` `circle` `ellipse` `pattern` `linearGradient`)를 **좌표 단위로 직접 기술**해 작성했다.
- 좌우 2패널(좌 ECD 셀 · 우 CMP 폴리셔)을 **1600×900 한 프레임**에 배치했다. 패널 경계는 `10-frame` 의 구분선으로만 표현하고 문자를 굽지 않았다.
- 색은 전부 DSN 색 토큰 `var(--xs-*, 폴백)` 이며 hex 직접 기입 0건이다. 래스터화 시 `이미지/_render.py` 가 다크 토큰을 주입한다.
- 래스터화: Chrome `--headless=new --window-size=1600,900 --force-device-scale-factor=1` → `cwebp` 품질 자동 하강. **실측 41,230 B · q=92**(한도 184,320 B 의 22 %).

🔴 **왜 생성형을 쓰지 않았나.** 이 컷의 목적은 **부위 하나하나에 특허 FIG.·부호 근거를 붙이는 것**(A13)이다. 생성 모델 출력물은 어느 화소가 어느 근거에서 왔는지 추적할 수 없어 **A8·A13 을 원리적으로 충족하지 못한다.** 세션 2 의 Gemini 파일럿(CZ 인상로 외관)이 기술적으로는 성공했는데도 채택 보류된 이유가 같다.

## 0-B. 프롬프트 원문 전체

🔴 **생성 프롬프트가 존재하지 않는다 — SVG 직접 제작이기 때문이다.** 이미지 생성 모델에 **어떤 프롬프트도 넣지 않았다.**
「해당 없음」으로 비워 두지 않고 **무엇이 프롬프트의 자리를 대신했는지**를 남긴다. 생성형이었다면 프롬프트가 했을 역할 — *「무엇을 그릴지 결정한 입력」* — 을 여기서는 **아래 §1 제작 근거 목록**이 전부 수행한다.

| 생성형이라면 | 이 도해에서는 |
|---|---|
| 프롬프트 원문 | **§1 제작 근거 목록** — 그린 부재 하나마다 T번호 + FIG. + 부호 |
| 네거티브 프롬프트 | **§1 「🔴 조사에 없어 그리지 않은 것」** — 미확인이라 의도적으로 뺀 목록 |
| 시드(재현성) | **마스터 SVG 자체**(`이미지/단면도해/src/xs_metal.svg`) + `python3 이미지/_render.py metal` — **바이트 단위 재현** |
| 스타일 지정 | DSN 색 토큰 `--xs-*`(스레드 §4-4) · `이미지/단면도해/_재질라이브러리.svg` |

**입력은 `이미지/_조사/D_금속배선.md` 와 그 §G 출처뿐이다.** 그 목록 밖의 부품은 그리지 않았다(A13).

## 0-C. 상업 사용 판정

| 출처군 | 건수 | 라이선스 | 판정 | 근거 |
|---|---|---|---|---|
| 미국 특허 명세서 (T-D-01·02·03·12·13·15·16) | **7** | 미국 특허 공개공보 — 공개 기록물 | ✅ **상업 사용 가능** | 연방정부 발행 공개 기록물이며 저작권 주장 대상이 아니다. 🔴 **도면 이미지를 복제·트레이싱하지 않고 명세서의 부호 정의(사실 정보)만 읽어 새로 작도**했으므로 이중으로 안전하다. **특허 청구항이 보호하는 「발명 실시」와 「도면 열람」은 별개다** — 본 산출물은 교육용 도해이지 장치 제조가 아니다 |
| 오픈액세스 논문 (T-D-05·10·14·18·19·20) | **6** | **CC BY 4.0** (본문에서 직접 확인) | ✅ **상업 사용 가능** | BY(출처 표시)만 요구한다. 이 문서가 표시를 수행한다. **수치·사실만 인용했고 도판을 복제하지 않았다** |
| 백과 (T-D-11) | 1 | CC BY-SA 4.0 | ✅ **가능(조건부)** | 🔶 **SA 주의** — 문장을 옮긴 부분이 없고 **수치·사실만** 사용했으므로 2차적 저작물에 해당하지 않아 SA 전파는 발생하지 않는다고 판단. **최종 판단은 LEG 검토 권장** |
| NIST 공개 서지 (T-D-21) | 1 | 본문 라이선스 **미확인** | ⚠️ **서지·초록만 사용** | 본문 인용·도판 사용 **0건.** 이 출처 단독에 근거한 사실 주장 없음 |
| 🚫 CC BY-NC / CC BY-ND / 유료 스톡 / 블로그 이미지 | **0** | — | — | 조사 단계에서 배제 |
| 색·패턴·그라디언트 | — | CJH그룹 자체 제작(`_재질라이브러리.svg`) | ✅ 자사 자산 | |
| 서체 | — | 시스템 폰트 스택만 지정, **폰트 파일 임베드 없음** | ✅ | 애초에 SVG 에 문자가 0개다 |

- **상표·제조사 모델명·로고 0건** — 장비 유형명(「전해도금(ECD) 셀」·「CMP 폴리셔」)만 사용했다.
- **클린룸(E-001 · D-026):** 금지 목록(`Semiconductor-Digital-Twin` · `semiconductor-8-process-simulator` · `~/Desktop/AGENT/` · 그 어떤 위치의 사본 · `archive/2026/교재구독-001/`)을 **열람·검색·인용 0건.**
- 🔴 **라이선스 정정 이력 (2026-08-20 · 독립 검수 V6):** 3D 텍스처 `slurry-pad` 가 「폴리우레탄」의 근거로 **T-D-12** 를 인용하고 있었는데 **전문에 `polyurethane`·`porous`·`pore`·`foam` 이 전부 0회**였다. 주장을 **「다공질 고분자」**(T-D-11 원문 *"porous polymeric materials"*)로 낮추고, **이 파일 §1 폴리싱 패드 행 · 조사 대장 D §C·§F · `07_정합성원장.md` §4 까지 4곳을 동시 정정**했다(🔴 **이 「4곳」은 검증 없는 자기신고였다** — 2026-08-21 FIX-DOC 전수 `grep` 재집계 결과 하향이 닿은 자리는 **≥7곳**이다 · 원장 §8-8). 라이선스 위반은 아니나 **인용한 출처가 그 내용을 담고 있지 않았던 것**이라 A8 결함으로 다룬다. 🔴 **2026-08-21 복원(정정조 FIX-DOC · 근거 SRC-2 / RV3-T 재검증).** 위 하향은 **과잉 정정**이었다 — ㉡**오귀속**을 ㉠**무출처**처럼 처리했다. 올바른 출처가 **우리 조사 대장 안에 이미 있었다**: **T-D-14**(McAllister et al., *Micromachines* **10**(4):258, 2019, doi:10.3390/mi10040258, PMC6523751, **CC BY 4.0**) 축자 *"CMP involves a rotating polishing pad, **typically made of porous polyurethane**, being placed into intimate contact with a rotating wafer."* 보강 **T-D-18**(PMC10536193, CC BY 4.0) *"The top pad … is made of **polyurethane**, a polymer."* → **「다공질 폴리우레탄」으로 복원한다.** ⚠️ **기공 지름 30~50 µm 는 별건이며 「근거 미상」(D-041 ④) 유지.**

## 0-D. 제작자 ≠ 검수자 (A11)

| 항목 | 값 |
|---|---|
| **제작자** | **DSN-P6** (디자인팀 제작 하위 에이전트 · 공정 06 금속배선·CMP 담당) |
| 제작일 | 2026-08-20 |
| **1차 검수자** | **V3** (독립 검수조 · 제작 지시 미수령) — **판정: 반려** |
| V3 반려 사유 | anchor **18/18** 이 SVG `90-anchor` 와 불일치(**13개가 빈 배경**, 2개가 다른 부품) · 리더선 실교차 5건 · 🔴 **「접점 120개」 사실 오류**(US6156167A 원문은 180 / 128 / 최소 16 — **부호 120(컵 표면)을 개수로 오독**) |
| 정정자 | **DSN 팀장** — anchor 18건 SVG 동기화 · 실교차 5→0 · `ko` 축약 · `field-shield` 「필드 **셰이핑** 실드」 수식어 복원 · 사실 오류를 **자산과 조사 대장 양쪽** 정정 |
| **재검수자** | **RV** (독립 재검수 · 원 검수조가 아니며 **원 판정을 뒤집을 권한**을 갖고 투입) — **판정: 조건부 합격** |
| RV 지적(정정 완료) | `en` 라벨 clamp 4건 → **P-EN 이 0으로** · `_sync_prov.py` 가 **비교 0건인데 「✅ 일치」**(이 파일에 anchor 열이 없었다) → **§A anchor 대응표 28행 신설**, 현재 **28건 대조 · 일치** |
| RV 잔여 지적 | `magnet-array`·`retaining-ring` anchor 가 도형 **경계 2 px** — 육안 변별이 어렵다. **다음 개정 항목**(`07_정합성원장.md` §8 미결 22) |
| **최종 판정** | 🟡 **조건부 합격 → 최종 재검수(RV2-B) 회신 대기** (정정자가 DSN 팀장이므로 **팀장이 스스로 합격시킬 수 없다.** A11) |
| 검수일 | **2026-08-20** |

🔴 **제작자와 검수자가 같으면 CI 가 실패한다. 이 칸을 제작자가 채우지 않았다** — V3·RV 가 각각 독립으로 채웠고, DSN 팀장은 **정정자**로만 기재된다.

---

## 1. 제작 근거 목록 — 그린 부재 → 근거

### 좌 패널 · 전해도금(ECD) 셀

| 그린 부재 | 근거 문헌 | 도면·부호 |
|---|---|---|
| 웨이퍼(도금면 하향, 침지) | T-D-01 | FIG.2 부호 36 · 60 ("plating surface 60 down") |
| 클램셸 컵 | T-D-01 | FIG.3 부호 34 |
| 클램셸 콘 | T-D-01 | FIG.3 부호 32 |
| 접점 핑거(접점 링) | T-D-01 | 부호 72(72A·72B) — 한 실시예 **180개**(다른 실시예 128개 · 최소 16개), 팁이 도금면을 긁도록 비틀림. 🔴 **2026-08-20 정정** — 초판 「120개」는 US6156167A 의 **부호 120(컵 표면)을 개수로 오독**한 것이다. 원문: *"more particularly 180 contacts 72B … at least 16 contacts 72B … in one embodiment 128 contacts 72B"*. `labels.json`·조사 대장 §C-4 는 먼저 정정됐으나 **이 파일만 누락돼 있었다**(씬명세 SS-4 적발) |
| 컴플라이언트 실 | T-D-01 | 부호 58 (plating surface 60 의 perimeter region 접촉, edge 62·backside 56 보호) |
| 회전 스핀들 | T-D-01 | 부호 38 (20~150 rpm) |
| 슬립 링·브러시 | T-D-01 | 부호 46 |
| 가용성 Cu 애노드 | T-D-01 / T-D-02 | 부호 67 / 부호 206 (copper granules or solid disk) |
| 애노드 컵 | T-D-02 | 부호 202 (PVC/폴리프로필렌 절연 용기) |
| 애노드 격막(다공막) | T-D-02 | 부호 208 — 이온 통과 · 고전기저항으로 전류 재분배 · 입자 차단 (**금속망으로 그리지 않았다**) |
| 애노드 접점(Ti 메시) | T-D-02 | 부호 204 |
| 필드 셰이핑 실드(중앙 개구 유공판) | T-D-01 / T-D-03 | 부호 69A·69B (virtual anodes) / 부호 416 (가변 개구 shield) |
| 전해액(푸른 산성 황산구리) | T-D-01 / T-D-10 | 부호 42·43 / 조성(Table 2) |
| 전해액 제트(바닥 중앙 → 웨이퍼 중심) | T-D-02 | 부호 200 |
| 셀 몸체(대기압 습식 셀, 진공 플랜지 없음) | T-D-01 | FIG.1 도금조 42 |
| DC 전원 | T-D-01 | 부호 65 (**DC만 확인 — 펄스 파형 미도시**) |

### 우 패널 · CMP 폴리셔

| 그린 부재 | 근거 문헌 | 도면·부호 |
|---|---|---|
| 폴리싱 패드(다공질·매크로그루브) | T-D-11 / T-D-13 / **T-D-14** | 기공 30~50 µm · ~~다공질 고분자~~ → **다공질 폴리우레탄** / FIG.1·FIG.6 성형 홈 / 서브패드 위, 지름 775 mm. 🔴 **2026-08-20 정정(검수 V6)** — **T-D-12(US6244942B1) 전문에 `polyurethane`·`urethane`·`porous`·`pore`·`foam` 이 전부 0회다.** 「폴리우레탄」은 **오귀속**이었다. T-D-11 이 실제로 담고 있는 표현은 *"porous polymeric materials … pore size between 30 and 50 μm"* 이므로 주장을 **「다공질 고분자」**로 낮춘다. 폴리우레탄 자체는 업계 사실이나 **우리가 인용한 출처가 그 내용을 담고 있지 않았다**. 🔴 **2026-08-21 복원(정정조 FIX-DOC · 근거 SRC-2 / RV3-T 재검증).** 위 하향은 **과잉 정정**이었다 — ㉡**오귀속**을 ㉠**무출처**처럼 처리했다. 올바른 출처가 **우리 조사 대장 안에 이미 있었다**: **T-D-14**(McAllister et al., *Micromachines* **10**(4):258, 2019, doi:10.3390/mi10040258, PMC6523751, **CC BY 4.0**) 축자 *"CMP involves a rotating polishing pad, **typically made of porous polyurethane**, being placed into intimate contact with a rotating wafer."* 보강 **T-D-18**(PMC10536193, CC BY 4.0) *"The top pad … is made of **polyurethane**, a polymer."* → **「다공질 폴리우레탄」으로 복원한다.** ⚠️ **기공 지름 30~50 µm 는 별건이며 「근거 미상」(D-041 ④) 유지.** |
| 패드 홈(매크로그루브) | T-D-13 | FIG.1 · FIG.6 (미리 성형, 사용 중 마모) |
| 서브패드 | T-D-14 | 본문 |
| 플래튼(회전 원판) | T-D-11 / T-D-16 | "extremely flat plate covered by a pad" / 부호 22 |
| 캐리어 헤드 하우징 | T-D-12 | 부호 102 |
| 캐리어 구동축 | T-D-12 | 부호 102 (회전 구동) |
| 로딩 챔버 · 유로 | T-D-12 | 부호 108, 유로 132 |
| 짐벌 기구 | T-D-12 | 부호 106 |
| 베이스 | T-D-12 | 부호 104 |
| 유연 멤브레인 | T-D-12 | 부호 118, 장착면 122 |
| 존별 가압 챔버 · 유로 | T-D-12 | 부호 120, 유로 154 |
| 스페이서 링 | T-D-12 | 부호 116 (주부 200, 플랜지 204, 자유구간 220) |
| 리테이너 링(방사상 슬롯, 웨이퍼보다 아래로 내려와 패드를 함께 누름) | T-D-12 / T-D-11 | 부호 110 (내면 126이 기판과 맞물림) / 웨이퍼 수평 유지 |
| 웨이퍼(연마면 하향, Cu 오버버든) | T-D-11 / T-D-05 | carrier holds wafer upside-down / damascene 과충전 |
| 슬러리 공급 암·노즐 | T-D-15 | FIG.22~25 (overhead slurry dispenser) |
| 패드 컨디셔너(다이아몬드 디스크·요동 암·피벗) | T-D-13 / T-D-15 | 다이아몬드 팁 샹크·홀더 블록·요동 모터·반경방향 스윕 / FIG.30 · FIG.36A~36C |
| 종점 검출 광학창·광학 헤드 | T-D-16 | 부호 28 (레이저 간섭계) · 52 (물기둥 도관) |

### 🔴 근거 없이 그린 것
**없다.** 조사 대장 §C에 항목이 있는 부재만 작도했다.

### 🔴 조사에 없어 그리지 않은 것 (A13 준수)
1. ECD 펄스·역펄스 전원 파형 (T-D-01은 DC 전원 65만 명시)
2. ECD 확산판(diffuser plate)의 구체 형상 — 「필드 셰이핑 실드」로만 그렸다
3. ECD 오버플로 위어의 구체 형상 — 셀 벽 상단을 평범한 턱으로만 그렸다
4. 불용성 애노드 구성
5. post-CMP 브러시 세정기 구조
6. 컨디셔너 세정컵 (T-D-15 FIG.37·38에 존재하나 2패널 폭에 자리가 없어 제외)
7. 모터 전류계식 종점 검출 박스 (T-D-17) — 광학식만 그렸다
8. 플래튼·캐리어의 **회전 방향 상대 부호** — 회전은 양끝 화살촉 원호로만 표시
9. 에로전(erosion) 형상 — 정의 미확인이므로 라벨·도형 모두 없음
10. Cu 다마신 트렌치 4단계 흐름(D-3) — 축척이 6자리 어긋나 이 프레임에서 제외

---

## 2. 참조한 공개 자료 (URL · 도면번호 · 부호)

| 번호 | 서지 | 도면·부호 | URL | 라이선스 | 상업 사용 판정 |
|---|---|---|---|---|---|
| T-D-01 | US 6,156,167 A — Clamshell apparatus for electrochemically treating semiconductor wafers (Novellus, 2000-12-05) | FIG.1·2·3·4 / 부호 32,34,36,38,42,46,58,60,62,65,67,69A·69B,72 | https://patents.google.com/patent/US6156167A/en | 특허문헌(공개) | ✅ 가능 — 도면 이미지를 복제하지 않고 **구조 기술을 문장으로 읽어 새로 작도**했다. 특허 도면은 저작권 보호 대상이 아닌 기술 개시물이며, 본 작업은 원 도면의 표현을 베끼지 않았다 |
| T-D-02 | US 6,126,798 A — Electroplating anode including membrane partition system (Novellus/IBM, 2000-10-03) | FIG.1~4 / 부호 200,202,204,206,208 | https://patents.google.com/patent/US6126798A/en | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-03 | US 6,402,923 B1 — Uniform electroplating using a variable field shaping element (2002-06-11) | FIG.4~7 / 부호 402,406,408,416 | https://www.freepatentsonline.com/6402923.html | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-05 | Li Z. 외, "Recent Advances in Barrier Layer of Cu Interconnects", Materials 13(21):5049, 2020 | 본문 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7664900/ | **CC BY 4.0** | ✅ 가능 — 사실 인용만, 도판 미복제 |
| T-D-10 | Xing D. 외, "…nitro blue tetrazolium chloride as an efficient leveler for copper microvia superfilling", Micromachines 16(6):721, 2025 | Fig.10, Fig.11, Table 2 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12195018/ | **CC BY 4.0** | ✅ 가능 — 전해액 조성 수치만 인용 |
| T-D-11 | Wikipedia, "Chemical-mechanical polishing" | 본문 | https://en.wikipedia.org/wiki/Chemical-mechanical_polishing | CC BY-SA 4.0 | ✅ 가능 — 사실 확인 용도, 문장 미복제 |
| T-D-12 | US 6,244,942 B1 — Carrier head with a flexible membrane and adjustable edge pressure (Applied Materials, 2001-06-12) | 캐리어 헤드 단면 FIG. / 부호 102,104,106,108,110,116,118,120,122,126,132,154,200,204,220 | https://patents.google.com/patent/US6244942B1/en | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-13 | US 5,216,843 A — Polishing pad conditioning apparatus (Intel, 1993-06-08) | FIG.1·2·3·4·5(a)~(c)·6 | https://www.freepatentsonline.com/5216843.html | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-14 | McAllister J. 외, "Effect of Conditioner Type and Downforce…", Micromachines 10(4):258, 2019 | 본문·실험조건 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6523751/ | **CC BY 4.0** | ✅ 가능 |
| T-D-15 | US 5,738,574 A — Continuous processing system for CMP (Applied Materials, 1998-04-14) | FIG.22~25(슬러리 디스펜서) · FIG.30 · FIG.36A~36C · FIG.37·38 | https://patents.google.com/patent/US5738574A/en | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-16 | US 5,081,796 A — Mechanical planarization and endpoint detection (Micron, 1992-01-21) | FIG.2 부호 22 · FIG.4 부호 28·52 | https://www.freepatentsonline.com/5081796.html | 특허문헌(공개) | ✅ 가능 (동일 근거) |
| T-D-18 | Zheng P. 외, "Prediction of pad wear profile…", Micromachines 14(9):1683, 2023 | 본문·식 (MRR = k·P·v) | https://pmc.ncbi.nlm.nih.gov/articles/PMC10536193/ | **CC BY 4.0** | ✅ 가능 |
| T-D-19 | Ye G., Yao Z., "Research on the trajectory and relative speed of a single-sided CMP machine", Micromachines 16(4):450, 2025 | 본문·식 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12029203/ | **CC BY 4.0** | ✅ 가능 |
| T-D-20 | Gamagedara K.U., Roy D., "Mechanisms of Chemically Promoted Material Removal…", Materials 17(19):4905, 2024 | 본문 | https://pmc.ncbi.nlm.nih.gov/articles/PMC11477894/ | **CC BY 4.0** | ✅ 가능 |
| T-D-21 | Moffat T.P. 외, "Superconformal Electrodeposition of Copper in 500–90 nm Features", JES 147(12), 2000 (NIST 공개 서지) | 초록만 | https://www.nist.gov/publications/superconformal-electrodeposition-copper-500-90-nm-features | 본문 라이선스 미확인 | ⚠️ 서지·초록만 사용. 본문 인용·도판 사용 없음 |

**🚫등급(CC BY-NC/ND · 유료 스톡 · 블로그) 자료 0건.**
**상표·제조사 모델명·로고 0건** — 장비 유형명만 사용했다.

---

## 3. 이미지에 문자 없음 (04 정정문 §1)

- SVG 마스터의 `<text>` **0개**, `<tspan>` **0개**. 범례·패널 제목·조성·수량 전부 `labels.json` 의 `labels[]`·`notes[]` 로 분리했다.
- 캡션 고지("생성 이미지 · 실제 사진이 아닙니다")와 근거 등급 배지는 **앱이 그린다.** 이미지에 넣지 않았다.

## 4. 레이어 구조

`00-bg` · `10-frame` · `20-internal` · `30-wafer` · `40-flow` · `50-highlight` · `90-anchor` (7개, DEV 규약 그대로). `40-flow` 는 전해액 제트·슬러리 경로의 **기하만** 그렸고 전류밀도·연마압력 분포를 색으로 굽지 않았다.

---

## A. 🔴 anchor 대응표 — `labels.json` ↔ 이 문서 (2026-08-20 신설)

> **왜 신설했나.** 재검수 **RV** 가 지적했다 — 이 파일에 anchor 좌표 열이 **아예 없어서**
> `이미지/_sync_prov.py` 가 **비교한 것이 0건인데 화면에는 `✅ 일치` 가 찍히고 있었다.** 공허한 통과다.
> 이 표가 `07_정합성원장.md` 의 입력이므로, **표가 없으면 원장이 검증할 대상 자체가 없다.**
>
> 🔴 **정본은 마스터 SVG 의 `90-anchor` 레이어이고, `labels.json` 이 그것을 따르며, 이 표가 그 뒤를 따른다.**
> 납품·수정 때마다 `python3 이미지/_sync_prov.py metal` 로 검사하고 `--write` 로 동기화한다.

| id | 한글 부위명 | anchor | 종류 |
|---|---|---|---|
| `dc-power-supply` | DC 전원(DC Power Supply) | [494, 334] | 라벨 |
| `spindle-rotation` | 회전 스핀들(Rotatable Spindle) | [591, 300] | 라벨 |
| `clamshell-holder` | 클램셸 홀더(Clamshell Holder) | [538, 470] | 라벨 |
| `wafer-face-down` | 웨이퍼 하향 배치(Wafer, Face-Down) | [630, 562] | 라벨 |
| `contact-ring` | 접점 링(Contact Ring) | [549, 569] | 라벨 |
| `plating-bath` | 전해액·도금조(Plating Bath) | [485, 600] | 라벨 |
| `field-shield` | 필드 셰이핑 실드 | [510, 671] | 라벨 |
| `anode-membrane` | 애노드 격막(Anode Membrane) | [540, 705] | 라벨 |
| `anode-cu` | 구리 애노드(Cu Anode) | [540, 750] | 라벨 |
| `carrier-head` | 캐리어 헤드(Carrier Head) | [973, 431] | 라벨 |
| `slurry-arm` | 슬러리 공급 암(Slurry Arm) | [1100, 477] | 라벨 |
| `zone-chambers` | 존별 가압 챔버(Zone Chambers) | [973, 568] | 라벨 |
| `pad-conditioner` | 패드 컨디셔너(Conditioner) | [863, 577] | 라벨 |
| `flexible-membrane` | 유연 멤브레인 | [973, 589] | 라벨 |
| `wafer-face-down-cmp` | 웨이퍼 하향 배치(Wafer, Face-Down) | [973, 594] | 라벨 |
| `retaining-ring` | 리테이너 링(Retaining Ring) | [919, 608] | 라벨 |
| `polishing-pad` | 폴리싱 패드(Polishing Pad) | [820, 613] | 라벨 |
| `platen` | 플래튼(Platen) | [820, 710] | 라벨 |
| `panel-title-ecd` | 전해도금(ECD) 셀 — 회전 스핀들 축을 지나는 수직 종단면 | [540, 58] | 고지 |
| `panel-title-cmp` | CMP 폴리셔 — 플래튼 중심과 캐리어 헤드 중심을 지나는 수직 종단면 | [1053, 58] | 고지 |
| `contact-count` | 접점 핑거는 웨이퍼 도금면 가장자리를 따라 원주 전체에 배치되고, 팁이 도금면을 긁도록 비틀려 있다. 개수는 실시예마다 다르다 — 한 실시예 180개, 다른 실시예 128개, 최소 16개. 단면에는 그중 일부만 그렸다. | [170, 100] | 고지 |
| `bath-composition` | 전해액은 산성 황산구리 용액이라 푸른색이다. 참조 논문 조건: CuSO4·5H2O 0.88 M, H2SO4 0.54 M, HCl 50 ppm | [170, 760] | 고지 |
| `additives-not-shown` | 억제제(PEG+Cl-)·촉진제(SPS)·평탄제의 경쟁 흡착과 상향식 충전은 트렌치 스케일(수십~수백 nm) 현상이라, cm 스케일인 이 셀 단면에는 그리지 않았다. 별도 실습 시각화가 필요하다 | [170, 812] | 고지 |
| `ecd-unconfirmed` | 미확인이라 그리지 않은 것: 펄스·역펄스 전원 파형, 확산판의 구체 형상, 오버플로 위어 형상, 불용성 애노드 구성 | [170, 864] | 고지 |
| `rotation-undetermined` | 플래튼과 캐리어 헤드는 각각 회전하지만(예: 플래튼 87 rpm, 캐리어 38 rpm) 상대 회전 방향은 본 조사에서 확인하지 못했다. 회전 표시는 양끝 화살촉으로 그려 방향을 단정하지 않는다 | [1430, 100] | 고지 |
| `cmp-unconfirmed` | 미확인이라 그리지 않은 것: post-CMP 브러시 세정기 구조, 슬러리의 BTA 부식억제제, 에로전(erosion)의 정의 | [1430, 760] | 고지 |
| `scale-exaggeration` | 가독성을 위해 압축·과장한 비: 애노드 두께(실제 웨이퍼 두께의 20배 이상 -> 도해 약 13배), 애노드 격막 두께(실제 애노드의 1/20 이하 -> 도해 약 1/8), 플래튼 두께(실제 패드의 약 6배 -> 도해 약 4.1배), 유연 멤브레인 두께(실제 웨이퍼 두께의 약 1/3 -> 도해 약 1배) | [1430, 812] | 고지 |
| `preston-equation` | CMP 제거율은 프레스턴 식 MRR = k·P·V 를 따른다. P는 캐리어 헤드가 웨이퍼에 가하는 압력, V는 패드와 웨이퍼의 상대속도다 | [1430, 864] | 고지 |

---

## Z. 🔴 2026-08-20 세션 3 변경 이력

> **왜 이 절이 있는가.** 이 프로젝트에서 **사실 하나가 최대 4곳**(자산 · 조사 대장 · 이 파일 · `07_정합성원장.md`)에 복제돼 있고, 정정이 절반만 반영된 사례가 오늘만 **3건** 나왔다. 무엇이 언제 왜 바뀌었는지를 **자산 옆에** 남긴다. 규칙: `07_정합성원장.md` **§8-2**.

**현재 실측:** 라벨 **18개** · `cross-section.webp` **41,230 B**(한도 184,320 B 의 22 %)

| # | 변경 |
|---|---|
| 1 | 🔴 **A8 필수 절 §0-A~0-D 신설** — 상세는 그 절들 |
| 2 | 🔴 **「접점 120개」 정정 누락 2곳** 마저 정정(이 파일 §1 · `07_정합성원장.md` §3). 원문은 **180 / 128 / 최소 16** 이고 **부호 120(컵 표면)을 개수로 오독**한 것이었다. 씬명세 **SS-4** 적발 |
| 3 | 🔴 **「폴리우레탄」 오귀속 하향** — 인용한 T-D-12 전문에 `polyurethane`·`porous`·`pore`·`foam` **전부 0회**. ~~**「다공질 고분자」**(T-D-11 *"porous polymeric materials"*)로.~~ 검수 **V6** 적발. 🔴 **2026-08-21 복원(FIX-DOC)** — 하향은 **과잉 정정**이었다. **T-D-14**(*Micromachines* 10(4):258, 2019, **CC BY 4.0**, PMC6523751) 축자 *"typically made of **porous polyurethane**"* 로 재귀속해 **「다공질 폴리우레탄」 복원.** T-D-12 인용은 삭제 유지. ⚠️ 기공 30~50 µm 는 **별건 · 「근거 미상」 유지**(D-041 ④) |
| 4 | **anchor 대응표 §A 28행 신설**(종전 비교 0건) |
| 5 | `flexible-membrane` en 복원 — `Membrane` → **`Flexible Membrane`**(`Flexible` 은 CMP 헤드 멤브레인의 **정의적 성질 = 사실 주장**). `leaderEnd.x` **1399 → 1331** |
| — | 🔴 **`en` 라벨 레이아웃 정정 — clamp 4건** → **0**. 아래 배경 참조 |

### Z-1. `en` 레이아웃이 왜 문제였나 (전 공정 공통 배경)

`cross-section.webp` 는 **ko/en 이 공유하는 단일 파일**이고 그래서 SVG 에 문자를 하나도 굽지 않았다 — **i18n 이 이 설계의 존재 이유다.** 그런데 렌더러 `app/src/viz/svg/Overlay.tsx` 의 `place()` 는 **`lang` 을 받아 `en` 이면 `label.en` 으로 박스 폭을 다시 재는데**, DSN 검사기는 **`ko` 만** 검사하고 있었다.

🔴 **원인은 앞선 수리 자체였다.** `_labels_repair.py` 가 「`leaderEnd.x` 를 여백 끝에 붙여 clamp 원천 차단」하면서 **ko 박스를 여백에 정확히 flush(`boxX = 4.0`)** 로 맞췄고, 그보다 넓은 en 박스는 **전부 clamp 가 확정**됐다. **ko 42건을 0으로 만든 대가로 en 60건이 생겼다.** 재검수 **RV** 적발.

**조치:** ①`en` 문자열을 **건별 판단으로 축약**(일괄 치환 스크립트 금지 — 수식어가 **사실 주장인지 장식인지**를 하나씩 판단했다) ②`_labels_check.py` 를 **`ko`·`en` 양쪽 검사**로 ③`_selftest_tools.py` 에 **픽스처 고정** ④`_검수.html` 에 **언어 토글** 신설.

**검증:** `이미지/_검수증거/ko_metal.png` · `en_metal.png` — 렌더러 `place()` 와 **동일 산식**(정렬·베이스라인 포함)으로 합성했다. **clamp 된 박스는 붉은 파선**으로 그리므로, 붉은 박스가 없다는 것이 곧 판정이다.

---

### Z-2. 🔴 2026-08-20 세션 4 — 출하 렌더러 기준 라벨 기하 정정 (작도조 P-GEO)

**전제가 바뀌었다.** 종전 DSN 라벨 검사기는 `app/src/viz/svg/Overlay.tsx` 를 기준으로 삼았으나 **그 컴포넌트는 화면에 마운트되지 않는다.** 실제 출하 렌더러는 `app/src/ui/sections/EquipmentSection.tsx` 의 `LabelledFigure`·`NoteMarker` 이고 기하가 다르다. ⇒ 위 Z-1 의 「clamp 0」 판정은 **죽은 코드를 잰 값**이라 무효다. 이번 정정의 판정 도구는 신설된 **`이미지/_figure_check.py`**(읽기 전용 · headless Chrome 실측 · 불감대 0).

**측정 상수(이 문서에서만 쓰는 값이 아니라 실측치다):** 2행 라벨의 실측 세로 높이 **56.30 px**, 후광(stroke 6 px) 포함 **62.30 px**. 즉 **행 피치 60 px 는 2행 라벨끼리 후광이 2.30 px 겹친다.**

#### ① 리더선 실교차 2건 → 0건 — **행 교환**

두 건 모두 원인이 같다: **라벨 행 순서가 앵커 깊이 순서와 뒤집혀 있었다.** `leaderEnd.x` 만으로는 풀 수 없다(사선으로 옮기면 교점이 수평 구간에서 사선 구간으로 이동할 뿐이다). 앵커는 규정대로 **한 점도 옮기지 않았다.**

| 쌍 | 교점(전) | 조치 | 후 |
|---|---|---|---|
| `clamshell-holder` × `wafer-face-down` | (411.8, 400.0) | 앵커 깊이 470 / 562 인데 행이 400 / 340 로 역전 → 행 교환 | 교차 없음 |
| `carrier-head` × `pad-conditioner` | (1065.7, 378.2) | 앵커 깊이 431 / 577 인데 행이 280 / 220 로 역전 → 행 교환 | 교차 없음 |

#### ② 근거 없이 깎였던 `ko` 라벨 2건 복원

사용 중지된 `_labels_repair.py`(유령 기하 기반)가 「폭이 넘친다」며 뗀 괄호 영문을 되돌렸다. **여백 예산은 372 px 인데 복원 후 실측이 아래와 같아 애초에 깎을 이유가 없었다.**

| 자산 | 전 | 후 | 실측 폭 | 여유 |
|---|---|---|---|---|
| `field-shield` | `필드 셰이핑 실드` | `필드 셰이핑 실드(Field-Shaping Shield)` | 188.66 px | 183.34 px |
| `flexible-membrane` | `유연 멤브레인` | `유연 멤브레인(Flexible Membrane)` | 175.11 px | 196.89 px |

#### ③ 복원의 부수효과 처리 — 아래 이웃 행 밀기

두 라벨 모두 **1행 → 2행**이 되므로 60 px 피치에서는 위·아래 이웃과 후광이 새로 겹친다. **해당 라벨 아래쪽만** 순차로 밀어 62.30 px 이상을 확보했다(위쪽 행은 건드리지 않았다).

- ECD 좌열 `field-shield` 580→**585** · `anode-membrane` 640→**650** · `anode-cu` 700→**714** (피치 65/65/64)
- CMP 우열 `flexible-membrane` 460→**465** · `wafer-face-down-cmp` 520→**528** · `retaining-ring` 580→**592** · `polishing-pad` 640→**656** · `platen` 700→**720** (피치 65/63/64/64/64)

밀기 한계는 고지 배지다 — `bath-composition`(170,760) · `cmp-unconfirmed`(1430,760) 이 r=17/22 이므로 최하단 행은 **714 / 720**(이격 46 / 40 px)에서 멈췄다.

#### ④ 판정 (`python3 이미지/_figure_check.py metal`)

| 항목 | 전 | 후 |
|---|---|---|
| C1 이미지 침범 | 0 | **0** |
| C3 라벨 겹침 | 12 | **8** (전건 후광 2.30 px · 글리프 실교차는 전·후 모두 0) |
| C4 배지 충돌 | 0 | **0** |
| C6 배지 가림 | 0 | **0** |
| C7 **리더선 실교차** | **2** | **0** |

남은 C3 8건은 전부 **손대지 않은 60 px 피치 구간의 후광 겹침**(별도 등급)이다. 해소하려면 두 열 전체를 62.30 px 이상으로 재배치해야 하므로 이번 범위에서 제외했다.
