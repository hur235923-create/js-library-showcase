/**
 * PointerParallax — 포인터/기울기 기반 시점 미세 반응
 *
 * 마우스(데스크톱) 또는 디바이스 기울기(모바일)를 -1~1 정규화 좌표로 보간한다.
 * 카메라가 이 값을 읽어 살짝 시점을 틀면 "살아있는 공간" 느낌을 준다.
 * destroy 시 리스너를 반드시 해제하도록 캡슐화.
 */
export class PointerParallax {
  constructor({ smooth = 0.05 } = {}) {
    this.smooth = smooth;
    this.target = { x: 0, y: 0 };
    this.value = { x: 0, y: 0 };

    this._onMove = (e) => {
      this.target.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.target.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    this._onTilt = (e) => {
      if (e.gamma == null) return;
      this.target.x = clamp(e.gamma / 35, -1, 1);  // 좌우 기울기
      this.target.y = clamp((e.beta - 45) / 35, -1, 1); // 앞뒤 기울기
    };

    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('deviceorientation', this._onTilt, { passive: true });
  }

  /** 매 프레임 호출 → 보간된 {x,y} 반환 */
  update() {
    this.value.x += (this.target.x - this.value.x) * this.smooth;
    this.value.y += (this.target.y - this.value.y) * this.smooth;
    return this.value;
  }

  dispose() {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('deviceorientation', this._onTilt);
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
