/**
 * SceneManager — 씬 등록 / 활성 씬 전환
 *
 * 향후 여러 "공간"을 오갈 때(예: 우주 → 도시 → 심해) 확장 지점.
 * 팩토리(키 → () => new SomeScene(ctx))로 등록해 두면 lazy 하게 생성하고,
 * 전환 시 이전 씬을 dispose 해 GPU 메모리를 회수한다.
 */
export class SceneManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.factories = new Map();
    this.active = null;
    this.activeKey = null;
  }

  register(key, factory) {
    this.factories.set(key, factory);
    return this;
  }

  /** 키로 씬을 활성화. 이전 씬은 자동 dispose. */
  goTo(key) {
    if (this.activeKey === key) return this.active;
    const factory = this.factories.get(key);
    if (!factory) throw new Error(`[SceneManager] 등록되지 않은 씬: ${key}`);

    if (this.active) this.active.dispose();

    this.active = factory(this.ctx);
    this.active.build();
    this.activeKey = key;
    return this.active;
  }

  dispose() {
    if (this.active) this.active.dispose();
    this.active = null;
    this.activeKey = null;
    this.factories.clear();
  }
}
