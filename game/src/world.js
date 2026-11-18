// The world: one generated city, one player, a fleet of cars (parked, circulating and
// eventually the player's), a crowd of pedestrians, and the time of day. step() is the
// whole simulation in one call — main feeds it controls, it advances everything by a
// fixed dt and collects sound-worthy events ('horn', 'crash') for main to play.
//
// Stage two wires the systems in: the player's car now collides with other cars and
// with pedestrians (and both are crimes, if anyone saw), combat resolves Marlo's
// fists and pistol, the police hunt or lose him, the repair yard and the supply shop
// do their business, and Nadia's missions advance the story. The order inside step()
// matters: collisions before the hunt, the hunt before the story — so a bust lands
// before a mission can complete, and a mission sees the penalty the same step.

import { DAY_SECONDS, DAY_START, PEDS, TRAFFIC } from './config.js';
import { generateCity } from './city.js';
import { createPlayer, damagePlayer, updatePlayerOnFoot } from './player.js';
import { knockDown, spawnPeds, updatePeds } from './pedestrians.js';
import { spawnParked, spawnTraffic, updatePlayerCar, updateTraffic } from './vehicles.js';
import { createPlaces, updatePlaces } from './places.js';
import { createPoliceState, reportCrime, updatePolice } from './police.js';
import { updateCombat } from './combat.js';
import { createMissions, updateMissions } from './missions.js';

/**
 * The player's car against the world of other cars and people, one step's worth.
 * Cars: a circle shove apart, and a closing-speed impact that crumples both,
 * hurts at speed, and is a crime if witnessed. People: at speed a pedestrian
 * goes down (a serious crime); crawling pace just startles them into a run.
 */
function collidePlayerCar(world) {
  const pc = world.player.car;
  if (!pc) return;
  const { player } = world;

  for (const other of world.cars) {
    if (other === pc) continue;
    const dx = other.x - pc.x;
    const dy = other.y - pc.y;
    const dist = Math.hypot(dx, dy);
    const minDist = (pc.len + other.len) * 0.3;
    if (dist < 0.01 || dist >= minDist) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    const rel = (pc.vx - (other.vx || 0)) * nx + (pc.vy - (other.vy || 0)) * ny;
    // Shove Marlo's car back out of the overlap, if the shove itself is legal.
    const push = minDist - dist;
    if (world.city.circleFree(pc.x - nx * push, pc.y - ny * push, pc.wid * 0.52)) {
      pc.x -= nx * push;
      pc.y -= ny * push;
    }
    if (other.kind === 'traffic') {
      other.x += nx * 3;
      other.y += ny * 3;
      other.speed *= 0.4;
    }
    if (rel > 55) {
      world.events.push('crash');
      pc.damage = Math.min(100, pc.damage + (rel - 55) * 0.05);
      if (other.kind !== 'police') other.damage = Math.min(100, (other.damage || 0) + (rel - 55) * 0.05);
      if (rel > 165) damagePlayer(player, (rel - 165) * 0.1);
      reportCrime(world, other.kind === 'police' ? 120 : 55, pc.x, pc.y);
      // Kill the closing velocity, with a little bounce.
      pc.vx -= nx * rel * 1.35;
      pc.vy -= ny * rel * 1.35;
      pc.speed = pc.vx * Math.cos(pc.angle) + pc.vy * Math.sin(pc.angle);
    }
  }

  const speedMag = Math.hypot(pc.vx, pc.vy);
  for (const ped of world.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - pc.x, ped.y - pc.y);
    if (d >= pc.wid * 0.5 + 13) continue;
    if (speedMag > 55) {
      knockDown(ped, 4);
      world.events.push('crash');
      reportCrime(world, speedMag > 150 ? 200 : 110, ped.x, ped.y);
      pc.vx *= 0.82;
      pc.vy *= 0.82;
      pc.speed *= 0.82;
    } else {
      ped.state = 'flee';
      ped.fleeTime = 0.8;
      ped.angle = Math.atan2(ped.y - pc.y, ped.x - pc.x);
    }
  }
}

export function createWorld(rng) {
  const city = generateCity(rng);

  // Marlo starts on the pavement by the Avenida Coral / Calle Marea crossing,
  // mid-city, with traffic going past — a fair postcard of Solmaris.
  const corner = city.intersections.find((i) => i.avenue === 'Avenida Coral' && i.street === 'Calle Marea')
    ?? city.intersections[0];
  const spawnTarget = { x: corner.x + 70, y: corner.y + 70 };
  let spawn = spawnTarget;
  let bestDist = Infinity;
  for (const spot of city.sidewalkSpots) {
    const d = Math.hypot(spot.x - spawnTarget.x, spot.y - spawnTarget.y);
    if (d < bestDist) {
      bestDist = d;
      spawn = spot;
    }
  }
  const player = createPlayer(spawn.x, spawn.y);

  const cars = [...spawnParked(city, rng), ...spawnTraffic(city, rng, TRAFFIC.count, player.x, player.y)];
  const peds = spawnPeds(city, rng, PEDS.count, player.x, player.y);

  const world = {
    city,
    player,
    cars,
    peds,
    rng, // the seeded generator, kept so the stage-two systems spawn deterministically
    dayTime: DAY_START,
    wanted: 0,
    message: '',
    messageTime: 0,
    events: [],
    lastCar: null, // the car Marlo most recently got out of (minimap marker)
    mission: null, // { x, y } marker the minimap draws: the current objective
    objective: '', // the HUD's objective line, owned by missions
    story: null, // { title, lines } panel between missions, owned by missions
    banner: '',
    bannerTime: 0,
    effects: [], // tracers, muzzle flashes and swings, drawn by the renderer
    penaltyEvent: null, // 'busted' | 'wasted', set by police/combat, read by missions
    places: null, // filled in below, once the city exists
    police: createPoliceState(),
    missions: null, // filled in below: the story state machine
    playSeconds: 0,

    /** Show a line of text over the HUD for a few seconds. */
    say(text, seconds = 3.5) {
      world.message = text;
      world.messageTime = seconds;
    },

    /** Flash a word across the middle of the screen: BUSTED, WASTED. */
    bannerSay(text, seconds = 2.2) {
      world.banner = text;
      world.bannerTime = seconds;
    },

    /**
     * Advance everything by dt. `ctl` carries both bodies of control —
     * { mx, my, sprint } on foot and { throttle, steer, handbrake } in a car —
     * plus the one-shot combat presses { attack, fire, confirm }.
     */
    step(dt, ctl) {
      world.events.length = 0;
      world.playSeconds += dt;
      world.dayTime = (world.dayTime + dt / DAY_SECONDS) % 1;
      if (world.messageTime > 0) world.messageTime -= dt;
      if (world.bannerTime > 0) world.bannerTime -= dt;

      if (player.car) {
        const car = player.car;
        const speedBefore = Math.hypot(car.vx, car.vy);
        updatePlayerCar(car, ctl, city, dt, world.events);
        collidePlayerCar(world);
        // A wall taken at speed hurts, even with nobody to witness it.
        const drop = speedBefore - Math.hypot(car.vx, car.vy);
        if (drop > 120) {
          damagePlayer(player, (drop - 120) * 0.1);
          car.damage = Math.min(100, car.damage + (drop - 120) * 0.05);
        }
        player.x = car.x;
        player.y = car.y;
        player.angle = car.angle;
      } else {
        updatePlayerOnFoot(player, ctl, city, dt);
      }
      updateTraffic(cars, city, rng, dt, world.events);
      updatePeds(peds, city, cars, rng, dt);
      updateCombat(world, rng, dt, ctl);
      updatePolice(world, rng, dt);
      updatePlaces(world, dt);
      updateMissions(world, rng, dt, ctl);
    },
  };
  world.places = createPlaces(city);
  world.missions = createMissions(world);
  return world;
}
