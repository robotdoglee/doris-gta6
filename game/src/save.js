// The save: one small JSON record in localStorage — the player's money, where he was
// standing, and how long he has played, in all. Loading never throws: a missing or
// damaged save just means a fresh start, which the title screen mentions.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: Number.isFinite(data.money) ? Math.max(0, Math.floor(data.money)) : 0,
      x: Number.isFinite(data.x) ? data.x : null,
      y: Number.isFinite(data.y) ? data.y : null,
      playSeconds: Number.isFinite(data.playSeconds) ? data.playSeconds : 0,
    };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be off (private windows): the visit simply is not remembered.
  }
}
