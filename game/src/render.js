// Drawing the world: tiles, roads with their markings, bridges, parks, beaches,
// buildings with signs and windows that light up as the light fails, then the actors —
// cars, pedestrians, Marlo. The camera decides what is visible; everything outside
// the view is skipped. A warm dusk tint settles over the whole scene late in the day.
//
// The renderer owns the canvas transform: worldTransform() for the scene, then
// screenTransform() so the HUD and minimap can draw in plain CSS pixels.

import { COLS, FONT, PALETTE, ROWS, TILE, VIEW_H, VIEW_W, WORLD_H, WORLD_W } from './config.js';
import { T } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawPlayer } from './player.js';

/** 0 in full afternoon sun, 1 at deepest dusk. The day slides there and back. */
export function duskFactor(dayTime) {
  if (dayTime < 0.55) return 0;
  if (dayTime < 0.8) return (dayTime - 0.55) / 0.25;
  if (dayTime < 0.92) return 1;
  return Math.max(0, 1 - (dayTime - 0.92) / 0.13);
}

/** Cheap deterministic hash of two integers, for per-tile and per-window variation. */
function hash(a, b) {
  let h = (a * 73856093) ^ (b * 19349663) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 0x2545f491);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  let scale = 1;

  const renderer = {
    canvas,
    ctx,
    viewW: VIEW_W,
    viewH: VIEW_H,
    width: VIEW_W,
    height: VIEW_H,

    resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = Math.max(w / VIEW_W, h / VIEW_H);
      renderer.width = w;
      renderer.height = h;
      renderer.viewW = w / scale;
      renderer.viewH = h / scale;
    },

    worldTransform(camera) {
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -camera.x * dpr * scale, -camera.y * dpr * scale);
    },

    screenTransform() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    /** The whole scene, in world coordinates. `time` (seconds) animates the water. */
    drawWorld(state, camera, time) {
      const dusk = duskFactor(state.dayTime);
      const x0 = Math.max(0, Math.floor(camera.x / TILE));
      const y0 = Math.max(0, Math.floor(camera.y / TILE));
      const x1 = Math.min(COLS - 1, Math.floor((camera.x + renderer.viewW) / TILE));
      const y1 = Math.min(ROWS - 1, Math.floor((camera.y + renderer.viewH) / TILE));

      drawTiles(state, camera, x0, y0, x1, y1, time);
      drawRoadPaint(state, camera);
      drawBuildings(state, camera, dusk);
      drawTrees(state, camera);
      drawPlaces(state, camera, time);
      for (const car of state.cars) {
        if (inView(car.x, car.y, camera, renderer, 90)) drawCar(ctx, car, dusk);
      }
      for (const ped of state.peds) {
        if (inView(ped.x, ped.y, camera, renderer, 40)) drawPed(ctx, ped);
      }
      if (!state.player.car) drawPlayer(ctx, state.player);
      drawEffects(state);

      // Dusk: a violet shade, with a band of sunset warmth while it is arriving.
      if (dusk > 0.01) {
        ctx.fillStyle = PALETTE.duskTint;
        ctx.globalAlpha = dusk * 0.30;
        ctx.fillRect(camera.x - 4, camera.y - 4, renderer.viewW + 8, renderer.viewH + 8);
        ctx.fillStyle = PALETTE.sunsetTint;
        ctx.globalAlpha = Math.sin(dusk * Math.PI) * 0.08;
        ctx.fillRect(camera.x - 4, camera.y - 4, renderer.viewW + 8, renderer.viewH + 8);
        ctx.globalAlpha = 1;
      }
    },
  };

  function inView(x, y, camera, r, pad) {
    return x > camera.x - pad && x < camera.x + r.viewW + pad && y > camera.y - pad && y < camera.y + r.viewH + pad;
  }

  /** The working places: pulsing pads for the two businesses, name chips for the rest,
   *  and a light-beam with a bobbing triangle wherever the story wants Marlo next. */
  function drawPlaces(state, camera, time) {
    const places = state.places;
    if (places) {
      const zones = [
        [places.repair, '#7fd4ff', 'R', 'REPAIRS'],
        [places.shop, '#ffd98a', 'S', 'SUPPLY'],
      ];
      for (const [pt, color, letter, label] of zones) {
        if (!inView(pt.x, pt.y, camera, renderer, 80)) continue;
        const pulse = 26 + Math.sin(time * 3) * 3;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff7e8';
        ctx.font = `bold 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(letter, pt.x, pt.y + 6);
        ctx.font = `bold 9.5px ${FONT}`;
        ctx.fillText(label, pt.x, pt.y + pulse + 13);
      }
      const chips = [
        [places.station, 'COMISARÍA'],
        [places.hospital, 'CLÍNICA VIDA'],
        [places.giver, 'DOCK OFFICE'],
      ];
      for (const [pt, label] of chips) {
        if (!inView(pt.x, pt.y, camera, renderer, 80)) continue;
        ctx.font = `bold 10px ${FONT}`;
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(24,16,12,0.6)';
        ctx.fillRect(pt.x - w / 2, pt.y - 26, w, 15);
        ctx.fillStyle = '#fff7e8';
        ctx.textAlign = 'center';
        ctx.fillText(label, pt.x, pt.y - 15);
      }
    }
    if (state.mission) {
      const m = state.mission;
      if (inView(m.x, m.y, camera, renderer, 220)) {
        const grad = ctx.createLinearGradient(0, m.y - 200, 0, m.y);
        grad.addColorStop(0, 'rgba(255,154,60,0)');
        grad.addColorStop(1, 'rgba(255,154,60,0.20)');
        ctx.fillStyle = grad;
        ctx.fillRect(m.x - 7, m.y - 200, 14, 200);
        const bob = Math.sin(time * 3) * 5;
        ctx.fillStyle = '#ff9a3c';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y - 18 + bob);
        ctx.lineTo(m.x + 10, m.y - 34 + bob);
        ctx.lineTo(m.x - 10, m.y - 34 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** Combat's brief fireworks: tracer lines, impact flashes, the arc of a swing. */
  function drawEffects(state) {
    if (!state.effects) return;
    for (const e of state.effects) {
      const alpha = Math.max(0, e.ttl / e.max);
      if (e.kind === 'tracer') {
        ctx.strokeStyle = `rgba(255,220,130,${alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.ax, e.ay);
        ctx.lineTo(e.bx, e.by);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (e.kind === 'flash') {
        ctx.fillStyle = `rgba(255,240,180,${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(e.bx, e.by, 11, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'swing') {
        ctx.strokeStyle = `rgba(255,247,232,${alpha})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(e.bx, e.by, 13, -0.7, 0.9);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }

  function drawTiles(state, camera, x0, y0, x1, y1, time) {
    const { city } = state;
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const tile = city.tiles[ty * COLS + tx];
        const px = tx * TILE;
        const py = ty * TILE;
        switch (tile) {
          case T.ROAD:
            ctx.fillStyle = (tx + ty) % 2 ? PALETTE.asphalt : PALETTE.asphaltDark;
            ctx.fillRect(px, py, TILE, TILE);
            break;
          case T.SIDEWALK:
            ctx.fillStyle = PALETTE.sidewalk;
            ctx.fillRect(px, py, TILE, TILE);
            ctx.strokeStyle = 'rgba(120,90,50,0.10)';
            ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
            break;
          case T.GRASS:
            ctx.fillStyle = hash(tx, ty) > 0.5 ? PALETTE.grass : PALETTE.grassDark;
            ctx.fillRect(px, py, TILE, TILE);
            ctx.fillStyle = 'rgba(40,80,30,0.25)';
            ctx.fillRect(px + hash(tx, ty + 9) * 36 + 4, py + hash(tx + 7, ty) * 36 + 4, 3, 3);
            ctx.fillRect(px + hash(tx + 3, ty + 5) * 36 + 4, py + hash(tx, ty + 2) * 36 + 4, 3, 3);
            break;
          case T.WATER: {
            ctx.fillStyle = PALETTE.water;
            ctx.fillRect(px, py, TILE, TILE);
            const drift = Math.sin(time * 0.9 + (tx * 1.7 + ty * 2.3)) * 5;
            ctx.strokeStyle = `rgba(191,232,239,${0.16 + 0.1 * Math.sin(time * 1.3 + tx + ty)})`;
            ctx.beginPath();
            ctx.moveTo(px + 8 + drift, py + 15);
            ctx.lineTo(px + 24 + drift, py + 15);
            ctx.moveTo(px + 18 - drift, py + 33);
            ctx.lineTo(px + 36 - drift, py + 33);
            ctx.stroke();
            break;
          }
          case T.SAND:
            ctx.fillStyle = PALETTE.sand;
            ctx.fillRect(px, py, TILE, TILE);
            ctx.fillStyle = 'rgba(160,120,60,0.20)';
            ctx.fillRect(px + hash(tx, ty) * 38 + 3, py + hash(ty, tx) * 38 + 3, 2.6, 2.6);
            break;
          case T.BRIDGE:
            ctx.fillStyle = PALETTE.bridge;
            ctx.fillRect(px, py, TILE, TILE);
            ctx.strokeStyle = 'rgba(70,48,26,0.35)';
            for (let lx = 8; lx < TILE; lx += 12) {
              ctx.beginPath();
              ctx.moveTo(px + lx, py);
              ctx.lineTo(px + lx, py + TILE);
              ctx.stroke();
            }
            ctx.fillStyle = PALETTE.bridgeRail;
            ctx.fillRect(px, py, TILE, 4);
            ctx.fillRect(px, py + TILE - 4, TILE, 4);
            break;
          case T.LOT:
            ctx.fillStyle = PALETTE.lot;
            ctx.fillRect(px, py, TILE, TILE);
            break;
          default:
            // BUILDING tiles are covered by the building rectangles themselves;
            // anything else shows the pavement colour so a gap never flashes.
            ctx.fillStyle = PALETTE.sidewalk;
            ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
    // Parking bay outlines, where the lots marked them.
    ctx.strokeStyle = 'rgba(255,247,232,0.35)';
    ctx.lineWidth = 1.6;
    for (const spot of state.city.parkingSpots) {
      if (!inView(spot.x, spot.y, camera, renderer, 60)) continue;
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);
      ctx.beginPath();
      ctx.moveTo(-13, -26);
      ctx.lineTo(-13, 26);
      ctx.lineTo(13, 26);
      ctx.lineTo(13, -26);
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = 1;
  }

  function drawRoadPaint(state, camera) {
    const { city } = state;
    // Dashed centre lines along every avenue and street.
    ctx.strokeStyle = PALETTE.laneLine;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    for (const road of city.vRoads) {
      if (road.center < camera.x - 60 || road.center > camera.x + renderer.viewW + 60) continue;
      ctx.beginPath();
      ctx.moveTo(road.center, Math.max(0, camera.y - 20));
      ctx.lineTo(road.center, Math.min(WORLD_H, camera.y + renderer.viewH + 20));
      ctx.stroke();
    }
    for (const road of city.hRoads) {
      if (road.center < camera.y - 60 || road.center > camera.y + renderer.viewH + 60) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, camera.x - 20), road.center);
      ctx.lineTo(Math.min(WORLD_W, camera.x + renderer.viewW + 20), road.center);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Crosswalks and painted street names at the crossings.
    ctx.fillStyle = PALETTE.crosswalk;
    ctx.font = `bold 13px ${FONT}`;
    for (const cross of city.intersections) {
      if (!inView(cross.x, cross.y, camera, renderer, 130)) continue;
      ctx.globalAlpha = 0.42;
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(cross.x + i * 18 - 5, cross.y - 92, 10, 26);
        ctx.fillRect(cross.x + i * 18 - 5, cross.y + 66, 10, 26);
        ctx.fillRect(cross.x - 92, cross.y + i * 18 - 5, 26, 10);
        ctx.fillRect(cross.x + 66, cross.y + i * 18 - 5, 26, 10);
      }
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(cross.street, cross.x + 58, cross.y + 118);
      ctx.save();
      ctx.translate(cross.x - 104, cross.y + 58);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(cross.avenue, 0, 0);
      ctx.restore();
      ctx.fillStyle = PALETTE.crosswalk;
    }
    ctx.globalAlpha = 1;
  }

  function drawBuildings(state, camera, dusk) {
    const litFraction = 0.12 + dusk * 0.75;
    for (const b of state.city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, camera, renderer, Math.max(b.w, b.h))) continue;
      const facadeH = Math.min(30, b.height * 0.5);
      // Shadow, stretched as the sun drops.
      ctx.fillStyle = PALETTE.buildingShadow;
      ctx.fillRect(b.x + 5 + dusk * 9, b.y + 7 + dusk * 5, b.w, b.h + facadeH);
      // The sunlit south face, with its windows.
      ctx.fillStyle = b.facade;
      ctx.fillRect(b.x, b.y + b.h, b.w, facadeH);
      const cols = Math.max(1, Math.floor(b.w / 15));
      const rows = Math.max(1, Math.floor(facadeH / 12));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const lit = hash(b.seed + c * 31, r * 57) < litFraction;
          ctx.fillStyle = lit ? '#ffd98a' : 'rgba(28,30,44,0.55)';
          ctx.fillRect(b.x + 6 + c * 15, b.y + b.h + 4 + r * 12, 7, 6);
        }
      }
      // Roof: parapet, inner field, a rooftop box or two.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(90,70,50,0.35)';
      const ax = b.x + 10 + hash(b.seed, 3) * Math.max(4, b.w - 44);
      const ay = b.y + 10 + hash(b.seed, 5) * Math.max(4, b.h - 40);
      ctx.fillRect(ax, ay, 20, 14);
      if (b.w > 130) ctx.fillRect(ax + 34, ay + 6, 14, 10);
      // The sign, on a trim band along the top of the face.
      if (b.w > 74 && facadeH > 12) {
        ctx.fillStyle = b.trim;
        ctx.fillRect(b.x, b.y + b.h - 1, b.w, 13);
        ctx.fillStyle = '#fff7e8';
        ctx.font = `bold 9.5px ${FONT}`;
        ctx.textAlign = 'center';
        const label = b.sign.length * 6.4 > b.w - 10 ? `${b.sign.slice(0, Math.floor((b.w - 14) / 6.4))}…` : b.sign;
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h + 9);
      }
    }
  }

  function drawTrees(state, camera) {
    for (const tree of state.city.trees) {
      if (!inView(tree.x, tree.y, camera, renderer, 40)) continue;
      ctx.fillStyle = 'rgba(40,22,14,0.22)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 3, tree.y + 4, tree.r * 0.9, tree.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (tree.palm) {
        ctx.strokeStyle = '#3f7a34';
        ctx.lineWidth = 2.4;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + tree.x * 0.01;
          ctx.beginPath();
          ctx.moveTo(tree.x, tree.y);
          ctx.quadraticCurveTo(
            tree.x + Math.cos(a) * tree.r * 0.8,
            tree.y + Math.sin(a) * tree.r * 0.8 - 3,
            tree.x + Math.cos(a) * tree.r * 1.25,
            tree.y + Math.sin(a) * tree.r * 1.25 + 3,
          );
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.fillStyle = '#8a6b42';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#3f7a34';
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#579c46';
        ctx.beginPath();
        ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.25, tree.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return renderer;
}
