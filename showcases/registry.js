/**
 * 쇼케이스 레지스트리
 *
 * 새 라이브러리 쇼케이스를 추가하려면:
 *   1. showcases/<폴더명>/index.js 를 만들고 아래 스펙에 맞게 export
 *   2. 이 파일에 import 한 줄 + showcases 배열에 항목 추가
 *
 * Showcase 스펙:
 * {
 *   id:          string   — 고유 식별자 (URL 해시로도 쓰임)
 *   title:       string   — 탭에 표시될 이름
 *   icon:        string   — 이모지 또는 SVG 문자열
 *   description: string   — 헤더 설명
 *   init(container: HTMLElement): void  — 쇼케이스 마운트
 *   destroy(): void                     — 이벤트·타이머 정리 (선택, 없으면 생략 가능)
 * }
 */

import gallery from './gallery/index.js';
import perfume from './perfume/index.js';
import threeHero from './three-hero/index.js';
import gsap from './gsap/index.js';
import animejs from './anime-js/index.js';
import exampleLibrary from './example-library/index.js';

export const showcases = [
  gallery,
  perfume,
  threeHero,
  gsap,
  animejs,
  exampleLibrary,
  // 여기에 새 쇼케이스 추가
];
