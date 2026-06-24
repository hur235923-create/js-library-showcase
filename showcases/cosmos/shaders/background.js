/**
 * background — 우주 공간 배경 돔 GLSL
 *
 * 거대한 구(BackSide)에 입혀 "하늘"을 만든다. 단색 검정이 아니라:
 *   - 방향(dir) 기반 딥 블루-블랙 그라데이션 → 깊이감
 *   - 절차적 fbm 노이즈가 아주 옅은 안개(성운기)를 천천히 흐르게
 *   - gl_FragCoord 기반 필름 그레인 → 실제 카메라로 우주를 찍은 듯한 노이즈
 *   - 미세 디더링으로 그라데이션 밴딩 제거
 *
 * 모두 GPU 절차 생성이라 텍스처/메모리 부담이 없다.
 */
export const bgVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;                       // 구 로컬 위치 = 시선 방향
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const bgFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec3 vDir;

  // ── 값 노이즈 / fbm (3D) ──────────────────────────
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);

    // 딥 블랙 그라데이션 (위→아래로 미묘하게 다른 청흑색)
    float h = dir.y * 0.5 + 0.5;
    vec3 top    = vec3(0.013, 0.018, 0.040);
    vec3 bottom = vec3(0.004, 0.005, 0.016);
    vec3 col = mix(bottom, top, smoothstep(0.0, 1.0, h));

    // 중앙(정면 -z)으로 갈수록 아주 옅게 밝혀 시선을 모음
    float center = smoothstep(0.2, 1.0, -dir.z);
    col += vec3(0.010, 0.012, 0.022) * center;

    // 천천히 흐르는 성운기(안개) — 인디고/마젠타 계열을 미세하게
    float mist = fbm(dir * 2.4 + vec3(uTime * 0.012, uTime * 0.008, 0.0));
    mist = smoothstep(0.45, 1.0, mist);
    col += vec3(0.05, 0.025, 0.07) * mist * 0.55;

    // 필름 그레인 (시간에 따라 매 프레임 갱신)
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))
                  + uTime * 11.0) * 43758.5453);
    col += (grain - 0.5) * 0.020;

    gl_FragColor = vec4(col, 1.0);
  }
`;
