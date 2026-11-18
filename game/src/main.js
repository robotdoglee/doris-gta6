// Solmaris — boot and the one loop. Input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. Three screens: title (the world idles behind it), play, and
// paused. Sound events the world collects while stepping — horns, crashes — are
// played here, where the audio lives.
//
// ?seed=N fixes the city and everything in it. ?shot=city|start|play|chase|mission|dusk (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { FONT, GAME_TAGLINE, GAME_TITLE, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createInput, ACTION_ATTACK, ACTION_CONFIRM, ACTION_FIRE, ACTION_HORN, ACTION_INTERACT, ACTION_PAUSE } from './input.js';
import { createCamera } from './camera.js';
import { createRenderer } from './render.js';
import { createMinimap, drawMinimap, MAP_H, MAP_W } from './minimap.js';
import { drawHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { tryInteract } from './player.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const camera = createCamera();
const minimap = createMinimap(world.city);
const audio = createAudio();
const save = shot ? null : loadSave();

if (save) {
  world.player.money = save.money;
  if (save.x !== null && save.y !== null && world.city.circleFree(save.x, save.y, 12)) {
    world.player.x = save.x;
    world.player.y = save.y;
  }
}
camera.jumpTo(world.player.x, world.player.y);

function syncView() {
  renderer.resize();
  camera.viewW = renderer.viewW;
  camera.viewH = renderer.viewH;
}
window.addEventListener('resize', syncView);
syncView();

function persist() {
  if (shot) return;
  storeSave({
    money: world.player.money,
    x: Math.round(world.player.x),
    y: Math.round(world.player.y),
    playSeconds: Math.round((save?.playSeconds ?? 0) + world.playSeconds),
  });
}

function drawWorld(time) {
  renderer.worldTransform(camera);
  renderer.drawWorld(world, camera, time);
  renderer.screenTransform();
}

function drawPlayUI() {
  // drawHUD positions its clusters by view.w / view.h; the renderer calls those
  // width / height, so hand it the screen size in the shape it reads.
  drawHUD(renderer.ctx, world, { w: renderer.width, h: renderer.height });
  drawMinimap(renderer.ctx, minimap, world, renderer.width - MAP_W - 14, renderer.height - MAP_H - 14);
}

function drawTitle() {
  const { ctx } = renderer;
  const w = renderer.width;
  const h = renderer.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(30,14,8,0.42)');
  grad.addColorStop(0.55, 'rgba(30,14,8,0.18)');
  grad.addColorStop(1, 'rgba(30,14,8,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd98a';
  ctx.font = `bold 74px ${FONT}`;
  ctx.fillText(GAME_TITLE, w / 2, h * 0.34);
  ctx.fillStyle = '#fff7e8';
  ctx.font = `italic 19px ${FONT}`;
  ctx.fillText(GAME_TAGLINE, w / 2, h * 0.34 + 38);
  ctx.font = `15.5px ${FONT}`;
  ctx.fillText('Marlo Reyes runs errands for half the port. This summer, every favour has a price.', w / 2, h * 0.34 + 72);
  ctx.font = `14.5px ${FONT}`;
  ctx.fillStyle = 'rgba(255,247,232,0.85)';
  ctx.fillText('WASD move · Shift run · E get in / out of a car · J punch · K pistol · H horn · P pause', w / 2, h * 0.34 + 108);
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillStyle = '#ffd98a';
  ctx.fillText(save ? `Press Enter — welcome back. $${save.money.toLocaleString('en-US')} in your pocket.` : 'Press Enter or tap to play', w / 2, h * 0.34 + 148);
}

function drawPaused() {
  const { ctx } = renderer;
  ctx.fillStyle = 'rgba(16,10,8,0.55)';
  ctx.fillRect(0, 0, renderer.width, renderer.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff7e8';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText('PAUSED', renderer.width / 2, renderer.height * 0.46);
  ctx.font = `15px ${FONT}`;
  ctx.fillText('P or Esc to keep going', renderer.width / 2, renderer.height * 0.46 + 34);
}

function runShot(name) {
  const scene = stageShot(name, world);
  camera.jumpTo(world.player.x, world.player.y);
  let painted = 0;
  function paint() {
    drawWorld(2.4);
    if (scene.screen === 'title') drawTitle();
    else drawPlayUI();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let startedAt = performance.now();
  // One-shot presses the world consumes (a punch, a shot, a panel dismissal):
  // captured per frame, offered to the first step of the frame, then spent.
  const pending = { attack: false, fire: false, confirm: false };

  function announce(message) {
    status.textContent = message;
  }

  function startPlay() {
    screen = 'play';
    audio.resume();
    audio.uiClick();
    world.say(save ? 'Welcome back to Solmaris.' : 'Solmaris. Find a car — E is the key.', 4);
    announce('Playing.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startPlay();
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'paused';
        persist();
        announce('Paused.');
      } else if (screen === 'paused') {
        screen = 'play';
        announce('Playing.');
      }
      return;
    }
    if (screen !== 'play') return;
    if (actions & ACTION_ATTACK) pending.attack = true;
    if (actions & ACTION_FIRE) pending.fire = true;
    if (actions & ACTION_CONFIRM) pending.confirm = true;
    if (actions & ACTION_INTERACT) {
      const carBefore = world.player.car;
      const result = tryInteract(world.player, world.cars, world.city);
      if (result === 'enter') {
        audio.door();
        audio.engineStart();
        world.say(`${world.player.car.type.name}. ${world.player.car.type.taxi ? 'The meter is broken. Lucky you.' : 'It is not stealing if you bring it back. Probably.'}`, 3.2);
      } else if (result === 'exit') {
        audio.door();
        audio.engineStop();
        world.lastCar = carBefore;
      }
    }
    if ((actions & ACTION_HORN) && world.player.car) audio.horn();
  }

  function controls() {
    const driving = world.player.car !== null;
    return {
      mx: input.axisX(),
      my: input.axisY(),
      sprint: input.sprint(),
      throttle: input.throttle(),
      steer: input.axisX(),
      handbrake: driving && input.sprint(),
      attack: pending.attack,
      fire: pending.fire,
      confirm: pending.confirm,
    };
  }

  function playEvents() {
    for (const event of world.events) {
      if (event === 'horn') audio.horn();
      else if (event === 'crash') audio.crash(0.7);
      else if (event === 'gunshot') audio.gunshot();
      else if (event === 'melee') audio.melee();
      else if (event === 'cash') audio.cash();
      else if (event === 'busted' || event === 'wasted') audio.sting();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();

    if (screen === 'title') {
      // The world idles behind the title: traffic circulates, the light slides.
      accumulator += frameDt;
      while (accumulator >= STEP) {
        world.step(STEP, { mx: 0, my: 0, sprint: false, throttle: 0, steer: 0, handbrake: false });
        accumulator -= STEP;
      }
      const t = (now - startedAt) / 1000;
      camera.follow(world.player.x + Math.cos(t * 0.11) * 130, world.player.y + Math.sin(t * 0.07) * 90, 0, 0, frameDt);
    } else if (screen === 'play') {
      accumulator += frameDt;
      const ctl = controls();
      while (accumulator >= STEP) {
        world.step(STEP, ctl);
        playEvents();
        accumulator -= STEP;
        // The one-shots belong to the first step that saw them.
        ctl.attack = ctl.fire = ctl.confirm = false;
        pending.attack = pending.fire = pending.confirm = false;
      }
      const p = world.player;
      const lead = p.car ? 0.42 : 0.18;
      const vx = p.car ? p.car.vx : 0;
      const vy = p.car ? p.car.vy : 0;
      camera.follow(p.x, p.y, vx * lead, vy * lead, frameDt);
      if (p.car) audio.engineUpdate(Math.min(1, Math.abs(p.car.speed) / p.car.type.max), input.throttle());
      saveTimer += frameDt;
      if (saveTimer > 15) {
        saveTimer = 0;
        persist();
      }
    } else {
      accumulator = 0;
    }

    drawWorld(now / 1000);
    if (screen === 'title') drawTitle();
    else {
      drawPlayUI();
      if (screen === 'paused') drawPaused();
    }
  }

  // Leaving the tab pauses a running game rather than letting Solmaris run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      persist();
      announce('Paused.');
    }
  });

  announce('Solmaris. Press Enter or tap to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
