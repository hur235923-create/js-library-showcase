/**
 * ScrollController — 스크롤 진행도 추상화 (외부 의존성 없음)
 *
 * "탐험"의 척추. 긴 스크롤 영역(sectionEl)을 0~1 진행도로 정규화하고,
 * 관성(lerp smoothing)을 입혀 부드러운 카메라 플라이스루를 가능케 한다.
 * 또한 N개 구간(section)으로 나눠 각 구간의 로컬 진행도/활성 인덱스를 제공.
 *
 * 매 프레임 update()를 호출하면 보간된 progress(0~1)를 돌려준다.
 *
 *   smooth : 0~1, 클수록 즉각 반응 / 작을수록 묵직한 관성
 *   sections : 구간 수 (UI 캡션·웨이포인트 동기화용)
 */
export class ScrollController {
  constructor(sectionEl, { sections = 1, smooth = 0.08 } = {}) {
    this.el = sectionEl;
    this.sections = sections;
    this.smooth = smooth;
    this.target = 0; // 실제 스크롤 위치 (raw)
    this.value = 0;  // 보간된 값 (렌더에 사용)
    this.activeSection = 0;
  }

  /** 현재 스크롤 위치로 raw target 갱신 (스크롤 이벤트/매 프레임 호출 가능) */
  _readTarget() {
    const rect = this.el.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  /** 매 프레임 호출 → 보간된 progress 반환 */
  update() {
    this.target = this._readTarget();
    this.value += (this.target - this.value) * this.smooth;
    // 부동소수 잔떨림 정리
    if (Math.abs(this.target - this.value) < 1e-4) this.value = this.target;
    this.activeSection = Math.min(
      this.sections - 1,
      Math.floor(this.value * this.sections + 1e-6)
    );
    return this.value;
  }

  /** 특정 구간 내부의 로컬 진행도(0~1) — 구간별 연출 타이밍에 사용 */
  sectionProgress(i) {
    const span = 1 / this.sections;
    return clamp((this.value - i * span) / span, 0, 1);
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
