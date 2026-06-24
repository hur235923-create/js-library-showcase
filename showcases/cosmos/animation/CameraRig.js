/**
 * CameraRig — 시네마틱 카메라 컨트롤러
 *
 * "스크롤 = 카메라 조작"의 핵심. 위치/시선 곡선(CatmullRom)을 스크롤
 * 진행도로 샘플링하되, SF 영화 같은 무브먼트를 위해 다음을 얹는다:
 *   - 관성(inertia)   : 목표값을 시간상수 기반 lerp 로 따라가 부드럽게 미끄러짐
 *   - 룩어헤드(look-ahead): 진행 방향을 살짝 앞서 바라봐 비행감
 *   - 뱅킹(banking)   : 경로 곡률 + 포인터로 카메라를 살짝 롤 → 비행기 선회감
 *   - FOV 돌리        : 구간별 화각을 바꿔 접근(좁게)/조망(넓게) 연출
 *   - 호흡 보브        : 미세한 상하 흔들림으로 핸드헬드 같은 생동감
 *   - 포커스 모드      : 특정 천체로 천천히 활공(7단계 프로젝트 선택에서 사용)
 *
 * 프레임레이트 독립 smoothing: k = 1 - exp(-dt/tau) (tau=관성 시간상수[초]).
 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CameraRig {
  constructor(ctx, { posCurve, lookCurve, fovStops = [60] }) {
    const { THREE, camera } = ctx;
    this.ctx = ctx;
    this.camera = camera;
    this.posCurve = posCurve;
    this.lookCurve = lookCurve;
    this.fovStops = fovStops;

    this.progress = 0;
    this.mode = 'travel'; // 'travel' | 'focus'

    // 보간 상태
    this._pos = camera.position.clone();
    this._look = lookCurve.getPointAt(0);
    this._roll = 0;
    this._fov = fovStops[0];

    // 포커스 타깃
    this._focusPos = new THREE.Vector3();
    this._focusLook = new THREE.Vector3();
    this._focusFov = 50;

    // 재사용 임시 벡터
    this._tPos = new THREE.Vector3();
    this._tLook = new THREE.Vector3();
    this._tan = new THREE.Vector3();

    // 관성 시간상수(초) — 클수록 더 묵직하게 미끄러짐
    this.tauTravel = 0.22;
    this.tauFocus = 0.85;
    if (ctx.viewport.reducedMotion) { this.tauTravel = 0.001; this.tauFocus = 0.001; }
  }

  setScroll(p) { this.progress = clamp(p, 0, 1); }

  focusOn(pos, look, fov = 48) {
    this.mode = 'focus';
    this._focusPos.copy(pos);
    this._focusLook.copy(look);
    this._focusFov = fov;
  }
  release() { this.mode = 'travel'; }

  /** fovStops 를 진행도 t(0~1)로 선형 보간 */
  _fovAt(t) {
    const n = this.fovStops.length;
    if (n === 1) return this.fovStops[0];
    const f = t * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    return this.fovStops[i] + (this.fovStops[i + 1] - this.fovStops[i]) * (f - i);
  }

  update(dt, elapsed) {
    let targetPos, targetLook, targetFov, targetRoll, tau;

    if (this.mode === 'focus') {
      targetPos = this._focusPos;
      targetLook = this._focusLook;
      targetFov = this._focusFov;
      targetRoll = 0;
      tau = this.tauFocus;
    } else {
      const t = this.progress;
      this.posCurve.getPointAt(t, this._tPos);
      this.lookCurve.getPointAt(t, this._tLook);

      // 진행 방향(접선)으로 뱅킹 + 룩어헤드
      this.posCurve.getTangentAt(t, this._tan);
      targetRoll = clamp(-this._tan.x * 0.16, -0.14, 0.14);

      // 포인터 패럴랙스 (미세 시점 반응) + 호흡 보브
      const pr = this.ctx.parallax.value;
      this._tPos.x += pr.x * 12;
      this._tPos.y += -pr.y * 7 + Math.sin(elapsed * 0.25) * 2.0;
      targetRoll += pr.x * 0.04;

      targetPos = this._tPos;
      targetLook = this._tLook;
      targetFov = this._fovAt(t);
      tau = this.tauTravel;
    }

    const k = 1 - Math.exp(-dt / tau);
    this._pos.lerp(targetPos, k);
    this._look.lerp(targetLook, k);
    this._roll += (targetRoll - this._roll) * k;
    this._fov += (targetFov - this._fov) * k;

    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    this.camera.rotateZ(this._roll);

    if (Math.abs(this.camera.fov - this._fov) > 0.01) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
