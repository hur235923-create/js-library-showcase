/**
 * ParticleTerrain — 데모 씬: 살아 숨 쉬는 거대 파티클 지형
 *
 * 우주(SpaceBackground) 위에 수십만 입자로 이루어진 유기적 풍경을 펼친다.
 * 산맥과 파도 사이의 형상을 Simplex Noise 로 만들고, 매우 천천히 흐르고
 * 호흡하게 해 "디지털 아트 작품" 같은 압도적 스케일을 노린다.
 *
 * 성능: 격자(positions)는 1회만 생성해 GPU에 올리고, 변위/색/호흡은 전부
 *       정점 셰이더에서 계산 → 단일 draw call, CPU 매 프레임 비용 0.
 */
import { BaseScene } from './BaseScene.js';
import { terrainVertex, terrainFragment } from '../shaders/terrain.js';
import { SpaceBackground } from '../environment/SpaceBackground.js';
import { ProjectSystem } from '../environment/ProjectSystem.js';
import { CameraRig } from '../animation/CameraRig.js';

const WORLD = 1500;                 // 지형 한 변의 월드 크기
const GRID = { low: 220, mid: 360, high: 560 }; // 티어별 격자 한 변

export class ParticleTerrain extends BaseScene {
  build() {
    const { THREE, viewport } = this.ctx;

    // 광활한 우주 환경 먼저
    this.bg = new SpaceBackground(this.ctx).addTo(this.scene);

    this._buildTerrain();
    this._buildCameraPath();

    // 마우스 → 지형 평면 레이캐스트 도구 (커서 인지 효과용)
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.points.position.y);
    this._hit = new THREE.Vector3();

    // 프로젝트 천체 — 선택 시 카메라를 해당 천체로 포커스
    this.projects = new ProjectSystem(this.ctx, this.ctx.ui.root).addTo(this.scene);
    this.projects.onOpen = (it) => this.rig.focusOn(it.focusPos, it.focusLook, 42);
    this.projects.onClose = () => this.rig.release();
  }

  _buildTerrain() {
    const { THREE, viewport, renderer } = this.ctx;
    const side = GRID[viewport.tier];
    const count = side * side;
    const half = WORLD / 2;

    const positions = new Float32Array(count * 3);
    const rand = new Float32Array(count);

    let p = 0;
    for (let ix = 0; ix < side; ix++) {
      for (let iz = 0; iz < side; iz++) {
        positions[p * 3]     = (ix / (side - 1) - 0.5) * WORLD;
        positions[p * 3 + 1] = 0;
        positions[p * 3 + 2] = (iz / (side - 1) - 0.5) * WORLD;
        rand[p] = Math.random();
        p++;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0 },
        uSize:   { value: 2.2 * renderer.getPixelRatio() },
        uAmp:    { value: 195 },                       // 압도적 높이
        uFreq:   { value: 0.0030 },                    // 산맥 스케일 (넓고 웅장하게)
        uFlow:   { value: viewport.reducedMotion ? 0 : 0.06 }, // 매우 느린 변형(파도 X)
        uBreath: { value: viewport.reducedMotion ? 0 : 0.16 }, // 호흡
        uHalf:   { value: half },
        uMouse:  { value: new THREE.Vector2(1e6, 1e6) },       // 마우스 지형 위 위치
        uMouseR: { value: 150 },                                // 영향 반경
        uMouseOn:{ value: 0 },                                  // 영향 세기(보간)
      },
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // 셰이더 변위로 바운딩이 무의미
    this.points.position.y = -40;       // 지형을 시야 아래로 깔아 지면감
    this.scene.add(this.points);
  }

  /**
   * 지형 위를 비행하는 시네마틱 카메라 경로.
   * 고도를 의도적으로 오르내려 "접근(디테일) ↔ 조망(전경)"을 번갈아 연출한다.
   * 제어점 수는 캡션 구간(5)과 무관 — 곡선은 호 길이 0~1 로 샘플링된다.
   */
  _buildCameraPath() {
    const { THREE } = this.ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    const posCurve = new THREE.CatmullRomCurve3([
      V(0,   240, 700),  // 광활한 조망 (높이)
      V(-180, 90, 420),  // 능선으로 하강
      V(90,   38, 160),  // 표면을 낮게 스침 (디테일)
      V(-120, 72, -20),  // 잠시 상승
      V(70,   30, -220), // 골짜기로 다이브 (디테일)
      V(-40, 165, -360), // 다시 상승
      V(20,  280, -480), // 최종 압도적 전경 (높이, 지형 위 유지)
    ]);
    const lookCurve = new THREE.CatmullRomCurve3([
      V(0, 40, -40),
      V(0, 30, -180),
      V(0, 25, -240),
      V(0, 35, -340),
      V(0, 20, -440),
      V(0, 30, -560),
      V(0, 5,  -650),    // 최종: 여전히 지형을 내려다봄
    ]);

    // 구간 화각: 조망은 넓게(웅장), 접근은 좁게(압축·몰입)
    const fovStops = [74, 60, 52, 58, 50, 60, 78];

    this.rig = new CameraRig(this.ctx, { posCurve, lookCurve, fovStops });
  }

  update(dt, elapsed, scroll) {
    const { camera, parallax } = this.ctx;
    this.material.uniforms.uTime.value = elapsed;

    this.rig.setScroll(scroll);
    this.rig.update(dt, elapsed);

    this._updateMouse(dt);
    this.projects.update(dt, elapsed, camera);

    this.bg.update(dt, elapsed, camera);
  }

  /** 마우스를 지형 평면에 투사해 "커서 인지" 효과 위치/세기를 갱신 */
  _updateMouse(dt) {
    const { camera, parallax, viewport } = this.ctx;
    const u = this.material.uniforms;
    const half = WORLD / 2;

    // 패럴랙스 보간값을 NDC 로 사용 (y는 반전)
    this._ndc.set(parallax.value.x, -parallax.value.y);
    this._ray.setFromCamera(this._ndc, camera);

    let on = 0;
    const hit = this._ray.ray.intersectPlane(this._mousePlane, this._hit);
    if (hit && Math.abs(hit.x) < half && Math.abs(hit.z) < half) {
      u.uMouse.value.set(hit.x, hit.z);
      on = viewport.reducedMotion ? 0 : 1;
    }
    // 세기 부드럽게 보간 (커서가 지형을 벗어나면 자연스럽게 사라짐)
    const k = 1 - Math.exp(-dt / 0.25);
    u.uMouseOn.value += (on - u.uMouseOn.value) * k;
  }

  dispose() {
    this.projects?.dispose();
    this.bg?.dispose();
    super.dispose();
    this.projects = null;
    this.bg = null;
    this.rig = null;
    this.points = this.material = null;
  }
}
