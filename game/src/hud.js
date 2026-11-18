// The HUD, drawn in screen space over the world: health and armour bars top-left;
// money, wanted stars and the current street top-right; a context hint bottom-left
// (what the keys do right now); the speedometer bottom-right when driving; and a
// message line along the bottom centre whenever the world has something to say.
//
// Stage two fills the frame in: the wanted stars now answer to the police (with a
// PURSUIT / SEARCHING note under them), an objective line rides top-centre while a
// mission runs, the pistol's ammunition counts beside the minimap on foot, story
// panels open between missions, and BUSTED / WASTED land as full-screen banners.

import { FONT, PALETTE } from './config.js';

function bar(ctx, x, y, w, h, fraction, fill, label) {
  ctx.fillStyle = 'rgba(10,10,14,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 1, y - 5);
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#ffc93c';
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,201,60,0.75)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

export function drawHUD(ctx, state, view) {
  const { player } = state;
  const driving = player.car !== null;

  // Top-left: who Marlo is, and how he is doing.
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('MARLO REYES', 18, 24);
  bar(ctx, 18, 36, 178, 11, player.health / 100, player.health > 30 ? '#7ec850' : '#e5534b', 'HEALTH');
  bar(ctx, 18, 62, 178, 8, player.armor / 100, '#7fa8c9', 'ARMOUR');

  // Top-right: the law's opinion (stars), the money, the street.
  for (let i = 0; i < 5; i += 1) {
    star(ctx, view.w - 26 - (4 - i) * 30, 26, 11, i < state.wanted);
  }
  ctx.fillStyle = '#8be26a';
  ctx.font = `bold 23px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`$${player.money.toLocaleString('en-US')}`, view.w - 16, 66);
  ctx.fillStyle = 'rgba(255,247,232,0.85)';
  ctx.font = `12.5px ${FONT}`;
  ctx.fillText(state.city.streetNameAt(player.x, player.y), view.w - 16, 86);
  // Under the stars: is the law looking at him, or looking for him?
  if (state.wanted > 0 && state.police) {
    ctx.font = `bold 11px ${FONT}`;
    if (state.police.seen) {
      ctx.fillStyle = '#ff7a5c';
      ctx.fillText('● PURSUIT', view.w - 16, 106);
    } else {
      ctx.fillStyle = '#ffc93c';
      ctx.fillText('○ SEARCHING — break line of sight', view.w - 16, 106);
    }
  }

  // Top-centre: where the story wants him next.
  if (state.objective) {
    ctx.font = `bold 13.5px ${FONT}`;
    const ow = ctx.measureText(state.objective).width + 40;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect((view.w - ow) / 2, 12, ow, 30);
    ctx.fillStyle = '#ff9a3c';
    ctx.textAlign = 'left';
    ctx.fillText('◎', (view.w - ow) / 2 + 12, 32);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.objective, (view.w - ow) / 2 + 32, 32);
  }

  // Bottom-left: the keys that matter right now.
  ctx.fillStyle = 'rgba(10,10,14,0.45)';
  const hint = driving
    ? 'W/S drive · A/D steer · Shift handbrake · H horn · E get out'
    : 'WASD move · Shift run · E get in a car · J punch · K pistol';
  ctx.font = `12.5px ${FONT}`;
  const hintW = ctx.measureText(hint).width + 20;
  ctx.fillRect(10, view.h - 40, hintW, 26);
  ctx.fillStyle = 'rgba(255,247,232,0.88)';
  ctx.textAlign = 'left';
  ctx.fillText(hint, 20, view.h - 23);

  // Bottom-right, over the minimap's corner: speed while driving.
  if (driving) {
    const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `italic bold 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, view.w - 58, view.h - 178);
    ctx.font = `11px ${FONT}`;
    ctx.fillText('km/h', view.w - 16, view.h - 178);
    ctx.font = `italic 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,247,232,0.75)';
    ctx.fillText(player.car.type.name, view.w - 16, view.h - 160);
  }

  // On foot, beside the minimap: the pistol and what is left in it.
  if (!driving) {
    ctx.fillStyle = 'rgba(255,247,232,0.75)';
    ctx.font = `10.5px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('PISTOL · K', view.w - 16, view.h - 196);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `italic bold 22px ${FONT}`;
    ctx.fillText(`${player.ammo}`, view.w - 16, view.h - 172);
  }

  // Bottom-centre: the world's message line.
  if (state.messageTime > 0 && state.message) {
    ctx.font = `bold 15px ${FONT}`;
    const w = ctx.measureText(state.message).width + 34;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect((view.w - w) / 2, view.h - 76, w, 32);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(state.message, view.w / 2, view.h - 55);
  }

  // BUSTED / WASTED: the whole screen knows.
  if (state.bannerTime > 0 && state.banner) {
    ctx.globalAlpha = Math.min(1, state.bannerTime);
    ctx.font = `bold 58px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(10,8,10,0.8)';
    const bx = view.w / 2;
    const by = view.h * 0.4;
    ctx.strokeText(state.banner, bx, by);
    ctx.fillStyle = state.banner === 'BUSTED' ? '#7fb3ff' : '#e5534b';
    ctx.fillText(state.banner, bx, by);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }

  // A story panel: the chapter's title and its lines, over a dusk-dark card.
  if (state.story) {
    const lines = state.story.lines;
    ctx.font = `14.5px ${FONT}`;
    let widest = ctx.measureText(state.story.title).width;
    for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
    const pw = Math.min(view.w - 60, widest + 64);
    const ph = 66 + lines.length * 24 + 34;
    const px = (view.w - pw) / 2;
    const py = view.h * 0.3;
    ctx.fillStyle = 'rgba(18,11,9,0.88)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,217,138,0.6)';
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd98a';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(state.story.title, view.w / 2, py + 36);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `14.5px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, view.w / 2, py + 68 + i * 24);
    });
    ctx.fillStyle = 'rgba(255,201,60,0.85)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText('ENTER ▸', view.w / 2, py + ph - 14);
  }
}
