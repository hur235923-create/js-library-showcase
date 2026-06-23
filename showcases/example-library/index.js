/**
 * Example Library Showcase
 * — 새 쇼케이스를 만들 때 이 파일을 복사해서 시작하세요.
 */

let _raf = null;

function init(container) {
  container.innerHTML = `
    <div class="showcase-wrapper">
      <div class="showcase-header">
        <span class="badge">Template</span>
        <h1>Example Library</h1>
        <p>이 카드는 쇼케이스 템플릿입니다. <code>showcases/example-library/index.js</code>를 복사해 새 라이브러리를 추가하세요.</p>
      </div>
      <div class="demo-grid">
        <div class="demo-card">
          <h3>Demo 1</h3>
          <div class="demo-stage" id="ex-demo1"></div>
        </div>
        <div class="demo-card">
          <h3>Demo 2</h3>
          <div class="demo-stage" id="ex-demo2"></div>
        </div>
        <div class="demo-card">
          <h3>Demo 3 — 코드 예시</h3>
          <div class="demo-stage" style="align-items:flex-start;padding:16px;">
            <pre style="font-size:12px;color:#a78bfa;line-height:1.7">// showcases/my-lib/index.js
export default {
  id: 'my-lib',
  title: 'My Library',
  icon: '✨',
  description: '...',
  init(container) { /* 데모 마운트 */ },
  destroy() { /* 정리 */ },
};</pre>
          </div>
        </div>
      </div>
    </div>
  `;

  // 간단한 캔버스 애니메이션 (예시)
  _runBallDemo(document.getElementById('ex-demo1'));
  _runPulseDemo(document.getElementById('ex-demo2'));
}

function destroy() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
}

function _runBallDemo(stage) {
  if (!stage) return;
  const canvas = document.createElement('canvas');
  canvas.width = stage.clientWidth || 240;
  canvas.height = 140;
  canvas.style.cssText = 'display:block;width:100%;height:140px;';
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let x = 40, y = 70, vx = 2.2, vy = 1.4;
  const r = 14;

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    x += vx; y += vy;
    if (x - r < 0 || x + r > canvas.width)  vx *= -1;
    if (y - r < 0 || y + r > canvas.height)  vy *= -1;

    const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
    g.addColorStop(0, '#a78bfa');
    g.addColorStop(1, '#7c6ff7');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    _raf = requestAnimationFrame(frame);
  }
  frame();
}

function _runPulseDemo(stage) {
  if (!stage) return;
  const div = document.createElement('div');
  div.style.cssText = `
    width: 60px; height: 60px; border-radius: 50%;
    background: var(--accent);
    animation: showcasePulse 1.4s ease-in-out infinite;
  `;
  if (!document.getElementById('_showcasePulseKF')) {
    const s = document.createElement('style');
    s.id = '_showcasePulseKF';
    s.textContent = `
      @keyframes showcasePulse {
        0%,100% { transform: scale(1);   opacity: 1; }
        50%      { transform: scale(1.4); opacity: 0.5; }
      }
    `;
    document.head.appendChild(s);
  }
  stage.appendChild(div);
}

export default { id: 'example', title: 'Example', icon: '🧩', description: '쇼케이스 템플릿', init, destroy };
