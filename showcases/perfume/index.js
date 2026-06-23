/**
 * Perfume Showcase — GSAP Timeline + ScrollTrigger + Lenis
 *
 * 구조(HTML/CSS/JS 분리):
 *   - perfume.html : 마크업 (fetch 해서 주입)
 *   - perfume.css  : 스타일 (<link>로 주입, destroy 시 제거)
 *   - index.js     : 라이브러리 로드 + 애니메이션 셋업 (이 파일)
 *
 * 핵심 연출:
 *   1) Hero    : GSAP Timeline 으로 카피/병 순차 등장
 *   2) Object  : ScrollTrigger scrub 로 병 회전 + 확대
 *   3) Notes   : Pin + cross-fade 로 Top/Middle/Base 스토리텔링 (Fade Up)
 *   4) Finale  : 병을 화면에 가득 확대 후 브랜드 메시지 등장
 *   - Lenis 로 전체 스크롤을 부드럽게(Apple 스타일)
 */

// esm.sh 는 gsap 플러그인(ScrollTrigger)의 서브패스 export 를 잘 처리합니다.
const GSAP_URL  = 'https://esm.sh/gsap@3.12.5';
const ST_URL    = 'https://esm.sh/gsap@3.12.5/ScrollTrigger';
const LENIS_URL = 'https://esm.sh/lenis@1.1.14';

// ── 모듈 상태 (destroy 정리용) ──────────────────────
let alive = false;
let _gsap = null, _ST = null;
let lenis = null;
let ctx = null;
let tickerFn = null;
let cssLink = null;
let bodyClassAdded = false;

async function init(container) {
  alive = true;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Perfume Showcase 로드 중…</p>
    </div>`;

  // ── 1. 라이브러리 동적 로드 ───────────────────────
  let Lenis;
  try {
    ({ gsap: _gsap } = await import(GSAP_URL));
    ({ ScrollTrigger: _ST } = await import(ST_URL));
    Lenis = (await import(LENIS_URL)).default;
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">라이브러리를 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }
  if (!alive || !container.isConnected) return;

  // ScrollTrigger 플러그인 등록 (gsap 와 같은 인스턴스에 연결)
  _gsap.registerPlugin(_ST);

  // ── 2. CSS 주입 (link) 후 로드 대기 ───────────────
  cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = new URL('./perfume.css', import.meta.url).href;
  document.head.appendChild(cssLink);
  await new Promise((res) => { cssLink.onload = res; cssLink.onerror = res; });

  // ── 3. HTML 주입 (fetch) ──────────────────────────
  const html = await fetch(new URL('./perfume.html', import.meta.url)).then((r) => r.text());
  if (!alive || !container.isConnected) { cleanupStyles(); return; }
  container.innerHTML = html;
  document.body.classList.add('perfume-active');
  bodyClassAdded = true;

  // 진입 시 항상 맨 위에서 시작
  window.scrollTo(0, 0);

  // ── 4. Lenis 부드러운 스크롤 셋업 ─────────────────
  // Lenis 는 휠 입력을 받아 window 스크롤을 보간(lerp)하여 관성 스크롤을 만듭니다.
  lenis = new Lenis({
    duration: 1.2,          // 관성 지속 시간(클수록 더 부드럽고 느림)
    smoothWheel: true,
    wheelMultiplier: 1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out
  });

  // (a) Lenis 가 스크롤할 때마다 ScrollTrigger 가 위치를 다시 계산하도록 연결
  lenis.on('scroll', _ST.update);
  // (b) Lenis 의 rAF 를 GSAP 의 ticker 에 위임 → 단일 루프로 동기화
  tickerFn = (time) => lenis.raf(time * 1000); // gsap time(초) → lenis(ms)
  _gsap.ticker.add(tickerFn);
  _gsap.ticker.lagSmoothing(0); // 탭 복귀 시 점프 방지

  // ── 5. 애니메이션 구성 (context 로 묶어 destroy 시 일괄 revert) ──
  ctx = _gsap.context(() => {
    buildHeroTimeline();
    buildObjectSection();
    buildNotesSection();
    buildFinaleSection();
  }, container);

  // 레이아웃/폰트 안정화 후 트리거 위치 재계산
  requestAnimationFrame(() => _ST && _ST.refresh());
  setTimeout(() => _ST && _ST.refresh(), 400);
}

function destroy() {
  alive = false;
  if (ctx) { ctx.revert(); ctx = null; }              // 모든 tween + ScrollTrigger 제거
  if (_ST) _ST.getAll().forEach((t) => t.kill());     // 혹시 남은 트리거까지 정리
  if (tickerFn && _gsap) { _gsap.ticker.remove(tickerFn); tickerFn = null; }
  if (_gsap) _gsap.ticker.lagSmoothing(500, 33);       // 기본값 복원
  if (lenis) { lenis.destroy(); lenis = null; }
  cleanupStyles();
  window.scrollTo(0, 0);
  _gsap = _ST = null;
}

function cleanupStyles() {
  if (bodyClassAdded) { document.body.classList.remove('perfume-active'); bodyClassAdded = false; }
  if (cssLink) { cssLink.remove(); cssLink = null; }
}

/* ─────────────────────────────────────────────────────
 *  1) HERO — GSAP Timeline (스크롤과 무관, 진입 시 1회 재생)
 * ──────────────────────────────────────────────────── */
function buildHeroTimeline() {
  // Timeline: 여러 tween 을 시간 순서대로 이어 붙입니다.
  // 위치 파라미터('-=0.8')로 직전 tween 과 살짝 겹쳐 자연스럽게 연결.
  const tl = _gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.from('.hero__bottle', { y: 70, autoAlpha: 0, scale: 0.92, duration: 1.4 })
    .from('.hero__kicker', { y: 20, autoAlpha: 0, duration: 0.8 }, '-=0.9')
    // 제목은 .line-mask(overflow:hidden) 안의 .line 을 끌어올려 '리빌' 효과
    .from('.hero__title .line', { yPercent: 120, duration: 1, stagger: 0.15 }, '-=0.7')
    .from('.hero__sub', { y: 20, autoAlpha: 0, duration: 0.8 }, '-=0.6')
    .from('.hero__scroll', { autoAlpha: 0, duration: 0.8 }, '-=0.4');

  // 등장 후 은은한 부유(floating). 병 래퍼(.hero__bottle)에만 적용해 인트로와 충돌 없음.
  _gsap.to('.hero__bottle', {
    y: '-=14', duration: 3, ease: 'sine.inOut',
    yoyo: true, repeat: -1, delay: tl.duration(),
  });
}

/* ─────────────────────────────────────────────────────
 *  2) OBJECT — ScrollTrigger scrub (회전 + 확대)
 * ──────────────────────────────────────────────────── */
function buildObjectSection() {
  // scrub:true → 애니메이션 진행도가 스크롤 위치에 1:1로 묶입니다(스크럽).
  // pin → 트리거 구간 동안 stage 를 화면에 고정.
  const tl = _gsap.timeline({
    scrollTrigger: {
      trigger: '.s-reveal',
      start: 'top top',
      end: 'bottom bottom',   // 섹션(240vh) 전체 = 약 140vh 스크롤 구간
      pin: '.s-reveal__stage',
      scrub: 1,               // 1초의 관성을 둬 더 부드럽게
    },
  });

  tl.fromTo('.s-reveal .pf-bottle',
      { rotateY: 0, scale: 0.85 },
      { rotateY: 360, scale: 1.3, ease: 'none' })   // 천천히 한 바퀴 회전 + 확대
    .fromTo('.s-reveal__caption',
      { autoAlpha: 0, y: 30 },
      { autoAlpha: 1, y: 0, duration: 0.25 }, 0);
}

/* ─────────────────────────────────────────────────────
 *  3) NOTES — Pin + cross-fade 스토리텔링 (Fade Up)
 *  하나의 stage 를 Pin 한 채, Top→Middle→Base 를 순차 전환.
 * ──────────────────────────────────────────────────── */
function buildNotesSection() {
  const phases = [
    { note: '.note[data-note="top"]',  bg: '.nbg--top' },
    { note: '.note[data-note="mid"]',  bg: '.nbg--mid' },
    { note: '.note[data-note="base"]', bg: '.nbg--base' },
  ];

  // 시작 상태: 모든 노트는 아래쪽에서 투명하게 대기 (Fade Up 준비)
  _gsap.set('.note', { autoAlpha: 0, y: 50 });
  _gsap.set('.nbg', { autoAlpha: 0 });

  const tl = _gsap.timeline({
    scrollTrigger: {
      trigger: '.s-notes',
      start: 'top top',
      end: 'bottom bottom',     // 섹션(400vh) → 충분한 스크롤 구간
      pin: '.s-notes__stage',   // stage 를 고정한 채 내부 콘텐츠만 전환
      scrub: 1,
    },
  });

  phases.forEach((p, i) => {
    // 등장: 아래 → 제자리 (Fade Up) + 배경 cross-fade
    tl.to(p.note, { autoAlpha: 1, y: 0, duration: 1, ease: 'power2.out' })
      .to(p.bg,   { autoAlpha: 1, duration: 1 }, '<')
      .to({}, { duration: 1.3 });                     // 머무는 구간(hold)

    // 마지막 노트는 그대로 두고, 그 외엔 위로 사라지며 다음 노트로 전환
    if (i < phases.length - 1) {
      tl.to(p.note, { autoAlpha: 0, y: -50, duration: 1, ease: 'power2.in' })
        .to(p.bg,   { autoAlpha: 0, duration: 1 }, '<');
    }
  });
}

/* ─────────────────────────────────────────────────────
 *  4) FINALE — 병을 화면 가득 확대 → 브랜드 메시지 등장
 * ──────────────────────────────────────────────────── */
function buildFinaleSection() {
  const tl = _gsap.timeline({
    scrollTrigger: {
      trigger: '.s-finale',
      start: 'top top',
      end: 'bottom bottom',     // 260vh
      pin: '.s-finale__stage',
      scrub: 1,
    },
  });

  tl.to('.s-finale .pf-bottle', { scale: 7, ease: 'power1.in', duration: 2 })
    // 확대된 병을 골드빛 배경으로 녹여냄
    .to('.s-finale .pf-bottle', { autoAlpha: 0.12, duration: 0.6 }, '>-0.5')
    .to('.pf-halo--finale', { scale: 2.4, autoAlpha: 0.85, duration: 1.4 }, '<')
    // 브랜드 메시지 Fade Up (from: 스크럽 후반에 비로소 나타남)
    .from('.finale-msg > *', {
      autoAlpha: 0, y: 40, duration: 0.8, stagger: 0.15, ease: 'power2.out',
    }, '>-0.3');
}

export default {
  id: 'perfume',
  title: 'Perfume',
  icon: '🧴',
  description: '럭셔리 향수 랜딩 (GSAP · ScrollTrigger · Lenis)',
  init,
  destroy,
};
