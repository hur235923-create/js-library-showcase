import { showcases } from '../showcases/registry.js';

const tabNav     = document.getElementById('tabNav');
const mainContent = document.getElementById('mainContent');

let current = null; // 현재 활성 쇼케이스

// ── 탭 생성 ─────────────────────────────────────────
showcases.forEach((showcase) => {
  const btn = document.createElement('button');
  btn.className   = 'tab-btn';
  btn.role        = 'tab';
  btn.dataset.id  = showcase.id;
  btn.innerHTML   = `<span class="tab-icon">${showcase.icon}</span>${showcase.title}`;
  btn.addEventListener('click', () => activate(showcase.id));
  tabNav.appendChild(btn);
});

// ── 탭 활성화 ────────────────────────────────────────
function activate(id) {
  const showcase = showcases.find((s) => s.id === id);
  if (!showcase || current?.id === id) return;

  // 이전 쇼케이스 정리
  if (current?.destroy) current.destroy();

  // 탭 버튼 상태 갱신
  tabNav.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.id === id);
    btn.setAttribute('aria-selected', btn.dataset.id === id);
  });

  // 콘텐츠 마운트
  mainContent.innerHTML = '';
  showcase.init(mainContent);
  current = showcase;

  // URL 해시 동기화
  history.replaceState(null, '', `#${id}`);
}

// ── 초기 탭 결정 (해시 → 첫 번째) ───────────────────
function getInitialId() {
  const hash = location.hash.slice(1);
  if (hash && showcases.some((s) => s.id === hash)) return hash;
  return showcases[0]?.id;
}

if (showcases.length === 0) {
  mainContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📦</div>
      <p>쇼케이스가 없습니다.<br>
         <code>showcases/registry.js</code>에 모듈을 등록하세요.</p>
    </div>`;
} else {
  activate(getInitialId());
}
