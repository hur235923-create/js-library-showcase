/**
 * Three.js — Immersive 3D Hero Section
 *
 * 연출 요소
 *  - 어두운 청록(teal) 미래 공간 + FogExp2 안개로 깊이감
 *  - 공중에 부유하는 거대한 콘크리트 큐브 (서로 다른 속도로 회전·부유)
 *  - 중앙의 우주비행사 (프리미티브로 스타일라이즈, 외부 모델 의존 없음)
 *  - Reflector 기반 반사 바닥
 *  - 배경 네온 블루 발광 패널 + UnrealBloom으로 글로우
 *  - RoomEnvironment 환경맵으로 프리미엄 반사
 *  - GSAP 시네마틱 카메라 인트로 + 무한 오빗 드리프트
 *  - 마우스 패럴랙스로 시점 미세 반응
 *
 *  three / three/addons/ 는 index.html 의 import map 으로 해석됩니다.
 */

const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm';
// 드래곤 컨셉 이미지 (모듈 기준 상대 경로 → 페이지 위치와 무관하게 해석)
const ASSET = new URL('./assets/dragon.png', import.meta.url).href;

// ── 모듈 상태 (destroy 정리용) ──────────────────────
let alive = false;
let raf = null;
let renderer, scene, camera, composer, clock;
let THREE, gsap, ctx, pmrem;
let cubes = [], astronaut = null, hero = null;
let onPointerMove = null, onResize = null;
const mouse = { x: 0, y: 0 };          // 보간된 현재값
const target = { x: 0, y: 0 };          // 마우스 목표값
const cam = { theta: -0.3, dist: 11, y: 3.2, lookY: 1.4 }; // GSAP가 조작

// ── 드래곤 3D 뷰어 (마우스로 돌려보기) ───────────────
let vRenderer, vScene, vCamera, vControls, vPmrem, vCard = null;
let viewerStage = null, viewerResumeTimer = null;
let io = null;                              // 가시성 옵저버 (off-screen 렌더 중단)
let heroVisible = true, viewerVisible = false;

async function init(container) {
  alive = true;
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Three.js 씬 구성 중…</p>
    </div>`;

  // ── 의존성 동적 로드 ──────────────────────────────
  let Reflector, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, OrbitControls;
  try {
    THREE = await import('three');
    ({ gsap } = await import(GSAP_URL));
    ({ Reflector }       = await import('three/addons/objects/Reflector.js'));
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
    ({ EffectComposer }  = await import('three/addons/postprocessing/EffectComposer.js'));
    ({ RenderPass }      = await import('three/addons/postprocessing/RenderPass.js'));
    ({ UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js'));
    ({ OutputPass }      = await import('three/addons/postprocessing/OutputPass.js'));
    ({ OrbitControls }   = await import('three/addons/controls/OrbitControls.js'));
  } catch (e) {
    container.innerHTML = `
      <div class="loading-state">
        <p class="load-error">3D 라이브러리를 불러오지 못했습니다.<br>
        네트워크 연결을 확인하세요.<br><small>${e.message}</small></p>
      </div>`;
    return;
  }

  if (!alive || !container.isConnected) return; // 로딩 중 탭 이동됨

  // ── DOM ───────────────────────────────────────────
  container.innerHTML = `
    <div class="hero3d" id="hero3d">
      <div class="hero3d-overlay">
        <span class="hero3d-kicker">THREE.JS · IMMERSIVE 3D</span>
        <h1 class="hero3d-title">미지의 <span>공간</span>으로</h1>
        <p class="hero3d-sub">콘크리트 모놀리스가 부유하는 심해빛 격납고.
           네온이 스며든 정적 속에서 한 명의 탐사자가 당신을 기다립니다.</p>
        <div class="hero3d-hint">↕ 마우스를 움직여 시점을 탐험하세요</div>
      </div>
    </div>

    <section class="dragon-concept">
      <div class="dragon-concept__text">
        <span class="dragon-kicker">CONCEPT ART</span>
        <h2 class="dragon-title">작은 수호룡, <span>아쿠아</span></h2>
        <p class="dragon-sub">격납고의 정적 속에서 깨어난 아기 드래곤.
           청록빛 비늘과 호박색 눈동자를 가진 이 작은 생명체는
           탐사자의 곁을 지키는 수호룡입니다. 4-뷰 레퍼런스로 형태를 정리했습니다.</p>
      </div>
      <figure class="dragon-concept__art">
        <img src="${ASSET}" alt="아기 드래곤 아쿠아 — 4-뷰 컨셉 아트" loading="lazy" />
        <figcaption>4-View Turnaround Reference</figcaption>
      </figure>
    </section>

    <section class="dragon-viewer">
      <div class="dragon-viewer__head">
        <span class="dragon-kicker">INTERACTIVE 3D</span>
        <h2 class="dragon-title">마우스로 <span>돌려보기</span></h2>
        <p class="dragon-sub">받침대 위의 전시물을 드래그해 회전하고, 휠로 확대·축소하세요.
           잠시 멈추면 다시 천천히 자동 회전합니다.</p>
      </div>
      <div class="dragon-viewer__stage" id="dragonViewer">
        <span class="dragon-viewer__hint">⟳ 드래그하여 회전 · 휠로 줌</span>
      </div>
    </section>`;
  hero = container.querySelector('#hero3d');
  viewerStage = container.querySelector('#dragonViewer');

  _buildScene(Reflector, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass);
  _buildViewer(OrbitControls, RoomEnvironment);
  _bindEvents();
  _animate();
  _intro();
}

function destroy() {
  alive = false;
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (ctx) { ctx.revert(); ctx = null; }
  if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
  if (onResize) window.removeEventListener('resize', onResize);
  onPointerMove = onResize = null;
  if (io) { io.disconnect(); io = null; }
  if (viewerResumeTimer) { clearTimeout(viewerResumeTimer); viewerResumeTimer = null; }

  // 공통 리소스 해제 헬퍼
  const disposeScene = (s) => {
    if (!s) return;
    s.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
          m.dispose();
        });
      }
    });
  };

  // ── 히어로 씬 ──────────────────────────────────────
  disposeScene(scene);
  if (pmrem) { pmrem.dispose(); pmrem = null; }
  if (composer) { composer.dispose?.(); composer = null; }
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement?.remove();
    renderer = null;
  }
  scene = camera = clock = hero = null;
  cubes = []; astronaut = null;

  // ── 드래곤 뷰어 씬 ─────────────────────────────────
  if (vControls) { vControls.dispose(); vControls = null; }
  disposeScene(vScene);
  if (vPmrem) { vPmrem.dispose(); vPmrem = null; }
  if (vRenderer) {
    vRenderer.dispose();
    vRenderer.forceContextLoss?.();
    vRenderer.domElement?.remove();
    vRenderer = null;
  }
  vScene = vCamera = vCard = viewerStage = null;
  heroVisible = true; viewerVisible = false;
}

/* ─────────────────────────────────────────────────────
 *  씬 구성
 * ──────────────────────────────────────────────────── */
function _buildScene(Reflector, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass) {
  const W = hero.clientWidth, H = hero.clientHeight;

  // 렌더러
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  hero.appendChild(renderer.domElement);

  // 씬 + 안개
  scene = new THREE.Scene();
  const bg = new THREE.Color(0x06141a);
  scene.background = bg;
  scene.fog = new THREE.FogExp2(0x06141a, 0.035);

  // 카메라
  camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  camera.position.set(0, cam.y, cam.dist);

  // 환경맵 (부드러운 반사)
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ── 라이트 ───────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x9fdfe8, 0x04101a, 0.45));

  const key = new THREE.SpotLight(0xbfeaff, 60, 60, Math.PI / 5, 0.4, 1.2);
  key.position.set(5, 14, 8);
  key.target.position.set(0, 1.4, 0);
  scene.add(key, key.target);

  const rimL = new THREE.PointLight(0x2f7bff, 50, 40, 2); // 네온 스필 (좌)
  rimL.position.set(-9, 5, -6);
  const rimR = new THREE.PointLight(0x18d0e0, 40, 40, 2); // 청록 스필 (우)
  rimR.position.set(9, 4, -4);
  scene.add(rimL, rimR);

  // ── 반사 바닥 ────────────────────────────────────
  const mirror = new Reflector(new THREE.PlaneGeometry(120, 120), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x0a1c22,
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);

  // 바닥 위 옅은 그라데이션(반사 과함 완화 + 비네팅)
  const fade = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({
      color: 0x06141a, transparent: true, opacity: 0.55,
      depthWrite: false,
    })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.y = 0.001;
  scene.add(fade);

  // ── 콘크리트 큐브들 ──────────────────────────────
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x8b9094, roughness: 0.82, metalness: 0.04,
  });
  const layout = [
    { x: -6.5, y: 4.5, z: -3.0, s: 2.6 },
    { x:  6.2, y: 5.6, z: -2.0, s: 2.2 },
    { x: -3.8, y: 7.2, z: -5.0, s: 1.6 },
    { x:  4.0, y: 3.2, z: -4.5, s: 1.9 },
    { x: -7.8, y: 2.6, z: -6.5, s: 1.4 },
    { x:  8.0, y: 8.0, z: -6.0, s: 1.7 },
    { x:  0.5, y: 9.2, z: -7.5, s: 2.0 },
    { x: -2.0, y: 3.0, z: 4.5,  s: 1.3 },
  ];
  layout.forEach((c) => {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(c.s, c.s, c.s), concrete);
    cube.position.set(c.x, c.y, c.z);
    cube.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    cube.userData = {
      baseY: c.y,
      rx: (Math.random() - 0.5) * 0.004,
      ry: (Math.random() - 0.5) * 0.006,
      fa: 0.3 + Math.random() * 0.5,        // 부유 진폭
      fs: 0.3 + Math.random() * 0.5,        // 부유 속도
      ph: Math.random() * Math.PI * 2,      // 위상
    };
    scene.add(cube);
    cubes.push(cube);
  });

  // ── 네온 발광 패널 (배경) ────────────────────────
  const panelData = [
    { x: -12, y: 5, z: -12, w: 0.4, h: 11, color: 0x2f7bff },
    { x:  12, y: 6, z: -11, w: 0.4, h: 13, color: 0x18d0e0 },
    { x:  -5, y: 8, z: -16, w: 7,   h: 0.4, color: 0x2f7bff },
    { x:   6, y: 2, z: -15, w: 5,   h: 0.4, color: 0x18d0e0 },
    { x: -16, y: 3, z: -6,  w: 0.4, h: 7,   color: 0x18d0e0 },
    { x:  16, y: 4, z: -5,  w: 0.4, h: 9,   color: 0x2f7bff },
  ];
  panelData.forEach((p) => {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(p.w, p.h),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: new THREE.Color(p.color),
        emissiveIntensity: 3.2,
        roughness: 0.4, metalness: 0,
      })
    );
    panel.position.set(p.x, p.y, p.z);
    scene.add(panel);
  });

  // ── 우주비행사 ───────────────────────────────────
  astronaut = _buildAstronaut();
  scene.add(astronaut);

  // ── 포스트프로세싱 (블룸) ────────────────────────
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* 프리미티브 기반 스타일라이즈 우주비행사 */
function _buildAstronaut() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xb6c1c8, roughness: 0.62, metalness: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.6, metalness: 0.3 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0a1418, roughness: 0.08, metalness: 1.0,
    emissive: new THREE.Color(0x113844), emissiveIntensity: 0.6,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: new THREE.Color(0x3ad6e0), emissiveIntensity: 2.6,
  });

  const add = (geo, mat, x, y, z, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    g.add(m);
    return m;
  };

  // 다리
  add(new THREE.CapsuleGeometry(0.17, 0.6, 6, 12), suit, -0.22, 0.42, 0);
  add(new THREE.CapsuleGeometry(0.17, 0.6, 6, 12), suit,  0.22, 0.42, 0);
  add(new THREE.CylinderGeometry(0.19, 0.16, 0.16, 12), dark, -0.22, 0.08, 0.04); // 부츠
  add(new THREE.CylinderGeometry(0.19, 0.16, 0.16, 12), dark,  0.22, 0.08, 0.04);

  // 몸통
  add(new THREE.CapsuleGeometry(0.36, 0.55, 8, 16), suit, 0, 1.15, 0);
  // 가슴 컨트롤 패널
  add(new THREE.BoxGeometry(0.26, 0.18, 0.06), accent, 0, 1.18, 0.34);

  // 백팩
  add(new THREE.BoxGeometry(0.62, 0.7, 0.34), dark, 0, 1.2, -0.36);

  // 팔
  add(new THREE.CapsuleGeometry(0.14, 0.5, 6, 12), suit, -0.5, 1.2, 0, [0, 0,  0.32]);
  add(new THREE.CapsuleGeometry(0.14, 0.5, 6, 12), suit,  0.5, 1.2, 0, [0, 0, -0.32]);
  add(new THREE.SphereGeometry(0.15, 14, 12), dark, -0.64, 0.86, 0); // 장갑
  add(new THREE.SphereGeometry(0.15, 14, 12), dark,  0.64, 0.86, 0);

  // 헬멧 + 바이저
  add(new THREE.SphereGeometry(0.33, 24, 20), suit, 0, 1.86, 0);
  const visor = add(new THREE.SphereGeometry(0.27, 24, 20), visorMat, 0, 1.86, 0.1);
  visor.scale.set(1, 0.82, 0.7);

  // 어깨 LED 링
  add(new THREE.TorusGeometry(0.2, 0.025, 8, 24), accent, 0, 1.5, 0, [Math.PI / 2, 0, 0]);

  return g;
}

/* ─────────────────────────────────────────────────────
 *  드래곤 3D 뷰어 (OrbitControls 로 마우스 회전)
 *  - 컨셉 이미지를 받침대 위의 입체 전시물(액자형 카드)로 띄운다.
 *  - 별도 renderer/scene 이지만 메인 루프(_animate)에서 함께 렌더한다.
 * ──────────────────────────────────────────────────── */
function _buildViewer(OrbitControls, RoomEnvironment) {
  const W = viewerStage.clientWidth, H = viewerStage.clientHeight;

  vRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  vRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  vRenderer.setSize(W, H);
  vRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  vRenderer.toneMappingExposure = 1.1;
  viewerStage.appendChild(vRenderer.domElement);

  vScene = new THREE.Scene();
  vScene.fog = new THREE.FogExp2(0x06141a, 0.018);

  // 환경맵 (액자 메탈에 프리미엄 반사)
  vPmrem = new THREE.PMREMGenerator(vRenderer);
  vScene.environment = vPmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  vCamera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  vCamera.position.set(1.4, 1.2, 7.4);

  // 라이트 (히어로와 동일한 청록 무드)
  vScene.add(new THREE.HemisphereLight(0x9fdfe8, 0x04101a, 0.5));
  const key = new THREE.SpotLight(0xbfeaff, 60, 50, Math.PI / 5, 0.5, 1.2);
  key.position.set(4, 9, 6); key.target.position.set(0, 0.4, 0);
  vScene.add(key, key.target);
  const rimL = new THREE.PointLight(0x2f7bff, 34, 30, 2); rimL.position.set(-6, 2, -3);
  const rimR = new THREE.PointLight(0x18d0e0, 28, 30, 2); rimR.position.set(6, 3, -2);
  vScene.add(rimL, rimR);

  // ── 전시 카드 (드래곤 이미지를 입체 액자에) ──────────
  const maxAniso = vRenderer.capabilities.getMaxAnisotropy();
  const loader = new THREE.TextureLoader();

  // 앞면: 좌측 메인 뷰만 크롭해서 사용
  const texFront = loader.load(ASSET);
  texFront.colorSpace = THREE.SRGBColorSpace;
  texFront.anisotropy = maxAniso;
  texFront.repeat.set(0.605, 1.0);
  texFront.offset.set(0.0, 0.0);
  // 뒷면: 4-뷰 레퍼런스 시트 전체
  const texBack = loader.load(ASSET);
  texBack.colorSpace = THREE.SRGBColorSpace;
  texBack.anisotropy = maxAniso;

  const PW = 2.78, PH = 4.6, D = 0.26;        // 크롭 비율(0.605:1)에 맞춘 카드
  vCard = new THREE.Group();
  vCard.position.y = 0.5;

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(PW + 0.34, PH + 0.34, D),
    new THREE.MeshStandardMaterial({ color: 0x16323a, roughness: 0.3, metalness: 0.95 })
  );
  vCard.add(frame);

  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    new THREE.MeshBasicMaterial({ map: texFront })
  );
  front.position.z = D / 2 + 0.003;
  vCard.add(front);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PH),
    new THREE.MeshStandardMaterial({ map: texBack, color: 0x8a979c, roughness: 0.7, metalness: 0.0 })
  );
  back.position.z = -(D / 2 + 0.003);
  back.rotation.y = Math.PI;
  vCard.add(back);

  vScene.add(vCard);

  // ── 받침대 ───────────────────────────────────────
  const ped = new THREE.Group();
  ped.position.y = -2.12;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.95, 2.3, 0.42, 56),
    new THREE.MeshStandardMaterial({ color: 0x0c1c22, roughness: 0.4, metalness: 0.75 })
  );
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.62, 1.62, 0.1, 56),
    new THREE.MeshStandardMaterial({ color: 0x0a161b, roughness: 0.2, metalness: 0.9 })
  );
  top.position.y = 0.25;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.66, 0.03, 12, 80),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0x3ad6e0), emissiveIntensity: 3 })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  ped.add(disc, top, ring);
  vScene.add(ped);

  // 바닥 (그라운딩 + 깊이)
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 64),
    new THREE.MeshStandardMaterial({ color: 0x05121a, roughness: 0.55, metalness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.32;
  vScene.add(floor);

  // ── OrbitControls ────────────────────────────────
  vControls = new OrbitControls(vCamera, vRenderer.domElement);
  vControls.enableDamping = true;
  vControls.dampingFactor = 0.08;
  vControls.enablePan = false;
  vControls.minDistance = 4.5;
  vControls.maxDistance = 11;
  vControls.minPolarAngle = Math.PI * 0.12;
  vControls.maxPolarAngle = Math.PI * 0.9;
  vControls.target.set(0, 0.4, 0);
  vControls.autoRotate = true;
  vControls.autoRotateSpeed = 1.1;
  vControls.update();

  // 사용자가 잡으면 자동회전 멈추고, 손을 떼고 잠시 뒤 재개
  vControls.addEventListener('start', () => {
    vControls.autoRotate = false;
    viewerStage.classList.add('is-grabbing');
    if (viewerResumeTimer) clearTimeout(viewerResumeTimer);
  });
  vControls.addEventListener('end', () => {
    viewerStage.classList.remove('is-grabbing');
    if (viewerResumeTimer) clearTimeout(viewerResumeTimer);
    viewerResumeTimer = setTimeout(() => { if (alive && vControls) vControls.autoRotate = true; }, 2500);
  });
}

/* ─────────────────────────────────────────────────────
 *  이벤트 / 루프 / 애니메이션
 * ──────────────────────────────────────────────────── */
function _bindEvents() {
  onPointerMove = (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  onResize = () => {
    if (hero && renderer) {
      const W = hero.clientWidth, H = hero.clientHeight;
      renderer.setSize(W, H);
      composer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
    if (viewerStage && vRenderer) {
      const W = viewerStage.clientWidth, H = viewerStage.clientHeight;
      vRenderer.setSize(W, H);
      vCamera.aspect = W / H;
      vCamera.updateProjectionMatrix();
    }
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('resize', onResize);

  // 화면 밖 섹션은 렌더를 멈춰 GPU/배터리 절약
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === hero) heroVisible = e.isIntersecting;
      else if (e.target === viewerStage) viewerVisible = e.isIntersecting;
    }
  }, { threshold: 0.04 });
  io.observe(hero);
  io.observe(viewerStage);
}

function _animate() {
  clock = clock || new THREE.Clock();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();

    // ── 히어로 씬 (화면에 보일 때만) ──────────────────
    if (heroVisible && composer) {
      // 마우스 보간
      mouse.x += (target.x - mouse.x) * 0.045;
      mouse.y += (target.y - mouse.y) * 0.045;

      // 큐브 회전·부유
      for (const c of cubes) {
        c.rotation.x += c.userData.rx;
        c.rotation.y += c.userData.ry;
        c.position.y = c.userData.baseY + Math.sin(t * c.userData.fs + c.userData.ph) * c.userData.fa;
      }

      // 우주인 미세 아이들 모션
      if (astronaut) {
        astronaut.position.y = Math.sin(t * 0.6) * 0.06;
        astronaut.rotation.y = Math.sin(t * 0.18) * 0.18;
      }

      // 카메라 (GSAP 오빗 + 마우스 패럴랙스)
      const cx = Math.sin(cam.theta) * cam.dist;
      const cz = Math.cos(cam.theta) * cam.dist;
      camera.position.x = cx + mouse.x * 1.6;
      camera.position.y = cam.y + mouse.y * 0.9;
      camera.position.z = cz;
      camera.lookAt(0, cam.lookY, 0);

      composer.render();
    }

    // ── 드래곤 뷰어 씬 (화면에 보일 때만) ─────────────
    if (viewerVisible && vRenderer) {
      vCard.position.y = 0.5 + Math.sin(t * 0.8) * 0.06; // 부드러운 부유
      vControls.update();                                 // 댐핑/자동회전
      vRenderer.render(vScene, vCamera);
    }
  };
  loop();
}

/* GSAP 시네마틱 인트로 + 무한 오빗 드리프트 */
function _intro() {
  ctx = gsap.context(() => {
    // 캔버스 페이드인
    gsap.to(renderer.domElement, { opacity: 1, duration: 1.6, ease: 'power2.out' });

    // 카메라 돌리인 (멀리 위 → 안착)
    gsap.from(cam, { dist: 22, y: 9, lookY: 3.2, duration: 2.6, ease: 'power3.out' });

    // 우주인 등장
    if (astronaut) {
      astronaut.scale.set(0.0001, 0.0001, 0.0001);
      gsap.to(astronaut.scale, { x: 1, y: 1, z: 1, duration: 1.6, delay: 0.5, ease: 'elastic.out(1, 0.6)' });
    }

    // 큐브 어셈블 (위에서 낙하 + 스케일업, 스태거)
    cubes.forEach((c, i) => {
      const fromY = c.userData.baseY + 8;
      gsap.from(c.position, { y: fromY, duration: 1.8, delay: 0.2 + i * 0.08, ease: 'power3.out' });
      gsap.from(c.scale, { x: 0, y: 0, z: 0, duration: 1.2, delay: 0.2 + i * 0.08, ease: 'back.out(1.4)' });
    });

    // 오버레이 텍스트 스태거 등장
    gsap.from('.hero3d-overlay > *', {
      y: 26, opacity: 0, duration: 1, delay: 1.1, stagger: 0.12, ease: 'power2.out',
    });

    // 무한 오빗 드리프트
    gsap.to(cam, {
      theta: 0.35, duration: 16, ease: 'sine.inOut',
      yoyo: true, repeat: -1, delay: 2.6,
    });
  }, hero);
}

export default {
  id: 'three',
  title: 'Three.js Hero',
  icon: '🪐',
  description: '몰입형 3D 히어로 섹션',
  init,
  destroy,
};
