// Cars: the models, the traffic that drives itself around the grid, the physics of the
// car the player is driving, and how a car is drawn.
//
// Traffic keeps it simple and robust: every AI car follows one road in one of the four
// compass headings, holding the right-hand lane (right-hand traffic). At an
// intersection it may turn onto the crossing road — never off the edge of the map —
// and it brakes for whatever is ahead of it in its lane. The player's car is a small
// arcade physics model instead: velocity split into forward and lateral parts, the
// lateral part gripped away (unless the handbrake is held, which lets it slide).

import { TILE, TRAFFIC, WORLD_H, WORLD_W } from './config.js';
import { T } from './city.js';
import { pick, randRange } from './random.js';

/** Compass headings: 0 east, 1 south, 2 west, 3 north. */
export const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const TYPES = [
  { name: 'Brisa', len: 44, wid: 21, max: 252, colors: ['#e8e3d8', '#c94f3d', '#7fb3a3', '#8a8f98', '#d97971'] },
  { name: 'Marea Van', len: 53, wid: 24, max: 214, colors: ['#e5c07b', '#a8c3bc', '#efe0c0', '#5d8a66'] },
  { name: 'Solano GT', len: 47, wid: 22, max: 308, colors: ['#b5526b', '#4a6fa5', '#2f3542', '#e9a13b'] },
  { name: 'Taxi Sol', len: 45, wid: 21, max: 240, taxi: true, colors: ['#f2b63c'] },
];

let nextId = 1;

export function createCar(rng, x, y, angle, kind) {
  const type = pick(rng, TYPES);
  return {
    id: nextId++,
    kind, // 'traffic' | 'parked' | 'player'
    type,
    color: pick(rng, type.colors),
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    len: type.len,
    wid: type.wid,
    damage: 0, // 0 pristine .. 100 wreck; the repair yard straightens it for cash
    // Traffic state (unused for parked/player cars).
    heading: 0,
    road: 0,
    cruise: randRange(rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
    decidedKey: '',
    blockedTime: 0,
    honkCooldown: randRange(rng, 2, 6),
    braking: false,
  };
}

/** The lane centre a traffic car aims for, on the cross axis of its heading. */
function laneTarget(car) {
  const L = TRAFFIC.laneOffset;
  if (car.heading === 0) return car.road + L; // east: right side is south
  if (car.heading === 2) return car.road - L; // west: right side is north
  if (car.heading === 1) return car.road - L; // south: right side is west
  return car.road + L; // north: right side is east
}

/** Place a traffic car on a spawn point, lined up with its lane. */
export function placeOnRoad(car, spawn) {
  car.heading = spawn.heading;
  car.road = spawn.road;
  car.angle = Math.atan2(DIRS[car.heading].y, DIRS[car.heading].x);
  if (car.heading === 0 || car.heading === 2) {
    car.x = spawn.pos;
    car.y = laneTarget(car);
  } else {
    car.x = laneTarget(car);
    car.y = spawn.pos;
  }
  car.speed = car.cruise * 0.6;
}

/** Fill a fresh world with circulating traffic, kept away from (avoidX, avoidY). */
export function spawnTraffic(city, rng, count, avoidX, avoidY) {
  const cars = [];
  const points = [...city.trafficSpawns];
  // Seeded shuffle, so a seed always deals the same traffic.
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  for (const point of points) {
    if (cars.length >= count) break;
    const car = createCar(rng, 0, 0, 0, 'traffic');
    placeOnRoad(car, point);
    if (Math.hypot(car.x - avoidX, car.y - avoidY) < 300) continue;
    if (cars.some((other) => Math.hypot(other.x - car.x, other.y - car.y) < 110)) continue;
    cars.push(car);
  }
  return cars;
}

/** Parked cars for the city's parking lots; some bays stay empty. */
export function spawnParked(city, rng) {
  const cars = [];
  for (const spot of city.parkingSpots) {
    if (rng() < 0.45) continue;
    const car = createCar(rng, spot.x, spot.y, spot.angle, 'parked');
    cars.push(car);
  }
  return cars;
}

function updateTrafficCar(car, cars, city, rng, dt, events) {
  const dir = DIRS[car.heading];
  // Desired speed: cruise, unless something is ahead in the lane.
  let desired = car.cruise;
  let blocked = false;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * dir.x + dy * dir.y;
    const lateral = Math.abs(dx * dir.y - dy * dir.x);
    if (ahead > 0 && ahead < TRAFFIC.followGap + car.speed * 0.4 && lateral < 21) {
      blocked = true;
      const otherSpeed = other.kind === 'traffic' ? other.speed : Math.abs(other.speed);
      desired = Math.min(desired, otherSpeed * Math.max(0, (ahead - 30) / TRAFFIC.followGap));
      if (ahead < 36) desired = 0;
    }
  }
  car.braking = desired < car.speed - 4;
  if (car.speed < desired) car.speed = Math.min(desired, car.speed + TRAFFIC.accel * dt);
  else car.speed = Math.max(desired, car.speed - TRAFFIC.brake * dt);

  // A driver stuck behind something for a while leans on the horn.
  car.honkCooldown -= dt;
  if (blocked && car.speed < 8) {
    car.blockedTime += dt;
    if (car.blockedTime > 1.3 && car.honkCooldown <= 0) {
      events.push('horn');
      car.honkCooldown = randRange(rng, 3, 7);
      car.blockedTime = 0;
    }
  } else car.blockedTime = 0;

  // Move along the heading; ease the cross axis onto the lane centre.
  const target = laneTarget(car);
  const ease = Math.min(1, dt * 3.2);
  if (car.heading === 0 || car.heading === 2) {
    car.x += dir.x * car.speed * dt;
    car.y += (target - car.y) * ease;
  } else {
    car.y += dir.y * car.speed * dt;
    car.x += (target - car.x) * ease;
  }
  const wantAngle = Math.atan2(dir.y, dir.x);
  car.angle += shortestArc(car.angle, wantAngle) * Math.min(1, dt * 6);

  // Intersection ahead? Decide once per crossing whether to turn.
  for (const cross of city.intersections) {
    const dx = cross.x - car.x;
    const dy = cross.y - car.y;
    const ahead = dx * dir.x + dy * dir.y;
    const lateral = Math.abs(dx * dir.y - dy * dir.x);
    if (ahead > -6 && ahead < 14 && lateral < 34 && car.decidedKey !== cross.key) {
      car.decidedKey = cross.key;
      decideTurn(car, cross, city, rng);
      break;
    }
  }

  // Safety net: a car that somehow leaves the road network (map edge, water) is
  // quietly re-dealt onto a spawn point instead of driving off into the bay.
  if (car.x < 24 || car.x > WORLD_W - 24 || car.y < 24 || car.y > WORLD_H - 24
    || city.tileAtPx(car.x, car.y) === T.WATER) {
    placeOnRoad(car, pick(rng, city.trafficSpawns));
  }
}

function decideTurn(car, cross, city, rng) {
  const options = [];
  const candidates = [
    { heading: car.heading, weight: 0.55 },
    { heading: (car.heading + 1) % 4, weight: 0.225 },
    { heading: (car.heading + 3) % 4, weight: 0.225 },
  ];
  const firstX = city.vRoads[0].center;
  const lastX = city.vRoads[city.vRoads.length - 1].center;
  const firstY = city.hRoads[0].center;
  const lastY = city.hRoads[city.hRoads.length - 1].center;
  for (const cand of candidates) {
    const dir = DIRS[cand.heading];
    // The heading must lead to another crossing: past the last one the street runs
    // out at the map edge (the bay shore, the city limit), so it is not an option.
    if (cand.heading === 0 && cross.x >= lastX) continue;
    if (cand.heading === 2 && cross.x <= firstX) continue;
    if (cand.heading === 1 && cross.y >= lastY) continue;
    if (cand.heading === 3 && cross.y <= firstY) continue;
    const px = cross.x + dir.x * TILE * 2.5;
    const py = cross.y + dir.y * TILE * 2.5;
    const tile = city.tileAtPx(px, py);
    if (tile === T.ROAD || tile === T.BRIDGE) options.push(cand);
  }
  if (options.length === 0) {
    car.heading = (car.heading + 2) % 4; // dead end: turn around
    return;
  }
  let roll = rng();
  let chosen = options[options.length - 1];
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) {
      chosen = opt;
      break;
    }
  }
  if (chosen.heading !== car.heading) {
    const turning = chosen.heading;
    car.heading = turning;
    // The new road is the crossing one: for north/south travel its centre is the
    // intersection's x, for east/west its y.
    car.road = turning === 1 || turning === 3 ? cross.x : cross.y;
  }
}

function shortestArc(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Advance every traffic car one step. Parked and player cars are not touched. */
export function updateTraffic(cars, city, rng, dt, events) {
  for (const car of cars) {
    if (car.kind === 'traffic') updateTrafficCar(car, cars, city, rng, dt, events);
  }
}

/**
 * Drive the player's car for one step. `ctl` is { throttle, steer, handbrake }.
 * Collisions are tested axis by axis with two probe circles (front and rear axle);
 * a hard hit bounces the car back a little and reports a 'crash' event.
 */
export function updatePlayerCar(car, ctl, city, dt, events) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  let lx = car.vx - fx * vf;
  let ly = car.vy - fy * vf;

  if (ctl.throttle > 0) vf += 215 * dt;
  else if (ctl.throttle < 0) vf += ctl.throttle * (vf > 8 ? 350 : 125) * dt;
  vf -= vf * (ctl.throttle !== 0 ? 0.5 : 0.85) * dt;
  // A bent car loses its top end: full damage costs forty percent of it.
  const topSpeed = car.type.max * (1 - (car.damage || 0) * 0.004);
  vf = Math.max(-98, Math.min(topSpeed, vf));
  car.braking = ctl.throttle < 0 && vf > 8;

  const authority = Math.min(1, Math.abs(vf) / 60) * (vf < 0 ? -1 : 1) / (1 + Math.abs(vf) / 300);
  car.angle += ctl.steer * 2.05 * authority * (ctl.handbrake ? 1.3 : 1) * dt;

  const grip = Math.exp(-dt * (ctl.handbrake ? 1.7 : 9.5));
  lx *= grip;
  ly *= grip;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf + lx;
  car.vy = nfy * vf + ly;

  const probe = car.len * 0.34;
  const radius = car.wid * 0.52;
  const hitSpeed = Math.abs(vf);
  // X axis, then Y axis, so the car slides along walls instead of sticking to them.
  const nx = car.x + car.vx * dt;
  if (city.circleFree(nx + nfx * probe, car.y + nfy * probe, radius) && city.circleFree(nx - nfx * probe, car.y - nfy * probe, radius)) {
    car.x = nx;
  } else {
    if (hitSpeed > 115) events.push('crash');
    car.vx = 0;
    vf *= -0.22;
    car.vx = nfx * vf + lx;
  }
  const ny = car.y + car.vy * dt;
  if (city.circleFree(car.x + nfx * probe, ny + nfy * probe, radius) && city.circleFree(car.x - nfx * probe, ny - nfy * probe, radius)) {
    car.y = ny;
  } else {
    if (hitSpeed > 115) events.push('crash');
    car.vy = 0;
    vf *= -0.22;
    car.vy = nfy * vf + ly;
  }
  car.speed = car.vx * nfx + car.vy * nfy;
}

/** The closest car to a point within `maxDist`, or null. */
export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

/** Draw one car, top-down: shadow, body, glass, lights, wheels. */
export function drawCar(ctx, car, dusk) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Soft shadow, pushed away from the low sun.
  ctx.fillStyle = 'rgba(40,22,14,0.30)';
  ctx.beginPath();
  ctx.ellipse(3 + dusk * 5, 5 + dusk * 3, car.len * 0.52, car.wid * 0.55, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  // Wheels.
  ctx.fillStyle = '#1c1c20';
  const ww = 7;
  const wh = 4.6;
  for (const [wx, wy] of [[L * 0.3, -W / 2 - 1], [L * 0.3, W / 2 - wh + 1], [-L * 0.3, -W / 2 - 1], [-L * 0.3, W / 2 - wh + 1]]) {
    ctx.fillRect(wx - ww / 2, wy, ww, wh);
  }
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  // Roof and glass.
  ctx.fillStyle = 'rgba(20,26,34,0.85)';
  roundRect(ctx, L * 0.02, -W * 0.36, L * 0.3, W * 0.72, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,38,48,0.9)';
  roundRect(ctx, -L * 0.3, -W * 0.34, L * 0.2, W * 0.68, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, -L * 0.08, -W * 0.4, L * 0.52, W * 0.8, 5);
  ctx.fill();
  if (car.type.taxi) {
    ctx.fillStyle = '#fff3cf';
    ctx.fillRect(-4, -3.4, 8, 6.8);
    ctx.fillStyle = '#7a5410';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  if (car.police) {
    // The Patrulla light bar: red over the driver's side, blue over the other.
    ctx.fillStyle = '#141c2c';
    roundRect(ctx, -5, -W * 0.36, 10, W * 0.72, 3);
    ctx.fill();
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(-5, -W * 0.36, 10, W * 0.36);
    ctx.fillStyle = '#5a8aff';
    ctx.fillRect(-5, 0, 10, W * 0.36);
    ctx.fillStyle = '#e8ecf4';
    ctx.fillRect(-L * 0.18, -W / 2, L * 0.36, 2.6);
    ctx.fillRect(-L * 0.18, W / 2 - 2.6, L * 0.36, 2.6);
  }
  // Lights: headlights warm, tail lights red and brighter while braking.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(L / 2 - 2.4, -W * 0.32, 2.6, 3.4);
  ctx.fillRect(L / 2 - 2.4, W * 0.32 - 3.4, 2.6, 3.4);
  ctx.fillStyle = car.braking ? '#ff5a4a' : '#c23a30';
  ctx.fillRect(-L / 2 - 0.2, -W * 0.32, 2.6, 3.4);
  ctx.fillRect(-L / 2 - 0.2, W * 0.32 - 3.4, 2.6, 3.4);
  if (dusk > 0.35) {
    // Headlight pools on the asphalt ahead.
    const grad = ctx.createRadialGradient(L / 2 + 16, 0, 2, L / 2 + 16, 0, 34);
    grad.addColorStop(0, `rgba(255,230,160,${0.20 * dusk})`);
    grad.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(L / 2 + 16, 0, 36, W * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
