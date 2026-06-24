/**
 * ProjectSystem — 프로젝트를 우주에 떠 있는 천체로 전시
 *
 * 카드/그리드 대신 각 프로젝트를 발광하는 행성으로 공간에 배치한다.
 *   - 비행 중 가까워지면 라벨(프로젝트 정보)이 떠오름 (proximity)
 *   - 천체/라벨을 선택하면 카메라가 그 천체로 활공(onOpen→CameraRig.focusOn)하고
 *     상세 패널이 열림
 *   - 선택 해제 시 다시 여행(onClose→CameraRig.release)
 *
 * 3D(천체)와 DOM(라벨·패널)을 한곳에 캡슐화하되, 카메라 제어는 콜백으로
 * 씬에 위임해 결합도를 낮춘다.
 */
import { planetVertex, planetFragment } from '../shaders/planet.js';
import { disposeObject } from '../core/disposal.js';

const PROJECTS = [
  { name: 'AURORA',  tag: 'Generative Identity', year: 2024, role: 'Art Direction · WebGL',
    color: 0x6ea8ff, pos: [150, 70, -120], radius: 24, ring: false,
    desc: '데이터의 흐름을 실시간으로 빛의 장막으로 번역한 생성형 아이덴티티. 매 순간 다른 형상으로 피어난다.' },
  { name: 'TIDES',   tag: 'Realtime Data Sculpture', year: 2023, role: 'Creative Dev',
    color: 0xff8a5c, pos: [-180, 52, -240], radius: 31, ring: true,
    desc: '해양 관측 데이터를 조류처럼 흐르는 입자 조각으로 형상화. 보이지 않던 바다의 리듬을 만질 수 있는 형태로.' },
  { name: 'MONOLITH', tag: 'Spatial Web Experience', year: 2024, role: 'Lead Engineer',
    color: 0x9b7bff, pos: [125, 96, -360], radius: 22, ring: false,
    desc: '스크롤이 곧 공간 이동이 되는 몰입형 웹. 사용자는 페이지를 넘기지 않고 하나의 구조물을 통과한다.' },
  { name: 'NEBULA',  tag: 'Interactive Installation', year: 2022, role: 'Visual Artist',
    color: 0x4fd6c0, pos: [-150, 60, -470], radius: 35, ring: true,
    desc: '관객의 움직임에 반응해 응축·확산하는 성운형 인터랙티브 설치. 존재가 곧 붓이 되는 공간.' },
  { name: 'ECHO',    tag: 'Sound-Reactive Visuals', year: 2023, role: 'Audio-Visual',
    color: 0xff6fae, pos: [95, 112, -560], radius: 20, ring: false,
    desc: '소리의 파형을 빛의 파동으로 되돌려주는 오디오-비주얼 작업. 들리는 것과 보이는 것의 경계를 지운다.' },
];

const ACTIVATE = 380;  // 라벨이 또렷해지는 거리
const VISIBLE = 760;   // 라벨이 보이기 시작하는 거리

export class ProjectSystem {
  constructor(ctx, uiRoot) {
    this.ctx = ctx;
    this.uiRoot = uiRoot;
    this.group = new ctx.THREE.Group();
    this.items = [];       // { data, mesh, halo, base:Vector3, focusPos, focusLook, label, active }
    this.meshes = [];
    this.focused = -1;
    this.onOpen = null;    // (item) => void  — 씬이 카메라 포커스 처리
    this.onClose = null;   // () => void
    this._v = new ctx.THREE.Vector3();
    this._ndc = new ctx.THREE.Vector2();
    this._ray = new ctx.THREE.Raycaster();
  }

  addTo(scene) {
    this._scene = scene;
    scene.add(this.group);
    this._buildBodies();
    this._buildDOM();
    this._bind();
    return this;
  }

  /* ── 천체 생성 ──────────────────────────────────── */
  _buildBodies() {
    const { THREE } = this.ctx;
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

    for (const data of PROJECTS) {
      const color = new THREE.Color(data.color);
      const g = new THREE.Group();
      const base = V(data.pos);
      g.position.copy(base);

      // 본체 (프레넬 글로우)
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color }, uTime: { value: 0 }, uActive: { value: 0 } },
        vertexShader: planetVertex,
        fragmentShader: planetFragment,
      });
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(data.radius, 4), mat);
      mesh.userData.index = this.items.length;
      g.add(mesh);
      this.meshes.push(mesh);

      // 헤일로 (가산 글로우)
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._haloTexture(color), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.9,
      }));
      halo.scale.setScalar(data.radius * 5.5);
      g.add(halo);

      // 일부 천체엔 고리
      if (data.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(data.radius * 1.5, data.radius * 2.3, 64),
          new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
          })
        );
        ring.rotation.x = Math.PI * 0.42;
        ring.rotation.y = Math.PI * 0.12;
        g.add(ring);
      }

      this.group.add(g);

      // 카메라 포커스 지점(천체를 3/4 각도로 담는 위치)
      const r = data.radius;
      const focusPos = base.clone().add(new THREE.Vector3(r * 3.0, r * 1.5, r * 4.2));
      const focusLook = base.clone();

      this.items.push({
        data, group: g, mesh, mat, halo, base,
        focusPos, focusLook, label: null,
        bob: { phase: Math.random() * Math.PI * 2, amp: 4 + Math.random() * 4, speed: 0.4 + Math.random() * 0.3 },
        active: 0,
      });
    }
  }

  _haloTexture(color) {
    const { THREE } = this.ctx;
    const s = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const x = cv.getContext('2d');
    const rgb = `${(color.r * 255) | 0}, ${(color.g * 255) | 0}, ${(color.b * 255) | 0}`;
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${rgb}, 0.9)`);
    g.addColorStop(0.25, `rgba(${rgb}, 0.35)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── DOM (라벨 + 상세 패널) ──────────────────────── */
  _buildDOM() {
    this.dom = document.createElement('div');
    this.dom.className = 'cosmos-projects';
    this.dom.innerHTML = `
      <div class="cosmos-plabels">
        ${this.items.map((it, i) => `
          <button class="cosmos-plabel" data-i="${i}" style="--c:#${it.data.color.toString(16).padStart(6, '0')}">
            <span class="cosmos-plabel__dot"></span>
            <span class="cosmos-plabel__name">${it.data.name}</span>
            <span class="cosmos-plabel__tag">${it.data.tag}</span>
            <span class="cosmos-plabel__cue">CLICK TO EXPLORE</span>
          </button>`).join('')}
      </div>
      <aside class="cosmos-detail" aria-hidden="true">
        <button class="cosmos-detail__close" aria-label="닫기">×</button>
        <span class="cosmos-detail__tag"></span>
        <h2 class="cosmos-detail__title"></h2>
        <div class="cosmos-detail__meta"><span class="y"></span><span class="role"></span></div>
        <p class="cosmos-detail__desc"></p>
        <span class="cosmos-detail__hint">아무 곳이나 클릭하거나 ESC 로 우주로 돌아갑니다</span>
      </aside>`;
    this.uiRoot.appendChild(this.dom);

    this.labelEls = [...this.dom.querySelectorAll('.cosmos-plabel')];
    this.items.forEach((it, i) => (it.label = this.labelEls[i]));
    this.panel = this.dom.querySelector('.cosmos-detail');
  }

  _bind() {
    const canvas = this.ctx.renderer.domElement;

    this._onLabel = (e) => {
      const btn = e.target.closest('.cosmos-plabel');
      if (!btn) return;
      e.stopPropagation();
      this.select(+btn.dataset.i);
    };
    this._onCanvasClick = () => {
      if (this.focused >= 0) { this.close(); return; } // 포커스 중 빈 곳 클릭 → 닫기
      // 천체 직접 클릭(레이캐스트)
      this._ray.setFromCamera(this._ndcMove || this._ndc, this.ctx.camera);
      const hit = this._ray.intersectObjects(this.meshes, false)[0];
      if (hit) this.select(hit.object.userData.index);
    };
    this._onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      (this._ndcMove ||= new this.ctx.THREE.Vector2()).set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    };
    this._onClose = (e) => { e.stopPropagation(); this.close(); };
    this._onKey = (e) => { if (e.key === 'Escape' && this.focused >= 0) this.close(); };

    this.dom.addEventListener('click', this._onLabel);
    canvas.addEventListener('click', this._onCanvasClick);
    canvas.addEventListener('pointermove', this._onMove, { passive: true });
    this.panel.querySelector('.cosmos-detail__close').addEventListener('click', this._onClose);
    window.addEventListener('keydown', this._onKey);
  }

  /* ── 선택 / 해제 ────────────────────────────────── */
  select(i) {
    if (this.focused === i) return;
    this.focused = i;
    const it = this.items[i];

    // 상세 패널 채우기
    this.panel.querySelector('.cosmos-detail__tag').textContent = it.data.tag;
    this.panel.querySelector('.cosmos-detail__title').textContent = it.data.name;
    this.panel.querySelector('.y').textContent = it.data.year;
    this.panel.querySelector('.role').textContent = it.data.role;
    this.panel.querySelector('.cosmos-detail__desc').textContent = it.data.desc;
    this.panel.style.setProperty('--c', `#${it.data.color.toString(16).padStart(6, '0')}`);
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');

    this.uiRoot.classList.add('is-focused'); // 캡션/라벨 숨김 (CSS)
    this._lockScroll(true);
    this.onOpen?.(it);
  }

  close() {
    if (this.focused < 0) return;
    this.focused = -1;
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.uiRoot.classList.remove('is-focused');
    this._lockScroll(false);
    this.onClose?.();
  }

  _lockScroll(on) {
    const el = document.documentElement;
    if (on) {
      this._savedY = window.scrollY;
      el.style.overflow = 'hidden';
    } else {
      el.style.overflow = '';
    }
  }

  /* ── 매 프레임 ──────────────────────────────────── */
  update(dt, elapsed, camera) {
    const W = this.uiRoot.clientWidth, H = this.uiRoot.clientHeight;
    const focusing = this.focused >= 0;

    // 라벨 투영을 위해 카메라 행렬을 이번 프레임 값으로 갱신
    // (렌더러가 갱신하기 전이라 직접 한 번 계산)
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    let nearest = -1, nearestDist = Infinity;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];

      // 부유 + 자전
      it.group.position.y = it.base.y + Math.sin(elapsed * it.bob.speed + it.bob.phase) * it.bob.amp;
      it.mesh.rotation.y += dt * 0.15;
      it.mat.uniforms.uTime.value = elapsed;

      const dist = camera.position.distanceTo(it.group.position);
      const isFocusedOne = focusing && this.focused === i;
      const targetActive = isFocusedOne ? 1 : (focusing ? 0 : (dist < ACTIVATE ? 1 : 0));
      it.active += (targetActive - it.active) * (1 - Math.exp(-dt / 0.3));
      it.mat.uniforms.uActive.value = it.active;

      // 라벨 화면 투영
      const lbl = it.label;
      if (focusing) { lbl.style.opacity = '0'; lbl.style.pointerEvents = 'none'; continue; }

      this._v.copy(it.group.position).project(camera);
      const onScreen = this._v.z < 1;
      const op = onScreen ? clamp((VISIBLE - dist) / (VISIBLE - ACTIVATE), 0, 1) : 0;
      if (op <= 0.001) {
        lbl.style.opacity = '0';
        lbl.style.pointerEvents = 'none';
      } else {
        const sx = (this._v.x * 0.5 + 0.5) * W;
        const sy = (-this._v.y * 0.5 + 0.5) * H;
        lbl.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
        lbl.style.opacity = String(op);
        lbl.style.pointerEvents = op > 0.6 ? 'auto' : 'none';
        lbl.classList.toggle('is-near', dist < ACTIVATE);
      }

      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    }
  }

  dispose() {
    const canvas = this.ctx.renderer.domElement;
    this.dom.removeEventListener('click', this._onLabel);
    canvas.removeEventListener('click', this._onCanvasClick);
    canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('keydown', this._onKey);
    this._lockScroll(false);
    if (this._scene) this._scene.remove(this.group);
    disposeObject(this.group);
    this.dom.remove();
    this.items = [];
    this.meshes = [];
    this.group = this.dom = this.panel = null;
  }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
