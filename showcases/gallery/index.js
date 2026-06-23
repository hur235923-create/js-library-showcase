/**
 * Interactive 3D Art Gallery — Three.js + GSAP + ScrollTrigger + Lenis
 *
 * 컨셉: 디지털 전시관. 작품들이 보이지 않는 원형 트랙 위에 떠 있는 액자로 배치되고,
 *       마우스 휠(스크롤)로 갤러리 전체가 회전합니다.
 *
 *  - 원형 배치 + Z축 깊이 + 부유(floating)  ……… Three.js 3D 씬
 *  - 휠 → 회전 (관성)                       ……… ScrollTrigger scrub + Lenis
 *  - 호버 확대 / 클릭 시 중앙 확대            ……… Raycaster + GSAP
 *  - 상세 패널 + 주변 디밍                    ……… HTML 오버레이 + 머티리얼 opacity
 *  - 작품 이미지는 외부 의존 없이 Canvas로 생성(8가지 화풍)
 *
 *  three 는 index.html 의 import map 으로 해석됩니다.
 */

const GSAP_URL  = 'https://esm.sh/gsap@3.12.5';
const ST_URL    = 'https://esm.sh/gsap@3.12.5/ScrollTrigger';
const LENIS_URL = 'https://esm.sh/lenis@1.1.14';

// ── 작품 데이터 ─────────────────────────────────────
const ARTWORKS = [
  { style: 'colorField', title: 'Crimson Meridian', artist: 'Elena Vásquez', year: 2021,
    medium: 'Acrylic & pigment on canvas',
    desc: '붉은 지평선이 겹겹이 번지며 명상적인 침묵을 만들어낸다. 색면의 경계가 흐려지는 지점에서 시간이 멈춘 듯한 감각을 전한다.' },
  { style: 'bauhaus', title: 'Geometry of Silence', artist: 'Tobias Reinhardt', year: 2019,
    medium: 'Screen-print on paper',
    desc: '원, 삼각형, 직선이 절제된 균형을 이룬다. 바우하우스의 기하학적 어휘로 정적과 질서를 시각화한 작업.' },
  { style: 'waves', title: 'Tidal Memory', artist: 'Yuki Tanaka', year: 2022,
    medium: 'Digital print, archival',
    desc: '밀려오고 빠져나가는 물결의 리듬을 색의 층위로 번역했다. 기억이 파도처럼 되돌아오는 순간을 담는다.' },
  { style: 'goldGeo', title: 'Golden Ratio No.7', artist: 'Marcus Bellini', year: 2018,
    medium: 'Gold leaf & ink',
    desc: '황금비의 나선을 따라 배치된 선들이 고요한 질서를 드러낸다. 빛을 머금은 금박이 깊이를 더한다.' },
  { style: 'mesh', title: 'Whispers in Violet', artist: 'Amara Okafor', year: 2023,
    medium: 'Generative gradient field',
    desc: '보랏빛 안개가 서로 스미며 형태 없는 감정을 그린다. 알고리즘이 그려낸 색의 호흡.' },
  { style: 'dots', title: 'Fragments of Dawn', artist: 'Sofia Lindqvist', year: 2020,
    medium: 'Pointillist composition',
    desc: '수천 개의 점이 모여 새벽의 온기를 이룬다. 가까이서는 흩어지고 멀리서는 하나의 풍경이 된다.' },
  { style: 'ink', title: 'The Untitled Void', artist: 'Chen Wei', year: 2017,
    medium: 'Sumi ink on paper',
    desc: '단 한 번의 붓질로 그린 원. 비움과 채움 사이의 경계에서 동양적 여백의 미를 사유한다.' },
  { style: 'organic', title: 'Verdant Echoes', artist: 'Olivia Moreau', year: 2022,
    medium: 'Oil on linen',
    desc: '유기적인 형상들이 서로 메아리치며 생명의 리듬을 그린다. 자연의 성장과 순환에 대한 은유.' },
];

// ── 모듈 상태 ───────────────────────────────────────
let alive = false;
let _gsap = null, _ST = null, _THREE = null;
let lenis = null, ctx = null, tickerFn = null, cssLink = null;
let renderer, scene, camera, group, clock, raf;
let frames = [];
let dusts = [];          // 3D 먼지 입자 레이어
let bgParallax = [];     // CSS 배경 패럴렉스 quickTo
let raycaster, ndc;
let hovered = null, selected = null, focusBusy = false;
let stageEl = null, panelEl = null, dimEl = null;
let onPointerMove, onClick, onResize, onKey;
const pointer = { x: 0, y: 0 };

const CAM_Z = 11;
const BASE_R = 6;

async function init(container) {
  alive = true;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>전시 공간을 준비하는 중…</p>
    </div>`;

  let Lenis;
  try {
    ({ gsap: _gsap } = await import(GSAP_URL));
    ({ ScrollTrigger: _ST } = await import(ST_URL));
    Lenis = (await import(LENIS_URL)).default;
    _THREE = await import('three');
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">갤러리를 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }
  if (!alive || !container.isConnected) return;
  _gsap.registerPlugin(_ST);

  // CSS 주입
  cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = new URL('./gallery.css', import.meta.url).href;
  document.head.appendChild(cssLink);
  await new Promise((res) => { cssLink.onload = res; cssLink.onerror = res; });
  if (!alive || !container.isConnected) { cssLink.remove(); return; }

  // DOM 구성
  container.innerHTML = `
    <section class="gallery-showcase gal-section">
      <div class="gal-stage" id="galStage">
        <div class="gal-bg" id="galBg">
          <div class="gal-bg__layer gal-bg__layer--1"></div>
          <div class="gal-bg__layer gal-bg__layer--2"></div>
          <div class="gal-bg__layer gal-bg__layer--3"></div>
        </div>
        <div class="gal-dim" id="galDim"></div>
        <aside class="gal-panel" id="galPanel">
          <button class="gal-panel__close" id="galClose" aria-label="닫기">×</button>
          <span class="gal-panel__no"></span>
          <h2 class="gal-panel__title"></h2>
          <div class="gal-panel__meta"><span class="artist"></span><span class="year"></span></div>
          <span class="gal-panel__medium"></span>
          <div class="gal-panel__rule"></div>
          <p class="gal-panel__desc"></p>
        </aside>
        <div class="gal-hud">
          <div class="gal-hud__brand">AETHER GALLERY<span>DIGITAL EXHIBITION</span></div>
          <div class="gal-hud__hint">SCROLL TO ROTATE · CLICK TO VIEW</div>
        </div>
      </div>
    </section>`;
  stageEl = container.querySelector('#galStage');
  panelEl = container.querySelector('#galPanel');
  dimEl = container.querySelector('#galDim');

  window.scrollTo(0, 0);

  buildScene();
  buildFrames();
  bindEvents(container);

  // Lenis 관성 스크롤 → ScrollTrigger 동기화
  lenis = new Lenis({
    duration: 1.4,            // 관성 강하게 (미술관처럼 묵직하게)
    smoothWheel: true,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  lenis.on('scroll', _ST.update);
  tickerFn = (time) => lenis.raf(time * 1000);
  _gsap.ticker.add(tickerFn);
  _gsap.ticker.lagSmoothing(0);

  // 회전 애니메이션: 스크롤 진행 → 갤러리 한 바퀴 회전 (scrub 관성)
  ctx = _gsap.context(() => {
    _gsap.to(group.rotation, {
      y: Math.PI * 2,
      ease: 'none',
      scrollTrigger: {
        trigger: '.gal-section',
        start: 'top top',
        end: 'bottom bottom',
        pin: '.gal-stage',
        scrub: 1.2,
      },
    });
  }, container);

  startLoop();
  requestAnimationFrame(() => _ST && _ST.refresh());
  setTimeout(() => _ST && _ST.refresh(), 400);
}

function destroy() {
  alive = false;
  if (raf) cancelAnimationFrame(raf);
  if (ctx) { ctx.revert(); ctx = null; }
  if (_ST) _ST.getAll().forEach((t) => t.kill());
  if (tickerFn && _gsap) { _gsap.ticker.remove(tickerFn); tickerFn = null; }
  if (_gsap) _gsap.ticker.lagSmoothing(500, 33);
  if (lenis) { lenis.destroy(); lenis = null; }

  if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
  if (onResize) window.removeEventListener('resize', onResize);
  if (onKey) window.removeEventListener('keydown', onKey);
  onPointerMove = onResize = onKey = onClick = null;

  if (scene) scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    }
  });
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement?.remove();
    renderer = null;
  }
  if (cssLink) { cssLink.remove(); cssLink = null; }
  window.scrollTo(0, 0);
  scene = camera = group = clock = null;
  frames = []; dusts = []; bgParallax = [];
  hovered = selected = null; focusBusy = false;
  _gsap = _ST = _THREE = null;
}

/* ─────────────────────────────────────────────────────
 *  Three.js 씬
 * ──────────────────────────────────────────────────── */
function buildScene() {
  const THREE = _THREE;
  const W = stageEl.clientWidth, H = stageEl.clientHeight;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  stageEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  // 종이 톤 안개로 먼 작품이 배경에 녹아들며 깊이감 형성
  scene.fog = new THREE.Fog(0xe7e0d0, 9, 19);

  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // 액자 두께감을 위한 약한 조명 (작품 텍스처는 Basic 이라 영향 없음)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6354, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(2, 4, 6);
  scene.add(dir);

  group = new THREE.Group();
  scene.add(group);

  buildDust();

  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();
}

/* 공간 곳곳 다른 깊이에 떠 있는 먼지 입자 → 볼류메트릭 깊이감/패럴렉스 */
function buildDust() {
  const THREE = _THREE;
  // [개수, 분포(x,y,z), 크기, 색, 투명도] — 원/근 두 레이어로 패럴렉스 차이
  const layers = [
    { n: 520, sx: 32, sy: 18, sz: 32, size: 0.055, color: 0xb9a98a, opacity: 0.5 },  // 원경(멀리·작게)
    { n: 130, sx: 18, sy: 11, sz: 14, size: 0.10,  color: 0xfff4dd, opacity: 0.65 }, // 근경(가까이·크게)
  ];
  layers.forEach((L) => {
    const pos = new Float32Array(L.n * 3);
    for (let i = 0; i < L.n; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * L.sx;
      pos[i * 3 + 1] = (Math.random() - 0.5) * L.sy;
      pos[i * 3 + 2] = (Math.random() - 0.5) * L.sz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: L.color, size: L.size, sizeAttenuation: true,
      transparent: true, opacity: L.opacity, depthWrite: false, fog: true,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    dusts.push(pts);
  });
}

function buildFrames() {
  const THREE = _THREE;
  const N = ARTWORKS.length;

  ARTWORKS.forEach((art, i) => {
    const angle = (i / N) * Math.PI * 2;
    // 깊이(Z) 변주: 반지름을 살짝 다르게 + 높이 변주
    const radius = BASE_R + ((i % 3) - 1) * 0.9;
    const trackY = Math.sin(i * 1.7) * 0.45;
    const portrait = i % 3 !== 1;
    const aw = portrait ? 2.1 : 2.6;
    const ah = portrait ? 2.7 : 2.0;

    const frame = makeFrame(art, aw, ah);
    frame.position.set(Math.sin(angle) * radius, trackY, Math.cos(angle) * radius);
    frame.rotation.y = angle;   // 바깥쪽(카메라 방향)을 향하도록

    frame.userData = {
      index: i, data: art, trackY,
      frameH: ah * 1.12,        // 포커스 크기 계산용(액자 외곽 높이)
      floatPhase: Math.random() * Math.PI * 2,
      floatAmp: 0.10 + Math.random() * 0.10,
      floatSpeed: 0.4 + Math.random() * 0.4,
      floating: true,
      home: { x: frame.position.x, y: trackY, z: frame.position.z,
              rx: 0, ry: angle, rz: 0 },
    };
    group.add(frame);
    frames.push(frame);
  });
}

function makeFrame(art, aw, ah) {
  const THREE = _THREE;
  const g = new THREE.Group();

  // 액자 본체(두께 있는 박스) — 차콜/우드 톤
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x211d18, roughness: 0.7, metalness: 0.15, transparent: true,
  });
  const frameBox = new THREE.Mesh(new THREE.BoxGeometry(aw * 1.14, ah * 1.12, 0.12), frameMat);
  g.add(frameBox);

  // 매트(passe-partout) — 크림
  const matMat = new THREE.MeshStandardMaterial({ color: 0xf2ecdd, roughness: 0.95, transparent: true });
  const matPlane = new THREE.Mesh(new THREE.PlaneGeometry(aw * 1.04, ah * 1.04), matMat);
  matPlane.position.z = 0.061;
  g.add(matPlane);

  // 작품(Canvas 텍스처) — Basic 으로 색을 그대로
  const tex = new THREE.CanvasTexture(makeArtCanvas(art.style));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const artMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  const artPlane = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), artMat);
  artPlane.position.z = 0.063;
  g.add(artPlane);

  // 자식 메쉬에 프레임 역참조 (raycast 결과 → 프레임)
  g.children.forEach((m) => { m.userData.frame = g; });
  return g;
}

/* ─────────────────────────────────────────────────────
 *  생성형 아트 (Canvas 2D) — 8가지 화풍
 * ──────────────────────────────────────────────────── */
function makeArtCanvas(style) {
  const w = 700, h = 900;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  (ART_STYLES[style] || ART_STYLES.mesh)(x, w, h);
  addGrain(x, w, h, 16);
  return c;
}

function addGrain(x, w, h, amt) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

const ART_STYLES = {
  colorField(x, w, h) {
    x.fillStyle = '#4a1410'; x.fillRect(0, 0, w, h);
    const bands = ['#7d1f15', '#b8392a', '#e0735a', '#caa15f'];
    let y = h * 0.10;
    bands.forEach((col, i) => {
      const bh = h * (0.20 + i * 0.03);
      const grad = x.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grad;
      x.fillRect(w * 0.07, y, w * 0.86, bh);
      y += bh * 0.86;
    });
  },

  bauhaus(x, w, h) {
    x.fillStyle = '#efe7d4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1f3a5f'; x.beginPath(); x.arc(w * 0.36, h * 0.34, w * 0.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#d99a2b'; x.fillRect(w * 0.55, h * 0.18, w * 0.30, h * 0.30);
    x.fillStyle = '#9e3b2e'; x.beginPath();
    x.moveTo(w * 0.20, h * 0.86); x.lineTo(w * 0.50, h * 0.86); x.lineTo(w * 0.35, h * 0.55); x.closePath(); x.fill();
    x.strokeStyle = '#23201b'; x.lineWidth = 8;
    x.beginPath(); x.moveTo(w * 0.58, h * 0.60); x.lineTo(w * 0.86, h * 0.88); x.stroke();
    x.beginPath(); x.arc(w * 0.72, h * 0.70, w * 0.10, 0, Math.PI * 2); x.stroke();
  },

  waves(x, w, h) {
    const grad = x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b2a3a'); grad.addColorStop(1, '#123c4f');
    x.fillStyle = grad; x.fillRect(0, 0, w, h);
    const cols = ['#1d6a82', '#2f97a8', '#67c2c4', '#a9e0d6'];
    for (let b = 0; b < cols.length; b++) {
      x.fillStyle = cols[b];
      x.globalAlpha = 0.55;
      x.beginPath();
      const baseY = h * (0.30 + b * 0.16);
      x.moveTo(0, baseY);
      for (let i = 0; i <= w; i += 12) {
        x.lineTo(i, baseY + Math.sin(i * 0.012 + b) * 34 + Math.sin(i * 0.03) * 10);
      }
      x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fill();
    }
    x.globalAlpha = 1;
  },

  goldGeo(x, w, h) {
    x.fillStyle = '#14110b'; x.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.46;
    for (let r = 1; r <= 7; r++) {
      x.strokeStyle = `rgba(201,162,75,${0.25 + r * 0.08})`;
      x.lineWidth = 2;
      x.beginPath(); x.arc(cx, cy, r * w * 0.058, -0.6, Math.PI + 0.4); x.stroke();
    }
    x.strokeStyle = 'rgba(233,211,154,0.8)'; x.lineWidth = 3;
    let a = 0, r = w * 0.05;
    x.beginPath(); x.moveTo(cx, cy);
    for (let i = 0; i < 220; i++) { a += 0.32; r *= 1.012; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.stroke();
  },

  mesh(x, w, h) {
    x.fillStyle = '#1a1230'; x.fillRect(0, 0, w, h);
    const blobs = [
      [0.3, 0.3, '#6d3bd6'], [0.7, 0.4, '#b14ad0'],
      [0.5, 0.7, '#3d5bd6'], [0.25, 0.75, '#d063a8'], [0.8, 0.75, '#7e54e0'],
    ];
    x.globalCompositeOperation = 'lighter';
    blobs.forEach(([px, py, col]) => {
      const g = x.createRadialGradient(w * px, h * py, 0, w * px, h * py, w * 0.45);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    });
    x.globalCompositeOperation = 'source-over';
  },

  dots(x, w, h) {
    const grad = x.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#f3d9a8'); grad.addColorStop(1, '#e58a5a');
    x.fillStyle = grad; x.fillRect(0, 0, w, h);
    const cols = ['#c0392b', '#e67e22', '#f1c40f', '#8e44ad', '#2c3e50', '#ecf0f1'];
    const step = 26;
    for (let yy = step; yy < h; yy += step) {
      for (let xx = step; xx < w; xx += step) {
        const t = yy / h;
        x.globalAlpha = 0.5 + Math.random() * 0.4;
        x.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        const rr = (4 + Math.random() * 7) * (0.6 + t * 0.6);
        x.beginPath(); x.arc(xx + (Math.random() - 0.5) * 8, yy + (Math.random() - 0.5) * 8, rr, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalAlpha = 1;
  },

  ink(x, w, h) {
    x.fillStyle = '#f4efe3'; x.fillRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.46, R = w * 0.30;
    x.strokeStyle = '#1a1714'; x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      x.lineWidth = 26 - i * 6;
      x.globalAlpha = 0.9 - i * 0.25;
      x.beginPath();
      for (let a = -0.3; a < Math.PI * 1.85; a += 0.05) {
        const wob = 1 + Math.sin(a * 6) * 0.02;
        const px = cx + Math.cos(a) * R * wob + (Math.random() - 0.5) * 4;
        const py = cy + Math.sin(a) * R * wob + (Math.random() - 0.5) * 4;
        a === -0.3 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.stroke();
    }
    x.globalAlpha = 1;
    x.fillStyle = '#9e2b25'; x.beginPath(); x.arc(w * 0.72, h * 0.74, 22, 0, Math.PI * 2); x.fill();
  },

  organic(x, w, h) {
    x.fillStyle = '#16291a'; x.fillRect(0, 0, w, h);
    const cols = ['#2f6b3a', '#4f9a4d', '#8cc06a', '#bfe089', '#cfae5a'];
    for (let i = 0; i < 9; i++) {
      x.fillStyle = cols[i % cols.length];
      x.globalAlpha = 0.55 + Math.random() * 0.3;
      const cx = Math.random() * w, cy = Math.random() * h, rad = w * (0.08 + Math.random() * 0.14);
      x.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.4) {
        const rr = rad * (0.7 + Math.sin(a * 3 + i) * 0.3);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        a === 0 ? x.moveTo(px, py) : x.quadraticCurveTo(cx + Math.cos(a - 0.2) * rr * 1.1, cy + Math.sin(a - 0.2) * rr * 1.1, px, py);
      }
      x.closePath(); x.fill();
    }
    x.globalAlpha = 1;
  },
};

/* ─────────────────────────────────────────────────────
 *  이벤트 / 인터랙션
 * ──────────────────────────────────────────────────── */
function bindEvents(container) {
  const THREE = _THREE;

  // CSS 배경 레이어 패럴렉스: 레이어마다 이동량을 다르게 줘 깊이감
  bgParallax = [...container.querySelectorAll('.gal-bg__layer')].map((el, i) => ({
    qx: _gsap.quickTo(el, 'x', { duration: 1.0, ease: 'power2.out' }),
    qy: _gsap.quickTo(el, 'y', { duration: 1.0, ease: 'power2.out' }),
    f: (i + 1) * 26,   // 뒤 레이어일수록 더 크게 이동
  }));

  onPointerMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    bgParallax.forEach((p) => { p.qx(-pointer.x * p.f); p.qy(pointer.y * p.f); });
    if (focusBusy || selected) return;
    updateHover();
  };

  onClick = (e) => {
    if (focusBusy) return;
    const r = renderer.domElement.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    if (selected) return; // 패널은 닫기 버튼/배경으로 닫음
    ndc.set(pointer.x, pointer.y);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(frames, true)[0];
    if (hit) selectFrame(hit.object.userData.frame);
  };

  onResize = () => {
    if (!renderer) return;
    const W = stageEl.clientWidth, H = stageEl.clientHeight;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };

  onKey = (e) => { if (e.key === 'Escape' && selected) deselectFrame(); };

  window.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  container.querySelector('#galClose').addEventListener('click', deselectFrame);
  dimEl.addEventListener('click', deselectFrame);
}

function updateHover() {
  ndc.set(pointer.x, pointer.y);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(frames, true)[0];
  const frame = hit ? hit.object.userData.frame : null;
  if (frame === hovered) return;
  if (hovered) _gsap.to(hovered.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'power2.out' });
  hovered = frame;
  if (hovered) _gsap.to(hovered.scale, { x: 1.09, y: 1.09, z: 1.09, duration: 0.4, ease: 'power2.out' });
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
}

function selectFrame(frame) {
  if (!frame || selected) return;
  selected = frame;
  focusBusy = true;
  frame.userData.floating = false;
  lenis && lenis.stop();              // 회전 잠금
  if (hovered) { _gsap.to(hovered.scale, { x: 1, y: 1, z: 1, duration: 0.3 }); hovered = null; }
  renderer.domElement.style.cursor = 'default';

  // 그룹 → 씬으로 reparent(월드 변환 유지) 후 카메라 앞으로 이동
  scene.attach(frame);

  // 뷰포트 높이에 맞춰 포커스 스케일을 동적 계산 (항상 화면에 꽉 차되 잘리지 않게)
  const THREE = _THREE;
  const isNarrow = stageEl.clientWidth < 760;
  const focusZ = 6.8;
  const d = CAM_Z - focusZ;
  const visH = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ratio = isNarrow ? 0.5 : 0.84;
  const scale = (visH * ratio) / frame.userData.frameH;
  const focusX = isNarrow ? 0 : -1.1;
  const focusY = isNarrow ? 1.2 : 0;

  _gsap.to(frame.position, { x: focusX, y: focusY, z: focusZ, duration: 1.0, ease: 'power3.inOut' });
  _gsap.to(frame.rotation, { x: 0, y: 0, z: 0, duration: 1.0, ease: 'power3.inOut' });
  _gsap.to(frame.scale, { x: scale, y: scale, z: scale, duration: 1.0, ease: 'power3.inOut',
    onComplete: () => { focusBusy = false; } });

  // 주변 작품 디밍
  frames.forEach((f) => {
    if (f === frame) return;
    eachMat(f, (m) => _gsap.to(m, { opacity: 0.12, duration: 0.8, ease: 'power2.out' }));
  });

  // 배경 어둡게 + 패널 열기
  dimEl.style.visibility = 'visible';
  dimEl.style.pointerEvents = 'auto';
  _gsap.to(dimEl, { opacity: 1, duration: 0.7 });
  openPanel(frame.userData.data, frame.userData.index);
}

function deselectFrame() {
  if (!selected || focusBusy) return;
  const frame = selected;
  focusBusy = true;
  closePanel();

  _gsap.to(dimEl, { opacity: 0, duration: 0.6, onComplete: () => {
    dimEl.style.visibility = 'hidden';
    dimEl.style.pointerEvents = 'none';
  } });

  // 주변 작품 복원
  frames.forEach((f) => {
    if (f === frame) return;
    eachMat(f, (m) => _gsap.to(m, { opacity: 1, duration: 0.7, ease: 'power2.out' }));
  });

  // 씬 → 그룹으로 reparent 후 원래 트랙 슬롯으로 복귀
  group.attach(frame);
  const home = frame.userData.home;
  _gsap.to(frame.position, { x: home.x, y: home.y, z: home.z, duration: 0.9, ease: 'power3.inOut' });
  _gsap.to(frame.rotation, { x: home.rx, y: home.ry, z: home.rz, duration: 0.9, ease: 'power3.inOut' });
  _gsap.to(frame.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'power3.inOut', onComplete: () => {
    frame.userData.floating = true;
    selected = null;
    focusBusy = false;
    lenis && lenis.start();
    renderer.domElement.style.cursor = 'grab';
  } });
}

function eachMat(frame, fn) {
  frame.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(fn);
  });
}

function openPanel(art, index) {
  panelEl.querySelector('.gal-panel__no').textContent =
    `NO. ${String(index + 1).padStart(2, '0')} / ${String(ARTWORKS.length).padStart(2, '0')}`;
  panelEl.querySelector('.gal-panel__title').textContent = art.title;
  panelEl.querySelector('.artist').textContent = art.artist;
  panelEl.querySelector('.year').textContent = `· ${art.year}`;
  panelEl.querySelector('.gal-panel__medium').textContent = art.medium;
  panelEl.querySelector('.gal-panel__desc').textContent = art.desc;

  panelEl.style.visibility = 'visible';
  panelEl.style.pointerEvents = 'auto';
  const isNarrow = stageEl.clientWidth < 760;
  _gsap.fromTo(panelEl,
    { opacity: 0, x: isNarrow ? 0 : 40, y: isNarrow ? 40 : '-50%' },
    { opacity: 1, x: 0, y: isNarrow ? 0 : '-50%', duration: 0.7, delay: 0.35, ease: 'power3.out' });
  _gsap.fromTo(panelEl.querySelectorAll('.gal-panel__no, .gal-panel__title, .gal-panel__meta, .gal-panel__medium, .gal-panel__rule, .gal-panel__desc'),
    { opacity: 0, y: 16 },
    { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, delay: 0.5, ease: 'power2.out' });
}

function closePanel() {
  const isNarrow = stageEl.clientWidth < 760;
  _gsap.to(panelEl, {
    opacity: 0, x: isNarrow ? 0 : 30, y: isNarrow ? 30 : '-50%', duration: 0.4, ease: 'power2.in',
    onComplete: () => { panelEl.style.visibility = 'hidden'; panelEl.style.pointerEvents = 'none'; },
  });
}

/* ─────────────────────────────────────────────────────
 *  렌더 루프 — 부유 애니메이션 + 카메라 패럴랙스
 * ──────────────────────────────────────────────────── */
function startLoop() {
  clock = new _THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();

    for (const f of frames) {
      if (!f.userData.floating) continue;
      const u = f.userData;
      f.position.y = u.trackY + Math.sin(t * u.floatSpeed + u.floatPhase) * u.floatAmp;
      f.rotation.z = Math.sin(t * 0.3 + u.floatPhase) * 0.012;
    }

    // 먼지 입자 느린 드리프트 (레이어마다 속도 차 → 깊이)
    dusts.forEach((d, i) => {
      d.rotation.y = t * (0.012 + i * 0.01);
      d.position.y = Math.sin(t * 0.12 + i) * 0.25;
    });

    // 카메라 패럴랙스 (선택 중엔 거의 정지) — 입자/액자 사이 시차 발생
    const k = selected ? 0.04 : 0.65;
    camera.position.x += (pointer.x * k - camera.position.x) * 0.045;
    camera.position.y += (pointer.y * k * 0.6 - camera.position.y) * 0.045;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  loop();
}

export default {
  id: 'gallery',
  title: 'Art Gallery',
  icon: '🖼️',
  description: '인터랙티브 3D 아트 갤러리 (Three.js · GSAP · ScrollTrigger · Lenis)',
  init,
  destroy,
};
