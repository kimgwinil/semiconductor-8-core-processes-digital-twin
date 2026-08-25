# PROVENANCE — `photo` / cross-section.webp

> 공정 03 「포토리소그래피」 · ArF 이머전 스캐너(광축 수직 종단면) + 인라인 트랙 모듈 열 인셋
> 마스터 소스: `이미지/단면도해/src/xs_photo.svg` (viewBox `0 0 1600 900`)
> 라벨: `labels.json` — `labels[]` 21개 · `notes[]` 20개. **이미지에 굽지 않음**

## 1. 생성 엔진·모델명

**Claude Code / SVG 직접 제작 (생성형 미사용).**
래스터 생성 모델·이미지 생성 API를 일절 사용하지 않았다. 모든 도형은 좌표를 직접 기술한 벡터이며, WebP는 `이미지/_render.py` 가 마스터 SVG를 헤드리스 Chrome으로 래스터화한 결과다(**2026-08-20 정정 후 재렌더 — q=92, 58,118 B**. 정정 전 60,034 B).

## 2. 프롬프트 원문 전체

**생성 프롬프트 없음 — SVG 직접 제작.**

제작 근거는 아래 §3 조사 대장 항목이 전부이며, 도형 하나하나가 어느 근거에서 나왔는지는 §5 라벨 대응표와 §7 비라벨 부재 대장에 적었다.

제작이 따른 규격 문서(사내):
- `이미지/_조사/01_제작지침.md` (§3 색 토큰 · §4 A4 5요건 · §5 라벨 규칙)
- `이미지/_조사/03_규격개정_DEV정본.md` (캔버스 1600×900 · DEV 레이어명 · 라벨 분리 · 배경 불투명 · `40-flow` 정지 표현 원칙)
- `이미지/_조사/04_정정_문자금지와구도.md` (§1 래스터 문자 금지 · §2 `notes[]` 신설 · §3 구도 규칙 · §6 라벨 배치 구역 최종)
- `이미지/_조사/B_포토_식각.md` §1(ArF 이머전 스캐너) · §2(트랙) · §4(출처 T-B-01~T-B-36) · §5(미확인 총괄)
- `이미지/단면도해/_재질라이브러리.svg` (재질 `<defs>`)
- 수준 정합 참고: 이미 합격한 `이미지/단면도해/src/xs_etch.svg` · `xs_wafer.svg` (**도형을 복제하지 않고 레이어 구성·선폭·해칭 밀도만 맞췄다**)

🔴 **클린룸 준수:** 참조 사이트 2종(`kimgwinil.github.io/Semiconductor-Digital-Twin`, `…/semiconductor-8-process-simulator`) · `~/AGENT/` · `archive/2026/교재구독-001/` 의 이미지·프롬프트를 **열지 않았고 참고하지 않았다**(E-001 · D-026).

🔴 **문자 0개:** 마스터 SVG에 `<text>`·`<tspan>` 이 하나도 없다. 「4:1」·「NA」·「100 µm」 같은 숫자·기호도 넣지 않았고, 전부 `labels.json` 의 `labels[]`·`notes[]` 로 분리했다.

## 3. 참조한 공개 자료 — URL · 도면번호 · 부호

| T번호 | 서지 | URL | 도면·부호 | 이 그림에서 쓴 곳 |
|---|---|---|---|---|
| T-B-01 | Wikipedia, "Immersion lithography" | https://en.wikipedia.org/wiki/Immersion_lithography | — (본문) | 액침 구성 · 국소 물 갭(수조가 아님) · 후드가 물을 데리고 다님 · 슬릿 긴 변 = 필드 높이 · 물 n≈1.44 로 NA>1 · 해상도 개선 약 30~40% · NA 1.35/193 nm → 36 nm · 워터마크·기포 결함명 |
| T-B-02 | Wikipedia, "Photolithography" | https://en.wikipedia.org/wiki/Photolithography | — (해당 절) | 공정 단계 순서(프라임→도포→소프트베이크→노광→PEB→현상) · CD = k1·λ/NA · DOF = k2·λ/NA² · k1 = 0.61 / 양산 ≈ 0.4 · 소프트베이크 90~100 °C, 30~60초 · CAR 에서 PEB의 결정성 · 레티클·웨이퍼 반대 방향 주사 |
| T-B-03 | Wikipedia, "Stepper" | https://en.wikipedia.org/wiki/Stepper | — (본문) | 스텝앤스캔 · **축소비 4:1**(원문 "4x reduction on a scanner") · **슬릿 주사**(원문 "an 'exposure slit' that is as wide as the exposure field, but only a fraction of its length (such as a 9x25 mm slit for a 35x25 mm field)") · 서브어셈블리 목록(원문 "wafer loader, wafer stage, wafer alignment system, reticle loader, reticle stage, reticle alignment system, reduction lens, and illumination system") → **조명계·정렬계·축소 렌즈의 존재** · 레티클 6인치각(원문 "6 inches square and has a usable area of 104mm by 132mm") · **항온 밀폐 챔버**(원문 "contained in a sealed chamber that is maintained at a precise temperature"). 🔴 **정정 2026-08-20 (V5 F3·F4 + P3c 자체 발견)** — 이 행이 종전에 주장하던 4건은 **원문에 없다.** 전문 grep: `barrel` 0회 · `leveling`/`autofocus`/`focus sensor` 0회 · `vibration`·`granite`·`isolation`·`damper` 0회 · `chuck` 0회. 각각 ① 「여러 장이 든 긴 배럴」→ **T-B-26 부호 `PL`** ② 「레벨링(오토포커스) 센서」→ **T-B-39·T-B-40** ③ 「제진 프레임」→ **근거 없음. 기능 주장 철회**(§7) ④ 「웨이퍼 척」→ **T-B-25 부호 110** 으로 이관했다 |
| T-B-04 | Wikipedia, "Photomask" | https://en.wikipedia.org/wiki/Photomask | — (해당 절) | 레티클 = 석영판 아래면의 **크롬 흡수막 미세 선/공간 격자**(로고 실루엣이 아님) · 펠리클을 프레임으로 띄운다 |
| T-B-05 | Wikipedia, "Off-axis illumination" | https://en.wikipedia.org/wiki/Off-axis_illumination | — (전문) | **사입사(off-axis) 조명이 고차 회절광을 투영 렌즈 안으로 들여보낸다**는 원리까지. 🔴 **정정 2026-08-20 (V5 F1)** — 이 문서 전문(3,217 B)에 `annular`·`dipole`·`quadrupole` 이 **0회**다(인용 위키 8종 전체 grep 합계도 0회). 종전에 이 행이 주장하던 **퓨필 형상 4종의 근거는 T-B-37·T-B-38 로 이관**했다 |
| T-B-06 | Wikipedia, "Numerical aperture" | https://en.wikipedia.org/wiki/Numerical_aperture | — (해당 절) | NA = n·sinθ (물 갭이 NA를 올리는 이유의 식) |
| T-B-07 | Wikipedia, "Excimer laser" | https://en.wikipedia.org/wiki/Excimer_laser | — (해당 절) | **파장 193 nm ArF · 펄스광**까지로 한정. 🔴 **정정 2026-08-20 (V5 F5)** — 「광원이 별도 상자이고 빔 전송 광로로 연결된다」는 **배치** 근거는 이 문서에 없다. **T-B-26 FIG.1 부호 `SO`·`BD`** 로 이관했다 |
| T-B-08 | Wikipedia, "Spin coating" | https://en.wikipedia.org/wiki/Spin_coating | — (전문) | **중심 적하 → 원심력 확산 → 가장자리로 흘러넘침 → 용제 증발 → 회전이 빠를수록 얇아짐**까지. 원문 「a small amount of coating material in liquid form is applied on the **center** of the substrate」 · 「rotated at speeds up to 10,000 rpm to spread the coating material by **centrifugal force**」 · 「the fluid **spins off the edges** of the substrate」 · 「to deposit layers of photoresist about **1 micrometre** thick」. **에지 비드는 「존재한다」까지만** — 「spin coating thicker films of polymers and photoresists can result in relatively large **edge beads**」. 🔴 **정정 2026-08-20 (V5 F6)** — 전문 grep: `cup` 실질 0회(유일 매치는 출판사명 "Cambridge University Press (CUP)") · `drain` 0 · `exhaust` 0 · `EBR` 0 · `nozzle` 0 · `spin dry` 0. **컵·배액·배기·EBR 노즐·스핀 드라이는 이 문서의 근거가 아니다** → T-B-41·T-B-42·T-B-43 으로 이관, 전용 스핀 드라이 모듈은 **삭제**(§8) |
| T-B-09 | EPFL CMI 공개 장비 안내(코터/디벨로퍼 트랙 모듈 구성) | https://www.epfl.ch/research/facilities/cmi/equipment/photolithography/tel-cleantrack-act-8/ | — (모듈 목록만) | 트랙 모듈의 **존재와 순서**(반입구·반송 로봇·HMDS 프라임·코터·소프트베이크·냉각·인터페이스·PEB·현상) · 코터 컵(`Cup WasH disc`)의 존재. 🔴 **정정 2026-08-20 (V5 F6·F9)** — ⓐ 목록에서 「스핀 드라이」를 뺐다(해당 모듈은 도해에서 삭제 · §8). ⓑ 이 페이지는 **라이선스 미표기가 아니라 「© 2025 EPFL, all rights reserved」를 명시**한다(§4). 처리 방침은 그대로 — **사실만 인용**하고 문장·도면 복제 없음, 제품명·모델명은 도해에 넣지 않음 |
| **T-B-25** | US 7,675,604 B2 「Hood for immersion lithography」, TSMC, 2010-03-09 | https://www.freepatentsonline.com/7675604.html | **FIG.1a·1b** 부호 **130**(유체 유지 모듈=이머전 후드) · **140**(제1 유체=액침수) · **180**(밀봉 개구) · **192/194/196**(모듈 상부/측부/하부) · **110**(기판 테이블) · **120**(결상 렌즈계) | 후드를 상부·측부·하부로 나눈 확대 인셋 구조 · 후드가 액을 가두는 개구를 갖는다는 점 |
| **T-B-26** | US 7,251,013 B2 「Lithographic apparatus and device manufacturing method」, ASML Netherlands B.V., 2007-07-31 | https://www.freepatentsonline.com/7251013.html | **FIG.1** 부호 **SO**(방사원) · **BD**(빔 전송계) · **IL**(조명계) · **AD**(조절기) · **IN**(적분기) · **CO**(콘덴서) · **MT**(마스크 테이블) · **MA**(마스크) · **PL**(투영계) · **WT**(기판 테이블) · **W**(기판). **FIG.5~7** 부호 **12**(액체 봉입 구조) · **16**(기체 실) · **21**(실 부재) · **24**(개구를 가진 분할판). 본문 「two (dual stage) or more substrate tables」 · 「a projection system (e.g. a **refractive projection lens system**) PL」 · 「The source and the lithographic apparatus may be **separate entities, for example when the source is an excimer laser**」 · 「from the source SO to the illuminator IL with the aid of a **beam delivery system BD** comprising, for example, suitable **directing mirrors** and/or a beam expander」 | 장치 전체 배치(광원→조명계→마스크 테이블→투영계→기판 테이블) · 후드 하단 **기체 실** · **기판 스테이지를 둘** 그린 근거 · 🆕 **광원이 본체와 분리된 별도 상자라는 배치와 그 사이를 잇는 빔 전송계·꺾임 미러(V5 F5 이관처)** · 🆕 **투영계가 단일 렌즈가 아니라 굴절 렌즈 「계(system)」라는 근거(V5 F4 이관처)** |
| **T-B-27** | US 7,256,864 B2 「Liquid immersion lithography system having a tilted showerhead relative to a substrate」, ASML, 2007-08-14 | https://www.freepatentsonline.com/7256864.html | **FIG.6~11** 부호 **602**(투영광학 최종 렌즈 요소) · **604**(샤워헤드=이머전 후드) · **610**(제1 노즐, 액 주입) · **612**(제2 노즐, 액 회수) · **830**(액침액) · **614**(기판 표면) · **W/WT** · **h/H**(영역별 갭). 치수(원문 그대로) — ⓐ "a gap between showerhead 604 and substrate W can be **about 100 microns** and each nozzle can be tilted **50 microns** in opposite directions, such that there is a 100 micron total tile" · ⓑ "a dimension of a gap between **last element 602** of projection optics PL and **surface 614** of substrate W can be approximately one millimeter or range **between about 0.5 millimeters and about 2 millimeters**". 🔴 **정정 2026-08-20 (V5 F7)** — 0.5~2 mm 는 **602–기판** 간격이지 「노즐 기울임 포함 전체」가 아니다. 노즐 기울임은 별개로 노즐당 50 µm 다 | 후드의 **급수 노즐과 회수 노즐이 마주 본다**는 구조 · 국소 갭의 위치와 치수 근거 · 최종 렌즈 요소 |
| **T-B-28** | US 4,131,363 「Pellicle cover for projection printing system」, IBM, 1978-12-26 | https://www.freepatentsonline.com/4131363.html | **FIG.2** 부호 **12**(마스크 패턴면) · **14**(커버 조립체) · **16**(스페이서 링) · **18**(펠리클 투명막) · **11**(패턴 마스크). 치수: 펠리클 두께 0.2~6 µm, 마스크면과 이격 1~125 mm | 펠리클을 **스페이서 프레임으로 띄워** 붙인 구조(밀착 아님) · 막 위 입자가 초점 밖으로 밀려나는 배치 |
| **T-B-34** | US 5,431,700 「Vertical multi-process bake/chill apparatus」, FSI International, 1995-07-11 | https://www.freepatentsonline.com/5431700.html | **FIG.3** 부호 **26**(베이크 플레이트) · **22**(배기 개구) · **42**(칠 플레이트) · **48**(칠 플레이트 지지 핀) · **60**(웨이퍼 수직 지지대). 조건: 베이크 70~200 °C, 웨이퍼–플레이트 간극 0.010 인치 미만(비접촉 근접 가열) | 트랙 인셋의 소프트베이크·PEB 모듈: **위가 열린 평판 + 배기 후드**, 웨이퍼가 지지대 위에 **떠 있는** 근접 가열 · 칠 플레이트의 **리프트 핀** |
| **T-B-35** | US 8,636,458 「Integrated post-exposure bake track」, ASML Netherlands B.V., 2014-01-28 | https://www.freepatentsonline.com/8636458.html | **FIG.1** 부호 **12**(노광 장비) · **14**(로컬 트랙부) · **16**(인터페이스 유닛) · **18**(원격 트랙부) · **20**(반송 용기/FOUP) · **21**(용기 핸들러). **FIG.3~4** 부호 **200**(PEB+칠 결합 유닛) · **210**(로봇) · **212**(칠 기능 그리퍼) · **214**(베이크부). **FIG.5~7** 부호 **314**(소크) · **316**(노광후 베이크) · **318**(출력 버퍼) | 트랙 인셋의 **모듈 순서**와 **노광기 인터페이스가 가운데** 있다는 배치 · 반입구의 FOUP 도킹 · 반송 로봇 · 트랙과 노광기가 **인라인**이라는 세로 점선 결속 |
| **T-B-36** | US 7,288,746 「Integrated thermal unit having laterally adjacent bake and chill plates on different planes」, Sokudo, 2007-10-30 | https://www.freepatentsonline.com/7288746.html | **FIG.1** 부호 **12**(베이크 스테이션) · **14**(칠 스테이션) · **16**(셔틀 스테이션) · **18**(셔틀). **FIG.4** 부호 **20**(베이크 플레이트) · **128**(베이크부 배기). **FIG.6~7** 부호 **30**(칠 플레이트) · **36~38**(리프트 핀) | 핫플레이트마다 **칠 플레이트가 짝으로** 붙는 배치 · 베이크부 배기 · 칠 플레이트 내부 항온 유로 |
| 🆕 **T-B-37** | US 7,929,116 B2 「Polarized radiation in lithographic apparatus and device manufacturing method」, ASML Netherlands B.V., 2011-04-19 등록(출원 12/010,819) | https://www.freepatentsonline.com/7929116.html | **FIG.1** 부호 **SO**(방사원)·**BD**(빔 전송계)·**IL**(조명계)·**AD**(조절기 — σ-outer/σ-inner)·**IN**(적분기)·**CO**(콘덴서)·**MA/MT**·**PS**(투영계)·**W/WT**. **FIG.12**(조명 모드 도판 — 도면 내 문자 라벨 `Conventional`/`Dipole`/`C-Quad`/`Quadrupole`/`Annular`/`non-sym`, 숫자 부호 없음) · **FIG.5**(다이폴 퓨필 이미지) | **조명 퓨필 형상 4종(꽉 찬 원·고리·다이폴·쿼드러폴)의 정본 근거.** 원문 「at least the outer and/or inner radial extent (commonly referred to as σ-outer and σ-inner, respectively) of the intensity distribution **in a pupil plane of the illuminator** can be adjusted」 · 「illumination modes include any of the following: **conventional, dipole, a-symmetric, quadrupole, hexa-pole … and annular**」 · 「FIG. 12 depicts different illumination modes … such as **conventional, dipole, quadrupole, annular** and non-symmetric」 |
| 🆕 **T-B-38** | US 6,452,662 B2 「Lithography apparatus」, ASML Netherlands B.V., 2002-09-17 등록(출원 09/287,014) | https://www.freepatentsonline.com/6452662.html | **FIG.3**(퓨필면 분포 A: 작은 원판 / B: 큰 원판 / C: **고리**) · **FIG.8**(악시콘·줌·피라미돈 → 퓨필 형상 열) · **FIG.22**(모드별 초점심도) · **FIG.23(a)/(b)**(온액시스 vs 오프액시스 회절차수와 퓨필). 부호 **18**(퓨필면) · **22a/22b**(악시콘 오목/볼록 쌍) · **24**(줌 렌즈) · **26**(석영봉 적분기) · **32**(플라이아이) · **38**(다극 생성 소자) · **50**(피라미드 프리즘) · **70**(투영 렌즈 퓨필) | **「꽉 찬 원 = conventional, 고리 = annular」라는 형상 진술**과 **「패턴의 방향성·피치에 따라 바꿔 쓴다」는 진술**의 근거. 원문 「One known illumination mode is **annular, in which the conventional zero order spot on the optical axis is changed to a ring-shaped intensity distribution**」 · 「for exposing **horizontal or vertical features, quadrupole illumination results in larger depths of focus than annular** … **for equivalent features oriented around 45° … inferior to annular**」 · 「the quadrupole parameters must, of course, be **selected according to the periodicity of the pattern** being imaged」 |
| 🆕 **T-B-39** | US 6,878,916 B2 「Method for focus detection … and an imaging system with a focus-detection system」, Carl Zeiss SMT AG, 2005-04-12 등록(출원 10/210,051) | https://www.freepatentsonline.com/6878916.html | **FIG.1·FIG.2** 부호 **20**(포커스 검출계 = "focus sensor") · **21**(광원) · **22**(입사 결합 광학) · **23**(측정빔) · **24**(출사 결합 광학) · **25**(검출부) · **5**(투영 렌즈) · **10**(웨이퍼) · **11**(기판 상면) · **12**(상면) · **16**(작동거리) · **17**(렌즈–웨이퍼 사이 공간) · **18**(출사면 테두리 반지름) · **α**(입사각 — **기판면 기준**) · **β**(한계각). 🆕 **FIG.4(제3 실시예)** 부호 **224**(입사·출사를 겸하는 결합 광학계) · **223**(측정빔) · **226**(보조 반사면을 이루는 프리즘) · **227**(오목 종단경) · **215**(투영 렌즈 205 의 평면 출사면) · **211**(기판 상면) · **228**(광축과 일치하는 웨이퍼 상 반사점) | **레벨링(오토포커스) 센서의 존재·두 헤드 구성·얕은(그레이징) 입사각의 정본 근거.** 원문 「an optical **input-coupling system for obliquely injecting at least one measuring beam** to be reflected at the substrate's upper surface into a slit-shaped intermediate expanse situated between a final optical surface of an imaging system and the substrate's upper surface **and an output-coupling system for detecting** the measuring beam following its reflection」 · 「Focus-detection systems, which are also termed '**focus sensors**,'」 · 「focus-detection systems that operate at **grazing incidence**」 · 「'Angle of incidence,' as used here, is defined as the angle **between the direction of incidence … and the substrate surface**」. 🆕 **편입 2026-08-21 (RV2-A §6-1 10번 · P-P) — 입·출 결합 광학을 한쪽에 모으는 실시예가 같은 특허 안에 있다.** FIG.4 원문 「Its focus-detection system includes an **optical system 224 that both couples the measuring beam 223 into the focus-detection system and couples it out** of the focus-detection system. A **prism 226** whose base surface is parallel to the image plane and serves as an **auxiliary reflecting surface** … is arranged on the side of the **input/output-coupling optics 224**, between the plane of the planar exit surface 215 of the projection lens 205 and the upper surface 211 of the substrate. **Following a total of two reflections** at the exit surface 215 and a single reflection in the vicinity of the upper surface 211 of the substrate, the light employed for measurement strikes a **concave end mirror 227**…」. 또 FIG.1·2 조차 **보조경 26** 을 「may be mechanically fastened either to a component, for example, the **output-coupling optics 24**, of the focus-detection system 20」 이라 하여 한쪽에 붙인다. 🔴 **호스트 2개 독립 재현** — ⓐ `patents.google.com/patent/US6878916B2/en`(본문 179,257 자 · `224` 8회 · `226` 6회 · `227` 3회) ⓑ `patentimages.storage.googleapis.com/06/a5/b0/2b9b030fdbf3da/US6878916.pdf` 원공보 PDF 를 `pdftotext -layout` 로 추출(74,353 B · 같은 문장 축자 일치. 2단 조판 OCR 이라 행이 엇갈리고 `S`/`s` 가 뒤바뀌어 일부 구절 grep 은 0회로 나온다 — **원문 대조는 사람이 눈으로 했다**) |
| 🆕 **T-B-40** | US 6,674,510 B1 「Off-axis levelling in lithographic projection apparatus」, ASML Netherlands B.V., 2004-01-06 등록(출원 09/519,875) | https://www.freepatentsonline.com/6674510.html | **FIG.14·14A~14G** 부호 **10**(레벨 센서) · **11**(빔 생성부) · **12**(검출부) · **b_LS**(측정빔) · **113**(투영 격자) · **126**(검출 격자) · **128**(검출기) · **α**(입사각 — **법선 기준**) | **얕은 입사각의 정량 근거만.** 원문 「The projection beam b_LS is incident on the wafer at a fairly **large angle, α, to the normal, e.g. in the range of from 60° to 80°**」. 🔴 **배치 근거로는 쓰지 않는다** — 이 특허의 레벨 센서 10 은 계측 프레임 MF 위의 **별도 계측 스테이션**에 있어 투영 렌즈 옆이 아니다(원문 「Level sensor 10 … is also mounted on the metrology frame MF」). 배치 근거는 T-B-39 다 |
| 🆕 **T-B-41** | US 5,952,050 「Chemical dispensing system for semiconductor wafer processing」, Micron Technology, Inc., 1999-09-14 등록 | https://www.freepatentsonline.com/5952050.html | **FIG.1**(부분 측면도) 부호 **10**(웨이퍼) · **12**(스핀 척) · **14**(축) · **15**(웨이퍼 **중심** 위의 도포액 적하 노즐) · **16**(웨이퍼 **가장자리** 위의 에지 비드 제거 용제 노즐) · **18**(진공 포트) · **22**(웨이퍼 가장자리) | **EBR 노즐이 중심 노즐과 별개로 웨이퍼 가장자리를 겨눈다**는 근거. 원문 「a first nozzle 15 for dispensing coating material onto wafer 10 is positioned above and, typically, at the **center** of wafer 10. A **second nozzle 16** for dispensing solvent to dissolve the **edge bead** is disposed above the **edge** of wafer 10」 |
| 🆕 **T-B-42** | US 5,861,061 「Spin coating bowl」, Micron Technology, Inc., 1999-01-19 등록 | https://www.freepatentsonline.com/5861061.html | **FIG.3**(공정 위치 단면) · **FIG.8**(보울에 붙은 배기 배액부) 부호 **12**(공정 보울=컵) · **14**(회전 척) · **16**(웨이퍼) · **18**(배기 배액계) · **30**(용제 적하 노즐) · **88**(보울 바닥 배액구) · **90**(배기 매니폴드) · **96**(배기관) · **98**(액 배출구) · **100**(배플) | **코터의 컵 + 배액 + 배기** 근거. 원문 「a **process bowl 12** through which a **rotatable chuck 14** is disposed to support a wafer 16 … The bowl 12 is attached to an **exhausted drain system 18**」 · 「a single **drain 88** in the bottom 20 of the bowl 12」 · 「the vapor exiting through **exhaust pipe 96** and the liquid exiting through **drain 98**」 |
| 🆕 **T-B-43** | US 6,843,259 B2 「Solution treatment unit」, Tokyo Electron Limited, 2005-01-18 등록 | https://www.freepatentsonline.com/6843259.html | **FIG.4**(현상 처리 유닛 종단면) · FIG.1(트랙 배치) 부호 **18**(현상 처리 유닛) · **60**(컵 수용부) · **62**(배액구) · **63**(스핀 척) · **66**(승강 핀) · **67**(컵) · **70**(경사판) · **72**(배기관) · **81**(현상액 공급 노즐) · **93**(세정액 공급 노즐) | **현상 모듈의 컵·배액·배기·회전 척·2노즐** 근거. **동시에 「현상 하류의 전용 스핀 드라이 모듈」을 반증하는 근거** — 원문은 린스와 건조를 **현상 유닛 안에서** 끝낸다: 「the **pure water** is spread over the entire surface of the wafer W, and the developing solution on the wafer W is cast off by centrifugal force」 · 「the rotation speed of the wafer W is increased, for example, to 4000 rpm. Thereby, the pure water on the wafer W is cast off, and **the wafer W is dried**」 |

## 4. 상업 사용 판정

| 자료군 | 라이선스 | 판정 |
|---|---|---|
| T-B-01 · 02 · 03 · 04 · 05 · 06 · 07 · 08 (Wikipedia) | CC BY-SA 4.0 | ✅ 상업 사용 가능. **텍스트 서술만 참조했고 위키미디어 도해·이미지를 복제하지 않았다** → 파생물 아님, SA 전파 대상 아님 |
| T-B-09 (EPFL CMI 공개 시설 페이지) | 🔴 **명시적 저작권 유보 — 페이지가 「© 2025 EPFL, all rights reserved」를 표기한다** | ⚠️ **사실만 인용**(어떤 모듈이 어떤 순서로 존재하는가). 문장·도면 복제 0건, 제품명·모델명 도해 미표기 → 저작물 이용 아님으로 판단. 대체 근거로 특허 T-B-34·35·36 을 병기했다. 🔴 **정정 2026-08-20 (V5 F9)** — 종전 「라이선스 미표기」는 **사실과 다르다.** 처리 방침이 그대로 유효하므로 **판정은 바뀌지 않는다** |
| T-B-25 · 26 · 27 · 28 · 34 · 35 · 36 · **37 · 38 · 39 · 40** (미국 특허 공개 공보) | 미국 특허 문헌(공개 공보). 신규 4건 전문에 저작권 표시(copyright notice) grep **0건** | ✅ **도면을 복제하지 않고** 「어떤 부품이 어떤 부호로 표시되어 있는가」라는 구조 사실만 옮겨 직접 제작. 출원인·상표·모델명은 도해에 표기하지 않음 |
| 🚫 배제 | CC BY-NC / CC BY-ND / 유료 스톡 / 블로그 재게시 이미지 | **0건** |

**최종 판정: 상업 사용 가능.** 제3자 도면 복제 0건, **CC BY-NC / CC BY-ND / 라이선스 미확인 채택 0건**(2026-08-20 정정 회차에서도 유지).

## 5. 라벨 대응표 (`labels[]` 21개 ↔ 근거)

| id | 한글 부위명 | anchor | side | 근거(T번호 + FIG번호 + 부호) |
|---|---|---|---|---|
| `excimer-laser` | 엑시머 레이저(ArF Laser) | [534, 84] | left | T-B-07(**파장 193 nm ArF · 펄스광까지만**) · **T-B-26 FIG.1 부호 SO**(방사원. 「The source and the lithographic apparatus may be separate entities, for example when the source is an excimer laser」 → **본체 밖 별도 상자라는 배치 근거**) · **T-B-37 FIG.1 부호 SO** |
| `beam-delivery` | 빔 전송 광로(Beam Line) | [722, 146] | left | **T-B-26 FIG.1 부호 BD**(빔 전송계. 「from the source SO to the illuminator IL with the aid of a beam delivery system BD comprising, for example, suitable **directing mirrors** and/or a beam expander」) · **T-B-37 FIG.1 부호 BD**. 🔴 **미러가 광로를 꺾는다는 것까지가 근거**이고 **개수·꺾임 위치는 미확인**이라 미러 2개로 최소 표기(§8) |
| `illuminator` | 조명계(Illuminator) | [768, 238] | right | T-B-03(서브어셈블리 목록의 "illumination system") · **T-B-26 FIG.1 부호 IL·AD·IN·CO** · **T-B-37 FIG.1 부호 IL·AD·IN·CO**(퓨필면과 σ-outer/σ-inner 조절) · **T-B-38 부호 18**(퓨필면). 🔴 **anchor 정정 2026-08-20 (V5 F11)** — [800, 200] 은 외함 내부의 **빈 공간**을 짚었다. 외함 좌벽(x 762~774) 위인 **[768, 238]** 로 옮겼다 |
| `exposure-slit` | 노광 슬릿(Slit) | [890, 311] | right | **T-B-03**(35×25 mm 필드에 9×25 mm 슬릿 → 도해 개구 40 : 필드 160 = 1/4) · T-B-01(슬릿 긴 변 = 필드 높이) |
| `reticle-stage` | 레티클 스테이지(Stage) | [996, 346] | right | T-B-03(서브어셈블리 목록의 "reticle stage") · **T-B-26 FIG.1 부호 MT**(마스크 테이블) · **T-B-37 FIG.1 부호 MT**. 🔴 **anchor 정정 2026-08-20 (V5 F11)** — [1020, 330] 은 블록(x 980~1060 · y 330~380) **상단 경계선 위**였다. V5 권고안 [1020, 355] 은 `reticle` 리더선과 **실교차 1건**을 만들어(`_labels_check.py` 검출) 채택하지 못했고, 블록 내부에서 교차 0 이면서 네 변에서 가장 먼 **[996, 346]**(모든 변에서 16 이상)으로 확정했다 |
| `reticle` | 레티클(Reticle) | [940, 370] | right | T-B-03(6인치각·유효 104×132 mm) · T-B-04(크롬 흡수막 격자) · **T-B-26 FIG.1 부호 MA**(패터닝 디바이스) |
| `pellicle` | 펠리클(Pellicle) | [975, 385] | right | T-B-04 · **T-B-28 FIG.2 부호 18**(펠리클 막)·**16**(스페이서 링)·**14**(커버 조립체)·**12**(마스크 패턴면) |
| `projection-lens` | 투영 렌즈(Projection) | [966, 462] | right | **T-B-26 FIG.1 부호 PL**(투영계. 「a projection system (e.g. a **refractive projection lens system**) PL」 → 단일 렌즈가 아니라 **굴절 렌즈 「계(system)」**) · **T-B-37 FIG.1 부호 PS**. 🔴 **정정 2026-08-20 (V5 F4)** — T-B-03 인용을 삭제했다(원문에 `barrel`·"multiple lens elements" 0회). 🔴 **「배럴」·「소자 매수」는 어느 출처에도 없다**(§8) |
| `leveling-sensor` | 레벨링 센서(Leveling) | [1044, 517] | right | **T-B-39 FIG.1·2 부호 20**(포커스 검출계 = "focus sensors")·**21**(광원)·**22**(입사 결합 광학)·**23**(측정빔)·**24**(출사 결합 광학)·**25**(검출부)·**11**(기판 상면) — **송신 헤드 + 수신 헤드 두 개가 렌즈–웨이퍼 사이 공간으로 빔을 비스듬히 보내고 받는다**는 구조 · **T-B-40**(각도 정량만). 🔴 **정정 2026-08-20 (V5 F2)** — T-B-03 인용 삭제(원문에 `leveling`·`autofocus`·`focus sensor` 0회). 🔴 **정정 2026-08-21 (RV2-A §6-1 10번 · P-P) — 종전의 「출처는 두 헤드가 투영 렌즈를 사이에 두고 마주 보는 구성이다」는 사실 전제가 틀렸다.** 그것은 **FIG.1·2 만 본 결과**이며, **같은 특허 FIG.4(제3 실시예)** 는 입·출 결합 광학을 **하나로 모은 광학계 224** + 프리즘 **226** + 오목 종단경 **227** 로 **한쪽에 모으는 구성**을 명시한다(§3 T-B-39 행에 축자 인용). 따라서 도해가 두 헤드를 배럴 **오른쪽에 나란히** 둔 것은 **출처에 실재하는 배치 유형**이며 「지면 폭 때문에 어쩔 수 없이 어긴 것」이 아니다. 다만 **특정 설계를 주장하지는 않는다.** 🔴 **입사각은 별개 문제다** — 도해 실측 **법선 기준 41.82°**(면 기준 48.18°)는 인용한 T-B-40 의 60~80°(법선 기준) 밖이며 **더 세워져 있다**. `notes.af-angle` 에 수치로 고지했다(§9). 헤드 하면의 투명 요소는 부호 22·24 의 「coupling optics」에 대응하며 **「창(window)」이라는 별도 부품을 주장하지 않는다** |
| `final-lens` | 최종 렌즈(Final Lens) | [890, 552] | right | T-B-01 · **T-B-27 FIG.6 부호 602**(투영광학 최종 렌즈 요소) |
| `immersion-hood` | 이머전 후드(Hood) | [948, 553] | right | **T-B-27 FIG.6~11 부호 604**(샤워헤드=후드)·**610**(제1 노즐, 주입)·**612**(제2 노즐, 회수) · **T-B-26 FIG.5~7 부호 12**(액체 봉입 구조)·**16**(기체 실)·**21**(실 부재)·**24**(분할판) · **T-B-25 FIG.1a/1b 부호 130**·**192/194/196**(상/측/하부)·**180**(밀봉 개구) |
| `water-gap` | 초순수 갭(Water Gap) | [890, 570] | right | T-B-01(국소 갭, 수조 아님) · **T-B-27 FIG.8~11 부호 830**(액침액)·**602**(최종 렌즈 요소)·**604**(샤워헤드)·**614**(기판 표면)·**h/H**(영역별 갭) · **T-B-25 FIG.1a 부호 140**(제1 유체). 🔴 **수치 귀속 정정 2026-08-20 (V5 F7)** — **604 하면–기판 약 100 µm** / **602 하면–기판 약 0.5~2 mm** 는 **서로 다른 두 부위**의 간격이다. 노즐 기울임(노즐당 50 µm)은 별개 수치다 |
| `second-stage` | 제2 스테이지(Stage) | [588, 638] | left | **T-B-26 FIG.1 부호 WT** + 명세서 「two (dual stage) or more substrate tables」. 🔴 **역할 분담은 미확인**이라 캡션 없음(§6 `dual-stage-role`) |
| `wafer-stage` | 웨이퍼 스테이지(Stage) | [1000, 638] | right | T-B-02 · **T-B-03**(레티클과 **반대 방향** 동기 주사 — 원문 「moving the reticle stage and wafer stage in **opposite directions**」 · 「Successful scanning requires extremely precise **synchronization** between the moving reticle and wafer stages」. 🔴 **정정 2026-08-21 (P-P)** — 종전 괄호 「반대 방향 **4:1 동기 주사**」에서 **속도비 4:1 을 뺐다.** 원문에 속도비 기재가 없다(`speed`·`velocity` 각 0회). 축소비 4× 에서 **유도**한 값이며 `notes.scan-ratio` 본문에 그렇게 명시했다 — §6-1 17번 ㉯) · **T-B-26 FIG.1 부호 WT** · **T-B-27 FIG.6 부호 WT** |
| `track-interface` | 노광기 인터페이스(I/F) | [837, 742] | right | T-B-09 · **T-B-35 FIG.1 부호 16**(인터페이스 유닛)·**12**(노광 장비)·**14**(로컬 트랙부)·**18**(원격 트랙부) |
| `hmds-prime` | 밀착 촉진 모듈(HMDS) | [549, 734] | left | T-B-02 · T-B-09(밀폐된 별도 모듈에서 **증기** 처리, 스핀 도포가 아님) |
| `spin-coater` | 스핀 코터(Coater) | [621, 764] | left | T-B-08(**중심 적하 + 원심력 확산 + 에지 비드의 존재까지만**) · **T-B-42 FIG.3·8 부호 12**(컵=보울)·**14**(회전 척)·**18**(배기 배액계)·**88·98**(배액)·**90·96**(배기) · **T-B-41 FIG.1 부호 15**(중심 적하 노즐)·**16**(가장자리를 겨눈 EBR 용제 노즐)·**12**(스핀 척)·**22**(웨이퍼 가장자리) · T-B-09(모듈의 존재). 🔴 **정정 2026-08-20 (V5 F6)** — 종전 T-B-08 단독 귀속은 성립하지 않는다(§3) |
| `soft-bake` | 소프트베이크(Soft Bake) | [693, 778] | left | T-B-02(90~100 °C, 30~60초) · T-B-09 · **T-B-34 FIG.3 부호 26**(베이크 플레이트)·**22**(배기 개구)·**60**(웨이퍼 지지대) · **T-B-36 FIG.4 부호 20**·**128**(배기) |
| `chill-plate` | 냉각 플레이트(Chill) | [765, 782] | left | T-B-09(핫플레이트마다 짝) · **T-B-34 FIG.3 부호 42**(칠 플레이트)·**48**(지지 핀) · **T-B-36 FIG.1·6~7 부호 30**(칠 플레이트)·**36~38**(리프트 핀) |
| `peb-plate` | 노광후 베이크(PEB) | [909, 772] | right | T-B-02(CAR 에서 PEB 시점·온도가 결정적, 정재파 저감) · **T-B-35 FIG.5~7 부호 316**(노광후 베이크 유닛)·**314**(소크)·**318**(출력 버퍼) · **FIG.3~4 부호 200**(PEB+칠 결합)·**214**(베이크부)·**212**(칠 그리퍼) |
| `developer` | 현상 모듈(Developer) | [1053, 752] | right | T-B-02 · T-B-09(모듈의 존재) · **T-B-43 FIG.4 부호 18**(현상 처리 유닛)·**67**(컵)·**63**(스핀 척)·**62**(배액구)·**72**(배기관)·**81**(현상액 노즐)·**93**(세정액 노즐) — **담금조가 아니라 컵 안 회전 척 + 2노즐**이며 **린스와 스핀 건조까지 이 유닛 안에서 끝난다** |

## 6. `notes[]` 대응표 (20개 · 래스터에서 뺀 문자)

| id | tone | 내용 요지 | 근거 |
|---|---|---|---|
| `inset-immersion-title` | info | 좌측 인셋은 이머전 후드와 국소 갭의 확대다 | 조사 §C-11·12 · T-B-27 |
| `inset-track-title` | info | 하단 인셋은 트랙 모듈 열이며 가운데 인터페이스가 노광 전/후를 가른다 | 조사 §2-§B · T-B-35 FIG.1 |
| `scan-ratio` | info | 레티클·웨이퍼가 **반대 방향**으로 동기 주사(도해 화살표 280 : 70). 🔴 **속도비 4 : 1 은 「유도」임을 본문에 명시**(2026-08-21) | **T-B-03**(「moving the reticle stage and wafer stage in **opposite directions** to each other during the exposure」 = **반대 방향** · 「**4x reduction** on a scanner」 = **축소비**) · T-B-02 · 조사 §F-2. 🔴 **정정 2026-08-21 (P-P 자체 발견 · T-B-03 전수 재검)** — 종전 문구는 **「축소비와 같은 4 : 1 속도비」를 원문 진술처럼** 적었으나, T-B-03 은 「반대 방향」과 「4배 축소」를 **각각** 적을 뿐 **속도비를 적지 않는다**(전문 grep `speed` **0회** · `velocity` **0회**). 공동 인용 T-B-02 에도 없다(`speed` 0회 · `4:1` 1회는 **레지스트 종횡비** 문맥). ⇒ **㉢오독이 아니라 「유도」로 §6-1 17번 ㉯ 에 등재**하고, `labels.json` ko·en 본문에 **「원문 기재값(축소비 4×)에서 유도한 값이며 원문에 속도비로 적혀 있지 않다」**를 명시했다. 🔴 **서식은 `packaging/hole-chamfer-ratio` 문형을 재사용**했다(*「원문 기재값에서 유도한 범위이며 원문에 비로 적혀 있지 않다」*). **도형·화살표 길이비 280 : 70 은 무변경** |
| `demag-ratio` | info | 4 : 1 축소비 — 비교 막대 160 : 40, 격자 피치 20 → 5 | T-B-03(축소비 4:1) · 조사 §F-5 |
| `slit-not-stepper` | info | 슬릿이 필드를 훑는다. 전 필드 일괄 조명은 스텝퍼다 | T-B-03(9×25 mm 슬릿 / 35×25 mm 필드) · 조사 §F-1 |
| `immersion-not-bath` | warn | 이머전은 수조가 아니다. 국소 갭 + 후드 급수·회수 + 기체 실 | T-B-01 · T-B-27 부호 604/610/612 · T-B-26 부호 16 · 조사 §F-3 |
| `gap-dimension` | info | **후드(샤워헤드 604) 하면–기판 약 100 µm** · **최종 렌즈 요소(602) 하면–기판 약 0.5~2 mm**(서로 다른 두 부위) · 노즐 기울임은 별개로 노즐당 50 µm | **T-B-27 FIG.6~11 부호 602·604·614 · h/H**. 🔴 정정 2026-08-20 (V5 F7) |
| `na-water` | info | 물 n≈1.44 로 NA>1. 개선폭 약 30~40%, NA 1.35/193 nm → 36 nm | T-B-01 · T-B-03 · T-B-06 |
| `rayleigh` | info | CD = k1·λ/NA, DOF = k2·λ/NA². k1 = 0.61(고전) / ≈0.4(양산) | T-B-02 · T-B-03 |
| `pupil-mode` | warn | 퓨필을 애뉼러 1종만 그렸다. 꽉 찬 원·다이폴·쿼드러폴도 패턴 방향성·피치에 따라 쓰인다 | **T-B-37 FIG.12**(네 모드 도판 + 본문 열거) · **T-B-38 FIG.3·8**(형상)·**FIG.22·23**(방향성·피치 의존). 🔴 정정 2026-08-20 (V5 F1) — 종전 근거 T-B-05 는 네 단어가 **0회**여서 삭제 |
| `reticle-grating` | info | 레티클은 로고가 아니라 크롬 미세 선/공간 격자다 | T-B-04 · 조사 §F-8 |
| `pellicle-standoff` | info | 펠리클은 밀착이 아니라 스페이서로 띄운다 — 띄우는 것이 목적 | T-B-04 · T-B-28 부호 16·18 · 조사 §F-4 |
| `dual-stage-role` | warn | 스테이지가 둘이라는 것까지만. **역할 분담은 미확인** | T-B-26(「two (dual stage) or more substrate tables」) · 조사 §5-2 1번 |
| `refractive-only` | warn | **굴절 소자만** 그렸다. 반사경 혼합 구성은 미확인 | 조사 §5-2 3번 · **T-B-26 부호 PL**(「a projection system (e.g. a **refractive projection lens system**) PL」). 🔴 **정정 2026-08-21 (P-P 자체 발견 · V5 F4 의 잔여 전파)** — 종전 근거 **T-B-03 은 이 서술을 뒷받침하지 않는다**: 전문 grep `mirror` **0회** · `reflect` **0회** · `catadioptric` **0회** · `refract` 2회는 **둘 다 물의 굴절률**(refractive index) 문맥이다. F4 가 §5 라벨행·§7 을 T-B-26 으로 이관할 때 **이 notes 행만 남았다.** 🔴 **동시에 `labels.json` 의 note 본문도 정정했다** — ko/en 이 「**여러 장의 광학 요소가 든 긴 배럴**이라는 것까지가 확인된 범위」라고 적어 §7 의 「**「배럴」·「소자 매수」는 어느 출처에도 없다**」와 **정면으로 어긋나 있었다.** 「굴절 렌즈 계(system)」까지로 고쳤다 |
| `meniscus-unconfirmed` | warn | 결함 이름(워터마크·기포)만 확정. **스캔 속도–메니스커스 붕괴 관계는 미확인** | 조사 §5-2 2번 · T-B-01 |
| `af-angle` | warn | 레벨링 센서 입사각을 지면 폭 때문에 세워 그렸다. 실제는 **그레이징(스치는) 입사** — 법선 기준 60~80°, 곧 웨이퍼 면 기준 약 10~30°. 🆕 **도해 실측각 법선 기준 41.8°(면 기준 48.2°)를 문구에 명기**(2026-08-21) | **T-B-39**(「grazing incidence」 · 입사각을 **기판면 기준**으로 정의) · **T-B-40**(「a fairly large angle, α, to the **normal**, e.g. in the range of from 60° to 80°」). 🔴 정정 2026-08-20 (V5 F2) — 종전 근거 T-B-03 은 해당 서술이 **0회**여서 삭제. 🔴 두 출처의 **각도 기준 방향이 반대**이므로 문구에 기준을 명시했다. 🔴 **정정 2026-08-21 (RV2-A · P-P)** — 종전 문구는 「지면 폭 때문에 세워 그렸다」고만 하고 **몇 도인지 적지 않아** 도해가 인용 범위 **밖**이라는 사실을 감췄다. **`40-flow` 광선 좌표에서 직접 재계산**: 입사 `M976 532 → L1010 570` = Δ(34, 38) · 반사 `M1010 570 → L1044 532` = Δ(34, −38) → `atan(34/38)` = **41.8202°**(법선 기준) = **48.1798°**(면 기준). RV2-A 실측 41.8° 와 일치한다. 60° 미만이므로 **그레이징이 아니라 더 세워진 쪽**이다. 좌우 배치 고지도 함께 정정했다(§5 · §8) |
| `exaggeration` | warn | 과장 목록 — 배럴 길이 / 감광막 두께 / 물 갭 두께 | 제작지침 §4(과장 허용 + 실제 비 병기) · 조사 §C-9·12 · T-B-08 |
| `puddle-term` | warn | 「퍼들(고인 막)」이라는 **용어 자체가 미확인** → 노즐 도포 + 린스까지만 | 조사 §5-2 8번 |
| `static-image` | warn | 정지 구조도. 광로의 색·폭은 값이 아니다 | 규격개정 §1(색으로 정보를 굽지 않는다) |
| `inline-track` | info | 트랙과 노광기는 인라인. 베이크마다 칠이 짝을 이룬다 | T-B-35 FIG.1 부호 12·14·16·18 · T-B-36 FIG.1 부호 12·14·16·18 · 조사 §2-§F 6·9번 |

## 7. 라벨이 붙지 않았지만 그린 부재 (전부 근거 있음)

| 부재 | 근거 |
|---|---|
| 항온 밀폐 챔버 벽(절단면 해칭) | **T-B-03** 원문 「The components of the stepper are contained in a **sealed chamber that is maintained at a precise temperature**」 — 정상 근거 |
| 챔버를 받치는 바닥 구조(`10-frame` `path M440 668 H1160 V692 H440 Z`) | 🔴 **정정 2026-08-20 (V5 F3)** — 종전 표기 「제진 프레임」의 근거가 **없다.** T-B-03 전문 grep: `vibration` 0회 · `granite` 0회 · `isolation` 0회 · `damper` 0회. **도형은 유지하되 「챔버를 받치는 바닥 구조」로만 서술하고 제진(진동 절연) 기능은 주장하지 않는다.** 도해·`labels.json` 어디에도 이 부재의 라벨·캡션이 없으므로 학습자에게 노출되는 문구는 없다 |
| 빔 전송 광로의 관통 포트 · 꺾임 미러 2개 | **T-B-26 부호 BD** 원문 「a **beam delivery system BD** comprising, for example, suitable **directing mirrors** and/or a beam expander」. 🔴 **정정 2026-08-20 (V5 F5)** — T-B-07 인용 삭제(배치 서술 없음). **관통 포트의 위치와 미러 개수는 여전히 미확인**이라 최소 표기 |
| 조명 퓨필(애뉼러 고리) | **T-B-37 FIG.12**(`Annular` 포함 네 모드 도판) · **T-B-38 FIG.3 C·FIG.8**(퓨필면 18 의 고리 분포). 🔴 **정정 2026-08-20 (V5 F1)** — 종전 근거 T-B-05 는 `annular` 0회여서 삭제했다 |
| 콘덴서 렌즈 2매 | **T-B-26·T-B-37 FIG.1 부호 CO**(콘덴서)·**IN**(적분기). 🔴 **매수는 어느 출처에도 없다** — 「조명계 안에 콘덴서가 있다」의 최소 표기이며 특정 설계가 아니다 |
| 레티클 스테이지 블록 위의 수평 구조(`20-internal` `rect 700,322 170×8` · `rect 910,322 170×8`) | 🔴 **정정 2026-08-21 (RV2-A 신규 A13 · P-P)** — 종전 표기 「**레티클 스테이지 정밀 가이드 레일**」과 근거 「T-B-03(정밀 가이드가 달린 금속 프레임)」은 **원문에 없다.** T-B-03 전문(23,793 B) 재현 grep — `guide` **0회** · `rail` **0회** · `frame` **0회**. 유일한 `precision` 1회는 제조사 목록의 "Nikon, **Precision** division" 이다(호스트 2개 독립 재현: `en.wikipedia.org` 위키텍스트 원문 · `api.wikimedia.org` core API — 두 본문 23,793 B 바이트 동일). 대체 출처도 없다 — **T-B-26 전문 grep 도 `guide` 0회 · `rail` 0회**. **§8-2 오염원 전파** — 이 행은 V5 가 같은 출처 T-B-03 에서 4건(배럴·레벨링·제진·척)을 걷어낼 때 함께 걷히지 않고 남은 다섯 번째다. **처리: §7 「제진 프레임」(V5 F3)의 선례를 따라 도형은 유지하고 기능 주장만 철회한다.** 이 두 막대는 **레티클 스테이지 블록 위에 놓인 수평 구조**일 뿐이며 「가이드」·「레일」·「베어링」 등 특정 안내 부재를 주장하지 않는다. 스테이지가 주사 중 움직인다는 사실 자체는 **T-B-26 부호 MT·PM** 원문 「movement of the mask table MT may be realized with the aid of a **long-stroke module (coarse positioning) and a short-stroke module (fine positioning)**, which form part of the first positioner PM」 에 있으나, **그것은 위치결정기(모듈)이지 안내 레일이 아니므로 이 도형의 근거로 쓰지 않는다.** 도해·`labels.json` 어디에도 이 부재의 라벨·캡션이 없으므로 학습자에게 노출되는 문구는 없다. 🔴 광로를 막지 않도록 슬릿 개구를 비켜 두 토막으로 그렸다 |
| 레티클 크롬 격자(피치 20 · 8개) / 웨이퍼 상 격자(피치 5 · 8개) | T-B-04(선/공간 격자) + T-B-03(4:1) — **같은 8개 형상이 1/4로 줄어드는 것이 4:1의 시각 증거** |
| 투영 렌즈 굴절 소자 5매 | **T-B-26 부호 PL** 원문 「a projection system (e.g. a **refractive projection lens system**) PL」 — 단일 렌즈가 아니라 **굴절 렌즈 「계(system)」**라는 데까지가 근거. 🔴 **정정 2026-08-20 (V5 F4)** — T-B-03 인용 삭제(`barrel`·"multiple lens elements" 0회). 🔴 **매수 5는 「여러 장」의 최소 표현일 뿐 특정 설계가 아니다** |
| 정렬 마크·정렬 센서(입사·반사 광선) | 🔴 **미해소 — 다음 라운드 최우선 (등재 2026-08-21 · §6-1 17번 ㉰ · DSN 팀장 판정)** ⓐ **서식 오류 정정** — 종전 표기 「T-B-03 §C-17」의 `§C-17` 은 **T-B-03(위키 문서)의 절 번호가 아니라 조사 대장 B 의 절 번호**다. 올바른 표기는 **T-B-03 · 조사 대장 B §C-17** 이다. ⓑ 🔴 **㉠무출처 — T-B-03 이 뒷받침하는 것은 「존재」까지다.** 원문에 있는 것은 「each shot is aligned using special **alignment marks** that are located in the pattern for each final IC chip」 와 서브어셈블리 목록의 「wafer **alignment system** … reticle **alignment system**」 뿐이고, **도해가 그린 입사·반사 광선 2개**(`40-flow` `path M748 532 L806 570` · `M806 570 L772 532`)와 **광학 헤드가 비스듬히 읽는다는 배치**의 근거는 **없다**(전문 grep `reflect` **0회** · `mirror` **0회**). **§6-1 10번 레벨링 센서와 정확히 같은 유형의 결함**이다. ⓒ **처리: 등재만 하고 도형은 건드리지 않는다** — 출처 확보(1단계)를 시도할 시간이 이 라운드에 없고, 도형 제거는 재검수를 처음부터 다시 요구한다. 🔴 **이 행은 「해소」가 아니다.** 다음 라운드에서 정렬계 특허로 1단계를 시도해야 한다 |
| 웨이퍼 척(세라믹 평판) | **T-B-25 FIG.1a 부호 110**(기판 테이블) · **T-B-26·T-B-27 부호 WT**(기판 테이블). 🔴 **정정 2026-08-20 (P3c 자체 발견)** — T-B-03 인용 삭제(전문에 `chuck` **0회**). 근거는 **「기판을 얹는 테이블이 있다」까지**이며 세라믹이라는 재질은 주장하지 않는다(재질은 도해의 `pt-insul` 해칭 표현일 뿐) |
| 감광막(웨이퍼 위 얇은 층) | T-B-08 · 조사 §F-9 |
| 후드 내부 급수·회수 유로와 기체 실 표시 | **T-B-27 부호 610·612** · **T-B-26 부호 16**(기체 실)·**21**(실 부재) |
| 트랙 반입구 FOUP 도킹 · 반송 로봇(포크형 팔) · 반송 레일 | **T-B-35 FIG.1 부호 20·21**, **FIG.3~4 부호 210·212** · T-B-09 |
| 트랙 공정 순서 화살표(좌→우) | T-B-35(반송 용기 → 인터페이스 → 노광 → 로컬 트랙 → 출력 버퍼) · 조사 §2-§B |
| 스핀 코터 EBR 노즐(`50-highlight` `rect 632,750 4×10`) | **T-B-41 FIG.1 부호 16**(중심 노즐 15 와 별개로 웨이퍼 가장자리를 겨눈 EBR 용제 노즐). 🔴 **합성 고지** — 「컵 **안쪽**의 EBR 노즐」은 T-B-41(가장자리 노즐)과 T-B-42(척을 두르는 보울)를 **합성**한 것이다. T-B-41 FIG.1 자체에는 컵이 그려져 있지 않다 |
| 스핀 코터 컵 · 컵 배액구 | **T-B-42 FIG.3·8 부호 12**(보울)·**18**(배기 배액계)·**88·98**(배액)·**90·96**(배기) · T-B-09(컵의 존재). 🔴 **정정 2026-08-20 (V5 F6)** — 종전 T-B-08 귀속 삭제 |
| 현상 모듈 컵 · 배액구 · 2노즐 | **T-B-43 FIG.4 부호 67**(컵)·**62**(배액구)·**72**(배기관)·**81·93**(노즐 2개) |
| 최종 렌즈 지름 / 후드 외경 치수 막대(인셋) | 조사 §C-11(후드 바깥 지름 ≈ 최종 렌즈 지름의 약 2배) |

## 8. 🔴 그리지 않은 것 (조사 미확인 · 조사 §5-2)

| 항목 | 처리 |
|---|---|
| 듀얼 스테이지의 **역할 분담**(한쪽 노광 / 다른 쪽 계측) | 스테이지를 둘 그리는 데서 멈췄다. 역할을 나타내는 도형·기호 없음 (`notes.dual-stage-role`) |
| 투영 렌즈의 **반사경(반사굴절 구성)** | 굴절 소자만 그렸다 (`notes.refractive-only`) |
| **스캔 속도–메니스커스 붕괴 관계** | 임계 속도·붕괴 형상 모두 미도시 (`notes.meniscus-unconfirmed`) |
| 「**퍼들 현상**」이라는 용어 | 현상 모듈을 노즐 + 고인 액층 + 린스까지만 그림 (`notes.puddle-term`) |
| 빔 전송 광로의 **미러 개수·정확한 꺾임 위치** | 「미확인(일반 구성)」 → 미러 2개로 최소 표기, 개수를 주장하지 않음 |
| 투영 렌즈 **소자 매수·설계** | 「여러 장」임을 보이는 5매. 특정 설계 아님 |
| ~~레벨링 센서 **두 헤드의 좌우 배치**~~ → **해소** | 🔴 **정정 2026-08-21 (RV2-A §6-1 10번 · P-P).** 이 행의 전제 「출처는 두 헤드가 투영 렌즈를 사이에 두고 마주 본다」가 **틀렸다** — **FIG.1·2 만 본 결과**였다. 같은 특허 **T-B-39 FIG.4** 가 입·출 결합 광학을 **한쪽에 모은 광학계 224** + 프리즘 **226** + 오목 종단경 **227** 로 명시한다(§3 축자 인용). **배럴 오른쪽에 나란히 둔 도해 배치는 출처에 실재하는 구성이므로 「미확인」이 아니다.** 다만 특정 설계를 주장하지 않는다는 고지는 유지한다 |
| 🆕 레벨링 센서 **도해 입사각이 인용 범위 밖** | 🔴 **신규 고지 2026-08-21.** 도해 실측 **법선 기준 41.82°**(면 기준 48.18°) — 인용한 **T-B-40 의 60~80°(법선 기준)** 밖이며 **더 세워진** 쪽이다. **기하는 바꾸지 않고** 수치를 `notes.af-angle` 과 §9 과장표에 명기했다. 🔴 **기하 변경 여부는 팀장 판정 대기** — 바꾸려면 `leveling-sensor` anchor `[1044, 517]` 와 `notes.af-angle` anchor `[1010, 570]` 두 점을 옮겨야 하고, 그것은 불변식 위반이다(§4 규칙) |
| 레벨링 센서 헤드의 「창(window)」 | 부호 22·24 는 「coupling optics」이지 창이 아니다. 도해의 투명 요소는 그 광학면의 표현이며 **별도 부품을 주장하지 않는다** |
| 현상 하류의 **전용 스핀 드라이 모듈** | 🔴 **삭제 2026-08-20 (V5 F6 · 2단계).** 「현상 다음에 독립 스핀 드라이 스테이션을 둔다」는 배치를 허용 출처 어디에서도 확인하지 못했고, **T-B-43 은 오히려 린스와 스핀 건조가 현상 유닛(부호 18) 안에서 끝난다**고 적어 반증한다. 도형(모듈 상자·컵·웨이퍼·물방울 4개·회전 화살표)과 마지막 공정 순서 화살표를 지우고, 반송 레일(우단 1150 → 1090)과 트랙 인셋 프레임(1160 → 1090)을 남은 모듈 열에 맞춰 줄였다. **트랙 모듈 10 → 9개.** 라벨은 이 모듈에 붙어 있지 않았으므로 `labels[]` 21개 그대로 |
| 상표·제조사 모델명·로고 | 0건 |

## 9. 과장한 치수와 실제 비

| 부위 | 조사상의 실제 비 | 도해에서 쓴 비 | 과장 배율 | 병기 |
|---|---|---|---|---|
| 투영 렌즈 배럴 길이 : 웨이퍼 지름 | 약 **2 : 1** | 136 : 260 ≈ **0.52 : 1** | 축소 약 3.8배 | `notes.exaggeration` |
| 감광막 두께 : 웨이퍼 두께 | 「선처럼 얇다」(약 1 µm 대 수백 µm) | 3 : 18 ≈ **1/6** | 크게 과장 | `notes.exaggeration` |
| 초순수 갭 두께 : 웨이퍼 두께 | 조사 §C-12 「1/5 이하」 | 4 : 18 ≈ **1/4.5** | 약간 과장 | `notes.exaggeration` · 확대 인셋 + 갭 치수 화살표 |
| 노광 슬릿 폭 : 필드 길이 | **1/4** (9 mm : 35 mm ≈ 1/3.9) | 40 : 160 = **1/4** | 과장 없음 | — |
| 후드 외경 : 최종 렌즈 지름 | 약 **2 : 1**(조사 §C-11) | 본체 152 : 80 = **1.90 : 1** · **인셋 176 : 88 = 2.00 : 1** | 과장 없음 | 인셋 치수 막대 2단(위 막대 `x546~634` = 88 · 아래 막대 `x502~678` = 176). 🔴 **정정 2026-08-20 (V5 F8)** — 정정 전 인셋은 후드 블록 폭 66 이어서 외경 220 : 88 = **2.50 : 1**, 근거가 말하는 2 : 1 을 **25 % 틀리게** 보여주고 있었다. 후드 블록 폭을 **66 → 44**(좌 502~546 · 우 634~678)로 줄이고 노즐·기체 실·치수 막대 `x1/x2` 를 함께 갱신했다 |
| 펠리클 이격 : 레티클 두께 | 약 **1/2** | 10 : 20 = **1/2** | 과장 없음 | — |
| 🆕 **레벨링 센서 입사각(법선 기준)** | 인용 T-B-40 **60~80°**(= 면 기준 10~30°, 그레이징) | `40-flow` 광선 Δ(34, 38) → **41.82°**(= 면 기준 48.18°) | **눕히지 않고 세웠다** — 인용 범위 **밖**이며 반대쪽이다 | `notes.af-angle` 에 수치 명기(2026-08-21 · Z-2-2). 🔴 **기하 변경 여부는 팀장 판정 대기** |
| 레티클 격자 피치 : 웨이퍼 상 피치 | **4 : 1** | 20 : 5 = **4 : 1** | 과장 없음 | 4:1 비교 막대 160 : 40 |

## 10. 구도·규격 준수 확인 (정정문 §3 · §6)

| # | 규칙 | 결과 |
|---|---|---|
| 1 | 안전 여백 x∈[24,1576] · y∈[24,876] | ✅ **2026-08-20 정정 후 재측정** bbox **x[439,1160] · y[39,862]** (변동 없음) |
| 2 | 빈 사분면 금지 | ✅ **재측정** 비배경 픽셀 **TL 73,740 · TR 52,315 · BL 73,566 · BR 78,983** (정정 전 78,976 / 51,251 / 73,228 / 84,123 — 인셋 후드 축소와 스핀 드라이 삭제분) |
| 3 | 본체 가로 45% 이상 | ✅ **재측정** 439~1160 = **722 px = 45.1%** (항온 챔버가 우단을 정하므로 F6 삭제의 영향 없음) |
| 4 | 주 처리면 y∈[520,620] | ✅ 웨이퍼 감광막 상면 **y = 572**, 실리콘 575~593 |
| 5 | 라벨 구역(좌 40~420 / 우 1180~1560) 비움 | ✅ 도형 최좌단 439 · 최우단 1160 — 두 구역에 도형 0건 |
| 6 | 인셋은 라벨 구역 밖(x 440~1160)에 · 글자 없이 도형만 | ✅ 이머전 인셋 x456~708 · 트랙 인셋 **x440~1090**(F6 삭제 반영) · `<text>` 0개 |
| 7 | `40-flow` 정지 표현만 | ✅ 광로는 단일 불투명도 fill(그라디언트·세기 표현 없음), 애니메이션 0건 |
| 8 | 그라디언트를 stroke 에 쓰지 않음 | ✅ `stroke="url(#…)"` 0건 — 광로는 `path` fill |
| 9 | 리더선 교차 | 🔴 **2026-08-21 갱신 (P-P)** — 정본은 `_figure_check.py` **C7** 이며 **0건**이다. `_labels_check.py` 는 같은 자산에 「실교차 1건 → reticle-stage×reticle」을 찍지만 **위양성**이다(꺾임점 모델이 다르다 · Z-2-4 사). 종전 기재: ✅ **2026-08-20 `_labels_check.py` 재실행 0건.** anchor 2건을 옮긴 뒤(F11) 재검증했고, V5 권고 좌표 [1020,355] 가 만든 교차 1건은 채택하지 않고 [996,346] 으로 해소했다 |
| 10 | 색 토큰 | ✅ `var(--xs-*)` 만 사용. hex 직접 기입은 폴백뿐이고 **폴백값은 `_labels_check.py` 색 토큰 대조를 통과**한다(`--xs-resist` 폴백 `#f0abfc` 정본 일치 확인 — `xs_etch.svg` 의 `#f472b6` 오기와 달리 이 파일은 처음부터 정본이었다). 재료색으로 쓴 상태색 0건 |

## 11. 제작자 / 검수자

| 항목 | 값 |
|---|---|
| 제작자 | **P3b** (디자인팀 제작 하위 에이전트 · 공정 03 포토 담당 · 세션 한도로 중단된 P3 인계) |
| 정정 담당 | **P3c** (디자인팀 정정 하위 에이전트 · 독립 검수 V5 반려분 처리 · 2026-08-20) |
| 제작일 | 2026-08-20 |
| 검수자 | **(검수 대기)** — 별도 검수조가 채운다. 🔴 제작자와 같으면 CI 실패 |
| 검수일 | **(검수 대기)** |

## 12. 🔴 정정 이력 — 독립 검수 V5 반려분 (2026-08-20 · P3c)

V5 는 **주 기하는 건전**하다고 실증했다(3대 오답 전건 회피 · 라벨 21개 anchor 전건 정타 · 리더선 교차 0). 결함은 **근거 귀속·문구·인셋 치수**에 있었고, 아래와 같이 처리했다.

| # | 결함 | 처리 | 결과 |
|---|---|---|---|
| **F1** | 조명 퓨필 「애뉼러 고리」의 근거 T-B-05 에 `annular`·`dipole`·`quadrupole` 0회 | **1단계 — 출처 확보.** T-B-37(US 7,929,116 FIG.12) · T-B-38(US 6,452,662 FIG.3·8·22·23) 신규 편입 | **도형 유지.** `notes.pupil-mode` 문구 유지, 근거만 이관 |
| **F2** | 라벨 9 `leveling-sensor` 의 근거 T-B-03 에 `leveling`·`autofocus`·`focus sensor` 0회 | **1단계 — 출처 확보.** T-B-39(US 6,878,916 FIG.1·2) 배치 · T-B-40(US 6,674,510 FIG.14B) 각도 정량 | **도형·라벨 유지.** `notes.af-angle` 에 정량치(법선 기준 60~80° = 면 기준 약 10~30°)와 좌우 배치 고지 추가 |
| **F3** | 「제진 프레임」의 근거 없음 | **서술 철회.** 도형 유지, 「챔버를 받치는 바닥 구조」로만 서술 | 학습자 노출 문구 0(라벨·캡션 없음) |
| **F4** | 「투영 렌즈 여러 장이 든 긴 배럴」이 T-B-03 에 없음 | **귀속 이관** → T-B-26 부호 `PL`(「refractive projection lens system」) | 도형 유지 |
| **F5** | 「별도 상자 + 빔 전송 광로」가 T-B-07 에 없음 | **귀속 이관** → T-B-26 부호 `SO`·`BD`. T-B-07 은 193 nm·펄스로 한정 | 도형 유지 |
| **F6** | 컵·배액·배기·EBR·스핀 드라이가 T-B-08 에 0회 | **EBR·컵·배액·배기 = 1단계(출처 확보)** T-B-41·42·43 / **전용 스핀 드라이 모듈 = 2단계(삭제)** | 트랙 모듈 **10 → 9개** |
| **F7** | 0.5~2 mm 를 「노즐 기울임 포함 전체」로 오귀속 | **수치 정정.** 604 하면–기판 약 100 µm / **602 하면–기판 약 0.5~2 mm** / 노즐 기울임 별개 50 µm | `labels.json` ko·en 양쪽 정정 |
| **F8** | 인셋 후드 외경 비 2.50:1 (근거는 2:1) | **인셋 후드 블록 폭 66 → 44**, 노즐·기체 실·치수 막대 동반 갱신 | **176:88 = 2.00:1** |
| **F9** | EPFL 페이지를 「라이선스 미표기」로 기재 | **「명시적 저작권 유보(© 2025 EPFL, all rights reserved)」로 정정** | 처리 방침 유효 → **판정 불변** |
| **F11** | anchor 경미 2건 | `illuminator` [800,200] → **[768,238]** · `reticle-stage` [1020,330] → **[996,346]** | SVG `90-anchor` · `labels.json` · §5 세 곳 동시 갱신 |
| 🆕 | (P3c 자체 발견) 「웨이퍼 척」이 T-B-03 에 0회 | **귀속 이관** → T-B-25 부호 110 · T-B-26/27 부호 WT | §7 정정 |

🚫 **CC BY-NC / CC BY-ND / 라이선스 미확인 채택 0건** — 신규 7건(T-B-37~43)은 전부 미국 특허 공보이며 저작권 표시 grep 0건.

🔴 **클린룸(E-001 · D-026):** 이 정정 회차에서도 `kimgwinil/*` 저장소·페이지, `kimgwinil.github.io/*`, `~/AGENT/`(`semiconductor-8-process-simulator` 포함), `archive/2026/교재구독-001/` 을 **열람·검색 0건**. 접근한 외부 도메인은 `en.wikipedia.org` · `www.freepatentsonline.com` · `patentimages.storage.googleapis.com` 뿐이다.

**정정 후 게이트 5종 전건 통과** — `_render.py photo`(58,118 B / q=92) · `_labels_check.py photo`(✅ labels=21 notes=20) · `_sync_prov.py photo --write`(✅ 일치 · 21건 대조) · `_selftest_tools.py`(픽스처 29건 · ✅27 · 🔴0 · ⏭2) · `check-assets.mjs`(✅ 통과).

---

## A. 🔴 anchor 대응표 — `notes[]` 20건 (2026-08-21 신설 · P-P)

> **왜 신설했나.** 재검수 **RV2-A** 가 적발했다 — `photo` 는 `python3 이미지/_sync_prov.py` 에서 **41건 중 21건만 대조**되고 **20건이 조용히 빠진 채** 결과가 찍히고 있었다.
> 빠진 20건은 전부 `notes[]` 의 anchor 다. `metal`·`oxidation`·`packaging` 은 §A 에 `notes` 를 넣었는데 `photo` 는 **라벨만** 넣었기 때문이다.
> `labels[]` 21건은 **§5 라벨 대응표**가 이미 덮으므로 중복 계상하지 않는다. **§5(21) + §A(20) = 41/41** 이 되어야 `_sync_prov.py` 가 종료코드 0 을 낸다.
>
> 🔴 **좌표를 베껴 넣은 표가 아니다.** 20건 전부를 마스터 SVG `이미지/단면도해/src/xs_photo.svg` 와 대조해 **그 좌표가 실제로 어떤 도형을 짚는지** 마지막 열에 적었다.
> 🔴 **`notes[]` 에는 `90-anchor` 대응 도형이 없다.** 마스터 SVG 의 `90-anchor` 레이어에는 **`labels[]` 21건의 `circle` 만** 있다(`a-excimer-laser` … `a-developer`).
> 따라서 `notes[]` anchor 의 정본은 **`labels.json` 뿐**이며, 이 표는 그것을 SVG 도형과 대조한 결과다. 라벨과 달리 3자 대조(SVG↔JSON↔문서)가 아니라 **2자 대조**라는 점을 밝혀 둔다 — 팀장 판정 필요(§A-1 ③).

| id | 내용 요지 | anchor | 종류 | 🔴 SVG 대조 — 이 좌표가 실제로 짚는 도형 |
|---|---|---|---|---|
| `inset-immersion-title` | 고지 · 인셋 제목 — 좌측 인셋은 이머전 후드와 국소 갭의 확대다 | [470, 208] | 고지(패널 제목) | 이머전 인셋 프레임 `rect 456,196 252×280` **내부 좌상단**(프레임에서 x+14 · y+12). 특정 부재가 아니라 **패널 자체**를 짚는다 → 배치 자유도 있음 |
| `inset-track-title` | 고지 · 인셋 제목 — 하단 인셋은 트랙 모듈 열이며 가운데 인터페이스가 노광 전/후를 가른다 | [452, 714] | 고지(패널 제목) | 트랙 인셋 프레임 `rect 440,704 650×158` **내부 좌상단**(x+12 · y+10). **패널 자체**를 짚는다 → 배치 자유도 있음 |
| `scan-ratio` | 고지 — 레티클·웨이퍼 반대 방향 4 : 1 동기 주사 | [890, 352] | 고지(부재 지시) | `40-flow` 레티클 스캔 화살표 `path M768 352 H1048` **위의 점**(y 일치 · x 중앙 908 에서 18 px). ✅ 정타 |
| `demag-ratio` | 고지 — 4 : 1 축소비 비교 막대(160 : 40) | [540, 522] | 고지(부재 지시) | `50-highlight` 4:1 비교 막대 조합 — 위 막대 `y=508 x460~620` · 아래 막대 `y=536 x460~500` · 연결 점선 `M620 508 L500 536` 의 **가운데**(두 막대의 세로 중점 y=522). ⚠️ **어느 획 위도 아니다** — y=522 에서 점선은 x=560 을 지나므로 20 px 떨어져 있다. 20건 중 유일하게 획에 얹히지 않은 앵커다(§A-1 참조) |
| `slit-not-stepper` | 고지 — 슬릿이 필드를 훑는다. 전 필드 일괄 조명은 스텝퍼다 | [890, 311] | 고지(부재 지시) | 노광 슬릿 **개구 정중앙** — 좌 차광판 `762~870` · 우 `910~1018`, 둘 다 `y300~322`. 개구 x870~910 · y300~322 의 중심이 정확히 (890, 311). ✅ 정타. 라벨 `exposure-slit` 과 같은 점 |
| `immersion-not-bath` | 고지 — 이머전은 수조가 아니다. 국소 갭 + 후드 급수·회수 + 기체 실 | [890, 570] | 고지(부재 지시) | 국소 초순수 갭 `path M846 568 … L930 572 … Z`(x846~934 · y568~572) **내부 중앙**. ✅ 정타. 라벨 `water-gap` 과 같은 점 |
| `gap-dimension` | 고지 — 후드 하면–기판 약 100 µm / 최종 렌즈 요소 하면–기판 약 0.5~2 mm | [586, 372] | 고지(부재 지시) | 인셋 국소 초순수 `path M546 344 H634 V392 …`(x546~634 · y344~404) **내부**. 갭 치수 화살표(`line x=474 y344~398`)가 재는 **대상 그 자체**를 짚는다. ✅ 정타 |
| `na-water` | 고지 — 물 n≈1.44 로 NA>1 | [890, 556] | 고지(부재 지시) | 최종 렌즈 요소 `path M850 542 Q890 528 930 542 L930 568 L850 568 Z` **내부**(x=890 에서 상단 곡선 y=535, 하면 y=568 → 556 은 안쪽). ✅ 정타 |
| `rayleigh` | 고지 — CD = k1·λ/NA, DOF = k2·λ/NA² | [966, 462] | 고지(부재 지시) | 투영 렌즈 배럴 **셸 벽 안**. 외곽 `M762 398 L1018 398 L930 534 L850 534 Z` · 내곽 `M782 406 L998 406 L922 526 L858 526`. y=462 에서 외곽 우변 x=976.6 · 내곽 우변 x=962.5 → 966 은 그 사이. ✅ 정타. 라벨 `projection-lens` 와 같은 점 |
| `pupil-mode` | 고지 — 퓨필을 애뉼러 1종만 그렸다 | [890, 214] | 고지(부재 지시) | 퓨필 `circle cx=890 cy=214 r=40` **정중심**. ✅ 정타 |
| `reticle-grating` | 고지 — 레티클은 로고가 아니라 크롬 미세 선/공간 격자다 | [890, 377] | 고지(부재 지시) | 레티클 판 `rect 800,360 180×20` 안, **크롬 격자 막대 `rect 890,374 8×6` 위**(격자 8개 중 6번째). ✅ 정타 — 주장 대상인 격자를 직접 짚는다 |
| `pellicle-standoff` | 고지 — 펠리클은 밀착이 아니라 스페이서로 띄운다 | [975, 385] | 고지(부재 지시) | 펠리클 **우측 스페이서 프레임 `rect 968,380 12×10` 정중앙**(막 자체는 `line y=390 x812~968`). ✅ 정타 — 「띄우는 것」의 주체인 스페이서를 짚는다. 라벨 `pellicle` 과 같은 점 |
| `dual-stage-role` | 고지 — 스테이지가 둘이라는 것까지만. 역할 분담은 미확인 | [588, 638] | 고지(부재 지시) | 제2 기판 스테이지 `path M458 621 H718 V656 H458 Z` **내부 중앙**(가로 중심 588 정확 일치). ✅ 정타. 라벨 `second-stage` 와 같은 점 |
| `refractive-only` | 고지 — 굴절 소자만 그렸다. 반사경 혼합 구성은 미확인 | [890, 470] | 고지(부재 지시) | 배럴 내부 **굴절 소자 3번째 `path M827 474 Q890 486 953 474 Q890 462 827 474 Z`** 내부(x=890 에서 y462~486). ✅ 정타 — 주장 대상인 굴절 소자를 직접 짚는다 |
| `meniscus-unconfirmed` | 고지 — 결함 이름만 확정. 스캔 속도–메니스커스 붕괴 관계는 미확인 | [934, 570] | 고지(부재 지시) | 물 갭의 **우측 메니스커스 끝점**(`… Q930 570 934 568 Z` 의 934). ✅ 정타 — 메니스커스가 그려진 바로 그 지점 |
| `af-angle` | 고지 — 레벨링 센서 입사각. 도해 실측 법선 기준 41.8° | [1010, 570] | 고지(부재 지시) | 레벨링 광선의 **웨이퍼 면 반사점** — `path M976 532 L1010 570` 과 `M1010 570 L1044 532` 의 **공통 꼭짓점**. ✅ 정타. 🔴 이 두 획이 실측각 41.82° 의 산출 근거다 |
| `exaggeration` | 고지 — 과장 목록(배럴 길이 / 감광막 두께 / 물 갭 두께) | [890, 536] | 고지(부재 지시) | 최종 렌즈 요소 상단 곡선 `Q890 528` 바로 안쪽(x=890 에서 곡선 y=535 → 536 은 **1 px 안쪽**). ⚠️ 여유가 1 px 뿐이라 획 두께에 걸치는 셈이며, 20건 중 두 번째로 약하다. 다만 과장 3종(배럴·감광막·물 갭)이 만나는 자리라 의미는 맞다 |
| `puddle-term` | 고지 — 「퍼들(고인 막)」이라는 용어 자체가 미확인 | [1053, 752] | 고지(부재 지시) | 현상 모듈 **컵 안쪽 공간** — 컵 `M1028 744 V790 H1078 V744`, 노즐 2개 `rect 1042,734 5×14` · `rect 1058,734 5×14`(하단 y=748), 현상액층 `rect 1036,760 34×6`. (1053, 752) 는 **두 노즐 바로 아래·액층 바로 위**, 곧 「노즐 도포까지만 그렸다」가 가리키는 바로 그 자리. ✅ 의미 정타(획 위는 아님). 라벨 `developer` 와 같은 점 |
| `static-image` | 고지 — 정지 구조도. 광로의 색·폭은 값이 아니다 | [890, 424] | 고지(부재 지시) | 주 광로 `path M870 300 L870 390 L800 424 L885 568 L895 568 L980 424 L910 390 L910 300 Z` **내부**(y=424 는 좌우 꼭짓점 800·980 의 높이, 중심 x=890). ✅ 정타 — 주장 대상인 광로 자체를 짚는다 |
| `inline-track` | 고지 — 트랙과 노광기는 인라인. 베이크마다 칠이 짝을 이룬다 | [837, 712] | 고지(부재 지시) | 인라인 결속 점선 `path M837 726 V698` **위의 점**(x 일치 · y 구간 698~726 안). ✅ 정타 |

### A-1. 🔴 이 대조에서 나온 것 (고치지 않고 보고만 한다)

| # | 내용 |
|---|---|
| ① | **`demag-ratio` [540, 522] 는 어느 획 위도 아니다.** 4:1 비교 막대 두 개의 세로 중점이지만, 그 사이를 잇는 점선은 y=522 에서 x=560 을 지나므로 **20 px 떨어져 있다.** 「비교 막대 조합 전체」를 짚는 의도로 보이며 인셋 프레임 밖으로 나가지도 않는다. **의도인지 오차인지는 제작 근거가 남아 있지 않아 판정하지 못했다** — 옮기지 않았다 |
| ② | **`exaggeration` [890, 536] 은 최종 렌즈 요소 상단 곡선에서 1 px 안쪽**이다. 획 두께(stroke 2)를 감안하면 사실상 경계 위다. 부재 안쪽인 것은 맞으므로 위반으로 보지 않았고 옮기지 않았다 |
| ③ | **`notes[]` 는 `90-anchor` 레이어에 대응 도형이 없다.** 라벨은 SVG·JSON·문서 3자가 맞물리지만 notes 는 2자뿐이다. `90-anchor` 에 `n-*` 원을 20개 추가하면 3자 대조가 되지만 **SVG 도형 20개 신설은 설계 변경**이라 혼자 정하지 않는다 — 팀장 판정 대기 |
| ④ | 나머지 **18건은 전부 도형 위에 정타**다. 특히 `reticle-grating`(크롬 격자 막대) · `pellicle-standoff`(스페이서 프레임) · `refractive-only`(굴절 소자 3번째) · `af-angle`(광선 반사점) · `meniscus-unconfirmed`(메니스커스 끝점) 은 **주장 대상 부재를 직접** 짚는다 |

---
---

## Z-2. 🔴 2026-08-21 세션 5 변경 이력 — RV2-A 반려 처리 (제작 하위 에이전트 **P-P**)

> 재검수 **RV2-A** 가 `photo` 를 반려했다. 사유 5가지 — 신규 A13 1건(가이드 레일) · 배지 2쌍 · 라벨 겹침 11.3 px · notes 20건 3자 대조 불가 · §6-1 10번 처리 불충분.

### Z-2-1. A13(근거)

| # | 결함 | 처리 | 파급 범위(실제로 센 곳) |
|---|---|---|---|
| **①** | **신규 A13 ㉡오귀속** — 「레티클 스테이지 **정밀 가이드 레일**」의 근거 T-B-03 에 `guide`·`rail`·`frame` **각 0회** | **기능 주장 철회 · 도형 유지**(V5 F3 「제진 프레임」 선례) | **3곳** — 이 문서 §7 · `이미지/_조사/B_포토_식각.md` §C 6번 「그리는 법」열 · `xs_photo.svg` 주석. `labels.json` 에는 **0곳**(라벨·캡션 없음) |
| **②** | (P-P 자체 발견) `notes.refractive-only` 의 근거 T-B-03 에 `mirror`·`reflect`·`catadioptric` **각 0회** — **V5 F4 의 잔여 전파** | **T-B-26 부호 PL 로 이관** | 이 문서 §6 · `labels.json` note 본문 ko/en |
| **③** | (P-P 자체 발견) `labels.json` 의 `refractive-only` 본문이 「**여러 장의 광학 요소가 든 긴 배럴**이라는 것까지가 확인된 범위」라고 적어 §7 의 「**「배럴」·「소자 매수」는 어느 출처에도 없다**」와 **정면으로 어긋나 있었다** | 「굴절 렌즈 계(system)」로 정정 | `labels.json` ko·en |
| **④** | (P-P 자체 발견) **「반대 방향 4 : 1 속도비」가 원문 진술이 아니다** — T-B-03 은 「opposite directions」와 「4x reduction」을 **각각** 적을 뿐 속도비를 적지 않는다(`speed`·`velocity` 각 0회). T-B-02 에도 없다 | 🟢 **주장 약화 정정(팀장 판정 2026-08-21)** — **㉢오독이 아니라 「유도」**로 §6-1 **17번 ㉯** 등재. `packaging/hole-chamfer-ratio` 문형 재사용. **도형·화살표 280 : 70 무변경** | 이 문서 §5 `wafer-stage` · §6 `scan-ratio` · `labels.json` ko·en |
| **⑤** | (P-P 자체 발견) **§7 「정렬 마크·정렬 센서(입사·반사 광선)」** — ⓐ 근거 표기 「T-B-03 §C-17」 **서식 오류**(T-B-03 에 그런 절 번호가 없다) ⓑ **㉠무출처** — 마크·정렬계의 **존재**까지만 근거이고 **그려진 광선 2개**의 근거는 없다(`reflect`·`mirror` 각 0회) | 🔴 **미해소 — 등재만 하고 도형은 건드리지 않는다**(팀장 판정). §6-1 **17번 ㉰** 「㉠무출처 · 다음 라운드 최우선」. 서식 오류만 정정 | 이 문서 §7 · 원장 §6-1 |

🔴 **T-B-03 전수 재검(§8-2 오염원 전파 대책).** V5 는 같은 출처에서 4건을 걷어내면서 가이드 레일만 남겼다. 세 번째 반복을 막기 위해 **T-B-03 에 기대는 모든 기재를 전수로 훑었다.**

- **검사 대상 33건** — 이 문서 16건(§3 서지행 · §5 라벨 5행 · §6 notes 6행 · §7 4행) + 조사 대장 B **17건**. 정정 이력 문장(T-B-03 을 「삭제했다」고 적은 곳) 8건과 서지 목록 2건은 대상에서 제외했다.
- **결과: 근거 확인 27건 · 오귀속 확정 2건(위 ①②) · 🔴 판정 보류 4건**(아래 Z-2-4).
- **원문 재현 방법** — 호스트 2개 독립: `en.wikipedia.org/w/index.php?title=Stepper&action=raw` 와 `api.wikimedia.org/core/v1/wikipedia/en/page/Stepper`. **두 본문 23,793 B 바이트 동일.** grep 결과 — `guide` 0 · `rail` 0 · `frame` 0 · `vibration` 0 · `granite` 0 · `damper` 0 · `bearing` 0 · `mirror` 0 · `reflect` 0 · `catadioptric` 0 · `speed` 0 · `velocity` 0 · `0.61` 0 · `depth of focus` 0 · `1.35` 0 / `precision` **1**(제조사 목록 "Nikon, **Precision** division") · `4x reduction` 1 · `step-and-scan` 8 · `sealed chamber` 1 · `opposite direction` 1 · `1.44` 1 · `k_1` 5.
- 대체 출처도 확인했다 — **T-B-26**(US 7,251,013) 전문 96,949 자 grep 도 `guide` **0회** · `rail` **0회**. 있는 것은 「movement of the **mask table MT** … **long-stroke module** (coarse positioning) and a **short-stroke module** (fine positioning) … **first positioner PM**」 인데 이는 **위치결정기이지 안내 레일이 아니다.**

### Z-2-2. §6-1 10번 — 레벨링 센서 (원장의 사실 전제가 틀렸다)

- **ⓐ 조사 대장 B §C 18번에 `T-B-39` FIG.4(제3 실시예) 편입.** 부호 **224**(입·출 겸용 결합 광학계) · **223** · **226**(보조 반사 프리즘) · **227**(오목 종단경) · **215** · **211** · **228**. 원문을 직접 열어 축자 인용으로 확인했다(§3 T-B-39 행). ⇒ **「출처는 두 헤드가 투영 렌즈를 사이에 두고 마주 본다」는 원장의 단정은 FIG.1·2 만 본 결과이며 사실이 아니다.** 도해의 「배럴 오른쪽에 나란히」 배치는 출처에 실재하는 구성이다.
- **ⓑ `notes.af-angle` 에 도해 실측각 명기.** 🔴 **RV2-A 의 41.8° 를 받아 적지 않고 좌표에서 다시 계산했다** — `40-flow` 입사 `M976 532 → L1010 570` = Δ(34, 38), 반사 `M1010 570 → L1044 532` = Δ(34, −38) → `atan(34/38)` = **41.8202°**(법선 기준) = **48.1798°**(면 기준). RV2-A 값과 일치. 인용 T-B-40 의 60~80°(법선 기준) **밖이며 더 세워진** 쪽이다.
- **ⓒ 기하 변경 판정 — 「바꾸지 않는다」. 다만 팀장 판정을 요청한다.** 근거: ⑴ 60°(법선)로 눕히려면 같은 낙차 38 px 에서 수평 주행이 34 → **65.8 px** 로 늘어 수신 헤드가 `1090~1126` 으로 이동하고, 그러면 라벨 `leveling-sensor` anchor `[1044, 517]` 와 `notes.af-angle` anchor `[1010, 570]` **두 점을 옮겨야 한다** — 불변식 위반이다. ⑵ 송신 헤드를 대신 왼쪽으로 옮기면 투영 렌즈 배럴(y 502~532 에서 우변 x 950.7 → 931.3)과 겹친다. ⑶ 이 프로젝트는 **§9 「과장한 치수와 실제 비」** 로 「기하는 두고 수치를 병기한다」를 이미 규칙으로 쓰고 있으므로 같은 처리를 적용했다(§9 에 행 추가).

### Z-2-3. 기하 — 행 배치와 배지 자리

🔴 **팀장 발주문의 배지 좌표 지시가 틀렸고 정정본으로 작업했다.** 발주문은 「`notes[].anchor` 를 조정하라」였으나 **배지는 `leaderEnd` 에 그려진다.** 검사기 출력과 대조해 확인했다 — `inset-track-title ↔ inline-track` 검사기 **16.12**: anchor 기준 385.01(불일치) / leaderEnd 기준 **16.12(일치)**. `scan-ratio ↔ illuminator` 검사기 **2.68**: anchor 기준 146.29 / leaderEnd 기준 **2.68**. ⇒ **`anchor` 는 라벨·고지 41건 전부 한 점도 옮기지 않았고, `leaderEnd.x` 도 전건 불변이다. 움직인 것은 `leaderEnd.y` 뿐이다.**

| 대상 | 값 | 근거 |
|---|---|---|
| 우 라벨 14행 | `49 + 63k` (49 · 112 · 175 · 238 · 301 · 364 · 427 · 490 · 553 · 616 · 679 · 742 · 805 · 868) | **63 px** = 2행 라벨 **후광 포함 실측 높이 62.30 px 를 넘는 최소 정수**. `eds` 좌열에서 P-GEO 가 쓴 64 px 와 **같은 근거**이며, `photo` 는 우열이 14행이라 64 를 쓰면 프레임 여유가 1 px 대로 떨어져 63 을 골랐다. 시작 49 도 임의값이 아니라 **C6 위반 0 을 만드는 해 중 프레임 여유가 최대인 값**(상 12.55 / 하 6.15 px) |
| 좌 라벨 7행 | 56 · 140 · 560 · 628 · **696** · 760 · **824** | 두 개만 움직였다(`spin-coater` 704→696 · `chill-plate` 820→824). 아래 세 피치가 **68 / 64 / 64** 로 전부 62.30 초과. 696 을 692 로 두면 인셋 제목 배지 `inset-track-title`(452, 714)이 `spin-coater` 리더선에 **16.07 px** 로 걸려 못 쓴다 |
| 우 배지열 11개 (x=1120 불변) | 82 · 162 · 242 · 294 · 374 · 446 · 526 · 578 · 630 · 710 · 790 | 피치열 **80 · 80 · 52 · 80 · 72 · 80 · 52 · 52 · 80 · 80** — 쓴 값은 **52 · 72 · 80 세 개뿐이고 셋 다 이 도해에 이미 있던 배지 피치**다(정정 전 우열이 52·70·72, 좌열이 80). **균일 피치로는 풀리지 않는다** — 44~86 전수 탐색 결과 **어떤 균일값도 위반 0 을 못 만들고** 최선(80)조차 배지가 리더선 위 **1.36 px** 에 얹힌다. 기존 피치 집합 {52,68,70,72,80} 조합 DP 로 **위반 0** 을 얻었다 |
| 좌 배지열 7개 (x=460 불변) | `168 + 80k` (168 … 648) | **80** = 이 도해 좌 배지열의 기존 피치 그대로. 시작 168 은 **위반 0 구간에서 최소 여유가 최대(7.23 px)가 되는 값** |

🔴🔴 **다음에 이 파일을 여는 사람에게 — 우 라벨 피치 63 을 64 로 「통일」하지 마라. (DSN 팀장 확정 2026-08-21)**

> 다른 공정(`eds` · `packaging`)은 **64 px** 를 쓴다. 값이 다르다고 임의 상수가 아니다 — **둘 다 「2행 라벨 후광 포함 실측 높이 62.30 px 를 넘는 최소 정수」라는 같은 근거에서 나왔고, 공정별 행 수가 달라 결과가 갈린 것**이다.
>
> `photo` 는 **우열이 14행으로 8공정 중 가장 길다.** 가용 ly 창은 `[36.45, 874.15]` = **837.70 px** 뿐이다.
>
> | 피치 | 13칸 span | 프레임 여유(상 / 하) | 판정 |
> |---|---|---|---|
> | **63** ← **채택** | 819 | **12.55 / 6.15 px** | ✅ 후광 겹침 0 · 여유 확보 |
> | 64 | 832 | **1 px 대** | 🔴 폰트가 조금만 바뀌어도 **C2(프레임 이탈)** |
>
> 🔴 **이 자산은 폰트 변경에 8공정 중 가장 민감하다.** 렌더러 폰트 스택이 바뀌면 **`photo` 를 가장 먼저 재측정하라.**
> 🔴 상자는 `leaderEnd.y` 를 중심으로 **대칭이 아니다** — **위 33.45 px / 아래 22.85 px**(합 56.30). 이 비대칭을 모르면 위쪽 여유를 3 px 넘게 과대평가한다. **실제로 이번 세션에서 그 착각으로 C2 회귀를 한 번 만들었다**(Z-2-4 가).

🔴 **`_figure_check.py` 전·후 (등급 분리 · `--ignore-renderer-drift` · 팀장 §21-6 근거)**

| 항목 | 착수 | 종료 |
|---|---|---|
| C1 이미지 침범 | 0 | **0** |
| C2 프레임 이탈 | 0 | **0** |
| **C3 잉크급**(글리프 bbox 교차) | **10** (최악 `pellicle↔reticle` 70.08 × **11.30 px**) | **0** |
| C3 후광급(stroke 6 px 만) | 4 | **0** |
| **C4 배지 충돌** | **2쌍**(최악 16.12 < 34 → 겹침 17.88) | **0** |
| C5 배지↔텍스트 | 0 | **0** |
| **C6 배지↔리더선** | **8쌍**(최악 2.68 < 17) | **0** |
| C7 리더선 실교차 | 0 | **0** |
| **합계(언어·상태 전개)** | **44건** | **0건** |

🔴 **`sameSpot` 유지** — 인셋 제목 배지 `inset-immersion-title`(470,208) · `inset-track-title`(452,714) 는 `anchor == leaderEnd` 라 점선 리더가 없다. **둘 다 손대지 않았으므로 없던 점선이 새로 생기지 않는다.** C4 2쌍은 상대편(비-sameSpot 배지)만 옮겨 해소했다.

### Z-2-4. 🔴 못 한 것 · 판정 보류 — 고치지 않고 남긴다

| # | 내용 |
|---|---|
| **가** | 🔴 **작업 도중 C2 회귀를 1건 만들었다가 고쳤다(자진 신고).** 중간 안(우 라벨 `34 + 64k`)에서 `illuminator` 가 **프레임 상단을 2.45 px 넘었다.** 원인은 **내 상자 모형이 틀렸던 것** — 라벨 텍스트 상자가 `leaderEnd.y` 를 중심으로 **대칭이라고 가정**했으나, 검사기 실측을 역산하니 **위 33.45 px / 아래 22.85 px 로 비대칭**이다(합 56.30 은 맞다). 모형을 고쳐 가용 ly 창을 `[36.45, 874.15]` 로 다시 잡고 피치 63 · 시작 49 로 재배치해 **C2 0** 을 확인했다. **최종 산출물에는 남아 있지 않다** |
| **나** | **우 라벨 열은 용량 한계에 가깝다** — 2행 라벨 14개 × 피치 63 = 819 px 가 가용창 837.7 px 를 채운다. 최종안의 프레임 여유는 **상 12.55 / 하 6.15 px**. 피치를 64 로 올리면 여유가 **1 px 대**로 떨어진다. **폰트가 바뀌면 곧바로 C2 가 된다** — 이 자산은 폰트 변경에 8공정 중 가장 민감하다 |
| **다** | ✅ **처리됨(팀장 판정 2026-08-21).** 「반대 방향 **4 : 1 속도비**」는 원문 진술이 아니라 **유도값**이었다 — T-B-03 은 「opposite directions」와 「4x reduction」을 **각각** 적을 뿐이고 `speed`·`velocity` 각 0회, T-B-02 에도 없다. **주장을 약하게 만드는 정정이므로 즉시 반영**했고 **㉢오독이 아니라 「유도」로 §6-1 17번 ㉯ 에 등재**했다. 서식은 `packaging/hole-chamfer-ratio` 문형 재사용. **도형·화살표 길이비 280 : 70 무변경** |
| **라** | 🔴 **미해소 — 등재만 했다(팀장 판정 2026-08-21).** §7 「정렬 마크·정렬 센서(입사·반사 광선)」는 **㉠무출처**다 — 마크·정렬계의 **존재**까지만 근거이고 **그려진 광선 2개의 근거는 없다**(`reflect`·`mirror` 각 0회). **§6-1 10번 레벨링 센서와 같은 유형.** ⓐ 출처 확보(1단계)를 시도할 시간이 이 라운드에 없고 ⓑ 도형 제거는 재검수를 다시 요구하므로 **도형은 건드리지 않았다.** 「T-B-03 §C-17」 **서식 오류만 정정**했다. 🔴 **「해소」가 아니다 — §6-1 17번 ㉰ 「다음 라운드 최우선」** |
| **마** | 🔴 **다음 라운드 안건으로 등재(팀장 판정 2026-08-21 · 지금 하지 마라).** `notes[]` 20건은 `90-anchor` 레이어에 대응 도형이 없어 라벨(3자)과 달리 **2자 대조**뿐이다. `90-anchor` 에 `n-*` 원 20개를 더하면 3자가 되지만 **8공정 공통 규약 변경**이라 지금 하면 **8공정 전부가 재검수 대상**이 된다. `_labels_check.py` 도 현 상태를 정상으로 취급한다. **P-D 가 같은 질의를 했고 같은 판정이 났다** |
| **바** | **`notes.demag-ratio` anchor [540, 522] 는 어느 획 위도 아니다** — 4:1 비교 막대 두 개의 세로 중점이지만 연결 점선에서 20 px 떨어져 있다. 의도인지 오차인지 판정하지 못해 **옮기지 않았다**(§A-1 ①) |
| **사** | **작업 도중 `_labels_check.py` 가 이 자산에 「리더선 실교차 1건 → reticle-stage×reticle」을 찍었다 — 위양성이었다.** 이 도구의 `place()` 는 꺾임점을 `((anchor.x+leaderEnd.x)/2, 행 y)` 로 **자체 추정**하는데, 출하 렌더러·`_figure_check.py` 는 `anchor → leaderEnd → (tx, ly)` 다. 정본 모델로 재계산하면 두 리더선은 교차하지 않고, `_figure_check.py` **C7 = 0** 이었다. 🔴 **세션 도중 도구조(FIX-TOOL)가 이 출력을 실제로 제거했다** — 종료 시점 `_labels_check.py`(`5fa397764407f86e`)는 유령 4항목을 `GHOST_ITEMS` 로 묶어 **판정도 종료코드도 내지 않으며**, `photo` 에 **✅** 를 낸다. **기록만 남긴다 — 조치 필요 없음** |


## Z. 🔴 2026-08-20 세션 3 변경 이력

> **왜 이 절이 있는가.** 이 프로젝트에서 **사실 하나가 최대 4곳**(자산 · 조사 대장 · 이 파일 · `07_정합성원장.md`)에 복제돼 있고, 정정이 절반만 반영된 사례가 오늘만 **3건** 나왔다. 무엇이 언제 왜 바뀌었는지를 **자산 옆에** 남긴다. 규칙: `07_정합성원장.md` **§8-2**.

**현재 실측:** 라벨 **21개** · `cross-section.webp` **58,118 B**(한도 184,320 B 의 31 %)

| # | 변경 |
|---|---|
| 1 | 🔴 **A13 반려 정정** — 상세는 이 문서의 「V5 반려 반영」 절 |
| — | 🔴 **`en` 라벨 레이아웃 정정 — clamp 12건** → **0**. 아래 배경 참조 |

### Z-1. `en` 레이아웃이 왜 문제였나 (전 공정 공통 배경)

`cross-section.webp` 는 **ko/en 이 공유하는 단일 파일**이고 그래서 SVG 에 문자를 하나도 굽지 않았다 — **i18n 이 이 설계의 존재 이유다.** 그런데 렌더러 `app/src/viz/svg/Overlay.tsx` 의 `place()` 는 **`lang` 을 받아 `en` 이면 `label.en` 으로 박스 폭을 다시 재는데**, DSN 검사기는 **`ko` 만** 검사하고 있었다.

🔴 **원인은 앞선 수리 자체였다.** `_labels_repair.py` 가 「`leaderEnd.x` 를 여백 끝에 붙여 clamp 원천 차단」하면서 **ko 박스를 여백에 정확히 flush(`boxX = 4.0`)** 로 맞췄고, 그보다 넓은 en 박스는 **전부 clamp 가 확정**됐다. **ko 42건을 0으로 만든 대가로 en 60건이 생겼다.** 재검수 **RV** 적발.

**조치:** ①`en` 문자열을 **건별 판단으로 축약**(일괄 치환 스크립트 금지 — 수식어가 **사실 주장인지 장식인지**를 하나씩 판단했다) ②`_labels_check.py` 를 **`ko`·`en` 양쪽 검사**로 ③`_selftest_tools.py` 에 **픽스처 고정** ④`_검수.html` 에 **언어 토글** 신설.

**검증:** `이미지/_검수증거/ko_photo.png` · `en_photo.png` — 렌더러 `place()` 와 **동일 산식**(정렬·베이스라인 포함)으로 합성했다. **clamp 된 박스는 붉은 파선**으로 그리므로, 붉은 박스가 없다는 것이 곧 판정이다.
