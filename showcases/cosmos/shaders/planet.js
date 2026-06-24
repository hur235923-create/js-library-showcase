/**
 * planet — 천체(프로젝트) 프레넬 글로우 셰이더
 *
 * 씬에 조명이 없으므로 표준 머티리얼 대신 프레넬(가장자리 발광)으로
 * 스스로 빛나는 행성을 만든다. 가장자리가 밝게 타오르고 표면엔 미세한
 * 띠(band)가 흐르며 천체다운 질감을 준다. 불투명(깊이 정렬됨).
 */
export const planetVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const planetFragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uActive; // 0~1: 가까이서 활성화되면 더 밝게
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
    float band = 0.5 + 0.5 * sin(vNormal.y * 7.0 + uTime * 0.4);
    vec3 col = uColor * (0.16 + band * 0.10)        // 표면
             + uColor * fres * (1.3 + uActive * 0.9); // 가장자리 발광
    col += uColor * uActive * 0.15;
    gl_FragColor = vec4(col, 1.0);
  }
`;
