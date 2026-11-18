// A small seeded random number generator (mulberry32) plus the handful of helpers the
// world builders use. The same seed always gives the same city, the same traffic and the
// same screenshot scene — that repeatability is what makes ?shot= staging trustworthy.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max], both ends included. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of `list`, chosen by the seeded generator. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** True with probability `p`. */
export function chance(rng, p) {
  return rng() < p;
}
