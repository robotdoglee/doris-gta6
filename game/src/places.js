// The named places of Puerto Solmaris that stage two hangs its systems on: the police
// station Marlo is hauled back to when he is busted, the hospital that patches him up
// when he is wasted, a repair yard that straightens bent cars for cash, a supply shop
// that sells armour and ammunition, and the spots the story visits — Nadia's dock
// office, the riverside park, the Mercado Central loading bay, a safehouse, and Tito's
// beach bar.
//
// Every place is found from the generated city itself (a named crossing, a building
// with the right sign, a parking lot, a beach tile), with a deterministic fallback, so
// any seed yields a complete, reachable set. updatePlaces() runs the two interactive
// zones: hold still in the repair yard to get a car fixed, stand in the shop to buy.

import { COMBAT, PLACES, TILE } from './config.js';
import { T } from './city.js';

/** Nudge a point in a fixed spiral until a walker can stand there. */
function freeSpot(city, x, y) {
  for (let r = 0; r <= 112; r += 16) {
    for (let a = 0; a < 8; a += 1) {
      const px = x + Math.cos((a * Math.PI) / 4) * r;
      const py = y + Math.sin((a * Math.PI) / 4) * r;
      if (city.circleFree(px, py, 12)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** A pavement corner beside the named crossing (falling back to the first crossing). */
function crossing(city, avenue, street, dx, dy) {
  const hit = city.intersections.find((i) => i.avenue === avenue && i.street === street)
    ?? city.intersections[0];
  return freeSpot(city, hit.x + dx, hit.y + dy);
}

/** The pavement in front of a building with the given sign (or a fallback building). */
function buildingFront(city, sign, fallbackIndex) {
  const b = city.buildings.find((bd) => bd.sign === sign) ?? city.buildings[fallbackIndex % city.buildings.length];
  if (!b) return freeSpot(city, city.intersections[0].x + 70, city.intersections[0].y + 70);
  return freeSpot(city, b.x + b.w / 2, b.y + b.h + 30);
}

export function createPlaces(city) {
  const station = { ...crossing(city, 'Palm Row', 'Paseo del Puerto', 70, 70), name: 'Comisaría — Police Station' };
  const hospital = { ...crossing(city, 'Avenida Miramar', 'Calle Alba', -70, 70), name: 'Clínica Vida — Hospital' };
  const giver = { ...crossing(city, 'Paseo del Muelle', 'Paseo del Puerto', 70, -70), name: "Nadia's Dock Office" };
  const safehouse = { ...crossing(city, 'Avenida del Faro', 'Calle Alba', 70, 70), name: 'Safehouse — Calle Alba' };

  // The repair yard is one of the city's parking lots: open asphalt a car can reach.
  const lotSpot = city.parkingSpots[Math.floor(city.parkingSpots.length * 0.4)] ?? { x: station.x, y: station.y };
  const repair = { x: lotSpot.x, y: lotSpot.y, name: 'Taller Solmaris — Repairs' };

  const shop = { ...buildingFront(city, 'Farmacia Luz', 2), name: 'Palma Supply' };
  const dropoff = { ...buildingFront(city, 'Mercado Central', 6), name: 'Mercado Central — Loading Bay' };

  // The pickup is a tree in the riverside park, west bank of the river.
  const riverX = 45 * TILE;
  const tree = city.trees.find((t) => city.tileAtPx(t.x, t.y) === T.GRASS && t.x < riverX && t.x > riverX - 7 * TILE);
  const pickupBase = tree ?? city.sidewalkSpots[Math.floor(city.sidewalkSpots.length * 0.5)] ?? station;
  const pickup = { ...freeSpot(city, pickupBase.x, pickupBase.y), name: 'Riverside Park' };

  // Tito holds court on the sand: take the middle beach tile on the bay shore.
  const sands = [];
  for (let ty = 0; ty < 48; ty += 1) {
    for (let tx = 58; tx < 64; tx += 1) {
      if (city.tileAt(tx, ty) === T.SAND) sands.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
    }
  }
  const sandBase = sands[Math.floor(sands.length / 2)] ?? giver;
  const tito = { ...freeSpot(city, sandBase.x, sandBase.y), name: 'Bar La Ola — The Beach' };

  return {
    station, hospital, giver, safehouse, repair, shop, dropoff, pickup, tito,
    state: { repairTimer: 0, shopTimer: 0, repairHint: false, shopServed: false },
  };
}

/** Run the repair yard and the supply shop for one step. */
export function updatePlaces(world, dt) {
  const { player, places } = world;
  const st = places.state;
  const car = player.car;

  if (car && Math.hypot(player.x - places.repair.x, player.y - places.repair.y) < PLACES.repairRadius) {
    if (car.damage > 0.5) {
      if (!st.repairHint) {
        st.repairHint = true;
        world.say(`Taller Solmaris — $${Math.ceil(car.damage) * PLACES.repairCostPerPoint} to make it right. Hold still…`, 2.6);
      }
      st.repairTimer += dt;
      if (st.repairTimer > 0.7 && Math.abs(car.speed) < 14) {
        st.repairTimer = 0;
        const cost = Math.ceil(car.damage) * PLACES.repairCostPerPoint;
        if (player.money >= cost) {
          player.money -= cost;
          car.damage = 0;
          world.events.push('cash');
          world.say('Good as new. Try not to bend it again.', 2.6);
        } else {
          world.say('Not enough cash for the job, friend.', 2.2);
        }
      }
    }
  } else {
    st.repairTimer = 0;
    st.repairHint = false;
  }

  if (!car && Math.hypot(player.x - places.shop.x, player.y - places.shop.y) < PLACES.shopRadius) {
    st.shopTimer += dt;
    // One transaction per visit: step out and back in for the next.
    if (st.shopTimer > 0.7 && !st.shopServed) {
      st.shopTimer = 0;
      st.shopServed = true;
      if (player.armor < 100 && player.money >= PLACES.armourCost) {
        player.money -= PLACES.armourCost;
        player.armor = Math.min(100, player.armor + PLACES.armourAmount);
        world.events.push('cash');
        world.say(`Armour vest — $${PLACES.armourCost}. Stay alive, Marlo.`, 2.4);
      } else if (player.ammo < COMBAT.maxAmmo && player.money >= PLACES.ammoCost) {
        player.money -= PLACES.ammoCost;
        player.ammo = Math.min(COMBAT.maxAmmo, player.ammo + PLACES.ammoAmount);
        world.events.push('cash');
        world.say(`Ammunition — $${PLACES.ammoCost}. No questions asked.`, 2.4);
      } else {
        world.say(`Palma Supply: armour $${PLACES.armourCost} · ammo $${PLACES.ammoCost}.`, 2.6);
      }
    }
  } else {
    st.shopTimer = 0;
    st.shopServed = false;
  }
}
