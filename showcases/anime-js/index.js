/**
 * Anime.js Showcase
 * — 동적으로 CDN(ESM)에서 anime.js(v3)를 로드해 대표 기능을 데모합니다.
 *   1. Grid Stagger : 그리드 좌표 기반 물결(ripple) 스태거
 *   2. SVG Drawing  : strokeDashoffset 으로 선이 그려지는 효과
 *   3. Timeline     : add() 로 연결한 시퀀스 애니메이션
 */

const ANIME_URL = 'https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm';

let anime = null;
let instances = [];   // 정리할 anime 인스턴스
let targets = [];     // anime.remove() 대상 셀렉터/엘리먼트
let replayFns = [];

async function init(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Anime.js 로드 중…</p>
    </div>`;

  try {
    const mod = await import(ANIME_URL);
    anime = mod.default || mod.anime || mod;
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">Anime.js를 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }

  if (!container.isConnected) return;

  container.innerHTML = `
    <div class="showcase-wrapper">
      <div class="showcase-header">
        <span class="badge">Animation</span>
        <h1>Anime.js</h1>
        <p>CSS·SVG·DOM·객체를 한 API로 다루는 경량 애니메이션 엔진.
           <code>anime()</code> / 그리드 <code>stagger</code> / SVG 라인 드로잉 /
           <code>timeline()</code>을 데모합니다.</p>
      </div>

      <div class="showcase-toolbar">
        <button class="replay-btn" id="animeReplay">▶ 전체 다시 재생</button>
      </div>

      <div class="demo-grid">
        <div class="demo-card">
          <h3>1. Grid Stagger</h3>
          <div class="demo-stage" id="anime-grid"></div>
          <p class="demo-desc">그리드 좌표 기준 <code>stagger(…, {grid, from})</code>로 중심에서 퍼지는 물결.</p>
        </div>
        <div class="demo-card">
          <h3>2. SVG Line Drawing</h3>
          <div class="demo-stage" id="anime-svg"></div>
          <p class="demo-desc"><code>strokeDashoffset</code>를 애니메이트해 선이 그려지는 효과.</p>
        </div>
        <div class="demo-card">
          <h3>3. Timeline</h3>
          <div class="demo-stage" id="anime-timeline" style="flex-direction:column;gap:14px;"></div>
          <p class="demo-desc"><code>timeline().add()</code>로 세 막대를 순차 등장시킵니다.</p>
        </div>
      </div>
    </div>`;

  instances = [];
  targets = [];
  replayFns = [];

  replayFns.push(_gridDemo(container.querySelector('#anime-grid')));
  replayFns.push(_svgDemo(container.querySelector('#anime-svg')));
  replayFns.push(_timelineDemo(container.querySelector('#anime-timeline')));

  container.querySelector('#animeReplay').addEventListener('click', () => {
    replayFns.forEach((fn) => fn && fn());
  });
}

function destroy() {
  instances.forEach((a) => a && a.pause());
  targets.forEach((t) => anime && anime.remove(t));
  instances = [];
  targets = [];
  replayFns = [];
}

/* ── 1. Grid Stagger ────────────────────────────────── */
function _gridDemo(stage) {
  if (!stage) return null;
  const COLS = 7, ROWS = 5;
  const grid = document.createElement('div');
  grid.style.cssText =
    `display:grid;grid-template-columns:repeat(${COLS},14px);grid-gap:6px;`;
  for (let i = 0; i < COLS * ROWS; i++) {
    const d = document.createElement('div');
    d.className = 'anime-cell';
    d.style.cssText =
      'width:14px;height:14px;border-radius:3px;background:#7c6ff7;';
    grid.appendChild(d);
  }
  stage.appendChild(grid);
  targets.push('.anime-cell');

  const play = () => {
    const a = anime({
      targets: '.anime-cell',
      scale: [
        { value: 1.5, easing: 'easeOutSine', duration: 250 },
        { value: 1, easing: 'easeInOutQuad', duration: 500 },
      ],
      backgroundColor: [
        { value: '#34d399', duration: 250 },
        { value: '#7c6ff7', duration: 500 },
      ],
      delay: anime.stagger(120, { grid: [COLS, ROWS], from: 'center' }),
    });
    instances.push(a);
    return a;
  };
  play();
  return play;
}

/* ── 2. SVG Line Drawing ────────────────────────────── */
function _svgDemo(stage) {
  if (!stage) return null;
  stage.innerHTML = `
    <svg viewBox="0 0 200 120" width="100%" height="120"
         fill="none" stroke="#a78bfa" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round">
      <path class="anime-path"
            d="M20,90 C50,10 80,10 100,60 S150,110 180,30" />
    </svg>`;
  const path = stage.querySelector('.anime-path');
  targets.push(path);

  const play = () => {
    const a = anime({
      targets: path,
      strokeDashoffset: [anime.setDashoffset, 0],
      easing: 'easeInOutSine',
      duration: 1600,
      direction: 'alternate',
    });
    instances.push(a);
    return a;
  };
  play();
  return play;
}

/* ── 3. Timeline ────────────────────────────────────── */
function _timelineDemo(stage) {
  if (!stage) return null;
  const bars = ['anime-bar1', 'anime-bar2', 'anime-bar3'].map((cls) => {
    const bar = document.createElement('div');
    bar.className = cls;
    bar.style.cssText =
      'height:18px;width:0;border-radius:9px;background:linear-gradient(90deg,#7c6ff7,#34d399);align-self:flex-start;';
    stage.appendChild(bar);
    targets.push('.' + cls);
    return '.' + cls;
  });

  const play = () => {
    const tl = anime.timeline({ easing: 'easeOutExpo', duration: 700 });
    tl.add({ targets: bars[0], width: ['0px', '180px'] })
      .add({ targets: bars[1], width: ['0px', '120px'] }, '-=400')
      .add({ targets: bars[2], width: ['0px', '150px'] }, '-=400');
    instances.push(tl);
    return tl;
  };
  play();
  return play;
}

export default {
  id: 'anime',
  title: 'Anime.js',
  icon: '🔴',
  description: 'CSS·SVG·DOM 올인원 애니메이션',
  init,
  destroy,
};
