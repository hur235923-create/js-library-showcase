/**
 * Viewport — 디바이스 성능 티어 감지 & 반응형 컨텍스트
 *
 * 엔진/씬이 "지금 어떤 환경인가"를 한 곳에서 질의할 수 있게 한다.
 * 파티클 수, DPR, 포스트프로세싱 강도 등 성능 예산을 티어로 분기하는 데 사용.
 *
 *   tier  : 'low' | 'mid' | 'high'  — 파티클/효과 예산 결정용
 *   dpr   : number                  — 캡이 적용된 devicePixelRatio
 *   isMobile / isTouch / reducedMotion
 *
 * 순수 함수에 가깝게 두어(외부 상태 없음) 테스트·재사용이 쉽도록 했다.
 */

const DPR_CAP = { low: 1.5, mid: 1.75, high: 2 };

export function detectViewport() {
  const isTouch =
    matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const isMobile = isTouch && Math.min(window.innerWidth, window.innerHeight) < 820;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 논리 코어 수 + 메모리(가능한 경우)로 대략적 티어 추정
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4; // GB (Chrome 계열만 제공)

  let tier;
  if (isMobile || cores <= 4 || mem <= 4) tier = 'low';
  else if (cores <= 8 || mem <= 8) tier = 'mid';
  else tier = 'high';

  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[tier]);

  return { tier, dpr, isMobile, isTouch, reducedMotion };
}

/** 티어별 예산을 한 곳에서 조회 (씬이 자기 파티클 수를 결정할 때 사용) */
export function budgetFor(tier) {
  return {
    low:  { particles: 45_000,  bloom: false },
    mid:  { particles: 130_000, bloom: true },
    high: { particles: 280_000, bloom: true },
  }[tier];
}
