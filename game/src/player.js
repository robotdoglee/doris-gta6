// The player: Marlo Reyes, dock courier, currently between jobs. On foot he walks (or
// runs, with Shift) and collides with buildings and water as a small circle, axis by
// axis so he slides along walls. The interact key is the hinge of the game: near a car
// it puts him in the driver's seat — traffic cars and parked cars alike, this is a
// crime game — and in a car it puts him back on the pavement beside it.

import { COMBAT, PLAYER } from './config.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.startHealth,
    armor: PLAYER.startArmor,
    money: 0,
    car: null, // the car object being driven, or null on foot
    phase: 0,
    moving: false,
    // Stage two: the pistol Marlo carries, and the swing/shot cooldowns combat reads.
    ammo: COMBAT.startAmmo,
    attackCd: 0,
    fireCd: 0,
  };
}

/**
 * Hurt Marlo. Armour soaks sixty percent of whatever it can cover; the rest is
 * health. Combat watches health reach zero and handles the consequences.
 */
export function damagePlayer(player, amount) {
  if (amount <= 0 || player.health <= 0) return;
  const soaked = Math.min(player.armor, amount * 0.6);
  player.armor -= soaked;
  player.health -= amount - soaked;
}

/** Put Marlo back on his feet at a place of consequence (station, hospital). */
export function respawnAt(player, spot) {
  player.x = spot.x;
  player.y = spot.y;
  player.angle = -Math.PI / 2;
  player.moving = false;
}

/** One on-foot step. `ctl` is { mx, my, sprint } with mx/my in -1..1. */
export function updatePlayerOnFoot(player, ctl, city, dt) {
  const mag = Math.hypot(ctl.mx, ctl.my);
  player.moving = mag > 0.01;
  if (!player.moving) return;
  const speed = ctl.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const dx = (ctl.mx / (mag || 1)) * speed * dt;
  const dy = (ctl.my / (mag || 1)) * speed * dt;
  player.angle = Math.atan2(ctl.my, ctl.mx);
  const r = PLAYER.radius;
  if (city.circleFree(player.x + dx, player.y, r)) player.x += dx;
  if (city.circleFree(player.x, player.y + dy, r)) player.y += dy;
  player.phase += dt * speed * 0.085;
}

/**
 * Try to get into or out of a car. Returns 'enter', 'exit' or null.
 * Entering takes the nearest car within reach (a traffic car simply changes hands;
 * its driver is a stage-two problem). Exiting places Marlo at the car's side,
 * preferring the left, and leaves the car parked where it stands.
 */
export function tryInteract(player, cars, city) {
  if (player.car) {
    const car = player.car;
    const sideX = Math.cos(car.angle + Math.PI / 2);
    const sideY = Math.sin(car.angle + Math.PI / 2);
    const reach = car.wid / 2 + PLAYER.radius + 7;
    for (const sign of [-1, 1]) {
      const x = car.x + sideX * reach * sign;
      const y = car.y + sideY * reach * sign;
      if (city.circleFree(x, y, PLAYER.radius)) {
        player.x = x;
        player.y = y;
        player.angle = car.angle + (sign < 0 ? -Math.PI / 2 : Math.PI / 2);
        break;
      }
    }
    car.kind = 'parked';
    car.vx = 0;
    car.vy = 0;
    car.speed = 0;
    player.car = null;
    return 'exit';
  }
  // The nearest car within reach — but never a patrol car; the law keeps its keys.
  let car = null;
  let bestDist = 52;
  for (const other of cars) {
    if (other.kind === 'police') continue;
    const d = Math.hypot(other.x - player.x, other.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      car = other;
    }
  }
  if (!car) return null;
  car.kind = 'player';
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  player.car = car;
  return 'enter';
}

/** Draw Marlo on foot: rust-red shirt, dark cap, unmistakable next to the crowd. */
export function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(40,22,14,0.32)';
  ctx.beginPath();
  ctx.ellipse(1.5, 3, 8.5, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle + Math.PI / 2);
  const swing = player.moving ? Math.sin(player.phase) * 3.8 : 0;
  ctx.fillStyle = '#26324a';
  ctx.fillRect(-4.8 + swing * 0.4, 2.5, 4, 6.6);
  ctx.fillRect(0.8 - swing * 0.4, 2.5, 4, 6.6);
  ctx.fillStyle = '#d84f35';
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 6.2, 7.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9a066';
  ctx.beginPath();
  ctx.arc(0, -5, 4.3, 0, Math.PI * 2);
  ctx.fill();
  // The cap, brim toward facing.
  ctx.fillStyle = '#20303e';
  ctx.beginPath();
  ctx.arc(0, -5.6, 4.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-4.3, -11.4, 8.6, 3.4);
  ctx.restore();
}
