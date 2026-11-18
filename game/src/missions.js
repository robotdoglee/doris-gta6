// Marlo's summer, in three favours: the story missions Nadia Ferro hands out from
// the dock office, chained one into the next.
//
// Walk into the orange marker at the dock office and the next chapter starts: an
// intro panel of dialogue, an objective line on the HUD, a marker on the minimap
// and in the world. Steps are arrivals (drive or walk into the ring), one timed
// delivery, one escape under a scripted wanted level, and one collection Marlo
// has to hold his ground through while Salcedo men swing at him. Finish and the
// money lands with a cash sound and an outro panel; get busted or wasted on the
// job — or run the clock out — and the chapter resets to the dock office, ready
// to try again. The panels dismiss with Enter (or fade on their own).

import { createPed } from './pedestrians.js';
import { damagePlayer } from './player.js';
import { clearHeat, setHeat } from './police.js';

function buildScript(places) {
  return [
    {
      title: 'First Favour',
      reward: 250,
      intro: [
        'Nadia Ferro runs the dock office — and half the favours in Puerto Solmaris.',
        '“Marlo. A crate came in on the morning boat. It sits in Riverside Park,',
        'and crates like that do not sit anywhere long.”',
        '“Take it to the Mercado Central loading bay. Quick, quiet — and do not open it.”',
      ],
      outro: [
        '“You smell like river water and money,” Nadia says, counting out your cut.',
        '“Good work. Because tomorrow, the owners of that crate come looking for it.”',
      ],
      steps: [
        {
          target: places.pickup, radius: 46,
          label: "Pick up Nadia's crate — Riverside Park",
          onArrive(world) {
            world.say('“Heavy, for paperwork.” Marlo loads the crate and does not look inside.', 3.4);
          },
        },
        {
          target: places.dropoff, radius: 46, timer: 150,
          label: 'Deliver the crate — Mercado Central loading bay',
        },
      ],
    },
    {
      title: 'Hot Tail',
      reward: 400,
      intro: [
        'The Salcedo crew traced the crate — and the courier who moved it.',
        '“They have friends in uniform, Marlo. Blue friends, with sirens.”',
        '“Get to the safehouse on Calle Alba. And whatever happens — do not get caught.”',
      ],
      outro: [
        'From the safehouse roof, the city looks almost honest.',
        '“Harder to catch than they said,” Nadia admits, over the phone. “One last job, then.”',
      ],
      onComplete(world) {
        clearHeat(world);
        world.wanted = 0;
      },
      steps: [
        {
          target: places.safehouse, radius: 52,
          label: 'Reach the safehouse — Calle Alba',
          onStart(world) {
            setHeat(world, 210);
            world.say('Sirens, somewhere behind you. Run.', 3);
          },
        },
      ],
    },
    {
      title: 'Settling Up',
      reward: 600,
      intro: [
        '“Tito, at the beach bar, owes the office three months of money',
        'for protection he never asked us for.”',
        '“Collect it. On foot. Smiling.”',
        '“His new Salcedo friends may object. Object back.”',
      ],
      outro: [
        'Nadia locks the cash box and, for the first time all summer, smiles.',
        '“The port is ours again, Marlo. Whatever that is worth.”',
        'It is worth $600, a sunburn, and a story nobody at the docks will ever believe.',
        '— FIN —',
      ],
      steps: [
        {
          target: places.tito, radius: 42,
          label: 'Find Tito — Bar La Ola, on the beach',
        },
        {
          target: places.tito, radius: 64, collect: 2.5,
          label: 'Collect the money — hold your ground by Tito',
          onStart(world) {
            spawnHostiles(world);
            world.say('Salcedo men: “Wrong beach, courier.”', 3);
          },
        },
        {
          target: places.giver, radius: 44,
          label: 'Bring the money back to Nadia',
        },
      ],
    },
  ];
}

export function createMissions(world) {
  return {
    script: buildScript(world.places),
    idx: 0,
    phase: 'idle', // 'idle' | 'active' | 'done'
    step: 0,
    timer: 0,
    collect: 0,
    storyT: 0,
    hostiles: [],
  };
}

function showStory(world, panel) {
  world.story = panel;
  world.missions.storyT = 16;
}

function currentStep(world) {
  const m = world.missions;
  return m.script[m.idx]?.steps[m.step] ?? null;
}

function initStep(world) {
  const m = world.missions;
  const step = currentStep(world);
  m.collect = 0;
  m.timer = step?.timer ?? 0;
  if (step?.onStart) step.onStart(world);
}

function startMission(world) {
  const m = world.missions;
  const def = m.script[m.idx];
  if (!def) {
    m.phase = 'done';
    return;
  }
  m.phase = 'active';
  m.step = 0;
  showStory(world, { title: def.title, lines: def.intro });
  initStep(world);
}

function freeHostiles(world) {
  const m = world.missions;
  for (const h of m.hostiles) {
    h.hostile = false;
    h.state = 'flee';
    h.fleeTime = 1.2;
  }
  m.hostiles = [];
}

function failMission(world, reason) {
  const m = world.missions;
  freeHostiles(world);
  m.phase = 'idle';
  m.step = 0;
  m.timer = 0;
  world.say(reason, 4);
}

function completeMission(world) {
  const m = world.missions;
  const def = m.script[m.idx];
  freeHostiles(world);
  if (def.onComplete) def.onComplete(world);
  world.player.money += def.reward;
  world.events.push('cash');
  showStory(world, { title: `${def.title} — $${def.reward}`, lines: def.outro });
  m.idx += 1;
  m.step = 0;
  m.timer = 0;
  if (m.idx >= m.script.length) {
    m.phase = 'done';
    world.say('Story complete. Solmaris is yours — the port, the sun, and the sirens.', 5);
  } else {
    m.phase = 'idle';
  }
}

function advanceStep(world) {
  const m = world.missions;
  m.step += 1;
  if (m.step >= m.script[m.idx].steps.length) completeMission(world);
  else initStep(world);
}

function spawnHostiles(world) {
  const m = world.missions;
  const tito = world.places.tito;
  for (const [ox, oy] of [[-52, -30], [48, 38]]) {
    let x = tito.x + ox;
    let y = tito.y + oy;
    if (world.city.isSolidPx(x, y)) {
      x = tito.x - ox;
      y = tito.y - oy;
    }
    const ped = createPed(world.rng, x, y);
    ped.hostile = true;
    ped.shirt = '#2f3542';
    world.peds.push(ped);
    m.hostiles.push(ped);
  }
}

/** The Salcedo men: walk at Marlo and swing; down is down, for good. */
function updateHostiles(world, dt) {
  const m = world.missions;
  const { player, city } = world;
  for (let i = m.hostiles.length - 1; i >= 0; i -= 1) {
    const h = m.hostiles[i];
    if (h.down) {
      h.downTime -= dt;
      if (h.downTime <= 0) {
        const pi = world.peds.indexOf(h);
        if (pi >= 0) world.peds.splice(pi, 1);
        m.hostiles.splice(i, 1);
      }
      continue;
    }
    const d = Math.hypot(player.x - h.x, player.y - h.y);
    if (d > 30) {
      h.angle = Math.atan2(player.y - h.y, player.x - h.x);
      const nx = h.x + Math.cos(h.angle) * 128 * dt;
      const ny = h.y + Math.sin(h.angle) * 128 * dt;
      if (!city.isSolidPx(nx, ny)) {
        h.x = nx;
        h.y = ny;
      } else if (!city.isSolidPx(nx, h.y)) h.x = nx;
      else if (!city.isSolidPx(h.x, ny)) h.y = ny;
      h.phase += dt * 128 * 0.11;
    } else {
      h.atkCd -= dt;
      if (h.atkCd <= 0) {
        h.atkCd = 0.85;
        damagePlayer(player, 6);
        world.events.push('melee');
      }
    }
  }
}

export function updateMissions(world, rng, dt, ctl) {
  const m = world.missions;
  const { player, places } = world;

  // Story panels: Enter dismisses, time fades.
  if (world.story) {
    if (ctl.confirm) world.story = null;
    else {
      m.storyT -= dt;
      if (m.storyT <= 0) world.story = null;
    }
  }

  // Busted or wasted on the job ends the chapter.
  if (world.penaltyEvent) {
    const pe = world.penaltyEvent;
    world.penaltyEvent = null;
    if (m.phase === 'active') {
      failMission(world, pe === 'busted'
        ? 'The comisaría has questions. Nadia will have to wait.'
        : 'You wake up at Clínica Vida. The job is off — for now.');
      return;
    }
  }

  if (m.phase === 'done') {
    world.mission = null;
    world.objective = '';
    return;
  }

  if (m.phase === 'idle') {
    world.mission = { x: places.giver.x, y: places.giver.y };
    world.objective = m.idx === 0
      ? 'Talk to Nadia at the dock office'
      : 'Nadia has more work — the dock office';
    if (Math.hypot(player.x - places.giver.x, player.y - places.giver.y) < 42) startMission(world);
    return;
  }

  // Active.
  updateHostiles(world, dt);
  const step = currentStep(world);
  if (!step) return;
  world.mission = { x: step.target.x, y: step.target.y };

  if (step.collect) {
    const near = Math.hypot(player.x - step.target.x, player.y - step.target.y) < step.radius;
    if (near) m.collect += dt;
    world.objective = `${step.label} (${Math.min(100, Math.floor((m.collect / step.collect) * 100))}%)`;
    if (m.collect >= step.collect) advanceStep(world);
    return;
  }

  if (step.timer) {
    m.timer -= dt;
    const left = Math.max(0, Math.ceil(m.timer));
    world.objective = `${step.label} — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (m.timer <= 0) {
      failMission(world, 'Too slow — the buyer walked. Nadia is not pleased.');
      return;
    }
  } else {
    world.objective = step.label;
  }

  if (Math.hypot(player.x - step.target.x, player.y - step.target.y) < step.radius) {
    if (step.onArrive) step.onArrive(world);
    advanceStep(world);
  }
}

/** Screenshot staging: drop the story at a given chapter and step, panel closed. */
export function debugForceMission(world, idx, stepIdx) {
  const m = world.missions;
  m.idx = idx;
  m.phase = 'active';
  m.step = stepIdx;
  world.story = null;
  initStep(world);
}
