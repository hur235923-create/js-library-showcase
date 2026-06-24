/**
 * BaseScene — 모든 씬이 구현하는 수명주기 계약 (추상 클래스)
 *
 * 엔진은 구체 씬을 몰라도 이 인터페이스만 알면 구동할 수 있다.
 * 새 공간(씬)을 추가하려면 이 클래스를 상속해 4개 메서드만 채우면 된다.
 *
 *   build()                    — 객체 생성 (1회). 무거운 작업은 여기서.
 *   update(dt, elapsed, scroll)— 매 프레임 (dt=델타초, scroll=0~1 진행도)
 *   resize(w, h)               — 뷰포트 변경 시
 *   dispose()                  — GPU/이벤트 정리
 *
 * ctx = { THREE, renderer, camera, viewport, ui } — 엔진이 주입하는 공유 컨텍스트
 */
import { disposeObject } from '../core/disposal.js';

export class BaseScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new ctx.THREE.Scene();
  }

  // 하위 클래스에서 오버라이드 (기본 구현은 no-op)
  build() {}
  update(/* dt, elapsed, scroll */) {}
  resize(/* w, h */) {}

  /** 기본 정리: 씬 그래프 전체 해제. 추가 리소스가 있으면 super.dispose() 호출. */
  dispose() {
    disposeObject(this.scene);
    this.scene = null;
  }
}
