// The camera: a VIEW_W x VIEW_H window on the world that glides after its target with a
// little look-ahead in the direction of travel, and never shows anything past the
// city limits. The renderer asks it for the visible rectangle each frame.

import { VIEW_H, VIEW_W, WORLD_H, WORLD_W } from './config.js';

export function createCamera() {
  const cam = {
    x: 0,
    y: 0,
    viewW: VIEW_W,
    viewH: VIEW_H,
    /** Snap straight to a point (spawn, screenshot scenes). */
    jumpTo(cx, cy) {
      cam.x = clamp(cx - cam.viewW / 2, 0, Math.max(0, WORLD_W - cam.viewW));
      cam.y = clamp(cy - cam.viewH / 2, 0, Math.max(0, WORLD_H - cam.viewH));
    },
    /** Glide toward a point; `leadX/leadY` peek ahead of movement. */
    follow(cx, cy, leadX, leadY, dt) {
      const k = 1 - Math.exp(-dt * 5.5);
      const tx = clamp(cx + leadX - cam.viewW / 2, 0, Math.max(0, WORLD_W - cam.viewW));
      const ty = clamp(cy + leadY - cam.viewH / 2, 0, Math.max(0, WORLD_H - cam.viewH));
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
    },
  };
  return cam;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
