/**
 * createRenderer — WebGLRenderer 팩토리
 *
 * 렌더러 생성 정책을 한 곳에 모은다. 톤매핑/색공간/클리어컬러 같은
 * "프로젝트 전역 룩" 설정을 씬마다 반복하지 않도록 캡슐화.
 */
export function createRenderer(THREE, { dpr }) {
  const renderer = new THREE.WebGLRenderer({
    antialias: dpr < 2,            // 고DPR에선 AA를 끄고 해상도로 커버 (성능)
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x05060e, 1);
  return renderer;
}
