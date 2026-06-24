/**
 * SpaceBackground — 재사용 가능한 "딥 스페이스" 환경 레이어
 *
 * 어떤 씬이든 addTo(scene) 한 줄로 광활한 우주 배경을 깔 수 있다.
 * 구성 요소(모두 이 클래스 안에 캡슐화):
 *   1. 그라데이션 돔   — 딥 블랙 하늘 + 절차적 안개/그레인 (background 셰이더)
 *   2. 다층 스타필드   — 거리별 레이어가 서로 다른 속도로 천천히 회전(패럴랙스)
 *   3. 성운 스프라이트 — 딥 블루/인디고 발광 구름으로 색·깊이
 *
 * 돔/성운은 매 프레임 카메라를 따라다녀(skybox) 카메라가 우주 밖으로
 * 벗어나지 않게 한다. 별의 미세한 회전이 "살아있는 공간" 느낌을 만든다.
 */
import { particleVertex, particleFragment } from '../shaders/particles.js';
import { bgVertex, bgFragment } from '../shaders/background.js';
import { budgetFor } from '../core/Viewport.js';
import { disposeObject } from '../core/disposal.js';

export class SpaceBackground {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new ctx.THREE.Group();
    this.starLayers = [];     // { points, spin:{x,y}, material }
    this.materials = [];      // uTime 갱신 대상 모음
    this.dome = null;
    this.nebula = null;
  }

  addTo(scene) {
    this._scene = scene;
    scene.add(this.group);
    this._buildDome();
    this._buildStars();
    this._buildNebula();
    return this;
  }

  /* ── 그라데이션 하늘 돔 ──────────────────────────── */
  _buildDome() {
    const { THREE } = this.ctx;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: bgVertex,
      fragmentShader: bgFragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
    this.dome.renderOrder = -10; // 항상 가장 먼저(맨 뒤) 그림
    this.group.add(this.dome);
    this.materials.push(mat);
  }

  /* ── 다층 스타필드 ──────────────────────────────── */
  _buildStars() {
    const base = budgetFor(this.ctx.viewport.tier).particles;
    // 은하 파티클 예산에 비례해 별 개수 산정 (티어 자동 반영)
    this._makeStarShell({
      count: Math.round(base * 0.10) + 2500, // 원경: 가장 많고 작게
      rMin: 420, rMax: 820, size: 1.5,
      spin: { x: 0.0008, y: 0.0016 },
    });
    this._makeStarShell({
      count: Math.round(base * 0.04) + 1000, // 근경: 적고 크게(빠른 패럴랙스)
      rMin: 180, rMax: 380, size: 2.6,
      spin: { x: 0.0018, y: 0.0036 },
    });
  }

  _makeStarShell({ count, rMin, rMax, size, spin }) {
    const { THREE, viewport, renderer } = this.ctx;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);

    // 대부분 흰-청색, 일부 따뜻한/붉은 별로 변주
    const palette = [
      new THREE.Color(0xffffff), new THREE.Color(0xcdd9ff),
      new THREE.Color(0xaec6ff), new THREE.Color(0xfff0d6),
      new THREE.Color(0xffd0b0),
    ];
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // 구면 균등 분포
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const s = Math.sqrt(1 - u * u);
      positions[i3]     = Math.cos(t) * s * r;
      positions[i3 + 1] = u * r;
      positions[i3 + 2] = Math.sin(t) * s * r;

      // 흰색 비중 높게(앞 두 색 가중), 가끔 컬러 별
      const pick = Math.random();
      const c = pick < 0.7 ? palette[0]
              : pick < 0.85 ? palette[1]
              : palette[2 + (Math.floor(Math.random() * 3))];
      tmp.copy(c).multiplyScalar(0.55 + Math.random() * 0.45);
      colors[i3] = tmp.r; colors[i3 + 1] = tmp.g; colors[i3 + 2] = tmp.b;

      scales[i] = 0.35 + Math.pow(Math.random(), 2) * 1.3; // 대부분 작고 가끔 큼
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size * renderer.getPixelRatio() },
        uTwinkle: { value: viewport.reducedMotion ? 0 : 1 },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.starLayers.push({ points: pts, spin });
    this.materials.push(mat);
  }

  /* ── 성운 (딥 블루/인디고 발광 구름) ──────────────── */
  _buildNebula() {
    const { THREE, viewport } = this.ctx;
    if (viewport.reducedMotion && viewport.tier === 'low') return; // 저사양+모션최소화 시 생략

    this.nebula = new THREE.Group();
    const clouds = [
      { color: ['rgba(70,90,200,0.5)', 'rgba(40,30,90,0)'], pos: [-380, 120, -520], scale: 720 },
      { color: ['rgba(150,60,170,0.45)', 'rgba(60,20,80,0)'], pos: [420, -160, -560], scale: 640 },
      { color: ['rgba(40,120,180,0.4)', 'rgba(20,40,80,0)'], pos: [120, 260, -640], scale: 560 },
    ];
    for (const c of clouds) {
      const tex = this._cloudTexture(c.color);
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, opacity: 0.16,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.set(...c.pos);
      sp.scale.setScalar(c.scale);
      sp.renderOrder = -5;
      this.nebula.add(sp);
    }
    this.group.add(this.nebula);
  }

  _cloudTexture([inner, outer]) {
    const { THREE } = this.ctx;
    const s = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const x = cv.getContext('2d');
    // 부드러운 라디얼 + 약간의 비대칭 노이즈로 구름 느낌
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) {
      x.globalAlpha = Math.random() * 0.05;
      x.fillStyle = inner;
      const rad = Math.random() * s * 0.4;
      x.beginPath();
      x.arc(s / 2 + (Math.random() - 0.5) * s * 0.6,
            s / 2 + (Math.random() - 0.5) * s * 0.6, rad, 0, Math.PI * 2);
      x.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ── 매 프레임 ──────────────────────────────────── */
  update(dt, elapsed, camera) {
    for (const m of this.materials) m.uniforms.uTime.value = elapsed;

    // 돔/성운은 카메라를 따라다녀 항상 우주 안에 있게 (skybox)
    this.dome.position.copy(camera.position);
    if (this.nebula) this.nebula.position.copy(camera.position);

    // 별은 레이어별로 다른 속도로 아주 천천히 회전 → 패럴랙스 + 생명감
    for (const L of this.starLayers) {
      L.points.rotation.x += L.spin.x * dt;
      L.points.rotation.y += L.spin.y * dt;
    }
  }

  dispose() {
    if (this._scene) this._scene.remove(this.group);
    disposeObject(this.group);
    this.group = this.dome = this.nebula = null;
    this.starLayers = [];
    this.materials = [];
  }
}
