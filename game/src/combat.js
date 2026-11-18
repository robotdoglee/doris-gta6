// Fighting in Solmaris: a dock-worker's fists and an unregistered pistol.
//
// Marlo fights on foot only — J swings, K fires. The pistol is hitscan: a ray from
// his hands to the first thing it meets (a pedestrian, a car, a wall), drawn for a
// frame as a tracer with a muzzle flash, and every shot is a crime somebody may
// have seen. Pedestrians go down and get up running; a Patrulla takes three hits
// to wreck, and its crew shoots back once the heat reaches three stars. Damage
// lands on Marlo from return fire and from hard crashes (the world reports those),
// armour first. At zero health he wakes at Clínica Vida, lighter in the pocket:
// WASTED.

import { COMBAT } from './config.js';
import { damagePlayer, respawnAt } from './player.js';
import { knockDown } from './pedestrians.js';
import { clearHeat, hasLineOfSight, reportCrime } from './police.js';
import { randRange } from './random.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Where a ray from (ox, oy) along `angle` first lands, and what it lands on. */
function raycast(world, ox, oy, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let bestT = COMBAT.pistolRange;
  let hit = null;
  // Solid ground first: walls and water stop a bullet.
  for (let t = 10; t <= COMBAT.pistolRange; t += 8) {
    if (world.city.isSolidPx(ox + dx * t, oy + dy * t)) {
      bestT = t;
      break;
    }
  }
  const rayCircle = (cx, cy, r) => {
    const lx = cx - ox;
    const ly = cy - oy;
    const along = lx * dx + ly * dy;
    if (along < 0 || along > bestT) return -1;
    const perp = Math.abs(lx * dy - ly * dx);
    return perp < r ? along : -1;
  };
  for (const ped of world.peds) {
    if (ped.down) continue;
    const t = rayCircle(ped.x, ped.y, 11);
    if (t >= 0) {
      bestT = t;
      hit = { kind: 'ped', ped };
    }
  }
  for (const car of world.cars) {
    if (car === world.player.car) continue;
    const t = rayCircle(car.x, car.y, Math.max(car.len, car.wid) * 0.52);
    if (t >= 0) {
      bestT = t;
      hit = { kind: 'car', car };
    }
  }
  return { x: ox + dx * bestT, y: oy + dy * bestT, hit };
}

function melee(world) {
  const { player } = world;
  player.attackCd = COMBAT.meleeCooldown;
  world.events.push('melee');
  const hx = player.x + Math.cos(player.angle) * 20;
  const hy = player.y + Math.sin(player.angle) * 20;
  world.effects.push({ kind: 'swing', ax: hx, ay: hy, bx: hx, by: hy, ttl: 0.12, max: 0.12 });
  for (const ped of world.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (d > COMBAT.meleeRange + 10) continue;
    const diff = Math.abs(Math.atan2(
      Math.sin(Math.atan2(ped.y - player.y, ped.x - player.x) - player.angle),
      Math.cos(Math.atan2(ped.y - player.y, ped.x - player.x) - player.angle),
    ));
    if (diff > 1.15) continue;
    knockDown(ped, ped.hostile ? 999 : 3.5);
    if (!ped.hostile) reportCrime(world, 70, ped.x, ped.y);
  }
}

function wreckUnit(world, car) {
  const ci = world.cars.indexOf(car);
  if (ci >= 0) world.cars.splice(ci, 1);
  const ui = world.police.units.indexOf(car);
  if (ui >= 0) world.police.units.splice(ui, 1);
  world.events.push('crash');
  world.effects.push({ kind: 'flash', ax: car.x, ay: car.y, bx: car.x, by: car.y, ttl: 0.3, max: 0.3 });
  world.say('Patrulla down. The whole city heard that.', 3);
}

function fire(world) {
  const { player } = world;
  if (player.ammo <= 0) {
    player.fireCd = 0.3;
    world.say('Out of ammo — Palma Supply sells more, no questions asked.', 2.4);
    return;
  }
  player.ammo -= 1;
  player.fireCd = COMBAT.fireCooldown;
  world.events.push('gunshot');
  const mx = player.x + Math.cos(player.angle) * 16;
  const my = player.y + Math.sin(player.angle) * 16;
  const shot = raycast(world, player.x, player.y, player.angle);
  world.effects.push({ kind: 'tracer', ax: mx, ay: my, bx: shot.x, by: shot.y, ttl: 0.09, max: 0.09 });
  world.effects.push({ kind: 'flash', ax: shot.x, ay: shot.y, bx: shot.x, by: shot.y, ttl: 0.07, max: 0.07 });
  if (!shot.hit) {
    reportCrime(world, 45, player.x, player.y);
    return;
  }
  if (shot.hit.kind === 'ped') {
    const ped = shot.hit.ped;
    knockDown(ped, ped.hostile ? 999 : 7);
    if (!ped.hostile) reportCrime(world, 200, ped.x, ped.y);
    return;
  }
  const car = shot.hit.car;
  if (car.kind === 'police') {
    car.health = (car.health ?? 100) - 34;
    reportCrime(world, 220, car.x, car.y);
    if (car.health <= 0) wreckUnit(world, car);
  } else {
    car.damage = Math.min(100, (car.damage || 0) + 7);
    reportCrime(world, 60, car.x, car.y);
  }
}

/** At three stars and up, patrol crews shoot back — badly, but in numbers. */
function policeGunfire(world, rng, dt) {
  const { player } = world;
  if (world.wanted < 3) return;
  for (const unit of world.police.units) {
    unit.shootCd -= dt;
    if (unit.shootCd > 0) continue;
    const dist = Math.hypot(player.x - unit.x, player.y - unit.y);
    if (dist > 400 || !hasLineOfSight(world.city, unit.x, unit.y, player.x, player.y)) {
      unit.shootCd = 0.4;
      continue;
    }
    unit.shootCd = randRange(rng, 1.15, 1.95);
    world.events.push('gunshot');
    const hitChance = clamp(0.6 - dist / 650, 0.12, 0.55);
    const hit = rng() < hitChance;
    const tx = hit ? player.x : player.x + randRange(rng, -30, 30);
    const ty = hit ? player.y : player.y + randRange(rng, -30, 30);
    world.effects.push({ kind: 'tracer', ax: unit.x, ay: unit.y, bx: tx, by: ty, ttl: 0.09, max: 0.09 });
    if (hit) {
      if (player.car) {
        player.car.damage = Math.min(100, player.car.damage + 4);
        damagePlayer(player, 4);
      } else {
        damagePlayer(player, Math.round(randRange(rng, 6, 12)));
      }
    }
  }
}

function wasted(world) {
  const { player } = world;
  const fee = Math.min(player.money, 100 + world.wanted * 40);
  player.money -= fee;
  if (player.car) {
    player.car.kind = 'parked';
    player.car.vx = 0;
    player.car.vy = 0;
    player.car.speed = 0;
    player.car = null;
  }
  clearHeat(world);
  world.wanted = 0;
  player.health = 100;
  player.armor = 0;
  respawnAt(player, world.places.hospital);
  world.bannerSay('WASTED', 2.4);
  world.say(fee > 0
    ? `You wake at Clínica Vida. The bill comes to $${fee.toLocaleString('en-US')}.`
    : 'You wake at Clínica Vida. They bill the city — you have nothing.', 3.6);
  world.events.push('wasted');
  world.penaltyEvent = 'wasted';
}

export function updateCombat(world, rng, dt, ctl) {
  const { player } = world;
  for (let i = world.effects.length - 1; i >= 0; i -= 1) {
    const e = world.effects[i];
    e.ttl -= dt;
    if (e.ttl <= 0) world.effects.splice(i, 1);
  }
  if (player.attackCd > 0) player.attackCd -= dt;
  if (player.fireCd > 0) player.fireCd -= dt;

  if (!player.car) {
    if (ctl.attack && player.attackCd <= 0) melee(world);
    if (ctl.fire && player.fireCd <= 0) fire(world);
  }
  policeGunfire(world, rng, dt);
  if (player.health <= 0 && !world.penaltyEvent) wasted(world);
}
