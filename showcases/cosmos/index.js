/**
 * Digital Cosmos — 인터랙티브 디지털 공간 탐험 (Three.js)
 *
 * 레지스트리 진입점. 여기서는 "조립"만 한다 — 실제 로직은 core/ scenes/
 * animation/ shaders/ ui/ 모듈에 분리되어 있다. 이 파일이 하는 일:
 *   1. 의존성(three) lazy 로드 + CSS 주입
 *   2. 스테이지 DOM 구성 (스크롤 영역 + sticky 캔버스 + UI 오버레이)
 *   3. Viewport 감지 → UILayer → Engine 조립 후 씬 등록·시작
 *   4. destroy 시 전부 정리 (GPU 컨텍스트·이벤트·스크롤 위치)
 *
 * three 는 index.html 의 import map 으로 해석된다.
 *
 * ── 확장 가이드 ───────────────────────────────────────
 *  · 새 공간 추가: scenes/ 에 BaseScene 상속 클래스 작성 →
 *    engine.registerScene('key', (ctx) => new MyScene(ctx)) 등록
 *  · 셰이더 추가: shaders/ 에 모듈 추가 후 씬에서 import
 *  · UI 추가: ui/ 컴포넌트 작성 후 UILayer 에서 조합
 */

// 각 구간(웨이포인트)에 매핑되는 캡션 — UILayer 가 스크롤 구간에 동기화
const WAYPOINTS = [
  { kicker: 'CHAPTER 01', title: '태초의 지형',
    text: '노이즈로부터 솟아오른 거대한 풍경. 산맥과 파도, 그 사이 어딘가의 형상.' },
  { kicker: 'CHAPTER 02', title: '능선을 따라',
    text: '수십만 개의 입자가 그리는 능선. 가까이서 보면 끊임없이 흐르고 있다.' },
  { kicker: 'CHAPTER 03', title: '표면을 스치며',
    text: '지형 위를 낮게 비행한다. 시점을 움직이면 풍경이 함께 반응한다.' },
  { kicker: 'CHAPTER 04', title: '골짜기 사이로',
    text: '빛이 가라앉은 골짜기. 지형은 살아있는 생명체처럼 천천히 숨을 쉰다.' },
  { kicker: 'CHAPTER 05', title: '압도적인 스케일',
    text: '다시 떠올라 마주하는 풍경. 웹사이트가 아닌, 하나의 디지털 아트.' },
];

let alive = false;
let engine = null;
let ui = null;
let cssLink = null;

async function init(container) {
  alive = true;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>디지털 우주를 생성하는 중…</p>
    </div>`;

  let THREE, Engine, UILayer, detectViewport, ParticleField, ParticleTerrain;
  try {
    THREE = await import('three');
    ({ Engine } = await import('./core/Engine.js'));
    ({ UILayer } = await import('./ui/UILayer.js'));
    ({ detectViewport } = await import('./core/Viewport.js'));
    ({ ParticleField } = await import('./scenes/ParticleField.js'));
    ({ ParticleTerrain } = await import('./scenes/ParticleTerrain.js'));
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">3D 모듈을 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }
  if (!alive || !container.isConnected) return;

  // ── CSS 주입 ──────────────────────────────────────
  cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = new URL('./cosmos.css', import.meta.url).href;
  document.head.appendChild(cssLink);
  await new Promise((res) => { cssLink.onload = res; cssLink.onerror = res; });
  if (!alive || !container.isConnected) { cssLink.remove(); return; }

  // ── 스테이지 DOM ──────────────────────────────────
  container.innerHTML = `
    <section class="cosmos-root">
      <div class="cosmos-stage">
        <div class="cosmos-stage__canvas"></div>
        <div class="cosmos-stage__ui"></div>
      </div>
    </section>`;

  const root = container.querySelector('.cosmos-root');
  const host = container.querySelector('.cosmos-stage__canvas');
  const uiRoot = container.querySelector('.cosmos-stage__ui');

  // 스크롤 길이 = 구간 수에 비례 (여유 1구간 추가)
  root.style.height = `${(WAYPOINTS.length + 1) * 100}vh`;

  window.scrollTo(0, 0);

  // ── 조립 ──────────────────────────────────────────
  const viewport = detectViewport();
  ui = new UILayer(uiRoot, WAYPOINTS);

  engine = new Engine(host, THREE, {
    viewport,
    ui,
    scrollEl: root,
    sections: WAYPOINTS.length,
  });
  // 씬 등록 — 진입 씬은 지형. 갤러리(은하)는 SceneManager 확장 데모로 유지.
  engine.registerScene('terrain', (ctx) => new ParticleTerrain(ctx));
  engine.registerScene('field', (ctx) => new ParticleField(ctx));
  engine.start('terrain');
}

function destroy() {
  alive = false;
  if (engine) { engine.dispose(); engine = null; }
  if (ui) { ui.dispose(); ui = null; }
  if (cssLink) { cssLink.remove(); cssLink = null; }
  window.scrollTo(0, 0);
}

export default {
  id: 'cosmos',
  title: 'Digital Cosmos',
  icon: '🌌',
  description: '인터랙티브 디지털 공간 탐험 — 모듈화 Three.js 엔진 · Simplex Noise 파티클 지형 · 수십만 GPU 파티클 · 스크롤 플라이스루',
  init,
  destroy,
};
