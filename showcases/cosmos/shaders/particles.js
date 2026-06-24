/**
 * particles — 파티클 GLSL (vertex + fragment)
 *
 * 셰이더는 별도 모듈로 분리해 씬 로직과 독립적으로 수정/재사용한다.
 * 수십만 개를 단일 draw call(THREE.Points)로 그리되, 반짝임·사이즈 감쇠·
 * 부드러운 원형 알파를 모두 GPU에서 처리해 CPU 부하를 0에 가깝게 유지한다.
 *
 * attributes:
 *   position        파티클 위치
 *   aColor          파티클 색
 *   aScale          파티클별 크기 배수
 *   aSeed           반짝임 위상(0~1)
 * uniforms:
 *   uTime           경과 시간(초)
 *   uSize           기본 크기 * DPR
 *   uTwinkle        반짝임 강도(0~1)
 */
export const particleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uTwinkle;

  attribute vec3 aColor;
  attribute float aScale;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = aColor;

    // 시간에 따른 반짝임 (씨앗으로 위상 분산)
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 6.2831853);
    vTwinkle = mix(1.0, tw, uTwinkle);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // 원근 사이즈 감쇠: 멀수록 작게 (-mvPosition.z 가 카메라 거리)
    gl_PointSize = uSize * aScale * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const particleFragment = /* glsl */ `
  precision mediump float;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    // 점을 부드러운 원형 글로우로 (사각 픽셀 제거)
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    alpha = pow(alpha, 1.6) * vTwinkle;

    gl_FragColor = vec4(vColor, alpha);
  }
`;
