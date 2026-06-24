/**
 * UILayer — HUD / 웨이포인트 캡션 / 진행 바 (DOM 오버레이)
 *
 * 3D와 UI를 분리한다. 씬은 픽셀을 그리고, 이 레이어는 DOM으로 정보를 얹는다.
 * 캡션은 스크롤 구간(section)에 매핑되어 진입 시 페이드인된다.
 * 순수 DOM이라 Three.js를 전혀 모르며, update(progress, section)만 받는다.
 */
export class UILayer {
  /**
   * @param root      오버레이가 들어갈 DOM 컨테이너
   * @param waypoints [{ kicker, title, text }] — 구간별 캡션
   */
  constructor(root, waypoints) {
    this.root = root;
    this.waypoints = waypoints;
    this.current = -1;

    root.innerHTML = `
      <div class="cosmos-hud">
        <div class="cosmos-brand">DIGITAL&nbsp;COSMOS<span>AN INTERACTIVE SPACE</span></div>
        <div class="cosmos-counter"><b>01</b> / ${String(waypoints.length).padStart(2, '0')}</div>
      </div>

      <div class="cosmos-captions">
        ${waypoints
          .map(
            (w) => `
          <article class="cosmos-cap">
            <span class="cosmos-cap__kicker">${w.kicker}</span>
            <h2 class="cosmos-cap__title">${w.title}</h2>
            <p class="cosmos-cap__text">${w.text}</p>
          </article>`
          )
          .join('')}
      </div>

      <div class="cosmos-progress"><span class="cosmos-progress__bar"></span></div>

      <div class="cosmos-hint">
        <span>SCROLL TO TRAVEL</span>
        <i class="cosmos-hint__arrow"></i>
      </div>`;

    this.caps = [...root.querySelectorAll('.cosmos-cap')];
    this.bar = root.querySelector('.cosmos-progress__bar');
    this.counter = root.querySelector('.cosmos-counter b');
    this.hint = root.querySelector('.cosmos-hint');
  }

  /** 매 프레임 엔진이 호출 */
  update(progress, section) {
    this.bar.style.transform = `scaleY(${progress})`;

    // 스크롤 시작하면 힌트 사라짐
    this.hint.classList.toggle('is-hidden', progress > 0.02);

    if (section === this.current) return;
    this.current = section;
    this.caps.forEach((c, i) => c.classList.toggle('is-active', i === section));
    this.counter.textContent = String(section + 1).padStart(2, '0');
  }

  dispose() {
    this.root.innerHTML = '';
  }
}
