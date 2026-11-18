// Pedestrians: the people of Solmaris out for a stroll. Each one picks a pavement spot
// a few blocks away and walks to it, then picks another. They keep off the buildings
// and out of the water by construction (targets are pavement, and a step that would
// end inside something solid is refused). A car coming fast and close makes them hop
// aside and run for a moment — self-preservation, stage one; tempers come later.

import { PEDS, TILE } from './config.js';
import { pick, randRange } from './random.js';

const SKIN = ['#f2c79b', '#d9a066', '#a9713f', '#7a4a26', '#ffe0bd'];
const SHIRTS = ['#e4572e', '#f2b63c', '#7fb3a3', '#e8e3d8', '#b5526b', '#4a6fa5', '#5d8a66', '#d97971'];
const PANTS = ['#33415c', '#5c4a33', '#e8e3d8', '#7a3b3b', '#2f4f4f'];

export function createPed(rng, x, y) {
  return {
    x, y,
    angle: randRange(rng, 0, Math.PI * 2),
    speed: randRange(rng, PEDS.walkMin, PEDS.walkMax),
    target: null,
    retarget: 0,
    state: 'walk', // 'walk' | 'flee'
    fleeTime: 0,
    // Stage two: knocked flat by a car, a fist or a bullet (downTime counts back up),
    // and — for the story's Salcedo men — hostile, driven by missions.js instead.
    down: false,
    downTime: 0,
    hostile: false,
    atkCd: 0,
    phase: randRange(rng, 0, Math.PI * 2),
    skin: pick(rng, SKIN),
    shirt: pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
  };
}

export function spawnPeds(city, rng, count, avoidX, avoidY) {
  const peds = [];
  for (let i = 0; i < count * 6 && peds.length < count; i += 1) {
    const spot = pick(rng, city.sidewalkSpots);
    if (Math.hypot(spot.x - avoidX, spot.y - avoidY) < 120) continue;
    peds.push(createPed(rng, spot.x + randRange(rng, -10, 10), spot.y + randRange(rng, -10, 10)));
  }
  return peds;
}

function pickTarget(ped, city, rng) {
  // A pavement tile within about six tiles, in any direction.
  for (let tries = 0; tries < 8; tries += 1) {
    const spot = pick(rng, city.sidewalkSpots);
    if (Math.hypot(spot.x - ped.x, spot.y - ped.y) < TILE * 7) return spot;
  }
  return pick(rng, city.sidewalkSpots);
}

/** Put a pedestrian on the ground for `seconds` (they climb up and run afterwards). */
export function knockDown(ped, seconds) {
  ped.down = true;
  ped.downTime = seconds;
  ped.state = 'walk';
  ped.target = null;
}

export function updatePeds(peds, city, cars, rng, dt) {
  for (const ped of peds) {
    if (ped.hostile) continue; // missions.js drives its own actors
    if (ped.down) {
      ped.downTime -= dt;
      if (ped.downTime <= 0) {
        ped.down = false;
        ped.state = 'flee';
        ped.fleeTime = 1.4;
      }
      continue;
    }
    // Danger check: a fast car close ahead means hop sideways and run.
    if (ped.state === 'walk') {
      for (const car of cars) {
        if (car.kind === 'parked') continue;
        const speed = car.kind === 'traffic' ? car.speed : Math.abs(car.speed);
        if (speed < 60) continue;
        const dx = ped.x - car.x;
        const dy = ped.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 58 && dist > 0.01) {
          ped.state = 'flee';
          ped.fleeTime = 0.9;
          ped.angle = Math.atan2(dy, dx) + (rng() < 0.5 ? 0.7 : -0.7);
          break;
        }
      }
    }

    let stepSpeed = ped.speed;
    if (ped.state === 'flee') {
      stepSpeed = PEDS.runSpeed;
      ped.fleeTime -= dt;
      if (ped.fleeTime <= 0) {
        ped.state = 'walk';
        ped.target = null;
      }
    } else {
      ped.retarget -= dt;
      if (!ped.target || ped.retarget <= 0 || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 9) {
        ped.target = pickTarget(ped, city, rng);
        ped.retarget = randRange(rng, 6, 14);
      }
      ped.angle = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    }

    const nx = ped.x + Math.cos(ped.angle) * stepSpeed * dt;
    const ny = ped.y + Math.sin(ped.angle) * stepSpeed * dt;
    if (!city.isSolidPx(nx, ny)) {
      ped.x = nx;
      ped.y = ny;
    } else if (!city.isSolidPx(nx, ped.y)) {
      ped.x = nx;
    } else if (!city.isSolidPx(ped.x, ny)) {
      ped.y = ny;
    } else {
      ped.target = null; // boxed in: choose somewhere else next step
      ped.angle += Math.PI / 2;
    }
    ped.phase += dt * stepSpeed * 0.11;
  }
}

/** Draw one pedestrian: shadow, swinging legs, shirt, head with a hair cap. */
export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(40,22,14,0.28)';
  ctx.beginPath();
  ctx.ellipse(1.5, 3, 7.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ped.angle + Math.PI / 2); // figures are drawn facing up
  if (ped.down) ctx.rotate(Math.PI / 2); // flat on the pavement, legs out sideways
  const swing = Math.sin(ped.phase) * 3.4;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-4.4 + swing * 0.4, 2.5, 3.6, 6);
  ctx.fillRect(0.8 - swing * 0.4, 2.5, 3.6, 6);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 5.6, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -4.6, 3.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40,26,18,0.85)';
  ctx.beginPath();
  ctx.arc(0, -5.4, 3.9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
