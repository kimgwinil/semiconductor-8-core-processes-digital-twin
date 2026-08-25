# PROVENANCE — `deposition` / cross-section.webp

> 공정 05 「증착 · 이온주입」 · 2패널 단일 프레임
> **좌 패널** PVD 마그네트론 스퍼터 챔버(챔버 중심축 수직 종단면) + 스텝 커버리지 확대 인셋
> **우 패널** 중전류 이온주입기 빔라인(빔 평면 배치도, 90° 편향에서 L자로 접음) + 주입 깊이 분포 인셋
> 마스터 소스: `이미지/단면도해/src/xs_deposition.svg` (viewBox `0 0 1600 900`)
> 라벨: `labels.json` — `labels[]` 20개 · `notes[]` 12개. **이미지에 문자를 굽지 않았다**

## 1. 생성 엔진·모델명

**Claude Code / SVG 직접 제작 (생성형 이미지 모델 미사용).**
래스터 생성 모델·이미지 생성 API를 일절 사용하지 않았다. 모든 도형은 좌표를 직접 기술한 벡터이며, WebP는 그 SVG를 `이미지/_render.py` 로 래스터화한 것이다.

## 2. 프롬프트 원문 전체

**생성 프롬프트 없음 — SVG 직접 제작.**
생성형 이미지 모델에 넣은 프롬프트가 존재하지 않으므로 옮겨 적을 원문이 없다. 대신 **제작 근거**는 아래가 전부이며, 도형 하나하나가 어느 근거에서 나왔는지는 §5 라벨 대응표와 §6 비라벨 부재 대장에 적었다.

**제작 근거 목록**

| 구분 | 문서 | 이 그림에서 규정한 것 |
|---|---|---|
| 조사 대장 | `이미지/_조사/C_증착_이온주입.md` **【2】PVD 절** (§A~§F) | 좌 패널 전체 — 단면 방향(챔버 중심축 수직 종단면), 구성부 12개, 상대 치수, 오답 7개 회피 |
| 조사 대장 | `이미지/_조사/C_증착_이온주입.md` **【4】이온주입기 절** (§A~§F) | 우 패널 전체 — 단면 방향(빔 평면 배치도), 구성부 17개와 **순서**, 오답 10개 회피 |
| 조사 대장 | 같은 문서 **§G**(출처 28건)·**§H**(특허 도면 근거 대장)·**미확인 표**(U-6·U-7·U-8·U-10·U-13·U-14) | §3 참조 자료 · §7 그리지 않은 것 |
| 사내 규격 | `이미지/_조사/03_규격개정_DEV정본.md` | 캔버스 1600×900 · 레이어명 `00-bg`~`90-anchor` · 라벨 분리(`labels.json`) · 배경 불투명 · **정지 표현 원칙**(색으로 정보를 굽지 않는다) · 2장비 공정은 좌우 2패널 |
| 사내 규격 | `이미지/_조사/04_정정_문자금지와구도.md` | **래스터에 문자 0** · `notes[]` 신설 · 안전 여백 · 빈 사분면 금지 · 라벨 구역(좌 40~420 / 본체 440~1160 / 우 1180~1560) |
| 사내 규격 | `이미지/_조사/01_제작지침.md` | A4 5요건(절단면 해칭·부재 두께·비례·내부 가시·재질 구분) · 색 토큰 `var(--xs-*)` · 상표·모델명 금지 |
| 재질 라이브러리 | `이미지/단면도해/_재질라이브러리.svg` | 금속·세라믹·실리콘·구리·텅스텐 그라디언트와 해칭 패턴 |

🔴 **클린룸 준수:** 참조 사이트 2종(`kimgwinil.github.io/Semiconductor-Digital-Twin`, `…/semiconductor-8-process-simulator`) · `~/AGENT/` · `archive/2026/교재구독-001/` 의 이미지·프롬프트를 **열지 않았고 참고하지 않았다**(E-001 · D-026).

## 3. 참조한 공개 자료 — URL · 도면번호 · 부호

> 🔴 **2026-08-20 보완 (A8 게이트 강화 대응).** 이 절은 제목 바로 아래가 곧바로 소제목(`### 3-1`)이라
> **본문이 한 줄도 없었다.** DEV 가 A8 검사를 「본문 아무 데나 단어가 있으면 통과」에서
> **「제목으로 존재 + 그 아래에 실제 내용」** 으로 조인 뒤 이 공정이 `참조` 누락으로 걸렸다.
> 내용은 원래 있었고 **구조가 검사에 잡히지 않는 모양이었을 뿐**이지만, 요약이 없으면 다음 사람이
> 두 소절을 다 읽어야 전모를 안다. 그래서 요약을 둔다.

**이 도해가 근거로 삼은 공개 자료는 전부 미국 특허 명세서다.** 좌 패널(PVD) 3건 · 우 패널(이온주입 빔라인) 3건이며,
아래 두 소절이 **부재 하나하나에 FIG. 번호와 부호(reference numeral)** 를 붙여 대응시킨다.

| 패널 | 근거 특허 | 핵심 도면 | 이 도해에서 결정한 것 |
|---|---|---|---|
| 좌 · PVD 마그네트론 | **US 5,174,875**(T-C-20) · US 6,358,376 B1 · US 6,663,754 B2 | **FIG.4 · 4A~4C** | 타깃 뒤 마그넷 어레이 → 타깃 표면 **링 침식(레이스트랙)** 형상의 직접 근거 |
| 우 · 이온주입 빔라인 | **US 6,130,436**(T-C-27) · **US 5,389,793**(T-C-28) · 관련 1건 | T-C-27 **FIG.1·2**(블록도) · T-C-28 **FIG.4**(평면 배치도) | **질량분석 마그넷 90° 편향** · 이온원→추출→분석→가속→스캔→중화→엔드스테이션 **순서** |

🔴 **도면 이미지를 복제·트레이싱하지 않았다.** 명세서의 「BRIEF DESCRIPTION OF THE DRAWINGS」·「DETAILED DESCRIPTION」
**텍스트**에서 부호 정의와 배치 관계를 읽어 재구성했다.
🔴 **정직 고지 — 조사 C 전반은 Google Patents 403 차단 때문에 FreePatentsOnline 텍스트 전문으로 열람했고,
도면 이미지 자체는 보지 않았다.** ~~`T-C-18`·`T-C-19` 2건은 전문 미열람~~ → ✅ **2026-08-20 P-REV 가 2건 모두 전문 열람 완료**(§8 항목 3 · §5-1).
🔴 부호 귀속 정정 2건이 있었다(§「검수 반영(V4)」) — **`T-C-27` → `T-C-28`.** 오염원인 조사 대장 §C-5·C-6·C-7·§H 도 함께 고쳤다.
🔴 **그중 「정정 ①」(FIG 귀속)은 2026-08-20 철회됐다** — 옳던 기재를 틀리게 바꾼 **오정정**이었고 10곳으로 퍼졌다. 되돌린 근거·축자 인용은 §「🔴 정정 ① 철회」, 등재는 `07_정합성원장.md` §6-1 **12번**. **정정 ②(빔라인 순서)는 유효하다.**

### 3-1. PVD 마그네트론 스퍼터 (좌 패널)

| T번호 | 서지 | URL | 도면·부호 | 이 그림에서 쓴 곳 |
|---|---|---|---|---|
| **T-C-21** | US 6,358,376 B1 "Biased shield in a magnetron sputter reactor", Applied Materials, 등록 2002-03-19 | https://www.freepatentsonline.com/6358376.html | **FIG.1**(반응기 수직 단면) 부호 **10**(magnetron sputter reactor) · **14**(grounded metal chamber) · **16**(target) · **18**(first electrical isolator) · **20**(DC power supply, V_T −400~−600 V) · **22**(wafer) · **24**(pedestal electrode·shadow ring) · **26**(RF bias source 13.56 MHz) · **28**(gas source) · **30**(mass flow controller) · **32**(gas inlet) · **34**(vacuum pump system) · **36**(pumping port) · **12**(biasable shield, V_s +10~50 V) · **40·42·44·46**(shield 각부) · **48**(second isolator) · **50**(shield voltage source) · **56**(grounded shield) · **60**(magnetron) · **62**(stronger outer magnet pole) · **64**(weaker inner magnet pole) · **66**(magnetic yoke) · **68**(rotating shaft) · **70**(center axis) · **72**(high-density plasma region) / **FIG.3·FIG.4**(마그네트론 평면 형상) | 좌 패널 골격 전체 — 타깃이 천장(음극)·웨이퍼가 바닥, 절연체로 격리, 접지 실드, 타깃 뒤 마그넷 내·외 자극과 요크·회전축, 타깃 앞 고밀도 플라즈마, 가스 계통·배기 계통, 캐소드 DC 전원, 기판 RF 바이어스 |
| **T-C-22** | US 6,663,754 B2 "Tubular magnet as center pole in unbalanced sputtering magnetron", Applied Materials, 등록 2003-12-16 | https://www.freepatentsonline.com/6663754.html | **FIG.1**(SIP 반응기 단면) 부호 **12**(chamber wall) · **14**(biased metal target) · **16**(dielectric isolator) · **18**(wafer) · **20**(pedestal electrode) · **22**(clamping ring) · **24**(grounded shield = anode) · **26**(floating shield) · **28**(second dielectric isolator) · **32**(gas supply) · **34**(MFC) · **36**(vacuum pumping system) · **38**(pumping port) · **40**(negative DC power supply ≈ −600 V) · **42**(RF power supply) · **52**(high-density plasma region) / **FIG.2·FIG.3**(마그네트론) 부호 **50**(magnetron) · **56**(magnetic yoke) · **58**(motor shaft) / **FIG.4·FIG.5**(비평형 마그네트론 자기장 분포) | 접지 실드가 양극이라는 결선, 클램프 링, 마그네트론을 축으로 **회전**시켜 원주 대칭 침식을 만든다는 서술(→ 침식 트랙을 좌우 대칭 한 쌍으로 작도) |
| **T-C-23** | US 5,174,875 "Method of enhancing the performance of a magnetron sputtering target", Materials Research Corp., 등록 1992-12-29 | https://www.freepatentsonline.com/5174875.html | 🔴 **FIG.4 · FIG.4A · FIG.4B · FIG.4C**(자력선·플라즈마·**침식 홈(erosion groove) 형상 비교**) / **FIG.1**(스퍼터 챔버 단면) / FIG.3(수명 곡선). 도면 설명이 정의하는 대상: "field line, plasma and erosion groove shapes with and without the present invention", 침식은 "areas which underlie the denser regions of ion concentration" 에 집중, 홈이 "will punch through to the back surface of the target" | 🔴 **레이스트랙 침식 트랙 그 자체** — 타깃 아랫면에만, 자석 아래 고리 자리에만 파인 형상. 타깃 중심·가장자리는 남긴 것 |
| **T-C-05** | J. T. Gudmundsson, "Physics and technology of magnetron sputtering discharges", *Plasma Sources Sci. Technol.* **29**(11) 113001, IOP, 2020, DOI 10.1088/1361-6595/abb7bd | https://iopscience.iop.org/article/10.1088/1361-6595/abb7bd | — (본문 서술) | 수랭 구리 백킹 플레이트의 존재 · 홈 중심이 타깃 반지름의 약 2/3 · 타깃 이용률 26%→77% · 아르곤 0.2~4 Pa, 방전 300~700 V, 타깃 표면 자기장 20~50 mT(수치는 이미지에 넣지 않음) |
| **T-C-04** | Wikipedia, "Sputter deposition" | https://en.wikipedia.org/wiki/Sputter_deposition | — (본문) | 스퍼터 입자가 **중성 원자라 직진**한다는 것 · 압력에 따른 산란 |
| **T-C-19** | US 6,592,728 / US 6,572,744 "Dual collimated deposition apparatus and method of use" 외 콜리메이션·롱스로우 공개 특허문서군 | https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6592728 | 콜리메이터 셀 구조 도면(부호 미확보) | ✅ **2026-08-20 P-REV 전문 열람 완료**(FreePatentsOnline · 6592728·6572744 양건, 본문 동일). 유효 근거는 **직진성·콜리메이션·롱스로우 개념뿐**이다(`collimat*` 약 350회). 🔴 **「오버행·보이드 발생 기구」 인용은 취소한다** — `overhang` 9회는 전부 **MR 헤드 레지스트 리프트오프 오버행**(부호 110·111·112)이고 `void` 2회는 트렌치 충전 맥락이 아니다. 오버행·보이드 근거는 **T-C-18 로 이관**(§5-1) |
| **T-C-18** | US 6,576,565 B1 "RTCVD process and reactor for improved conformality and step-coverage", 등록 2003-06-10 | https://patents.google.com/patent/US6576565B1/en | 명세서 + **FIG.3**(브레드로프·보이드 단면) · **FIG.5**(무결함 대비 단면) 부호 **48**(trench)·**50**(deposited material)·**52**(voids) | ✅ **2026-08-20 P-REV 전문 열람 완료.** 인셋의 오버행 → 핀치오프 → 보이드 순서의 **정본 근거**다(§5-1 `overhang`·`void`). 실측: `bread-loafing` 7회 · `pinch-off`/`pinching off` 각 1회 · `void` 19회 · `seam` 7회 · `trench` 45회 / `overhang` **0회**(용어가 아닌 **기구**를 취한다) |

### 3-2. 이온주입기 빔라인 (우 패널)

| T번호 | 서지 | URL | 도면·부호 | 이 그림에서 쓴 곳 |
|---|---|---|---|---|
| **T-C-27** | US 6,130,436 "Acceleration and analysis architecture for ion implanter", Varian Semiconductor Equipment Associates, 등록 2000-10-10 | https://www.freepatentsonline.com/6130436.html | 🔴 **FIG.1**(전체 블록도) 부호 **10**(ion beam generator) · **12**(ion beam) · **16**(scanning system) · **20**(scanner) · **24**(angle corrector) · **30**(scanned ion beam) · **32**(end station — dose measuring system + electron flood gun 포함) · **34**(semiconductor wafer) / 🔴 **FIG.2**(빔 생성기 블록도) 부호 **40**(ion beam source) · **42**(source filter) · **44**(acceleration/deceleration column) · **50**(mass analyzer) · **60**(ion source) · **62**(extraction electrode) · **64**(suppression electrode) · **66**(ion beam) · **70**(dipole magnet, 25° 편향) · **72**(mask) · **73**(resolving aperture) · **102**(ground electrode) · **104**(focus electrode) · **124**(extraction power supply, 20~80 kV 통상 40 kV) · 🔴 **160**(dipole analyzing magnet — **"deflects desired ions in the ion beam by 90°"**) · **162**(mask) · **163**(resolving aperture) / **FIG.3**(가속 모드 결선) 부호 120·130·132 / **FIG.4**(감속 모드) 부호 140 / **FIG.5·FIG.6**(마그넷 코일 전류 대 투과 빔 전류 질량 스펙트럼) / 명세서: 자기강성 **B·r = p/q = √(2mE/n²e)**, 분해능 80~250(통상 170), **BF₃ 소스 정규화 강성 표**(¹¹B⁺ 1.000 / ¹⁰B⁺ 0.953 / ¹⁹F⁺ 1.314 / ¹⁰BF⁺ 1.624 / ¹¹BF⁺ 1.651 / ¹⁰BF₂⁺ 2.089 / ¹¹BF₂⁺ 2.111) | 🔴 **빔라인 부품의 순서 그 자체** · **90° 편향 각도** · 3갈래 궤적의 곡률 차이 방향(가벼울수록 많이 휨) · 질량 슬릿 · 가감속관 · 스캐너 · 각도 보정(평행화) 마그넷 · 엔드스테이션 · 플러드건 |
| **T-C-28** | US 5,389,793 "Apparatus and methods for ion implantation", Applied Materials, 등록 1995-02-14 | https://www.freepatentsonline.com/5389793.html | 🔴 **FIG.4**(선행 주입기 **평면 배치도** — 본 도해가 채택한 시점) / 🔴 **FIG.5**(빔라인 이온광학 사시도 — 선행기술 빔라인) 부호 **25**(extraction electrode assembly) · **26**(resolving slit / aperture in the resolving slit arrangement) · **30**(ion source) · **31**(ion beam, 리본형 단면 종횡비 8:1~30:1) · **32**(ion exit aperture) · **40**(analyzing magnet) · **41·42**(upper/lower pole face) · **46**(rotatable entrance pole) · **48**(vane unit) · **50**(resolving slit arrangement) · **55**(post-acceleration gap) · **56**(magnetically suppressed shutter) · **60**(post-acceleration system) · **70**(wafer processor system) · **71**(wafer) · **72**(heat sink arrangement) · **d**(pole gap) — 🔴 **되돌림(2026-08-20 · DSN P-REV · 아래 §「🔴 정정 ① 철회」 참조)** — 2026-08-20 중 이 셀은 **25·26·46·55 를 「명세서 귀속(FIG.5 아님)」으로 강등**당했다. **그 정정이 틀렸다.** 최종 재검수 RV2-B 의 지적을 받아 P-REV 가 원문을 **2개 호스트로 직접 대조**(FreePatentsOnline · Google Patents)한 결과, 네 부호 전부 **FIG.5 문단이 정의한다**: *"FIG. 5 is a schematic isometric view of the beam line components. The ion beam 31 is extracted from the ion source 30 by an extraction electrode assembly 25."* / *"the analyzing magnet, which has a rotatable entrance pole 46"* / *"focused into the resolving slit 26"* / *"The post-acceleration of the ion beam is achieved across a single gap 55."* 🔴 **강등 근거였던 「FIG.5 부호 목록」에는 부호 51 이 들어 있었는데, 51 은 이 특허 전문에 0회다**(2개 호스트 동일). 존재하지 않는 부호가 목록에 있다는 것은 그 목록이 원문 대조로 만들어지지 않았음을 뜻한다. **원 기재로 되돌리고, 누락돼 있던 48·56 을 추가한다.** / 🔴 **FIG.40·41·42**(질량 분해계 평면·단면) 부호 **588**(multiple resolving slit frame) · **589**(resolving slit inserts) · **590**(swinging arm) · **592·593**(coolant tubes) / FIG.43·44(슬릿·패러데이 컵 구동) / **FIG.45**(이온원 출구 슬릿 단면) 부호 **495**(front plate) · **496**(ion exit aperture) / **FIG.9**(웨이퍼 스캐닝 시스템) 부호 **210**(ion implantation system) · **211**(wafer process chamber) · **212**(sliding front door) · **213**(overhead track) · **214**(post-acceleration system) · **215**(scan wheel assembly) · **216**(mounting and drive arrangement) · **217**(scan arm assembly) — 🔴 **부호 정정(2026-08-20 · P-REV):** 종전 이 칸은 **FIG.9 의 부호를 「70(wafer processor system)」** 이라 적었다. **거짓이다.** **70 은 전 문서 4회이고 전부 FIG.5 선행기술 문단**이며, FIG.9 는 210 계열을 쓴다 — *"FIG. 9 depicts an ion implantation system 210 which includes a wafer process chamber 211 having a sliding front door 212 carried on an overhead track 213"*. **엔드스테이션 라벨의 근거로는 FIG.5 부호 70 을 쓴다**(§6) | 🔴 **단면 방향(평면 배치도)의 채택 근거** · 이온원 출구 슬릿 · 추출 전극 조립체 · 질량 슬릿 블록 2매와 그 사이 갭 · 엔드스테이션 웨이퍼 처리계 |
| **T-C-09** | Wikipedia, "Ion implantation" | https://en.wikipedia.org/wiki/Ion_implantation | — (본문 §General principle · §Ion source · §Ion channelling) | 이온원 아크 챔버 재질·구성 · **중전류 주입기의 neutral ion trap** · "most implantation is carried out a few degrees off-axis" |
| **T-C-10** | Paul K. Chu, "Chapter 9: Ion Implantation"(강의노트 AP6120), City University of Hong Kong | https://www.cityu.edu.hk/phy/appkchu/AP6120/9v.pdf | 가우시안 분포도, 채널링 궤적도, RTA 장치도(도면 부호 없음) | 🔴 **주입 깊이 분포 인셋** — n(x) = n₀·exp[−(x−Rp)²/(2σp²)], n₀ ≈ 0.4Φ/σp, 100 keV 붕소 Si에서 Rp = 2968 Å·σp = 735 Å(수치는 이미지에 넣지 않음) · **웨이퍼 7° 틸트 관행** |
| **T-C-11** | L. Rubin, J. Poate, "Ion Implantation in Silicon Technology", *The Industrial Physicist*, 2003 | https://www.axcelis.com/wp-content/uploads/2019/02/Ion_Implantation_in_Silicon_Technology.pdf | **FIG.1**(에너지별 농도–깊이 곡선) · FIG.3(고전류 빔라인 전자가둠) | 인셋 3곡선의 에너지별 상대 관계 · 매엽식 중전류 엔드스테이션 최대 60° 틸트 · 저에너지 수송에 전자 중화 필수 |
| **T-C-12** | M. Tanjyo, M. Naito, "History of Ion Implanter and Its Future Perspective", *SEI Technical Review* No.73 | https://global-sei.com/technology/tr/bn73/pdf/73-03.pdf | Fig.7(다중 패러데이) · Fig.9(엔드스테이션) | 스캔빔을 평행화한 뒤 웨이퍼에 꽂는다는 순서 · 가·감속 후 잔류 성분을 슬릿/어퍼처로 제거 · 플라즈마 플러드건 |
| **T-C-14** | Wikipedia, "Sector instrument" | https://en.wikipedia.org/wiki/Sector_instrument | — (본문) | F = qvB 이므로 궤적이 원호가 된다는 것 |

## 4. 상업 사용 판정

| 자료군 | 라이선스 | 판정 |
|---|---|---|
| T-C-18 · 19 · 21 · 22 · 23 · 27 · 28 (미국 특허 공개공보) | 미국 특허 문헌(공개 공보) — **공중 이용 가능** | ✅ **도면 복제 0건.** 명세서의 「BRIEF DESCRIPTION OF THE DRAWINGS」·「DETAILED DESCRIPTION」과 부호표를 **문장으로 읽어 구조 관계만** 취했고, 좌표·비례·형상은 전부 새로 작도했다. 출원인·모델명은 도해에 표기하지 않았다(상표 금지 규칙) |
| T-C-04 · 09 · 14 (Wikipedia) | CC BY-SA 4.0 | ✅ 상업 사용 가능. **텍스트 서술만 참조했고 위키미디어 도해·이미지를 복제하지 않았다** → 파생물 아님, SA 전파 대상 아님 |
| T-C-05 (IOP, 오픈액세스) | **CC BY 4.0** (논문 페이지에서 직접 확인) | ✅ 상업 사용 가능. 출처 표시로 충족. 도면 복제 없음 |
| T-C-10 (대학 공개 강의노트) | 🟡 라이선스 표기 없음 | ✅ **사실 확인 전용.** 문장·도표를 복제하지 않았고 수치도 이미지에 굽지 않았다 |
| T-C-11 (© American Institute of Physics) | 🔴 전재 금지 | ✅ **사실만 인용.** 도면·문장 복제 0건. 곡선 형상은 T-C-10의 가우시안 식으로 직접 계산해 좌표를 생성했다 |
| T-C-12 (© Sumitomo Electric 기술지) | 🔴 회사 저작권 보유 | ✅ **부품 존재·순서 등 사실만 인용.** 도면 복제 0건, 상표·모델명 미사용 |
| 🚫 배제 | CC BY-NC · CC BY-ND · 유료 스톡 · 블로그 재게시 이미지 | **0건 (사용 없음)** |

**최종 판정: 상업 사용 가능.** 제3자 **도면 복제 0건** · 제조사 제품 사진 **0건** · 상표·모델명 표기 **0건**.

## 5. 라벨 대응표 (`labels.json` → `labels[]` 20개)

### 5-1. 좌 패널 — PVD (10개, `side: "left"`)

| id | 한글 부위명 | anchor | 근거(T번호 + FIG번호 + 부호) |
|---|---|---|---|
| `overhang` | 오버행 | [603, 194] | 🔴 **근거 재귀속(2026-08-20 · DSN P-REV · RV2-B D-02) — 도형·라벨은 유지, 근거만 이관.** **정본 = T-C-18**(US 6,576,565 B1) **명세서 + FIG.3** — *"If there is little adatom migration, then the upper corner would have thicker film, causing **pinch-off**."* · *"Enhanced polysilicon growth on top of the wafers than on the sides of the trenches causes polysilicon **bread-loafing** and **pinching off at the trench top**, leaving voids in the lower part of the trenches."* · *"more material 50 is deposited towards the top of the trenches 48 than at the bottom, causing what is referred to in the art as a **bread-loafing effect**, which causes the top part of the trenches 48 to close"* (FIG.3 부호 **48** trench · **50** deposited material · **52** voids). P-REV 전문 열람 실측: `bread-loafing` **7회** · `breadloafing` 1회 · `pinch-off`/`pinching off` 각 1회 · `trench` 45회. ❌ **T-C-19 에서 이관 — 인용 취소.** T-C-19(US 6,592,728 / 6,572,744 "Dual collimated deposition apparatus") 에 `overhang` 은 **9회 나오지만 전부 다른 물건**이다: MR 헤드 리프트오프 공정의 **레지스트 오버행 구조**(부호 **110** overhang structure · **111** sidewall · **112** overhang)이며, 목적이 *"to prevent deposition under the overhang so that the resist lifts off cleanly"* — **밑에 막이 쌓이지 않게 하는 것**이다. 우리 도해의 오버행은 **트렌치 입구 모서리에 막이 쌓여 막히는** 반대 기구다. ❌ **T-C-18 에 `overhang` 은 0회** — 용어가 아니라 **기구**를 근거로 삼는다(선례 §6-1 3·4번과 동일 「1단계 출처 확보」). `07_정합성원장.md` §6-1 **13번** 등재 |
| `void` | 보이드 | [620, 228] | ✅ **근거 유효 — 2026-08-20 P-REV 전문 열람으로 확인**(RV2-B D-02 동시 점검). T-C-18(US 6,576,565 B1) **FIG.3** 부호 **52**(voids) · `void` **19회** · `seam` 7회 — *"causing what is referred to in the art as a bread-loafing effect, which causes the top part of the trenches 48 to close, **leaving voids 52 in the lower part of the trenches 48**"* · FIG.5 는 *"a deep trench exhibiting **no seam voids or bread-loafing**, as in the prior art"*. ❌ **T-C-19 인용은 취소한다** — `void` 2회이나 트렌치 충전 맥락이 아니다(콜리메이션 스퍼터). 조사 §E-4 |
| `magnet-array` | 마그넷 어레이 | [591, 360] | T-C-21 **FIG.1** 부호 **60**(magnetron)·**62**(stronger outer magnet pole)·**64**(weaker inner magnet pole)·**66**(magnetic yoke)·**68**(rotating shaft)·**70**(center axis), FIG.3·FIG.4(평면 형상) · T-C-22 **FIG.2·FIG.3** 부호 **50**·**56**·**58** |
| `cathode-power` | 캐소드 전원 | [460, 375] | T-C-21 **FIG.1** 부호 **20**(DC power supply, V_T −400~−600 V)·**18**(first electrical isolator) · T-C-22 **FIG.1** 부호 **40**(negative DC power supply ≈ −600 V)·**16**(dielectric isolator) |
| `backing-plate` | 백킹판(수랭) | [660, 389] | T-C-05 본문("water-cooled copper backing plate"). 🟡 **특허 도면 부호 미확보**(조사 §H-5) — 논문 서술 근거만 |
| `erosion-track` | 레이스트랙 침식 트랙 | [540, 414] | 🔴 T-C-23 **FIG.4·FIG.4A·FIG.4B·FIG.4C**(erosion groove 형상 비교) + 명세서(침식은 이온 밀도가 높은 영역 아래에 집중 / 홈이 뒷면까지 punch-through) · T-C-22 명세서(마그네트론 회전 → 원주 대칭 침식) · T-C-05(홈 중심 = 타깃 반지름의 약 2/3, 이용률 26%→77%) |
| `sputter-target` | 스퍼터 타깃(음극) | [620, 420] | T-C-21 **FIG.1** 부호 **16**(target)·**18**(first electrical isolator) · T-C-22 **FIG.1** 부호 **14**(biased metal target)·**16**(dielectric isolator) · T-C-23 **FIG.1** |
| `plasma-torus` | 고밀도 플라즈마 영역 | [540, 462] | T-C-21 **FIG.1** 부호 **72**(region of high-density plasma adjacent the target at the location of the magnetron) · T-C-22 **FIG.1** 부호 **52**(high-density plasma region) · T-C-05 |
| `wafer-pedestal` | 웨이퍼·페디스털 전극 | [603, 592] | T-C-21 **FIG.1** 부호 **22**(wafer)·**24**(pedestal electrode·shadow ring) · T-C-22 **FIG.1** 부호 **18**(wafer)·**20**(pedestal electrode)·**22**(clamping ring) |
| `vacuum-pump` | 진공 펌프·배기 포트 | [535, 762] | T-C-21 **FIG.1** 부호 **34**(vacuum pump system)·**36**(pumping port) · T-C-22 **FIG.1** 부호 **36**(vacuum pumping system)·**38**(pumping port) |

### 5-2. 우 패널 — 이온주입기 빔라인 (10개, `side: "right"`)

| id | 한글 부위명 | anchor | 근거(T번호 + FIG번호 + 부호) |
|---|---|---|---|
| `angle-corrector` | 각도 보정(평행화) 마그넷 | [1073, 544] | T-C-27 **FIG.1** 부호 **24**(angle corrector) · T-C-12(스캔빔을 평행화, 평행도 0.5° 이내) |
| `beam-scanner` | 빔 스캐너 | [1034, 549] | T-C-27 **FIG.1** 부호 **16**(scanning system)·**20**(scanner)·**30**(scanned ion beam) · T-C-12(AC+DC 바이어스 스캔) |
| `resolving-slit` | 질량 슬릿(분해 슬릿) | [940, 561] | T-C-27 **FIG.2** 부호 **162**(mask)·**163**(resolving aperture) · T-C-28 **FIG.5** 부호 **50**(resolving slit arrangement) · T-C-28 **FIG.5** 부호 **26**(resolving slit — *"focused into the resolving slit 26"* · *"the aperture 26 in the resolving slit arrangement 50"*) 🔴 **되돌림 2026-08-20 P-REV**(원 기재가 옳았다 · 「정정①집행」은 오정정 · 부호 51 은 원문 0회 — §「🔴 정정 ① 철회」), **FIG.40·41·42** 부호 **588**(multiple resolving slit frame)·**589**(resolving slit inserts)·**592·593**(coolant tubes) |
| `tilted-wafer` | 틸트 웨이퍼(7°) | [1131, 570] | T-C-10("wafers are usually tilted by 7° to avoid the major planes") · T-C-09("a few degrees off-axis") · T-C-11(중전류 엔드스테이션 최대 60°) · T-C-27 **FIG.1** 부호 **34**(semiconductor wafer) |
| `analyzer-magnet` | 질량분석 마그넷(90° 편향) | [849, 579] | 🔴 T-C-27 **FIG.2** 부호 **50**(mass analyzer)·**160**(dipole analyzing magnet — "deflects desired ions in the ion beam by **90°**") · T-C-28 **FIG.5** 부호 **40**(analyzing magnet) · T-C-28 **FIG.5** 부호 **46**(rotatable entrance pole — *"the analyzing magnet, which has a rotatable entrance pole 46"*) · **48**(vane unit) 🔴 **되돌림 2026-08-20 P-REV**(원 기재가 옳았다 · 「정정①집행」은 오정정 · 부호 51 은 원문 0회 — §「🔴 정정 ① 철회」) |
| `accel-column` | 가속·감속관 | [984, 580] | T-C-27 **FIG.2** 부호 **44**(acceleration/deceleration column)·**102**(ground electrode)·**104**(focus electrode), **FIG.3**(가속 모드 부호 120·130·132)·**FIG.4**(감속 모드 부호 140) · T-C-28 **FIG.5** 부호 **55**(post-acceleration gap — *"achieved across a single gap 55"*, 원문 2회) · **56**(magnetically suppressed shutter) · **60**(post-acceleration system) 🔴 **되돌림 2026-08-20 P-REV**(원 기재가 옳았다 · 「정정①집행」은 오정정 · 부호 51 은 원문 0회 — §「🔴 정정 ① 철회」) |
| `neutral-trap` | 중성입자 트랩·에너지 필터 | [1101, 607] | T-C-09(중전류 주입기의 neutral ion trap — 중성 입자는 자기장에 안 휘어 직진하다 막힌다) · T-C-12(가·감속 후 잔류 성분을 슬릿/어퍼처로 제거) · T-C-27 **FIG.2** 부호 **42**(source filter)·**72**(mask)·**73**(resolving aperture) |
| `flood-gun` | 전자 플러드건 | [1129, 615] | T-C-27 명세서("the end station 32 typically includes … a dose measuring system, an **electron flood gun**") 🟡 **부호 미부여** · T-C-12(플라즈마 플러드건 PFG) · T-C-11(10 keV 이하 수 mA 수송에 전자 가둠 필수) |
| `extraction-electrode` | 추출·억제 전극 | [850, 711] | T-C-27 **FIG.2** 부호 **62**(extraction electrode)·**64**(suppression electrode)·**124**(extraction power supply, 20~80 kV 통상 40 kV) · T-C-28 **FIG.5** 부호 **25**(extraction electrode assembly — *"The ion beam 31 is extracted from the ion source 30 by an extraction electrode assembly 25"*) 🔴 **되돌림 2026-08-20 P-REV**(원 기재가 옳았다 · 「정정①집행」은 오정정 · 부호 51 은 원문 0회 — §「🔴 정정 ① 철회」) |
| `ion-source` | 이온원 아크 챔버 | [850, 791] | T-C-27 **FIG.2** 부호 **60**(ion source)·**40**(ion beam source) · T-C-28 **FIG.5** 부호 **30**(ion source)·**31**(ion beam), **FIG.45** 부호 **495**(front plate)·**496**(ion exit aperture) · T-C-09(고융점 금속 내벽·도펀트 가스) |

### 5-3. `notes[]` 대응표 (12개 · 래스터에서 뺀 문자)

| id | tone | 내용 요지 | 근거 |
|---|---|---|---|
| `panel-left-title` | info | 좌 패널 = PVD 마그네트론 스퍼터, 챔버 중심축 수직 종단면 | 조사 【2】§B |
| `panel-right-title` | info | 우 패널 = 중전류 이온주입기 빔라인 평면 배치도, 90°에서 L자로 접음. 부품 순서 명시 | 조사 【4】§B·§C · T-C-27 FIG.1·FIG.2 · T-C-28 FIG.4 |
| `stepcov-inset-title` | info | 좌상 인셋 = 스텝 커버리지 확대(오버행·보이드) | 조사 【2】§E-3·E-4 |
| `profile-inset-title` | info | 우상 인셋 = 주입 깊이 분포. 가로축 깊이·세로축 농도·세 곡선은 에너지 3조건 | 조사 【4】§E-2 · T-C-10 · T-C-11 FIG.1 |
| `magnetic-rigidity` | info | 🔴 **가벼운 이온일수록 곡률 반경이 작아 더 많이 휜다.** B·r = p/q = √(2mE/n²e), BF₃ 정규화 강성 ¹¹B⁺ 1.000 / ¹⁰B⁺ 0.953 / ¹⁹F⁺ 1.314 / ¹¹BF₂⁺ 2.111. 「무거운 이온이 더 휜다」는 오답 | T-C-27 FIG.2·5·6 + 명세서 정규화 강성 표 · T-C-14 · 조사 §F 오답 #2 |
| `racetrack-erosion` | info | 타깃 뒤 마그넷이 만드는 링 모양 침식 트랙. 중심·가장자리는 안 파이고 punch-through 직전 교체 | T-C-23 FIG.4·4A~4C + 명세서 · T-C-22 · T-C-05 |
| `line-of-sight` | info | 직진성 — 중성 원자라 안 휜다. 고종횡비 홀에서 오버행·보이드가 생기는 이유 | T-C-04 · T-C-19 · 조사 §E-3·E-4 · §F 오답 #6 |
| `implant-profile` | info | 투영 비정 Rp 와 산포 ΔRp. 에너지↑→Rp↑·ΔRp↑, 도즈↑→피크 농도↑. 표면 최대는 확산 도핑의 모양 | T-C-10 · T-C-11 FIG.1 · 조사 §F 오답 #5 |
| `static-image-note` | warn | 정지 구조도 고지 — 빔 세기·플라즈마 밀도는 굽지 않았고 오버레이가 그린다. 인셋 축에 눈금 수치 없음 | 규격개정 §1(색으로 정보를 굽지 않는다) · 미확인 U-11 |
| `shutter-omitted` | warn | 🔴 **PVD 셔터를 그리지 않았다** — 공개 구조 근거 없음 | 미확인 **U-13** · 조사 §H-5 · 인계 메모 7 |
| `implanter-omitted` | warn | 🔴 **4중극 렌즈·트위스트 축·이온원 내부를 그리지 않았다** — 도면 부호 없음. 패러데이 컵도 배치가 기종별로 달라 미도시 | 미확인 **U-14** · **U-10** · 조사 §H-5 |
| `ald-not-drawn` | warn | 이 프레임은 PVD·이온주입 2패널. PECVD·ALD는 담지 못했고, **ALD 온도창 그래프는 축 숫자를 넣을 수 없다** | 미확인 **U-8** · 규격개정 §2(공정당 이미지 1장) |

## 6. 라벨이 붙지 않았지만 그린 부재 (전부 근거 있음)

| 부재 | 근거 |
|---|---|
| 챔버 벽(수직 진공 용기 · 절단면 해칭) | T-C-21 FIG.1 부호 **14**(grounded metal chamber) · T-C-22 FIG.1 부호 **12**(chamber wall) |
| 접지 실드(양극) 좌·우 | T-C-21 FIG.1 부호 **56**(grounded shield)·**12**(biasable shield)·**40·42·44·46** · T-C-22 FIG.1 부호 **24**(grounded shield = anode)·**26**(floating shield) |
| 유전체 아이솔레이터(타깃 절연) | T-C-21 부호 **18**·**48** · T-C-22 부호 **16**·**28** |
| 마그네트론 회전축 · 자기 요크 | T-C-21 부호 **66**(yoke)·**68**(rotating shaft)·**70**(center axis) · T-C-22 부호 **56**·**58**(motor shaft) |
| 백킹판 내부 냉각수 유로(3구) | T-C-05("water-cooled copper backing plate"). 🟡 특허 부호 미확보 |
| 클램프 링(웨이퍼 가장자리) | T-C-22 FIG.1 부호 **22**(clamping ring) · T-C-21 부호 **24**(shadow ring) |
| Ar 가스원 · MFC · 가스 인입관 | T-C-21 부호 **28**(gas source)·**30**(MFC)·**32**(gas inlet) · T-C-22 부호 **32**·**34** |
| 기판 바이어스 전원 + 직류 차단 커패시터 | T-C-21 부호 **26**(RF bias source 13.56 MHz) · T-C-22 부호 **42**(RF power supply) |
| 웨이퍼 위 증착막(금속 박막) | T-C-04 · T-C-21 부호 **22** |
| 스퍼터 입자 직선 궤적(타깃 침식 홈 → 웨이퍼) | T-C-04(중성 원자·직진) · T-C-19 · 조사 §E-3 |
| 인셋의 트렌치·측벽막·바닥막·상면막 | **T-C-18 FIG.3**(부호 48 trench · 50 deposited material · 52 voids) · 조사 §E-4. ✅ **2026-08-20 P-REV 전문 열람 완료** — T-C-19 인용은 취소(직진성 근거로만 남긴다) |
| 빔라인 관벽(추출부·자석 후단·수평 구간)과 절단면 해칭 | T-C-28 FIG.4(평면 배치도)·FIG.5(빔라인 사시도) |
| 이온원 플라즈마(아크 챔버 내부 발광) | T-C-09(도펀트 가스가 플라즈마가 된다) · T-C-28 부호 **30** |
| 추출 빔(이온원 → 자석 입구) | T-C-28 부호 **31**(ion beam) · T-C-27 부호 **66** |
| 🔴 3갈래 궤적(선택 1 + 탈락 2)과 곡률 차이 | T-C-27 FIG.5·FIG.6 + 명세서 자기강성 식·정규화 강성 표 · T-C-14(F = qvB) |
| 스캔 부채꼴 → 평행 빔다발(4갈래) | T-C-27 부호 **20**(scanner)·**24**(angle corrector)·**30**(scanned ion beam) · T-C-12 · 조사 §F 오답 #9 |
| 엔드스테이션 챔버 · 플래튼 홀더 암 | T-C-27 FIG.1 부호 **32**(end station) · T-C-28 **FIG.5** 부호 **70**(wafer processor system — *"a post-acceleration system 60 and a wafer processing system 70"*, 전 문서 4회 **전부 FIG.5 문단**) · T-C-28 **FIG.9** 부호 **211**(wafer process chamber)·**215**(scan wheel assembly)·**217**(scan arm assembly) 🔴 **2026-08-20 P-REV 부호 정정** — FIG.9 는 **70 이 아니라 210 계열**을 쓴다 |
| 빔 축 기준선과 웨이퍼 법선(틸트각 표시) | T-C-10(7° 틸트) |
| 플러드건 방출 전자 구름 | T-C-27 명세서(electron flood gun) · T-C-11 · T-C-12 |
| 인셋의 가우시안 3곡선 · Rp 파선 3개 · ΔRp 치수선 | T-C-10(n(x) = n₀·exp[−(x−Rp)²/(2σp²)], 100 keV B: Rp 2968 Å·σp 735 Å) · T-C-11 FIG.1. 좌표는 이 식으로 **직접 계산**해 생성했다 |

## 7. 🔴 그리지 않은 것 (미확인 · 근거 없이 그리지 않는다)

| 미확인 번호 | 항목 | 왜 그리지 않았나 | 처리 |
|---|---|---|---|
| **U-13** | **PVD 셔터** | 담당 조사 범위에서 셔터를 부호로 명시한 공개 특허를 확보하지 못했다. A13 기준을 적용하면 근거 없이 그리게 된다. 조사 인계 메모 7번이 **초안에서 뺄 것을 권고**했다 | **전부 미도시.** `notes[].shutter-omitted` 로 고지 |
| **U-14** | **이온주입기 4중극 렌즈 · 플래튼 트위스트(방위각 회전) 축 · 이온원 내부(간접가열 캐소드 · 리펠러 · 소스 마그넷)** | 존재와 역할의 서술 근거(T-C-09·T-C-11·T-C-12)는 있으나 **특허 도면 부호를 확보하지 못했다** | **전부 미도시.** 이온원은 외곽 챔버 + 플라즈마까지만 그리고 내부는 비웠다. `notes[].implanter-omitted` 로 고지 |
| **U-8** | **ALD 온도창 그래프의 축 온도 숫자** | 4개 이탈 모드의 **구조**는 확인했으나 대표 온도 구간은 화학계 한정 값이고 원문 접근에 실패했다(MDPI 403) | ALD 자체가 이 프레임에 없다(공정당 1장 규칙). 앞으로 그리더라도 **축에 숫자를 넣지 않는다.** `notes[].ald-not-drawn` 로 고지 |
| **U-10** | 패러데이 컵의 정확한 배치 | 기종별로 배치가 다르다는 사실 자체가 확인됐다(T-C-28 FIG.40·43·44 = 슬릿 연동형 / T-C-12 = 전·후단 어레이형) | **미도시.** `notes[].implanter-omitted` 로 고지 |
| **U-6 · U-7** | 타깃–기판 거리의 대표 수치, 오버행 발생 임계 종횡비 | ~~근거 특허(T-C-19)가 전문 미열람이고 수치도 검색 요약 수준~~ ✅ **2026-08-20 P-REV 가 FreePatentsOnline 텍스트 전문을 열람했고, 2026-08-21 정정조 P-D 가 두 호스트로 독립 재확인했다. 「전문 미열람」은 무효다.** 열람 결과 근거가 셋으로 갈렸다 — ✅ **「4:1」 축자 확인**(*"these techniques are **ineffective for aspect ratios exceeding 4:1**"*) · 🔴 **「대략 1:1 이상」은 근거 없음 → U-7 강등** (T-C-19 의 1:1 은 트렌치가 아니라 **콜리메이터** 종횡비다 — *"a long-throw collimator providing an **aspect ratio of 1:1**"*) · 🔴 **「자기 그림자(self-shadowing)」도 근거 없음 → 삭제**(`shadow` 전문 **1회**, 그것도 "shadow masks"). **T-C-19 에 남는 유효 근거는 「직진성·콜리메이션·4:1 초과 시 무력」뿐이다.** (2026-08-21 전파 정정 · FIX-DOC) **U-6(타깃–기판 대표 거리)은 전문에도 일반 대표 수치가 없다**(그 문서의 12″ 는 특정 장비의 타깃–콜리메이터 거리). | **수치를 이미지에 넣지 않았다.** 거리는 「웨이퍼 지름의 약 0.5~1배」라는 **작화 규약**으로만 사용(사실 아님) |
| **U-11 · U-12** | RTA 승온율·피크 온도, 채널링 임계각 식 Ψ₁ | 원논문 대조 실패 | **미도시.** 어닐 인셋·채널링 인셋 자체를 넣지 않았다 |
| — | 콜리메이터 | 조사 §C-10에 있으나 **선택 구성**이다. ~~근거인 T-C-19가 전문 미열람~~ ✅ **2026-08-20 P-REV 가 FreePatentsOnline 텍스트 전문을 열람했고, 2026-08-21 정정조 P-D 가 두 호스트로 독립 재확인했다. 「전문 미열람」은 무효다.** 열람 결과 근거가 셋으로 갈렸다 — ✅ **「4:1」 축자 확인**(*"these techniques are **ineffective for aspect ratios exceeding 4:1**"*) · 🔴 **「대략 1:1 이상」은 근거 없음 → U-7 강등** (T-C-19 의 1:1 은 트렌치가 아니라 **콜리메이터** 종횡비다 — *"a long-throw collimator providing an **aspect ratio of 1:1**"*) · 🔴 **「자기 그림자(self-shadowing)」도 근거 없음 → 삭제**(`shadow` 전문 **1회**, 그것도 "shadow masks"). **T-C-19 에 남는 유효 근거는 「직진성·콜리메이션·4:1 초과 시 무력」뿐이다.** (2026-08-21 전파 정정 · FIX-DOC) 콜리메이션 자체는 **유효 근거로 남는다.** | **미도시**(선택 구성이므로 · 근거 상태와 무관) |
| — | 소스 필터(추출 직후 25° 1차 선별 쌍극자) | T-C-27 부호 **42·70·72·73** 으로 근거는 있으나, 2패널 프레임에서 90° 주 편향과 겹쳐 원리 전달을 흐린다고 판단 | **의도적 생략**(근거 부족이 아님) |

### 과장한 치수와 실제 비

| 대상 | 그림의 비 | 실제 | 배율 |
|---|---|---|---|
| 웨이퍼 두께 : 웨이퍼 지름 | 10 : 148 ≈ 1/15 | 약 1/400 | **약 27배 과장** |
| 타깃–기판 거리 : 웨이퍼 지름 | 124 : 148 ≈ 0.84 | 🟡 절대치 미확인(U-6). 작화 규약 0.5~1배 안 | 규약 준수 |
| 인셋 트렌치 종횡비(깊이 ÷ 폭) | 68 : 60 ≈ 1.1 | 오버행이 시작되는 대략의 경계(U-7, 수치 미표기) | 과장 없음 |
| 웨이퍼 틸트각 | 7° | 7°(T-C-10) | **과장 없음 — 실측치 그대로** |
| 질량분석 마그넷 편향각 | 90° | 90°(T-C-27 부호 160) | **과장 없음 — 실측치 그대로** |

## 8. 🔴 검수 우선 재확인 대상 (조사 C의 자진 신고를 그대로 옮긴다)

조사 대장 `C_증착_이온주입.md` §G 「확인 방식에 관한 정직한 고지」와 DSN 인계 메모 6번이 다음을 자진 신고했다. **감추지 않고 그대로 적는다.**

1. 🔴 **특허 도면 이미지 자체를 열람하지 않았다.** Google Patents가 자동 조회를 차단(HTTP 403/봇 방지)했고 USPTO 직접 PDF는 텍스트 레이어가 없는 스캔본이어서, **FreePatentsOnline이 게재한 미국 공개 전문(텍스트)** 을 내려받아 읽었다.
2. 🔴 따라서 이 문서의 **도면번호(FIG. n)와 부호–부품명 대응은 명세서 본문의 「BRIEF DESCRIPTION OF THE DRAWINGS」·「DETAILED DESCRIPTION」 서술에 기반한 것**이다. 부호–부품명 대응 자체는 명세서가 정의하므로 신뢰도가 높으나, **「어느 도면에 실제로 그 부호가 찍혀 있는가」는 서술 기반 추정**이다. 검수조는 이 점을 알고 도면 이미지를 직접 대조하기 바란다.
3. ✅ **해소(2026-08-20 · DSN P-REV).** ~~`T-C-18`·`T-C-19` 2건은 전문 미열람~~ → **2건 모두 FreePatentsOnline 전문 열람 완료.** 그 결과 **근거 1건이 무너졌다**: `overhang` 라벨이 인용하던 **T-C-19 의 `overhang` 9회는 전부 MR 헤드 레지스트 리프트오프 구조**로 우리 도해와 다른 물건이었고, **T-C-18 에 `overhang` 은 0회**였다. → 근거를 **T-C-18 의 bread-loafing / pinch-off 기구 문장**으로 재귀속했다(§5-1 · `07_정합성원장.md` §6-1 13번). **도형·라벨은 유지**(1단계 출처 확보). `void` 근거는 **유효**로 확인됐다(T-C-18 FIG.3 부호 52 · `void` 19회). 나머지 특허 5건(T-C-21·22·23·27·28)은 종전대로 전부 전문 열람했다.
4. 🟡 **부호를 확보하지 못한 채 그린 부재 1건**: 백킹 플레이트 냉각 유로 — 논문(T-C-05) 서술 근거만 있다(조사 §H-5).
5. 🟡 **부호가 부여되지 않은 부품 1건**: 전자 플러드건 — T-C-27 명세서가 존재를 서술하나 부호를 붙이지 않았다.

## 9. 구도·규격 준수 확인 (정정문 §3 · §6-2)

| # | 규칙 | 결과 |
|---|---|---|
| 1 | 안전 여백 x ∈ [24, 1576] · y ∈ [24, 876] | ✅ 실측 x [442, 1160] · y [90, 830] |
| 2 | 빈 사분면 금지 | ✅ TL 스텝커버리지 인셋(442~790, 96~280) · TR 주입깊이 인셋(846~1158, 110~430) · BL PVD 챔버·펌프 · BR 빔라인·엔드스테이션 |
| 3 | 본체 가로 45% 이상 | ⚠️ 실측 442~1160 = **718 px = 44.9%** — 규정 720 px(45.0%)에 **2 px 미달**. 좌우 이동으로는 폭이 늘지 않고 형상 재작도가 필요해 보정하지 않았다. 검수 판단에 맡긴다 |
| 4 | 주 처리면 y ∈ [520, 620] | ✅ PVD 웨이퍼 상면 y = **556** · 빔 축 y = **577~580** · 주입 웨이퍼 중심 y = **580** |
| 5 | 라벨 구역(좌 40~420 / 우 1180~1560) 비움 | ✅ 본체 최좌단 **442**(> 420) · 최우단 **1160**(< 1180). 확대 인셋도 전부 440~1160 안 |
| 6 | 인셋은 글자 없이 도형만 · 테두리 점선 1 px | ✅ 인셋 2개 모두 `stroke-dasharray="5 4"` 테두리, 내부는 도형만 |
| 7 | 🔴 래스터에 문자 0 | ✅ SVG 내 `<text>` 0개 · `<tspan>` 0개 |
| 8 | 레이어명 DEV 규약 | ✅ `00-bg` `10-frame` `20-internal` `30-wafer` `40-flow` `50-highlight` `90-anchor` |
| 9 | 상태색(22c55e/f59e0b/ef4444) 직접 기입 | ✅ 0건 |
| 10 | 배경 불투명 | ✅ `00-bg` 에 1600×900 `fill="var(--xs-page,#0f172a)"` |

## 10. 제작자 / 검수자

| 항목 | 값 |
|---|---|
| 제작자 | **P5b** (디자인팀 제작 하위 에이전트 · 공정 05 증착·이온주입 담당). SVG 형상은 선행 담당 **P5** 가 작도했고, P5b 는 그 SVG를 읽어 좌표를 추출해 `labels.json` · `PROVENANCE.md` 를 완성했다 |
| 제작일 | 2026-08-20 |
| 검수자 | **(검수 대기)** — 별도 검수조가 채운다. 🔴 제작자와 같으면 CI 실패 |
| 검수일 | **(검수 대기)** |

---

## 🔴 검수 반영 (V4 · 2026-08-20 · DSN 처리)

V4 가 **특허 도면 이미지를 실제로 열람**해, 조사 C 가 자진 신고한 「도면 미열람」을 **4건 해소**했다.
(US5174875 FIG.4/4A/4B/4C 침식 홈 · US6358376B1 FIG.1 반응기 · US6130436 FIG.1·2 빔라인 · US5389793 FIG.5)
접속 실패 **0건**. 그 과정에서 **부호 귀속 오류 2건**이 드러났다.

### ~~정정 ① — `T-C-28`(US 5,389,793) 부호의 **도면 귀속**~~ 🔴 **철회됨 (2026-08-20 · DSN P-REV)**

> 🔴 **이 정정은 틀렸다. 아래 원문은 기록으로만 남긴다. 따르지 마라.**
> 되돌린 내역은 이 절 바로 아래 **「🔴 정정 ① 철회 — 되돌린 근거」** 에 있다.

~~위 §3-2 표는 부호 **25·26·46·55** 를 **FIG.5 소속**으로 적었다. **틀렸다.**~~
~~V4 가 Sheet 2 of 26 을 직접 열람한 결과 **FIG.5 에 찍힌 부호는 30·31·32·40·41·42·50·51·60·70·71·72·d** 뿐이다.~~
~~→ 부품–부호 대응 자체는 명세서가 정의하므로 유효하나, **어느 도면인지가 틀렸다.** 해당 셀의 「FIG.5」 표기를 삭제한다.~~

### 🔴 정정 ① 철회 — 되돌린 근거 (2026-08-20 · DSN P-REV)

**원 기재(옳았음):** §3-2 T-C-28 셀과 §5-2 라벨 4행이 부호 **25·26·46·55** 를 **FIG.5 소속**으로 적었다.
**V4 정정(틀렸음):** 이를 **「명세서 귀속(FIG.5 아님)」** 으로 강등했고, §8-2 규칙(「오염원까지 고쳐라」)에 따라 조사 대장까지 횡전개됐다.
**되돌린 근거:** 최종 재검수 **RV2-B** 의 지적을 받아 P-REV 가 US 5,389,793 전문을 **2개 호스트로 독립 대조**했다.

- `https://www.freepatentsonline.com/5389793.html`
- `https://patents.google.com/patent/US5389793A/en`

**부호별 실측 (참조부호로 쓰인 횟수 · 두 호스트 일치):**

| 부호 | 참조부호 출현 | 소속 문단 | 원문 축자 인용 |
|---|---|---|---|
| **25** | **1회** | FIG.5 | *"The ion beam 31 is extracted from the ion source 30 by an extraction electrode assembly 25."* |
| **26** | **4회** | FIG.5 | *"focused into the resolving slit 26 without the use of any electrostatic focusing lenses"* · *"through the aperture 26 in the resolving slit arrangement 50"* |
| **46** | **1회** | FIG.5 | *"The divergent beam from the ion source 30 enters the analyzing magnet, which has a rotatable entrance pole 46."* |
| **48** | **1회** | FIG.5 | *"it comes to the vane unit 48 which controls the beam current reaching the wafer processor system 70"* |
| **51** | 🔴 **0회 — 이 특허 전체에 존재하지 않는다** | — | — |
| **55** | **2회** | FIG.5 | *"The post-acceleration of the ion beam is achieved across a single gap 55. Immediately after the post-acceleration gap 55 is a magnetically suppressed shutter 56…"* |
| **56** | **1회** | FIG.5 | 위 인용과 동일 문장 |
| **70** | **4회 · 전부 FIG.5 문단** | FIG.5 | *"a resolving slit arrangement 50, a post-acceleration system 60 and a wafer processing system 70"* |

🔴 **결정적 증거 — 부호 51 은 US 5,389,793 전문에 0회다.** V4 가 「FIG.5 에 찍힌 부호」라며 제시한 목록
`30·31·32·40·41·42·50·51·60·70·71·72·d` 에는 **원문 어디에도 없는 51** 이 들어 있다.
도면 부호는 전부 명세서가 정의하므로, **명세서에 0회인 부호가 도면에 찍혀 있을 수 없다.**
즉 그 목록은 **원문 대조로 만들어진 것이 아니다.** (나머지 30·31·32·40·41·42·50·60·70·71·72·d 는 전부 실재한다.)

🔴 **부호 70 에 대한 V4 의 별도 주장도 반증됐다.** V4 는 다른 셀에서 70 을 「FIG.9 의 wafer processor system」이라 적었으나,
70 은 전 문서 **4회이고 전부 FIG.5 선행기술 문단**이다. **FIG.9 는 210**(ion implantation system)**·211**(wafer process chamber)**·212**(sliding front door)**·213**(overhead track)**·214·215·216·217** 계열을 쓴다 —
*"FIG. 9 depicts an ion implantation system 210 which includes a wafer process chamber 211 having a sliding front door 212 carried on an overhead track 213"*.

**되돌린 곳:** 이 파일 §3-2 T-C-28 셀 · §5-2 라벨 4행 · 아래 §재검수 RV 반영 처리 ② 표 ·
`이미지/_조사/C_증착_이온주입.md` §C-4·§C-5·§C-6·§C-7·§「왜 이 특허인가」 T-C-28 행 · `07_정합성원장.md` §3 `deposition` 행.
**등재:** `07_정합성원장.md` §6-1 **12번** — 결함 유형 🔴 **「검수자의 오정정」**(이 원장 최초 사례).

🔴 **다음 사람에게.** 이 자리를 다시 「명세서 귀속」으로 내리지 마라. 내리려면 **먼저 원문에서 부호 51 을 찾아라.** 없다.

### 정정 ② — 🔴 **빔라인 부품 순서의 근거를 `T-C-27` → `T-C-28` 로 옮긴다**

`T-C-27`(US 6,130,436) **FIG.2** 는 이온원 60 → 추출 62/64 → 소스 필터 70 → **가속관 44** → 질량분석 50/160 → 슬릿 162/163 순이다.
즉 **가속이 90° 분석보다 앞**이며(특허 제목 자체가 *"Acceleration and analysis architecture"*), **이 그림과 반대다.**

**🔵 그림 쪽이 옳다.** `T-C-28`(US 5,389,793) **FIG.5**(직접 열람)가
이온원 30 → 분석 마그넷 40 → 분해 슬릿 **50** → **후단 가속 60** → 엔드스테이션 70 을 보여 준다.
🔴 **부호 정정(2026-08-20 · P-REV):** 종전 「50/51」의 **51 은 원문 0회인 유령 부호**였다(위 §「정정 ① 철회」). **순서 결론 자체는 원문이 그대로 뒷받침한다** — *"a resolving slit arrangement 50, a post-acceleration system 60 and a wafer processing system 70"*. 따라서 **정정 ②(빔라인 순서 · 근거 `T-C-27`→`T-C-28` 이관)는 유효하며 되돌리지 않는다.**
→ **근거를 `T-C-28` 로 이관.** 조사 대장 `이미지/_조사/C_증착_이온주입.md` §C-5 의 「추출 전극·가속관 다음」 서술도 **같은 이유로 정정 대상**이다(§F-3 및 그림과 모순).

### V4 가 확인해 준 것 (반려 사유 아님 · 기록)

| 항목 | 결과 |
|---|---|
| **레이스트랙 침식** | ✅ 마그넷 3블록(N｜S｜N, US6358376 FIG.1 동형) 외곽 2극 **바로 아래** 타깃 아랫면에 침식 홈 2개. 홈 중심 `\|540−603\|=63`, 타깃 반폭 95 → **0.66 R ≒ 2/3 R** |
| **직진성** | ✅ 스퍼터 궤적 10개 전부 `<line>`(직선). 곡선 0 |
| **질량 분리 위치** | ✅ **마그넷 안에서** 갈라진다. 출구 실측 — r73 → y577~583(슬릿 갭 574~586 **통과**) / r85 → y564~570(**차단**) / r62 → y591~597(**차단**) |
| **정규화 강성** | ✅ ¹¹B⁺ 1.000 / ¹⁰B⁺ 0.953 / ¹⁹F⁺ 1.314 / ¹¹BF₂⁺ 2.111 — **원문 TABLE 1 과 전부 일치** |
| **주입 깊이 분포** | ✅ Rp 938→986→1043(깊어짐) · FWHM 39→62→89.5(넓어짐) · 피크 190→124→85(낮아짐) · **면적 7410/7688/7607(도즈 일정)** |
| **그리지 않은 것** | ✅ PVD 셔터 0 · 4중극 렌즈 0 · 트위스트 축 0 · 이온원 내부 0 · ALD 온도창 0 (U-13/U-14/U-8 노트로 고지) |

### 미처리 (다음 개정)

- ~~**필수:** 타깃 지지 스템 `<rect x="595" y="240" w="16" h="92">` 이 **스텝커버리지 인셋(442,96)–(790,280) 을 관통**해 트렌치 안에 정체불명 회색 블록으로 비친다. **그림 수정 필요.**~~
  → ✅ **해소 (2026-08-21 · DSN P-D).** 스템을 `<rect x="595" y="296" w="16" h="36">` 으로 줄여 인셋 밖으로 뺐다. `y=296` 은 챔버 프레임 **외벽 상면**(`10-frame` `M476 296 …`)이고, 인셋 하단 280 과의 여유 **16 px** 는 이 도해의 **챔버 벽 두께**(312 − 296)를 그대로 쓴 값이다 — 새 상수를 만들지 않았다.
  같은 뿌리의 **챔버 중심축 파선**(`50-highlight` `<line x1="603" y1="240" …>`)도 인셋을 지나고 있어 `y1="296"` 으로 맞췄다.
  🔴 **RV2-B 가 적은 「480 px²」는 재현되지 않았다.** 이 조 실측 — 도형 ∩ 인셋 **기하 겹침 = 16 × 40 = 640 px²**, 래스터에서 실제로 사라진 잉크 **455 px**(수정 전·후 래스터 픽셀 차, 인셋 영역 442~790 × 96~280). **결함은 실재하나 수치는 셋 다 다르다.**
- 권고: `magnet-array` anchor `(591,360)` 이 마그넷 rect 좌측 **외곽선 위**다 → `(603,360)` 권고.
- 권고: 본체 가로폭 **718 px = 44.88%** — 규정 45%(720 px)에 **2 px 미달**.
- 권고: 우 패널 부재가 5~15 px 수준으로 판독 한계에 가깝다.
- 권고: T-C-10 원문이 *"에너지가 오르면 실제 분포는 음의 왜도로 가우시안에서 벗어난다"* 고 명시 → `implant-profile` 노트에 단서 추가.
- 참고: 발주서의 「U자로 접힘」은 부정확하다. **그림과 `labels.json` 은 L자이며 그대로 둔다.**

---

## 🔴 재검수 RV 반영 (2026-08-20 · DSN P5c 처리)

### 처리 ① — 마스터 SVG `90-anchor` 레이어를 채웠다 (🔴 방향 예외 1회)

RV 가 적발한 대로 `이미지/단면도해/src/xs_deposition.svg` 의 앵커 레이어는 **`<g id="90-anchor"/>` 자기닫힘 공백**이었다.
`_labels_check.py` 는 **양쪽에 있는 id 만** 대조하므로 라벨 20 + notes 12 = **32건이 한 건도 대조되지 않은 채 ✅** 가 났다(공허한 0).

- **방향 예외를 명시한다.** 평소에는 **SVG 가 앵커의 정본**이고 `labels.json` 이 따라온다.
  이번만 **`labels.json` → SVG** 방향으로 옮겼다. 이유: SVG 쪽이 비어 있었고, `labels.json` 의 20건은
  RV 가 렌더 위에 마젠타 십자를 찍어 **20건 전부 육안 대조**해 좌표가 옳음을 확인했기 때문이다.
  같은 예외 표기를 SVG 파일 `90-anchor` 바로 위 주석에도 남겼다. **이후로는 다시 SVG 가 정본이다.**
- **옮기기 전 P5c 가 20건 전수를 실제 도형과 재대조했다** — 각 anchor 를 SVG 도형의 bbox(회전 그룹은 역변환 후)와
  대조해 **불일치 0**. 곡선 경계(`erosion-track` 침식 홈 2차 베지어 정점 y=417.0, `analyzer-magnet` 요크 고리
  r=30\~110 · 빔 갭 컷아웃 r=48\~92 에 대해 실측 거리 100.4)까지 수치로 확인했다.
  `backing-plate`(y 378\~400, 구리) 가 `sputter-target`(y 400\~432) **위**라는 상하 관계도 재확인했다.
- `notes[]` 12건은 **넣지 않았다.** notes 는 장비 부위가 아니라 DSN 이 얹는 고지이며,
  전 8공정에서 SVG 앵커를 갖지 않는 것이 정상이다(검사기도 `labels[]` 만 대조한다).
- circle 접두사는 `deposition` 에 선례가 없어 **`a-` 로 통일**했다(검사기는 `a-`/`anc-`/`anchor-` 를 모두 받는다).
- 🟡 **미처리로 남긴 것:** 위 「미처리 (다음 개정)」의 `magnet-array` anchor `(591,360)` → `(603,360)` 권고는
  **반영하지 않았다.** `(591,360)` 은 마그넷 `<rect x="591" y="342" w="24" h="36">` 의 **좌측 외곽선 위**로,
  bbox 안(경계 포함)이라 틀린 좌표는 아니다. 좌표를 바꾸려면 `labels.json` 을 고쳐야 하는데
  P5c 는 `labels.json` 을 **읽기 전용**으로 다루라는 지시를 받았다(동시에 `en` 문자열을 고치는 담당이 있다).
  **다음 개정에서 `labels.json` 과 SVG 를 함께 `(603,360)` 으로 옮길 것.**

### 처리 ② — 오염원(조사 대장) 정정 집행

위 §검수 반영(V4)이 **선언만 하고 집행하지 않은 두 건**을 집행했다.
「자산만 고치고 조사 대장을 안 고치면 다음 제작자가 같은 값을 다시 쓴다」(`metal` 「접점 120개」 선례).

| 정정 | 고친 곳 | 내용 |
|---|---|---|
| **②(빔라인 순서)** | `이미지/_조사/C_증착_이온주입.md` §C-5 | 「추출 전극·**가속관** 다음」 → 「추출 전극 **바로 다음 — 가속관보다 앞이다**」. 근거 `T-C-27` → `T-C-28` 이관 이력 병기 |
| **②(파급)** | 같은 문서 §C-7 | 「질량 슬릿 **앞뒤** 구간」 → 「질량 슬릿 **다음**(후단 가속·감속)」. 「앞뒤」가 §C-5 옛 오기와 짝을 이뤄 잘못된 읽기를 허용했다. `T-C-27` 식 전단 가속 기종의 존재는 남기되 **본 도해 정본은 후단 가속**임을 못박음 |
| ~~**①(FIG 귀속)**~~ 🔴 **철회** | 같은 문서 §C-4·§C-5·§C-6·§C-7 + §「왜 이 특허인가」 T-C-28 행 | ~~부호 **25·26·46·55** 의 「FIG.5」 귀속 삭제 → **명세서** 귀속~~ 🔴 **이 집행은 틀렸다 — 2026-08-20 P-REV 가 전부 되돌렸다.** 25·26·46·55 는 **모두 FIG.5 문단이 정의한다**(축자 인용은 §「정정 ① 철회」). 강등 근거였던 「FIG.5 부호 목록」의 **51 은 원문 0회**. 부호 40·50 유지는 옳았다 |
| ~~**①(자기 집행)**~~ 🔴 **철회** | **이 파일** §3-2 T-C-28 셀 · §5-2 라벨 대응표 4행(`resolving-slit`·`analyzer-magnet`·`accel-column`·`extraction-electrode`) | ~~정정 ① 이 선언만 하고 셀을 고치지 않은 채 남아 있어 집행함~~ 🔴 **2026-08-20 P-REV 가 5곳 전부 원 기재로 되돌렸다.** 🔴 **여기서 배울 것:** 「선언과 집행이 어긋났다」는 절차 결함을 고치느라 **선언 내용이 옳은지를 아무도 확인하지 않았다.** 집행 전에 **선언의 근거부터 원문으로 검증**했어야 했다 |

**횡전개 확인 — 이상 없어 손대지 않은 곳(6):**
`labels.json`(좌표·문자열만 담고 FIG 인용 없음 · 읽기 전용 취급) ·
`07_정합성원장.md` L71(「이온원→추출→**질량분석**→가속…」 이미 옳음, 인용 도면도 US5389793 **FIG.4** 로 정확) ·
`12_시각화씬_공백보고.md` L92(`T-C-27` FIG.2·5·6 인용 — T-C-27 의 FIG.5 는 질량 스펙트럼으로 별개 도면, 오류 아님) ·
`이미지/씬명세/scene_stepCoverage.md` · `scene_aldCycle.md`(빔라인 순서·T-C-28 부호를 인용하지 않음) ·
조사 대장 §B·§D·§F-3(순서가 이미 옳음).

---

## A. 🔴 anchor 대응표 — `notes[]` 12건 (2026-08-21 신설 · DSN P-D)

> **왜 신설했나.** `이미지/_sync_prov.py` 가 이 공정을 **20/32 만 대조**하고 **12건을 미대조**로 띄웠다.
> 미대조분은 전부 `notes[]` 의 anchor 다 — §5-2 라벨 대응표에는 좌표 열이 있으나 §5-3 고지 대응표에는 없었기 때문이다.
> **`labels[]` 20건은 §5-2 가 이미 대조 대상이므로 여기서는 중복하지 않는다.** 이 표 12행으로 **32/32** 가 된다.
>
> 🔴 **좌표를 베껴 적은 표가 아니다.** 12건 전부 `이미지/단면도해/src/xs_deposition.svg` 의 실제 도형과 대조했다(아래 「가리키는 도형」 열).
> 🔴 **정본 순서는 마스터 SVG → `labels.json` → 이 표다.** 다만 `notes[]` anchor 는 `90-anchor` 레이어에 도형이 없다(그 레이어는 `labels[]` 20건 전용) — **이 표가 `notes[]` 쪽의 유일한 대조 근거다.**
> 배지 번호는 렌더러 `prepareNotes()` 가 **warn 을 앞으로 모아** 매기는 값이다(`EquipmentSection.tsx` 25~31행).

| id | 배지 | tone | anchor | 그 좌표가 가리키는 SVG 도형 (실제 대조) |
|---|---|---|---|---|
| `panel-left-title` | #5 | info | [603, 46] | 좌 패널 **제목 자리**(부재를 짚지 않는다). x=603 은 챔버 중심축(`50-highlight` `<line x1="603" …>`). `anchor` = `leaderEnd` 인 **sameSpot** 배지라 점선·앵커 고리를 그리지 않는다. 🔴 2026-08-21 P-D 가 `[603, 60]` → `[603, 46]` 로 옮겼다(사유는 §Z) |
| `panel-right-title` | #6 | info | [1000, 60] | 우 패널 **제목 자리**(부재를 짚지 않는다). sameSpot 배지 |
| `stepcov-inset-title` | #7 | info | [616, 86] | 좌상 인셋 **제목 자리**. x=616 은 인셋 `rect x=442 w=348` 의 **중심**, y=86 은 인셋 상단 96 에서 10 px 위. sameSpot 배지 |
| `profile-inset-title` | #8 | info | [1002, 100] | 우상 인셋 **제목 자리**. x=1002 는 인셋 `rect x=846 w=312` 의 **중심**, y=100 은 인셋 상단 110 에서 10 px 위 — 좌상 인셋과 **같은 규약**. sameSpot 배지 |
| `magnetic-rigidity` | #9 | info | [849, 579] | 질량분석 마그넷 요크(`20-internal` `path M810 650 A110 110 …`). 중심 (920,650) 에서 거리 **100.4** 로 요크 실체 구간(내측 컷 92 ~ 외경 110) 안이다. 라벨 `analyzer-magnet` 과 **같은 점** |
| `racetrack-erosion` | #10 | info | [540, 414] | 타깃 아랫면 **좌측 침식 홈**. 홈은 `20-internal` `path … Q540 405 …` 로, x=540 이 홈 중심이고 그 자리의 홈 표면은 y=417 이다(t=0.5 실계산). 타깃 판은 y 400~432. 라벨 `erosion-track` 과 **같은 점** |
| `line-of-sight` | #11 | info | [603, 505] | 타깃 아랫면(432)과 웨이퍼 상면(556) 사이의 **비행 구간**, 챔버 중심축 x=603 위. `40-flow` 스퍼터 궤적 `<line>` 10개가 지나는 자리다 |
| `implant-profile` | #12 | info | [986, 266] | 우상 인셋 **가운데 가우시안의 봉우리**. `50-highlight` polyline 2 의 정점이 (986, 265.77) 이고 Rp 파선 `<line x1="986" y1="265.8" x2="986" y2="390">` 이 여기서 내려간다 |
| `static-image-note` | #1 | warn | [847, 700] | 빔 자체(`40-flow` `<rect x="847" y="650" width="6" height="106">`). 「빔 굵기·밝기는 값이 아니다」라는 고지라 **빔 위**가 맞는 자리다 |
| `shutter-omitted` | #2 | warn | [603, 520] | PVD 셔터가 **있었다면 놓였을 자리** — 타깃(432)과 웨이퍼 상면(556) 사이, 웨이퍼 바로 위, 중심축 x=603. 미도시 부재이므로 도형은 없다(U-13) |
| `implanter-omitted` | #3 | warn | [850, 791] | 이온원 플라즈마(`40-flow` `<ellipse cx="850" cy="791" rx="20" ry="26">`) **정중심**. 「이온원 내부를 그리지 않았다」는 고지 대상이 바로 이 자리다. 라벨 `ion-source` 와 **같은 점** |
| `ald-not-drawn` | #4 | warn | [800, 96] | 두 패널을 가르는 **분할 파선**(`00-bg` `<line x1="800" y1="90" x2="800" y2="840">`) 위쪽 끝. 「이 한 장이 2패널이라 PECVD·ALD 를 못 담았다」는 프레임 전체에 관한 고지라 **패널 경계**가 맞는 자리다 |

🔴 **대조 결과 — 12건 전부 의도한 도형·자리와 일치한다. 어긋난 건 0.**
🔴 **다만 `notes[]` anchor 는 `90-anchor` 레이어에 대응 도형이 없다.** `_labels_check.py` 의 앵커 검사는 `labels[]` 20건만 본다. **`notes[]` 12건은 도구가 아니라 이 표가 유일한 근거다** — 다음 개정에서 `90-anchor` 에 `n-<id>` 도형을 넣을지 팀장 판정이 필요하다.

---

## Z. 🔴 2026-08-20 세션 3 변경 이력

> **왜 이 절이 있는가.** 이 프로젝트에서 **사실 하나가 최대 4곳**(자산 · 조사 대장 · 이 파일 · `07_정합성원장.md`)에 복제돼 있고, 정정이 절반만 반영된 사례가 오늘만 **3건** 나왔다. 무엇이 언제 왜 바뀌었는지를 **자산 옆에** 남긴다. 규칙: `07_정합성원장.md` **§8-2**.

**현재 실측:** 라벨 **20개** · `cross-section.webp` **46,588 B**(한도 184,320 B 의 25 %)

| # | 변경 |
|---|---|
| 1 | 🔴 **`90-anchor` circle 20건 신설** · **A8 §3 도입 요약 신설** · **조사 대장 10곳 횡전개 정정** — 상세는 이 문서 「검수 반영」·「재검수 RV 반영」 절 |
| 2 | `beam-scanner` en 본체 구역 침범 1건 해소 |
| **4** | 🔴 **「정정 ①」 철회 — 되돌림 10곳**(2026-08-20 · DSN P-REV · RV2-B 적발). 위 1번의 「조사 대장 10곳 횡전개 정정」 중 **FIG 귀속분이 전부 오정정**이었다. 부호 **25·26·46·55** 를 FIG.5 귀속으로 원복하고 **48·56** 을 보강. 강등 근거였던 부호 **51 은 US 5,389,793 전문에 0회**(FPO·Google Patents 2개 호스트 대조). 상세는 §「🔴 정정 ① 철회」 · 등재 `07_정합성원장.md` §6-1 **12번**(신설 유형 **「검수자의 오정정」**) |
| **5** | 🔴 **`overhang` 라벨 근거 재귀속**(RV2-B D-02) — `T-C-19`·`T-C-18` → **`T-C-18` 의 bread-loafing/pinch-off 문장**. T-C-19 의 `overhang` 9회는 **MR 헤드 레지스트 리프트오프**로 다른 물건. **도형·라벨·기하 무변경.** `void` 근거는 유효 확인(T-C-18 FIG.3 부호 52 · `void` 19회). 등재 §6-1 **13번** |
| — | 🔴 **`en` 라벨 레이아웃 정정 — clamp 18건 · 본체 구역 침범 1건** → **0**. 아래 배경 참조 |

### Z-0. 🔴 2026-08-21 세션 5 변경 이력 (DSN 정정조 P-D)

**RV2-B 잔여 반려 사유 3건(인셋 관통 · 리더선 실교차 1 · 배지)을 기하로 해소했다.** `anchor` 는 `labels[]`·`notes[]` 모두 **한 점도 옮기지 않았다**(단 아래 3번의 sameSpot 예외 1건).

| # | 파일 | 변경 | 근거 (새 상수를 만들지 않았다) |
|---|---|---|---|
| 1 | `xs_deposition.svg` | 타깃 지지 스템 `<rect x=595 y=240 w=16 h=92>` → `<rect x=595 y=296 w=16 h=36>` | `y=296` = 챔버 프레임 **외벽 상면**(`10-frame`). 인셋 하단 280 과의 여유 **16** = 이 도해의 **챔버 벽 두께**(312 − 296) |
| 2 | `xs_deposition.svg` | 챔버 중심축 파선 `<line x1=603 y1=240 …>` → `y1="296"` | 같은 뿌리의 인셋 관통. 축 구간을 챔버 외벽 상면~하면(296~700)으로 맞췄다 |
| 3 | `labels.json` `notes[]` | `panel-left-title` `anchor`·`leaderEnd` **[603, 60] → [603, 46]** (C4 해소) | 우 패널은 패널 제목 60 ↔ 인셋 제목 100 으로 **간격 40** 인데, 좌 패널은 좌상 인셋이 14 px 높아(상단 96 vs 110) 간격이 26 뿐이라 배지가 겹쳤다. **60 − 14 = 46** 으로 우 패널과 **같은 간격 40** 을 만들었다. 🔴 이 노트는 `anchor` = `leaderEnd` 인 **sameSpot** 배지라(부재를 짚지 않는 제목 자리다) 둘을 함께 옮겨야 없던 점선이 새로 생기지 않는다 — **부재를 짚는 anchor 를 옮긴 것이 아니다** |
| 4 | `labels.json` `notes[]` | `racetrack-erosion` `leaderEnd` [460, 414] → **[460, 473]** · `line-of-sight` [460, 505] → **[460, 565]** · `shutter-omitted` [460, 545] → **[460, 616]** · `implanter-omitted` [1120, 760] → **[1120, 778]** (C6 4쌍 해소) | 배지는 `leaderEnd` 에 그려진다(`EquipmentSection.tsx` NoteMarker). **`anchor` 는 넷 다 그대로**라 「무엇을 가리키는가」가 바뀌지 않았다. x 열(460 · 1120)도 그대로다. y 는 **그 열에서 라벨 리더선이 비워 둔 구간** 안에서 최소 여유가 최대가 되는 점이다 — 앵커 깊이 순서(414 < 505 < 520)와 배지 순서(473 < 565 < 616)도 보존 |
| 5 | `labels.json` `labels[]` | `flood-gun` `leaderEnd.y` 580 ↔ `neutral-trap` 642 **행 교환** (C7 실교차 1쌍 해소) | 앵커 깊이가 `neutral-trap` 607 < `flood-gun` 615 인데 행이 580 / 642 로 **뒤집혀** 있었다. 우 패널 행 피치 **62** 는 그대로다. `leaderEnd.x`(1315 · 1320)와 `anchor` 는 불변 |
| 6 | `PROVENANCE.md` | **§A `notes[]` anchor 대응표 12행 신설** | `_sync_prov.py` **20/32 → 32/32** |

**검사 전·후** (`_figure_check.py deposition`) — C4 **2 → 0** · C6 **12 → 0** · C7 **2 → 0** · C1·C2·C5·C8 **0 유지** · C3 **9 → 9**(전건 후광급 0.30 px · 우 패널 행 피치 62 와 2행 후광 높이 62.30 의 차이라 **개별 라벨 결함이 아니다**).
**래스터 재생성:** `python3 이미지/_render.py deposition` → 46,496 B.

### Z-1. `en` 레이아웃이 왜 문제였나 (전 공정 공통 배경)

`cross-section.webp` 는 **ko/en 이 공유하는 단일 파일**이고 그래서 SVG 에 문자를 하나도 굽지 않았다 — **i18n 이 이 설계의 존재 이유다.** 그런데 렌더러 `app/src/viz/svg/Overlay.tsx` 의 `place()` 는 **`lang` 을 받아 `en` 이면 `label.en` 으로 박스 폭을 다시 재는데**, DSN 검사기는 **`ko` 만** 검사하고 있었다.

🔴 **원인은 앞선 수리 자체였다.** `_labels_repair.py` 가 「`leaderEnd.x` 를 여백 끝에 붙여 clamp 원천 차단」하면서 **ko 박스를 여백에 정확히 flush(`boxX = 4.0`)** 로 맞췄고, 그보다 넓은 en 박스는 **전부 clamp 가 확정**됐다. **ko 42건을 0으로 만든 대가로 en 60건이 생겼다.** 재검수 **RV** 적발.

**조치:** ①`en` 문자열을 **건별 판단으로 축약**(일괄 치환 스크립트 금지 — 수식어가 **사실 주장인지 장식인지**를 하나씩 판단했다) ②`_labels_check.py` 를 **`ko`·`en` 양쪽 검사**로 ③`_selftest_tools.py` 에 **픽스처 고정** ④`_검수.html` 에 **언어 토글** 신설.

**검증:** `이미지/_검수증거/ko_deposition.png` · `en_deposition.png` — 렌더러 `place()` 와 **동일 산식**(정렬·베이스라인 포함)으로 합성했다. **clamp 된 박스는 붉은 파선**으로 그리므로, 붉은 박스가 없다는 것이 곧 판정이다.
