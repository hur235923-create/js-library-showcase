/**
 * Engine — 엔진 코어 오케스트레이터
 *
 * "한 번 만들어두면 어떤 씬이 와도 돌아가는" 런타임. 씬이 무엇인지 모른 채
 * 렌더러·카메라·렌더 루프·리사이즈·가시성·입력(스크롤/포인터)의 수명주기만 관리한다.
 *
 * 성능/안정성 기본기:
 *   - 단일 requestAnimationFrame 루프 (씬이 늘어도 루프는 하나)
 *   - 델타타임 기반 업데이트 (프레임레이트 독립적인 애니메이션)
 *   - 탭이 가려지면(document.hidden) 루프 정지 → 배터리/GPU 절약
 *   - 리사이즈는 호스트 요소 기준으로 렌더러·카메라 동기화
 *   - dispose()로 GPU 컨텍스트까지 완전 회수
 */
import { createRenderer } from './createRenderer.js';
import { SceneManager } from './SceneManager.js';
import { ScrollController } from '../animation/ScrollController.js';
import { PointerParallax } from '../animation/PointerParallax.js';

export class Engine {
  constructor(host, THREE, { viewport, ui, scrollEl, sections = 1 }) {
    this.host = host;
    this.THREE = THREE;
    this.viewport = viewport;
    this.ui = ui;

    // ── 렌더러 ──────────────────────────────────────
    this.renderer = createRenderer(THREE, { dpr: viewport.dpr });
    this.renderer.domElement.classList.add('cosmos-canvas');
    host.appendChild(this.renderer.domElement);

    // ── 카메라 (씬이 위치/방향을 조작) ───────────────
    const { w, h } = this._size();
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
    this.camera.position.set(0, 0, 60);

    // ── 입력 / 스크롤 ───────────────────────────────
    this.scroll = new ScrollController(scrollEl, {
      sections,
      smooth: viewport.reducedMotion ? 1 : 0.08, // 모션 최소화 시 즉시 반응
    });
    this.parallax = new PointerParallax({ smooth: viewport.isTouch ? 0.08 : 0.05 });

    // ── 씬 컨텍스트 (씬에 주입되는 공유 자원) ─────────
    const ctx = {
      THREE,
      renderer: this.renderer,
      camera: this.camera,
      viewport,
      ui,
      parallax: this.parallax,
    };
    this.scenes = new SceneManager(ctx);

    this.clock = new THREE.Clock();
    this._raf = null;
    this._running = false;

    // ── 이벤트 바인딩 ───────────────────────────────
    this._onResize = () => this.resize();
    this._onVisibility = () => (document.hidden ? this._pause() : this._resume());
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    this.resize();
  }

  registerScene(key, factory) {
    this.scenes.register(key, factory);
    return this;
  }

  start(key) {
    this.scenes.goTo(key);
    this.resize(); // 씬이 카메라에 의존할 수 있으므로 초기 동기화 1회 더
    this._resume();
  }

  _size() {
    return { w: this.host.clientWidth || 1, h: this.host.clientHeight || 1 };
  }

  resize() {
    const { w, h } = this._size();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.scenes.active?.resize(w, h);
  }

  _resume() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05); // 큰 dt(탭 복귀) 클램프
      const elapsed = this.clock.getElapsedTime();
      const progress = this.scroll.update();
      this.parallax.update();

      this.scenes.active?.update(dt, elapsed, progress);
      this.ui?.update?.(progress, this.scroll.activeSection);

      this.renderer.render(this.scenes.active.scene, this.camera);
    };
    loop();
  }

  _pause() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  dispose() {
    this._pause();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.parallax.dispose();
    this.scenes.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement?.remove();
    this.renderer = this.camera = this.scenes = null;
  }
}
