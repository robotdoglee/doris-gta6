// The screenshot scenes behind ?shot=<name>&seed=N. Each one plays the real rules
// forward from a fresh, seeded world for a fixed number of fixed steps, steered by a
// simple autopilot, so the frame is what the game really looks like and the same seed
// always gives the same frame. Stage one ships 'city' (the postcard: Marlo driving
// down Avenida Coral in traffic), plus the starter's 'start' and 'play' shapes —
// 'start' idles the world under the title, 'play' walks Marlo down the pavement.
// Stage two adds 'chase' (three stars, the Patrulla on his tail, the hunt live on
// the HUD and minimap) and 'mission' (mid-delivery, the crate in the car, the
// objective line and the loading-bay marker up). Stage three adds 'dusk': the
// driving postcard at last light, on the avenue along the riverside park.

import { STEP, TRAFFIC } from './config.js';
import { stagePursuit } from './police.js';
import { debugForceMission } from './missions.js';

const IDLE = { mx: 0, my: 0, sprint: false, throttle: 0, steer: 0, handbrake: false };

/** Put Marlo into the first traffic car, staged in the southbound lane of an avenue. */
function stageDriving(world, avenueName = 'Avenida Coral') {
  const { city, player } = world;
  const avenue = city.vRoads.find((r) => r.name === avenueName) ?? city.vRoads[2];
  const street = city.hRoads[2];
  const car = world.cars.find((c) => c.kind === 'traffic');
  if (!car || !avenue || !street) return null;
  car.kind = 'player';
  car.x = avenue.center - TRAFFIC.laneOffset; // southbound lane (right-hand traffic)
  car.y = street.center - 330;
  car.angle = Math.PI / 2;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  return { laneX: avenue.center - TRAFFIC.laneOffset };
}

/** A lane-keeping pilot: hold the throttle, steer gently back to the lane centre. */
function drivingControls(car, laneX) {
  const angleError = Math.atan2(Math.sin(Math.PI / 2 - car.angle), Math.cos(Math.PI / 2 - car.angle));
  const steer = Math.max(-1, Math.min(1, (laneX - car.x) * 0.012 + angleError * 1.6));
  return { mx: 0, my: 0, sprint: false, throttle: car.speed < 40 ? 1 : 0.72, steer, handbrake: false };
}

/**
 * Set `world` to the named scene and return the screen to draw over it
 * ('title' for start, 'play' for everything else).
 */
export function stageShot(name, world) {
  if (name === 'start') {
    for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE);
    return { screen: 'title' };
  }
  if (name === 'play') {
    // Six seconds south along the pavement from the spawn corner, traffic going by.
    const walk = { ...IDLE, my: 1 };
    for (let i = 0; i < 6 / STEP; i += 1) world.step(STEP, walk);
    return { screen: 'play' };
  }
  if (name === 'chase') {
    // The postcard, gone wrong: same avenue, three stars, patrol cars behind him.
    const staged = stageDriving(world);
    if (!staged) {
      for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE);
      return { screen: 'play' };
    }
    stagePursuit(world, 3);
    for (let i = 0; i < 5.5 / STEP; i += 1) {
      world.step(STEP, drivingControls(world.player.car, staged.laneX));
    }
    // The drive itself is real play — bumps included — but the scene is staged at
    // three stars: settle the heat back to exactly that, with the original three
    // units, for the frame.
    world.police.heat = 300;
    world.wanted = 3;
    world.police.bustTimer = 0;
    while (world.police.units.length > 3) {
      const extra = world.police.units.pop();
      const i = world.cars.indexOf(extra);
      if (i >= 0) world.cars.splice(i, 1);
    }
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // Mid-delivery on the first favour: crate aboard, clock running, bay marked.
    const staged = stageDriving(world);
    if (!staged) {
      for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE);
      return { screen: 'play' };
    }
    debugForceMission(world, 0, 1);
    for (let i = 0; i < 5 / STEP; i += 1) {
      world.step(STEP, drivingControls(world.player.car, staged.laneX));
    }
    return { screen: 'play' };
  }
  if (name === 'dusk') {
    // The postcard at last light: Calle Solano runs beside the riverside park,
    // so the frame holds the avenue, the river and the first lit windows.
    const staged = stageDriving(world, 'Calle Solano');
    if (!staged) {
      for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE);
      return { screen: 'play' };
    }
    // Deepest dusk (the factor tops out from dayTime 0.80 to 0.92; the drive
    // below advances it by under 0.02, so the light holds for the whole frame).
    world.dayTime = 0.84;
    for (let i = 0; i < 6.5 / STEP; i += 1) {
      world.step(STEP, drivingControls(world.player.car, staged.laneX));
    }
    return { screen: 'play' };
  }
  // 'city', and the default for any other name: the driving postcard.
  const staged = stageDriving(world);
  if (!staged) {
    for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP, IDLE);
    return { screen: 'play' };
  }
  for (let i = 0; i < 6.5 / STEP; i += 1) {
    world.step(STEP, drivingControls(world.player.car, staged.laneX));
  }
  return { screen: 'play' };
}
