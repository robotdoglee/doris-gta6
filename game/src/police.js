// The law in Puerto Solmaris: a heat meter behind the HUD's stars, and the Patrulla
// cars that come looking for Marlo when it climbs.
//
// Crimes are reported with reportCrime(): a witness — a pedestrian with line of
// sight, or a patrol unit — makes the full charge stick; an unwitnessed crime is
// only a rumour and counts for less. Heat maps to stars (ceil(heat / 100), at most
// five). Units drive the same arcade physics as the player's car, steering for his
// last known position; more stars means more units, arriving from crossings at the
// edge of the action. They arrest by pinning: stop Marlo's car dead with a unit
// alongside, or corner him on foot, and the bust timer fills — then it is the
// comisaría, a fine, and a long walk home. Break line of sight and stay broken,
// and the heat drains star by star. Units navigate the road grid crossing by
// crossing (a straight line in Solmaris ends at a building); only the final
// approach to the man himself is cross-country.

import { POLICE } from './config.js';
import { createCar, updatePlayerCar } from './vehicles.js';
import { respawnAt } from './player.js';
import { randRange } from './random.js';

const POLICE_TYPE = { name: 'Patrulla', len: 46, wid: 22, max: 306 };
const POLICE_COLOR = '#31435f';

export function createPoliceState() {
  return {
    heat: 0,
    units: [],
    spawnTimer: 0,
    searchTimer: 0,
    seen: false,
    bustTimer: 0,
    lastKnown: null,
  };
}

export function heatToStars(heat) {
  return heat <= 0 ? 0 : Math.min(POLICE.maxStars, Math.ceil(heat / POLICE.heatPerStar));
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** True when nothing solid (a building, the river) stands between two points. */
export function hasLineOfSight(city, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.floor(dist / 26));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (city.isSolidPx(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

function witnessed(world, x, y) {
  const { city } = world;
  for (const ped of world.peds) {
    if (ped.down) continue;
    if (Math.hypot(ped.x - x, ped.y - y) < POLICE.witnessRange
      && hasLineOfSight(city, ped.x, ped.y, x, y)) return true;
  }
  for (const unit of world.police.units) {
    if (Math.hypot(unit.x - x, unit.y - y) < POLICE.sightRange
      && hasLineOfSight(city, unit.x, unit.y, x, y)) return true;
  }
  return false;
}

/**
 * Report a crime at (x, y) worth `points` of heat. Witnessed crimes charge in full;
 * unwitnessed ones at forty percent. Returns whether anyone saw it.
 */
export function reportCrime(world, points, x, y) {
  const seen = witnessed(world, x, y);
  world.police.heat += seen ? points : Math.round(points * 0.4);
  if (seen) world.police.lastKnown = { x: world.player.x, y: world.player.y };
  return seen;
}

/** Raise the heat to at least `points` (a mission's scripted trouble). */
export function setHeat(world, points) {
  world.police.heat = Math.max(world.police.heat, points);
  world.police.lastKnown = { x: world.player.x, y: world.player.y };
}

/** Wipe the slate: no heat, no units, no arrest in progress. */
export function clearHeat(world) {
  const p = world.police;
  p.heat = 0;
  p.bustTimer = 0;
  p.seen = false;
  p.searchTimer = 0;
  p.lastKnown = null;
  for (const unit of p.units) {
    const i = world.cars.indexOf(unit);
    if (i >= 0) world.cars.splice(i, 1);
  }
  p.units.length = 0;
}

function spawnUnit(world, x, y, angle) {
  const unit = createCar(world.rng, x, y, angle, 'police');
  unit.type = POLICE_TYPE;
  unit.color = POLICE_COLOR;
  unit.police = true;
  unit.health = 100;
  unit.shootCd = randRange(world.rng, 1, 2);
  unit.stuckT = 0;
  unit.revT = 0;
  unit.route = null; // crossings to drive, when the target is not in sight
  unit.routeI = 0;
  unit.routeDest = null;
  unit.detourT = 0;
  world.cars.push(unit);
  world.police.units.push(unit);
  return unit;
}

function nearestCrossing(city, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const c of city.intersections) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * A route across the road grid: breadth-first over the crossings (neighbours are
 * the adjacent crossings along an avenue or a street), returned as waypoints.
 * Patrol cars drive roads like everyone else; only the last stretch to the man
 * himself is cross-country.
 */
function routeTo(city, fromX, fromY, toX, toY) {
  const start = nearestCrossing(city, fromX, fromY);
  const goal = nearestCrossing(city, toX, toY);
  if (!start || !goal) return [];
  if (start === goal) return [{ x: goal.x, y: goal.y }];
  const prev = new Map([[start.key, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const c of city.intersections) {
      if (prev.has(c.key)) continue;
      const aligned = (c.x === cur.x && Math.abs(c.y - cur.y) <= 400)
        || (c.y === cur.y && Math.abs(c.x - cur.x) <= 400);
      if (aligned) {
        prev.set(c.key, cur);
        queue.push(c);
      }
    }
  }
  if (!prev.has(goal.key)) return [{ x: goal.x, y: goal.y }];
  const path = [];
  let node = goal;
  while (node) {
    path.unshift({ x: node.x, y: node.y });
    node = prev.get(node.key);
  }
  return path;
}

/** Reinforcements arrive at a crossing a few blocks off — close, never on top of him. */
function spawnAtEdge(world, rng) {
  const { player, city } = world;
  const candidates = city.intersections.filter((c) => {
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    return d > 540 && d < 1150;
  });
  if (candidates.length === 0) return;
  const spot = candidates[Math.floor(rng() * candidates.length)];
  spawnUnit(world, spot.x, spot.y, Math.atan2(player.y - spot.y, player.x - spot.x));
}

/** Stage a pursuit for the screenshot scenes: `stars` of heat, units on his tail. */
export function stagePursuit(world, stars) {
  setHeat(world, stars * POLICE.heatPerStar);
  const { player, city } = world;
  const back = player.angle + Math.PI;
  const side = player.angle + Math.PI / 2;
  for (let i = 0; i < stars; i += 1) {
    let x = player.x + Math.cos(back) * (150 + i * 82) + Math.cos(side) * (i % 2 ? 28 : -28);
    let y = player.y + Math.sin(back) * (150 + i * 82) + Math.sin(side) * (i % 2 ? 28 : -28);
    for (let n = 0; n < 12 && city.isSolidPx(x, y); n += 1) {
      x += Math.cos(back) * 30;
      y += Math.sin(back) * 30;
    }
    spawnUnit(world, x, y, player.angle);
  }
}

/** Steer one unit for one step: the player's car physics, a patrolman's judgement. */
function driveUnit(world, unit, dt) {
  const { player } = world;
  const known = world.police.lastKnown ?? { x: player.x, y: player.y };
  const directDist = Math.hypot(player.x - unit.x, player.y - unit.y);
  if (unit.detourT > 0) unit.detourT -= dt;
  // Drive straight at him only when he is close or in plain sight; the rest of the
  // way the unit follows the road grid, crossing by crossing.
  const canDirect = (world.police.seen || directDist < 150)
    && !(unit.detourT > 0 && directDist >= 90);
  let tx;
  let ty;
  if (canDirect) {
    tx = known.x;
    ty = known.y;
    if (player.car && world.police.seen) {
      tx += player.car.vx * 0.3;
      ty += player.car.vy * 0.3;
    }
    unit.route = null;
  } else {
    if (!unit.route || unit.routeI >= unit.route.length || !unit.routeDest
      || Math.hypot(known.x - unit.routeDest.x, known.y - unit.routeDest.y) > 220) {
      unit.route = routeTo(world.city, unit.x, unit.y, known.x, known.y);
      unit.routeI = 0;
      unit.routeDest = { x: known.x, y: known.y };
    }
    const wp = unit.route[unit.routeI] ?? known;
    tx = wp.x;
    ty = wp.y;
    if (Math.hypot(tx - unit.x, ty - unit.y) < 48 && unit.routeI < unit.route.length - 1) {
      unit.routeI += 1;
    }
  }
  const diff = wrapAngle(Math.atan2(ty - unit.y, tx - unit.x) - unit.angle);
  let steer = clamp(diff * 1.9, -1, 1);
  let throttle = 1;

  // Do not plough through the traffic ahead: ease off when a car blocks the nose.
  const fx = Math.cos(unit.angle);
  const fy = Math.sin(unit.angle);
  for (const other of world.cars) {
    if (other === unit) continue;
    const ahead = (other.x - unit.x) * fx + (other.y - unit.y) * fy;
    const lateral = Math.abs((other.x - unit.x) * fy - (other.y - unit.y) * fx);
    if (ahead > 0 && ahead < 64 && lateral < 20) throttle = Math.min(throttle, 0.25);
  }

  if (unit.revT > 0) {
    unit.revT -= dt;
    throttle = -1;
    steer = -steer;
  } else if (Math.abs(diff) > 2.3) {
    throttle = -0.7; // facing the wrong way: back up and swing round
  } else if (canDirect && !player.car) {
    throttle = directDist < 44 ? 0 : directDist < 110 ? 0.5 : 1; // on foot: stop at him
  } else if (canDirect && directDist < 90) {
    throttle = 0.55; // alongside his car: stay with it, do not overshoot
  }
  if (Math.abs(unit.speed) < 10 && throttle > 0) {
    unit.stuckT += dt;
    if (unit.stuckT > 1.1) {
      // Wedged on a corner: back out, and take the roads for a while.
      unit.revT = 0.65;
      unit.stuckT = 0;
      unit.route = null;
      unit.detourT = 2.5;
    }
  } else unit.stuckT = 0;

  updatePlayerCar(unit, { throttle, steer, handbrake: false }, world.city, dt, world.events);
}

function bust(world) {
  const { player } = world;
  const stars = heatToStars(world.police.heat);
  const fee = Math.min(player.money, 120 + stars * 80);
  player.money -= fee;
  if (player.car) {
    // The car is impounded: it does not come back.
    const i = world.cars.indexOf(player.car);
    if (i >= 0) world.cars.splice(i, 1);
    player.car = null;
  }
  clearHeat(world);
  world.wanted = 0;
  player.health = Math.max(player.health, 55);
  respawnAt(player, world.places.station);
  world.bannerSay('BUSTED', 2.4);
  world.say(fee > 0
    ? `Busted. The comisaría keeps $${fee.toLocaleString('en-US')} for its trouble.`
    : 'Busted. They let you go — you are broke anyway.', 3.6);
  world.events.push('busted');
  world.penaltyEvent = 'busted';
}

function updateBust(world, dt) {
  const p = world.police;
  const { player } = world;
  let pinning = false;
  let need = POLICE.bustFootTime;
  if (player.car) {
    need = POLICE.bustCarTime;
    if (Math.abs(player.car.speed) < 26) {
      for (const unit of p.units) {
        if (Math.hypot(unit.x - player.x, unit.y - player.y) < 56) {
          pinning = true;
          break;
        }
      }
    }
  } else {
    for (const unit of p.units) {
      if (Math.hypot(unit.x - player.x, unit.y - player.y) < POLICE.bustRadius) {
        pinning = true;
        break;
      }
    }
  }
  if (pinning) {
    p.bustTimer += dt;
    if (p.bustTimer >= need) bust(world);
  } else {
    p.bustTimer = Math.max(0, p.bustTimer - dt * 1.6);
  }
}

export function updatePolice(world, rng, dt) {
  const p = world.police;
  const { player, city } = world;
  const stars = heatToStars(p.heat);
  world.wanted = stars;
  if (stars === 0) {
    if (p.units.length) clearHeat(world);
    p.seen = false;
    return;
  }

  // Who can see him right now?
  p.seen = false;
  for (const unit of p.units) {
    const d = Math.hypot(player.x - unit.x, player.y - unit.y);
    if (d < 64 || (d < POLICE.sightRange && hasLineOfSight(city, unit.x, unit.y, player.x, player.y))) {
      p.seen = true;
      break;
    }
  }
  if (p.seen) {
    p.searchTimer = 0;
    p.lastKnown = { x: player.x, y: player.y };
  } else {
    p.searchTimer += dt;
    if (p.searchTimer > POLICE.searchBase + stars * 1.6) {
      p.heat = Math.max(0, p.heat - POLICE.drainRate * dt);
      if (p.heat <= 0) {
        clearHeat(world);
        world.wanted = 0;
        world.say('You lost them. Lie low a while.', 3);
        return;
      }
    }
  }

  const desired = Math.min(stars, POLICE.maxUnits);
  if (p.units.length < desired) {
    p.spawnTimer -= dt;
    if (p.spawnTimer <= 0) {
      p.spawnTimer = POLICE.spawnInterval;
      spawnAtEdge(world, rng);
    }
  }

  for (const unit of p.units) driveUnit(world, unit, dt);
  if (world.penaltyEvent) return; // a shot may have ended this already
  updateBust(world, dt);
}
