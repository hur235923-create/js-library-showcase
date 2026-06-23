/**
 * GSAP Showcase
 * — 동적으로 CDN(ESM)에서 gsap을 로드해 대표 기능을 데모합니다.
 *   1. Stagger      : 여러 요소를 시간차로 순차 등장
 *   2. Timeline     : 여러 트윈을 체인으로 연결한 시퀀스
 *   3. Easing       : 대표 ease 곡선 비교 (power / elastic / bounce)
 */

const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';

let gsap = null;     // 로드된 gsap 인스턴스
let ctx = null;      // gsap.context — destroy 시 일괄 revert
let replayFns = [];  // 각 데모의 replay 함수 모음

async function init(container) {
  // 로딩 상태 표시
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>GSAP 로드 중…</p>
    </div>`;

  try {
    const mod = await import(GSAP_URL);
    gsap = mod.gsap || mod.default;
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">GSAP를 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }

  // 다른 탭으로 이미 이동한 경우 마운트 취소
  if (!container.isConnected) return;

  container.innerHTML = `
    <div class="showcase-wrapper">
      <div class="showcase-header">
        <span class="badge">Animation</span>
        <h1>GSAP</h1>
        <p>타임라인 기반의 업계 표준 애니메이션 라이브러리. <code>gsap.to()</code> /
           <code>gsap.timeline()</code> / <code>stagger</code> / <code>ease</code>의 핵심 사용법을 데모합니다.</p>
      </div>

      <div class="showcase-toolbar">
        <button class="replay-btn" id="gsapReplay">▶ 전체 다시 재생</button>
      </div>

      <div class="demo-grid">
        <div class="demo-card">
          <h3>1. Stagger</h3>
          <div class="demo-stage" id="gsap-stagger"></div>
          <p class="demo-desc">9개 박스를 <code>stagger</code> 옵션으로 시간차 등장시킵니다.</p>
        </div>
        <div class="demo-card">
          <h3>2. Timeline</h3>
          <div class="demo-stage" id="gsap-timeline"></div>
          <p class="demo-desc">이동 → 회전 → 스케일 → 색상 변화를 체인으로 연결합니다.</p>
        </div>
        <div class="demo-card">
          <h3>3. Easing 비교</h3>
          <div class="demo-stage" id="gsap-ease" style="flex-direction:column;gap:14px;padding:18px;"></div>
          <p class="demo-desc">같은 거리를 서로 다른 ease로 이동 — 곡선 차이를 눈으로 비교.</p>
        </div>
      </div>
    </div>`;

  replayFns = [];

  // 모든 트윈을 context로 묶어 destroy 시 한 번에 정리
  ctx = gsap.context(() => {
    replayFns.push(_staggerDemo(container.querySelector('#gsap-stagger')));
    replayFns.push(_timelineDemo(container.querySelector('#gsap-timeline')));
    replayFns.push(_easeDemo(container.querySelector('#gsap-ease')));
  }, container);

  container.querySelector('#gsapReplay').addEventListener('click', () => {
    replayFns.forEach((fn) => fn && fn());
  });
}

function destroy() {
  if (ctx) { ctx.revert(); ctx = null; }
  replayFns = [];
}

/* ── 1. Stagger ─────────────────────────────────────── */
function _staggerDemo(stage) {
  if (!stage) return null;
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:grid;grid-template-columns:repeat(3,28px);grid-gap:8px;';
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('div');
    b.className = 'gsap-box';
    b.style.cssText =
      'width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#a78bfa,#7c6ff7);';
    wrap.appendChild(b);
  }
  stage.appendChild(wrap);

  const play = () =>
    gsap.from('.gsap-box', {
      scale: 0,
      opacity: 0,
      rotate: -90,
      duration: 0.5,
      ease: 'back.out(1.7)',
      stagger: { amount: 0.6, from: 'center', grid: 'auto' },
    });
  play();
  return play;
}

/* ── 2. Timeline ────────────────────────────────────── */
function _timelineDemo(stage) {
  if (!stage) return null;
  const box = document.createElement('div');
  box.style.cssText =
    'width:40px;height:40px;border-radius:8px;background:#7c6ff7;';
  stage.style.justifyContent = 'flex-start';
  stage.style.paddingLeft = '20px';
  stage.appendChild(box);

  const play = () => {
    const tl = gsap.timeline();
    tl.set(box, { x: 0, rotate: 0, scale: 1, backgroundColor: '#7c6ff7', borderRadius: '8px' })
      .to(box, { x: 140, duration: 0.6, ease: 'power2.inOut' })
      .to(box, { rotate: 360, duration: 0.5 })
      .to(box, { scale: 1.6, borderRadius: '50%', backgroundColor: '#34d399', duration: 0.4 })
      .to(box, { x: 0, scale: 1, duration: 0.6, ease: 'power2.inOut' });
    return tl;
  };
  play();
  return play;
}

/* ── 3. Easing 비교 ─────────────────────────────────── */
function _easeDemo(stage) {
  if (!stage) return null;
  const eases = [
    ['power2.out', '#7c6ff7'],
    ['elastic.out(1,0.4)', '#34d399'],
    ['bounce.out', '#f59e0b'],
  ];
  const dots = eases.map(([label, color]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;';
    const dot = document.createElement('div');
    dot.style.cssText =
      `width:20px;height:20px;border-radius:50%;background:${color};flex-shrink:0;`;
    const tag = document.createElement('span');
    tag.textContent = label;
    tag.style.cssText = 'font-size:10px;color:#6b7280;';
    row.appendChild(dot);
    row.appendChild(tag);
    stage.appendChild(row);
    return { dot, ease: label };
  });

  const play = () =>
    dots.forEach(({ dot, ease }) => {
      gsap.fromTo(dot, { x: 0 }, { x: 120, duration: 1.4, ease });
    });
  play();
  return play;
}

export default {
  id: 'gsap',
  title: 'GSAP',
  icon: '🟢',
  description: '타임라인 기반 고성능 애니메이션',
  init,
  destroy,
};
