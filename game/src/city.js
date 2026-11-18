// Puerto Solmaris, generated: a regular grid of avenues (north-south) and streets
// (east-west) around 6x6-tile blocks. Most blocks carry buildings with names and lit
// windows; some are parks, some are parking lots. A river cuts the city at tile columns
// 45-46 and the streets cross it on bridges; the bay fills the east edge behind a beach.
//
// The generator is pure layout: it returns tile data, building rectangles, road centre
// lines, intersections, spawn spots and name lookups. Nothing here moves; vehicles,
// pedestrians and the renderer all read from this one description of the city.

import { COLS, ROWS, TILE, WORLD_H, WORLD_W } from './config.js';
import { chance, pick, randInt, randRange } from './random.js';

export const T = {
  ROAD: 0,
  SIDEWALK: 1,
  BUILDING: 2,
  GRASS: 3,
  WATER: 4,
  SAND: 5,
  BRIDGE: 6,
  LOT: 7,
};

/** Tiles between one road pair and the next: 2 of road, 6 of block. */
const PITCH = 8;
const RIVER_COLS = [45, 46];
const BAY_COL = 62;
const BEACH_COL = 61;

const AVENUES = [
  'Avenida del Faro',
  'Palm Row',
  'Avenida Coral',
  'Calle Brisa',
  'Avenida Miramar',
  'Calle Solano',
  'Avenida Palma Real',
  'Paseo del Muelle',
];
const STREETS = [
  'Calle Alba',
  'Avenida Horizonte',
  'Calle Marea',
  'Paseo del Puerto',
  'Calle Jazmín',
  'Avenida Atardecer',
];
const SIGNS = [
  'Hotel Brisa', 'Café Solano', 'Taller Reyes', 'Farmacia Luz', 'Mercado Central',
  'Bar La Ola', 'Hotel Miramar', 'Peluquería Ana', 'Tacos El Faro', 'Banco del Sol',
  'Librería Coral', 'Gimnasio Ola', 'Restaurante Marea', 'Joyas Palma', 'Clínica Vida',
  'Cine Atardecer', 'Floristería Jazmín', 'Panadería Alba', 'Taller del Puerto',
  'Hotel Palma Real', 'Café Horizonte', 'Mariscos Delfín', 'Óptica Clara', 'Bar El Ancla',
];
const ROOFS = ['#e8e0cd', '#df8f6a', '#c96f4a', '#e5c07b', '#a8c3bc', '#d97971', '#efe0c0', '#caa472', '#8fb8ad', '#e3d7ee'];
const TRIMS = ['#8a4b2d', '#5d7a72', '#7a3b3b', '#96762f', '#4f6d8a', '#6e4a2f'];

const isRoadCol = (tx) => tx % PITCH < 2;
const isRoadRow = (ty) => ty % PITCH < 2;
const isRiver = (tx) => RIVER_COLS.includes(tx);

/** Darken or lighten a #rrggbb colour by `amt` in [-1, 1]. */
function shade(hex, amt) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function generateCity(rng) {
  const tiles = new Uint8Array(COLS * ROWS);
  const buildings = [];
  const trees = [];
  const parkingSpots = [];

  // Base pass: water, roads and beach. Blocks are filled in afterwards.
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      let tile = T.SIDEWALK;
      if (isRiver(tx)) tile = isRoadRow(ty) ? T.BRIDGE : T.WATER;
      else if (tx >= BAY_COL) tile = isRoadRow(ty) ? T.ROAD : T.WATER;
      else if (tx === BEACH_COL && !isRoadRow(ty)) tile = T.SAND;
      else if (isRoadCol(tx) || isRoadRow(ty)) tile = T.ROAD;
      tiles[ty * COLS + tx] = tile;
    }
  }

  // Block pass: every 6x6 area between roads gets a job.
  for (let by = 2; by + 5 < ROWS; by += PITCH) {
    for (let bx = 2; bx + 5 < COLS; bx += PITCH) {
      fillBlock(bx, by);
    }
  }

  function setTile(tx, ty, tile) {
    if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS) tiles[ty * COLS + tx] = tile;
  }

  function fillBlock(bx, by) {
    const touchesRiver = bx <= RIVER_COLS[1] && bx + 5 >= RIVER_COLS[0];
    const isBeachBlock = bx + 5 >= BEACH_COL;
    // Perimeter is always pavement.
    for (let i = 0; i < 6; i += 1) {
      setTile(bx + i, by, T.SIDEWALK);
      setTile(bx + i, by + 5, T.SIDEWALK);
      setTile(bx, by + i, T.SIDEWALK);
      setTile(bx + 5, by + i, T.SIDEWALK);
    }
    if (touchesRiver) {
      // A riverside park: lawns and palms, a sandy promenade along the water.
      for (let ty = by + 1; ty <= by + 4; ty += 1) {
        for (let tx = bx + 1; tx <= bx + 4; tx += 1) {
          if (isRiver(tx)) continue; // water or bridge, already set
          setTile(tx, ty, tx === RIVER_COLS[0] - 1 || tx === RIVER_COLS[1] + 1 ? T.SAND : T.GRASS);
        }
      }
      scatterTrees(bx, by, 7);
      return;
    }
    if (isBeachBlock) {
      for (let ty = by + 1; ty <= by + 4; ty += 1) {
        for (let tx = bx + 1; tx <= bx + 4; tx += 1) {
          if (tiles[ty * COLS + tx] !== T.WATER) setTile(tx, ty, T.SAND);
        }
      }
      scatterTrees(bx, by, 5);
      return;
    }
    const roll = rng();
    if (roll < 0.6) fillBuildings(bx, by);
    else if (roll < 0.8) fillPark(bx, by);
    else fillLot(bx, by);
  }

  function scatterTrees(bx, by, count) {
    for (let i = 0; i < count; i += 1) {
      const x = (bx + randRange(rng, 0.7, 5.3)) * TILE;
      const y = (by + randRange(rng, 0.7, 5.3)) * TILE;
      const tile = tiles[Math.floor(y / TILE) * COLS + Math.floor(x / TILE)];
      if (tile === T.GRASS || tile === T.SAND) trees.push({ x, y, r: randRange(rng, 11, 17), palm: chance(rng, 0.5) });
    }
  }

  function fillPark(bx, by) {
    for (let ty = by + 1; ty <= by + 4; ty += 1) {
      for (let tx = bx + 1; tx <= bx + 4; tx += 1) setTile(tx, ty, T.GRASS);
    }
    // A cross of paths through the middle.
    for (let i = 1; i <= 4; i += 1) {
      setTile(bx + i, by + 2, T.SIDEWALK);
      setTile(bx + 2, by + i, T.SIDEWALK);
    }
    scatterTrees(bx, by, 8);
  }

  function fillLot(bx, by) {
    for (let ty = by + 1; ty <= by + 4; ty += 1) {
      for (let tx = bx + 1; tx <= bx + 4; tx += 1) setTile(tx, ty, T.LOT);
    }
    // Marked bays along the top and bottom edges of the lot.
    const top = (by + 1) * TILE + 30;
    const bottom = (by + 5) * TILE - 30;
    for (let x = (bx + 1) * TILE + 34; x < (bx + 5) * TILE - 20; x += 56) {
      parkingSpots.push({ x, y: top, angle: -Math.PI / 2 });
      parkingSpots.push({ x, y: bottom, angle: Math.PI / 2 });
    }
  }

  function addBuilding(x, y, w, h) {
    const roof = pick(rng, ROOFS);
    const building = {
      x, y, w, h,
      roof,
      trim: pick(rng, TRIMS),
      facade: shade(roof, -0.16),
      height: randInt(rng, 12, 34),
      sign: pick(rng, SIGNS),
      seed: randInt(rng, 1, 2147483646),
    };
    buildings.push(building);
    const tx0 = Math.floor(x / TILE);
    const tx1 = Math.floor((x + w - 1) / TILE);
    const ty0 = Math.floor(y / TILE);
    const ty1 = Math.floor((y + h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) setTile(tx, ty, T.BUILDING);
    }
  }

  function fillBuildings(bx, by) {
    const ix = (bx + 1) * TILE;
    const iy = (by + 1) * TILE;
    const iw = 4 * TILE;
    const ih = 4 * TILE;
    const layout = rng();
    if (layout < 0.34) {
      addBuilding(ix + 14, iy + 14, iw - 28, ih - 28);
    } else if (layout < 0.67) {
      const gap = 14;
      if (chance(rng, 0.5)) {
        addBuilding(ix + 10, iy + 12, (iw - gap) / 2 - 10, ih - 24);
        addBuilding(ix + (iw + gap) / 2, iy + 12, (iw - gap) / 2 - 10, ih - 24);
      } else {
        addBuilding(ix + 12, iy + 10, iw - 24, (ih - gap) / 2 - 10);
        addBuilding(ix + 12, iy + (ih + gap) / 2, iw - 24, (ih - gap) / 2 - 10);
      }
    } else {
      const gap = 12;
      const w = (iw - gap) / 2 - 14;
      const h = (ih - gap) / 2 - 14;
      addBuilding(ix + 8, iy + 8, w, h);
      addBuilding(ix + iw - w - 8, iy + 8, w, h);
      addBuilding(ix + 8, iy + ih - h - 8, w, h);
      addBuilding(ix + iw - w - 8, iy + ih - h - 8, w, h);
    }
  }

  // Road centre lines and intersections, with the names the HUD and minimap show.
  const vRoads = [];
  const hRoads = [];
  for (let tx = 0; tx < COLS; tx += PITCH) vRoads.push({ center: (tx + 1) * TILE, name: AVENUES[vRoads.length % AVENUES.length] });
  for (let ty = 0; ty < ROWS; ty += PITCH) hRoads.push({ center: (ty + 1) * TILE, name: STREETS[hRoads.length % STREETS.length] });
  const intersections = [];
  for (const v of vRoads) {
    for (const h of hRoads) intersections.push({ x: v.center, y: h.center, key: `${v.center},${h.center}`, avenue: v.name, street: h.name });
  }

  // Where pedestrians may wander and where traffic may appear.
  const sidewalkSpots = [];
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (tiles[ty * COLS + tx] === T.SIDEWALK) sidewalkSpots.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
    }
  }
  const trafficSpawns = [];
  for (const v of vRoads) {
    for (let y = 240; y < WORLD_H - 200; y += 470) trafficSpawns.push({ road: v.center, pos: y, heading: randInt(rng, 0, 1) === 0 ? 3 : 1 });
  }
  for (const h of hRoads) {
    for (let x = 240; x < WORLD_W - 200; x += 470) trafficSpawns.push({ road: h.center, pos: x, heading: randInt(rng, 0, 1) === 0 ? 0 : 2 });
  }

  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? T.WATER : tiles[ty * COLS + tx]);
  const tileAtPx = (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE));

  /** Solid for a walker or a car: inside a building rectangle, or in the water. */
  function isSolidPx(x, y) {
    if (x < 4 || y < 4 || x > WORLD_W - 4 || y > WORLD_H - 4) return true;
    if (tileAtPx(x, y) === T.WATER) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2) return true;
    }
    return false;
  }

  /** True when a circle at (x, y) touches nothing solid. */
  function circleFree(x, y, r) {
    return !isSolidPx(x - r, y) && !isSolidPx(x + r, y) && !isSolidPx(x, y - r) && !isSolidPx(x, y + r)
      && !isSolidPx(x - r * 0.7, y - r * 0.7) && !isSolidPx(x + r * 0.7, y + r * 0.7)
      && !isSolidPx(x - r * 0.7, y + r * 0.7) && !isSolidPx(x + r * 0.7, y - r * 0.7);
  }

  /** The road name at a point, or the crossing of the two nearest roads. */
  function streetNameAt(x, y) {
    let v = null;
    let h = null;
    for (const road of vRoads) if (Math.abs(x - road.center) <= TILE) v = road;
    for (const road of hRoads) if (Math.abs(y - road.center) <= TILE) h = road;
    if (v && h) return `${v.name} & ${h.name}`;
    if (v) return v.name;
    if (h) return h.name;
    let best = null;
    let bestDist = Infinity;
    for (const road of vRoads) {
      const d = Math.abs(x - road.center);
      if (d < bestDist) { bestDist = d; best = road.name; }
    }
    for (const road of hRoads) {
      const d = Math.abs(y - road.center);
      if (d < bestDist) { bestDist = d; best = road.name; }
    }
    return best ?? 'Puerto Solmaris';
  }

  return {
    tiles, buildings, trees, parkingSpots, sidewalkSpots, trafficSpawns,
    vRoads, hRoads, intersections, tileAt, tileAtPx, isSolidPx, circleFree, streetNameAt,
  };
}
