/**
 * disposal — Three.js GPU 리소스 해제 유틸
 *
 * WebGL 컨텍스트는 GC로 자동 회수되지 않는다. 씬 전환/언마운트 때
 * geometry·material·texture를 명시적으로 dispose 해야 메모리 누수가 없다.
 * 모든 씬이 동일한 정리 로직을 공유하도록 한 곳에 둔다.
 */
export function disposeObject(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        for (const key in m) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}
