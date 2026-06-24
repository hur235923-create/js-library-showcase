/**
 * ParticleField — 데모 씬: 은하 파티클 필드 + 스크롤 플라이스루
 *
 * BaseScene 계약의 구체 구현이자 "확장 예시". 새 공간을 만들 때 이 파일을
 * 본보기로 삼으면 된다. 핵심:
 *   - 수십만 파티클을 단일 THREE.Points + ShaderMaterial 로 그려 draw call 1회
 *   - 위치/색/크기/씨앗을 BufferAttribute 로만 올리고 CPU 업데이트 0
 *   - 카메라는 CatmullRom 곡선 경로를 스크롤 진행도로 샘플링해 부드럽게 비행
 *   - 포인터 패럴랙스로 시점 미세 반응
 *
 * 성능 예산(파티클 수)은 viewport.tier 로 분기된다.
 */
import { BaseScene } from './BaseScene.js';
import { budgetFor } from '../core/Viewport.js';
import { particleVertex, particleFragment } from '../shaders/particles.js';
import { SpaceBackground } from '../environment/SpaceBackground.js';

const GALAXY_R = 60;   // 은하 원반 반지름
const ARMS = 5;        // 나선 팔 개수
const SPIN = 0.9;      // 팔 감김 정도

export class ParticleField extends BaseScene {
  build() {
    const { THREE, viewport, renderer } = this.ctx;
    const count = budgetFor(viewport.tier).particles;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 광활한 우주 환경(딥 블랙 하늘·스타필드·성운)을 먼저 깐다
    this.bg = new SpaceBackground(this.ctx).addTo(this.scene);

    this._buildParticles(count);
    this._buildCoreGlow();
    this._buildCameraPath();

    // 카메라 작업용 임시 벡터 (매 프레임 new 방지)
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._spin = viewport.reducedMotion ? 0 : 0.018;

    // 셰이더 uSize 는 DPR 보정 (드로잉버퍼가 dpr배 크므로 보정해야 체감 크기 유지)
    this.material.uniforms.uSize.value = 2.6 * renderer.getPixelRatio();
  }

  _buildParticles(count) {
    const { THREE, viewport } = this.ctx;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);

    const cInner = new THREE.Color(0xffd9a0); // 코어: 따뜻한 황금
    const cMid = new THREE.Color(0xff6b6b);   // 중간: 산호빛
    const cOuter = new THREE.Color(0x4d7cff); // 외곽: 푸른 별
    const cHalo = new THREE.Color(0x9fb8ff);  // 헤일로: 옅은 청백
    const tmp = new THREE.Color();

    const haloRatio = 0.28; // 일부는 구형 헤일로 별로 흩뿌림

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      if (Math.random() < haloRatio) {
        // ── 구형 헤일로 별 (배경 깊이) ──────────────
        const r = GALAXY_R * (1.4 + Math.random() * 3.2);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        positions[i3]     = Math.sin(phi) * Math.cos(theta) * r;
        positions[i3 + 1] = Math.cos(phi) * r * 0.6;
        positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
        tmp.copy(cHalo).multiplyScalar(0.5 + Math.random() * 0.5);
        scales[i] = 0.4 + Math.random() * 0.6;
      } else {
        // ── 나선 원반 ──────────────────────────────
        const radius = Math.pow(Math.random(), 0.65) * GALAXY_R;
        const branch = ((i % ARMS) / ARMS) * Math.PI * 2;
        const spin = radius * (SPIN / GALAXY_R) * Math.PI * 2;

        // 코어로 갈수록 조밀, 외곽으로 갈수록 산포 (pow로 분포 제어)
        const scatter = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1);
        const spread = radius * 0.32 + 1.5;
        const rx = scatter * spread;
        const ry = scatter * spread * 0.35; // 원반은 얇게
        const rz = scatter * spread;

        positions[i3]     = Math.cos(branch + spin) * radius + rx;
        positions[i3 + 1] = ry + (Math.random() - 0.5) * 1.2;
        positions[i3 + 2] = Math.sin(branch + spin) * radius + rz;

        // 반지름에 따른 색 그라데이션 (코어→중간→외곽)
        const t = radius / GALAXY_R;
        if (t < 0.5) tmp.copy(cInner).lerp(cMid, t / 0.5);
        else tmp.copy(cMid).lerp(cOuter, (t - 0.5) / 0.5);
        scales[i] = 0.6 + Math.random() * 0.9;
      }

      colors[i3] = tmp.r;
      colors[i3 + 1] = tmp.g;
      colors[i3 + 2] = tmp.b;
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.computeBoundingSphere();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 2.6 },
        uTwinkle: { value: viewport.reducedMotion ? 0 : 1 },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // 카메라가 내부를 통과하므로 컬링 끔
    this.group.add(this.points);
  }

  /** 코어 발광 — 부드러운 라디얼 스프라이트 1장 (가산 합성) */
  _buildCoreGlow() {
    const { THREE } = this.ctx;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,230,190,0.9)');
    g.addColorStop(0.3, 'rgba(255,150,110,0.35)');
    g.addColorStop(1, 'rgba(255,120,90,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Sprite(mat);
    this.glow.scale.setScalar(34);
    this.group.add(this.glow);
  }

  /** 스크롤로 따라갈 카메라 비행 경로 (위치 곡선 + 시선 곡선) */
  _buildCameraPath() {
    const { THREE } = this.ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    this.pathPos = new THREE.CatmullRomCurve3([
      V(0, 22, 120),   // 0 멀리서 은하를 조망
      V(-46, 14, 64),  // 1 원반으로 하강
      V(40, 7, 22),    // 2 나선 팔을 스치며 횡단
      V(2, 3, -4),     // 3 코어로 잠입
      V(58, 30, -96),  // 4 반대편으로 빠져나가며 광활한 전경
    ]);
    this.pathLook = new THREE.CatmullRomCurve3([
      V(0, 0, 0),
      V(0, 0, 0),
      V(0, 0, -8),
      V(0, 0, -26),
      V(0, 4, -60),
    ]);
  }

  update(dt, elapsed, scroll) {
    const { camera, parallax } = this.ctx;
    this.material.uniforms.uTime.value = elapsed;
    this.group.rotation.y += this._spin * dt;

    // 스크롤 진행도로 카메라 경로 샘플링
    this.pathPos.getPointAt(scroll, this._camPos);
    this.pathLook.getPointAt(scroll, this._camLook);

    // 포인터 패럴랙스 — 위치 미세 오프셋
    const p = parallax.value;
    camera.position.copy(this._camPos);
    camera.position.x += p.x * 6;
    camera.position.y += -p.y * 4;
    camera.lookAt(this._camLook);

    // 배경(돔/성운 skybox 추종)은 카메라 확정 후 갱신
    this.bg.update(dt, elapsed, camera);
  }

  dispose() {
    this.bg?.dispose();
    super.dispose(); // 씬 그래프(지오메트리/머티리얼/텍스처) 일괄 해제
    this.bg = null;
    this.group = this.points = this.material = this.glow = null;
    this.pathPos = this.pathLook = null;
  }
}
