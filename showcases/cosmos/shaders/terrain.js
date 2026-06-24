/**
 * terrain — 파티클 지형 GLSL (Simplex Noise 기반)
 *
 * XZ 격자 위의 수십만 점을 정점 셰이더에서 3D Simplex Noise 로 변위시켜
 * "산맥과 파도 사이"의 유기적 지형을 만든다. CPU는 격자만 한 번 올리고,
 * 높낮이·흐름·호흡·색은 전부 GPU 절차 계산이라 매 프레임 비용이 거의 없다.
 *
 *   - ridge(저주파 snoise)   → 거대한 산맥
 *   - detail(fbm 4옥타브)     → 잔물결(파도)
 *   - uFlow                   → 노이즈 좌표를 시간축으로 흘려 "흐름"
 *   - uBreath                 → 진폭을 sin 으로 호흡시켜 "살아있는" 느낌
 *   - 가장자리 페이드          → 격자 경계를 우주로 용해(무한감 + 경계 은닉)
 *
 * snoise(vec3): Ashima Arts WebGL-noise (MIT) — 검증된 표준 구현.
 */
const SIMPLEX = /* glsl */ `
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }
`;

export const terrainVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uAmp;     // 높이 진폭 (스케일)
  uniform float uFreq;    // 수평 주파수 (지형 디테일 밀도)
  uniform float uFlow;    // 시간축 흐름 속도
  uniform float uBreath;  // 호흡 속도
  uniform float uHalf;    // 격자 반폭 (가장자리 페이드용)
  uniform vec2  uMouse;   // 마우스의 지형 위 월드 xz
  uniform float uMouseR;  // 마우스 영향 반경
  uniform float uMouseOn; // 마우스 영향 세기 (0~1, 포인터 떠나면 0)

  attribute float aRand;

  varying vec3 vColor;
  varying float vAlpha;

  ${SIMPLEX}

  // 능선형(ridged) 멀티프랙탈 — 날카롭고 유기적인 산맥 능선을 만든다
  float ridged(vec3 p){
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 5; i++){
      float n = 1.0 - abs(snoise(p * f)); // 능선(접힌 노이즈)
      n *= n;                              // 날카롭게
      v += a * n;
      f *= 2.0; a *= 0.5;
    }
    return v;
  }

  void main(){
    vec3 pos = position;
    vec2 q = pos.xz * uFreq;
    float tt = uTime * uFlow;             // 매우 느린 시간 진행 (파도가 아닌 미세 변형)

    // 느린 도메인 워프 → 산맥이 살아있는 듯 끊임없이 형태를 바꿈
    float warp = snoise(vec3(q * 0.6, tt)) * 0.55;
    vec3 mp = vec3(q + warp, tt * 0.6);

    float undulate  = snoise(mp * 0.35) * 0.55; // 큰 기복 (완만한 대지)
    float mountains = ridged(mp);               // 유기적 산맥 능선
    float h = undulate + mountains * 1.25 - 0.55; // 0 근처로 센터링

    float breath = 1.0 + sin(uTime * uBreath) * 0.10;    // 호흡 (진폭 맥동)
    pos.y = h * uAmp * breath + sin(uTime * 0.08) * 5.0;  // 전체 완만한 상하 호흡

    // 높이로 색 결정 (골짜기 인디고 → 능선 청록 → 봉우리 백청)
    float t = clamp(h * 0.62 + 0.42, 0.0, 1.0);
    vec3 cLow  = vec3(0.05, 0.08, 0.30);
    vec3 cMid  = vec3(0.10, 0.55, 0.68);
    vec3 cHigh = vec3(0.78, 1.00, 0.94);
    vColor = (t < 0.5)
      ? mix(cLow, cMid, t * 2.0)
      : mix(cMid, cHigh, (t - 0.5) * 2.0);

    // 봉우리일수록 또렷, 골짜기일수록 옅게
    vAlpha = 0.30 + t * 0.70;

    // 가장자리를 우주로 용해 (경계 은닉 + 무한감)
    float edge = 1.0 - smoothstep(0.62, 1.0, length(pos.xz) / uHalf);
    vAlpha *= edge;

    // ── 마우스 인터랙션: 커서 근처 입자가 솟아오르고 밝아짐 ──
    float md = distance(pos.xz, uMouse);
    float infl = (1.0 - smoothstep(0.0, uMouseR, md)) * uMouseOn;
    infl = pow(infl, 1.4);
    pos.y += infl * (13.0 + sin(uTime * 2.5 + md * 0.04) * 4.0); // 살짝 솟음 + 미세 진동
    vColor += infl * vec3(0.28, 0.38, 0.42);                      // 밝아짐
    vAlpha = min(1.0, vAlpha + infl * 0.6);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uSize * (0.7 + aRand * 0.6) * (340.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const terrainFragment = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;

  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.5) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;
