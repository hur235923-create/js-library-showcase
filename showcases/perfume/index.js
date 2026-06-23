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
let _gsap = null, _ST = null, _THREE = null;
let lenis = null;
let ctx = null;
let tickerFn = null;
let cssLink = null;
let bodyClassAdded = false;

// 섹션1 Three.js 3D 씬 리소스
let r3 = null; // { renderer, scene, camera, bottle, clock, raf, pmrem, onResize }

async function init(container) {
  alive = true;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Perfume Showcase 로드 중…</p>
    </div>`;

  // ── 1. 라이브러리 동적 로드 ───────────────────────
  // Three.js / 애드온은 index.html 의 import map 으로 해석됩니다.
  let Lenis, RoomEnvironment;
  try {
    ({ gsap: _gsap } = await import(GSAP_URL));
    ({ ScrollTrigger: _ST } = await import(ST_URL));
    Lenis = (await import(LENIS_URL)).default;
    _THREE = await import('three');
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
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
    buildObjectSection(RoomEnvironment);
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
  disposeReveal3D();
  cleanupStyles();
  window.scrollTo(0, 0);
  _gsap = _ST = _THREE = null;
}

/* 섹션1 Three.js 리소스 해제 */
function disposeReveal3D() {
  if (!r3) return;
  if (r3.raf) cancelAnimationFrame(r3.raf);
  if (r3.onResize) window.removeEventListener('resize', r3.onResize);
  r3.scene?.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    }
  });
  r3.pmrem?.dispose();
  r3.renderer?.dispose();
  r3.renderer?.forceContextLoss?.();
  r3.renderer?.domElement?.remove();
  r3 = null;
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
 *  2) OBJECT — Three.js 3D 향수병 + ScrollTrigger scrub
 *  CSS 병 대신 실제 3D 메쉬(유리 투과 재질)를 스크롤에 따라
 *  회전(rotation.y)·확대(scale)합니다. Apple 제품 페이지처럼
 *  scrub 관성 + 매 프레임 렌더링으로 부드럽게.
 * ──────────────────────────────────────────────────── */
function buildObjectSection(RoomEnvironment) {
  const stage = document.getElementById('reveal3d');
  if (!stage) return;
  const THREE = _THREE;

  const W = stage.clientWidth || window.innerWidth;
  const H = stage.clientHeight || window.innerHeight;

  // 렌더러 (alpha:true → 뒤의 CSS 골드 그라데이션이 비쳐 보임)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
  camera.position.set(0, 0.3, 6.4);

  // 종횡비에 맞춰 카메라 거리 보정(세로 화면일수록 뒤로) → 병이 항상 알맞게
  const fit = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.position.z = 6.4 + Math.max(0, 1 - aspect) * 7;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.2, 0);
  };
  fit();

  // 환경맵: 유리·골드 반사의 핵심 (RoomEnvironment 를 한 번 구워 사용)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // 라이트 (환경맵이 대부분을 담당, 포인트로 골드 하이라이트 보강)
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(4, 6, 5);
  const warm = new THREE.PointLight(0xffe6b0, 40, 24, 2);
  warm.position.set(-3, 2, 3);
  const cool = new THREE.PointLight(0x88bbff, 18, 24, 2);
  cool.position.set(3, -2, -3);
  scene.add(key, warm, cool);

  // 향수병 생성
  const bottle = _buildBottle3D(THREE);
  bottle.scale.setScalar(0.95);
  bottle.rotation.y = -0.3;
  scene.add(bottle);

  // 렌더 루프 (회전·스케일은 ScrollTrigger가, 부유는 여기서)
  const clock = new THREE.Clock();
  const loop = () => {
    r3.raf = requestAnimationFrame(loop);
    bottle.position.y = 0.2 + Math.sin(clock.getElapsedTime() * 0.8) * 0.05;
    renderer.render(scene, camera);
  };

  // 리사이즈 대응
  const onResize = () => { if (r3) fit(); };
  window.addEventListener('resize', onResize);

  r3 = { renderer, scene, camera, bottle, clock, pmrem, onResize, raf: null };
  loop();

  // ── ScrollTrigger: 스크롤 진행도 → 3D 회전·확대 ──
  // scrub:1 로 1초 관성을 줘 Apple 스타일의 부드러운 추적.
  const tl = _gsap.timeline({
    scrollTrigger: {
      trigger: '.s-reveal',
      start: 'top top',
      end: 'bottom bottom',     // 섹션(240vh) 전체 구간
      pin: '.s-reveal__stage',  // 회전하는 동안 stage 를 화면에 고정
      scrub: 1,
    },
  });

  // GSAP 는 Three.js 객체의 속성도 직접 트윈할 수 있습니다.
  tl.to(bottle.rotation, { y: bottle.rotation.y + Math.PI * 2, ease: 'none' }, 0)   // 한 바퀴 회전
    .to(bottle.scale, { x: 1.5, y: 1.5, z: 1.5, ease: 'none' }, 0)                  // 확대
    .fromTo('.s-reveal__caption',
      { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.2 }, 0);
}

/* 프리미엄 유리 향수병 (Three.js 프리미티브) */
function _buildBottle3D(THREE) {
  const g = new THREE.Group();

  // 유리 본체 (MeshPhysicalMaterial transmission → 진짜 유리 굴절)
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 1,            // 투과(유리)
    thickness: 1.2,
    ior: 1.45,
    transparent: true,
    attenuationColor: new THREE.Color(0xc9a24b), // 유리를 통과하며 골드빛으로
    attenuationDistance: 2.6,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.0, 0.75), glass);
  body.geometry.translate(0, 0, 0);
  g.add(body);

  // 내부 향수 액체 (하단 채움)
  const liquid = new THREE.MeshPhysicalMaterial({
    color: 0xb5762a, roughness: 0.25, transmission: 0.55, thickness: 1.0,
    ior: 1.4, transparent: true,
    attenuationColor: new THREE.Color(0x7a4a12), attenuationDistance: 0.6,
  });
  const liquidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.1, 0.62), liquid);
  liquidMesh.position.y = -0.42;
  g.add(liquidMesh);

  // 골드 재질 (캡 · 넥 · 라벨 테두리)
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc9a24b, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.4,
  });
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), gold);
  neck.position.y = 1.11;
  g.add(neck);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.56, 0.5), gold);
  cap.position.y = 1.5;
  g.add(cap);

  // 라벨 (CanvasTexture 로 브랜드 각인, 앞/뒤 양면)
  const labelTex = _makeLabelTexture(THREE);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  const labelGeo = new THREE.PlaneGeometry(1.05, 1.05);
  const labelF = new THREE.Mesh(labelGeo, labelMat);
  labelF.position.set(0, 0.05, 0.381);
  g.add(labelF);
  const labelB = new THREE.Mesh(labelGeo, labelMat);
  labelB.position.set(0, 0.05, -0.381);
  labelB.rotation.y = Math.PI;
  g.add(labelB);

  return g;
}

/* 라벨용 캔버스 텍스처 (AURUM / EAU DE PARFUM) */
function _makeLabelTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(233,211,154,0.85)';
  x.lineWidth = 2;
  x.strokeRect(34, 96, 188, 66);
  x.textAlign = 'center';
  x.fillStyle = '#e9d39a';
  x.font = '600 44px "Cormorant Garamond", Georgia, serif';
  x.fillText('AURUM', 128, 132);
  x.fillStyle = '#f3ead6';
  x.font = '500 13px Inter, sans-serif';
  x.fillText('E A U   D E   P A R F U M', 128, 152);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
