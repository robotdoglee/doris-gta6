// The minimap: the whole city rasterized once, at boot, into a small offscreen canvas
// (three pixels per tile — roads, water, parks, beach and blocks in flat colours), then
// blipped each frame: Marlo in white, the car he last drove in yellow, and a mission
// marker in orange once stage two gives him somewhere to be. Stage two adds the
// working city around him: the repair yard and the supply shop, the station and the
// hospital — and every Patrulla on the hunt, flashing red and blue.

import { COLS, ROWS, WORLD_H, WORLD_W } from './config.js';
import { T } from './city.js';

const PX_PER_TILE = 3;
export const MAP_W = COLS * PX_PER_TILE;
export const MAP_H = ROWS * PX_PER_TILE;

const TILE_COLORS = {
  [T.ROAD]: '#71727c',
  [T.SIDEWALK]: '#a68d64',
  [T.BUILDING]: '#45403c',
  [T.GRASS]: '#5d9240',
  [T.WATER]: '#256f88',
  [T.SAND]: '#eed9a0',
  [T.BRIDGE]: '#9b7b57',
  [T.LOT]: '#55545c',
};

export function createMinimap(city) {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const ctx = canvas.getContext('2d');
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      ctx.fillStyle = TILE_COLORS[city.tiles[ty * COLS + tx]] ?? '#888';
      ctx.fillRect(tx * PX_PER_TILE, ty * PX_PER_TILE, PX_PER_TILE, PX_PER_TILE);
    }
  }
  return { canvas };
}

function blip(ctx, x, y, color, r) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,10,14,0.65)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Draw the map with its frame at (x, y) in screen space, plus the blips. */
export function drawMinimap(ctx, minimap, state, x, y) {
  ctx.fillStyle = 'rgba(10,10,14,0.55)';
  ctx.fillRect(x - 4, y - 4, MAP_W + 8, MAP_H + 8);
  ctx.drawImage(minimap.canvas, x, y);
  ctx.strokeStyle = 'rgba(255,247,232,0.35)';
  ctx.strokeRect(x - 4.5, y - 4.5, MAP_W + 9, MAP_H + 9);

  const sx = MAP_W / WORLD_W;
  const sy = MAP_H / WORLD_H;
  const { player } = state;

  if (state.mission) {
    const mx = x + state.mission.x * sx;
    const my = y + state.mission.y * sy;
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.moveTo(mx, my - 6);
    ctx.lineTo(mx + 5, my + 4);
    ctx.lineTo(mx - 5, my + 4);
    ctx.closePath();
    ctx.fill();
  }
  if (state.places) {
    blip(ctx, x + state.places.repair.x * sx, y + state.places.repair.y * sy, '#7fd4ff', 2.6);
    blip(ctx, x + state.places.shop.x * sx, y + state.places.shop.y * sy, '#ffd98a', 2.6);
    blip(ctx, x + state.places.station.x * sx, y + state.places.station.y * sy, '#6aa8ff', 2.6);
    blip(ctx, x + state.places.hospital.x * sx, y + state.places.hospital.y * sy, '#ff9d9d', 2.6);
  }
  if (state.police) {
    const flash = Math.floor(state.playSeconds * 2) % 2 === 0;
    for (const unit of state.police.units) {
      blip(ctx, x + unit.x * sx, y + unit.y * sy, flash ? '#5a8aff' : '#ff5a4a', 2.4);
    }
  }
  if (!player.car && state.lastCar) {
    blip(ctx, x + state.lastCar.x * sx, y + state.lastCar.y * sy, '#f2b63c', 3.4);
  }
  // Marlo (or his car): a white dot with a facing tick.
  const px = x + player.x * sx;
  const py = y + player.y * sy;
  blip(ctx, px, py, '#ffffff', 3.8);
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(player.angle) * 8, py + Math.sin(player.angle) * 8);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,247,232,0.8)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N', x + 3, y + 12);
}
