// Solmaris — every tuning number and colour in one place.
// The world is a tile grid (TILE pixels a side) and the camera shows a VIEW_W x VIEW_H
// window of it; no rule below depends on the actual screen size.

export const TILE = 48;
export const COLS = 64;
export const ROWS = 48;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

/** Logical view size the renderer fits to the window. */
export const VIEW_W = 1280;
export const VIEW_H = 720;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  walkSpeed: 152,
  runSpeed: 238,
  radius: 11,
  startHealth: 100,
  startArmor: 0,
};

export const TRAFFIC = {
  /** How many AI cars the world keeps circulating. */
  count: 14,
  laneOffset: 24,
  cruiseMin: 120,
  cruiseMax: 215,
  accel: 150,
  brake: 320,
  /** Gap (px) to the car ahead at which a driver starts to brake. */
  followGap: 86,
};

export const PEDS = { count: 22, walkMin: 34, walkMax: 62, runSpeed: 150, radius: 9 };

/** Day length in seconds of play; the light slides from afternoon gold toward dusk. */
export const DAY_SECONDS = 420;
export const DAY_START = 0.34;

/** Warm, sun-soaked palette. */
export const PALETTE = {
  asphalt: '#55565e',
  asphaltDark: '#4b4c54',
  lot: '#5f5e63',
  sidewalk: '#d8bf98',
  sidewalkEdge: '#c3a87e',
  grass: '#71ac4f',
  grassDark: '#5d9240',
  sand: '#eed9a0',
  water: '#2f8aa8',
  waterDeep: '#256f88',
  waterFoam: '#bfe8ef',
  bridge: '#9b7b57',
  bridgeRail: '#6f5638',
  crosswalk: '#e8e2d2',
  laneLine: '#f5d76e',
  buildingShadow: 'rgba(46,26,18,0.35)',
  duskTint: '#33204d',
  sunsetTint: '#ff9a3c',
  text: '#fff7e8',
  panel: 'rgba(24,16,12,0.55)',
};

export const POLICE = {
  /** Heat points per star; the wanted level is ceil(heat / heatPerStar), capped at maxStars. */
  heatPerStar: 100,
  maxStars: 5,
  /** How many patrol cars the city fields at once, however hot it gets. */
  maxUnits: 5,
  /** Seconds a unit must stay unseen before the trail starts to cool. */
  searchBase: 5,
  /** Heat points drained per second once the trail is cold. */
  drainRate: 16,
  /** How far a unit can see Marlo (with line of sight), and how far a bystander witnesses from. */
  sightRange: 540,
  witnessRange: 250,
  /** Seconds between reinforcements arriving at the edge of the action. */
  spawnInterval: 2.2,
  /** Arrest: how close a unit must pin Marlo, and for how long, on foot and in a car. */
  bustRadius: 58,
  bustFootTime: 1.1,
  bustCarTime: 2.0,
};

export const COMBAT = {
  meleeRange: 36,
  meleeCooldown: 0.42,
  fireCooldown: 0.34,
  pistolRange: 430,
  startAmmo: 24,
  maxAmmo: 60,
};

export const PLACES = {
  /** Repair: dollars per point of car damage, and how close the car must be. */
  repairCostPerPoint: 2,
  repairRadius: 54,
  /** The supply shop: armour and ammunition, priced for a courier's wages. */
  shopRadius: 42,
  armourCost: 120,
  armourAmount: 50,
  ammoCost: 40,
  ammoAmount: 12,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmaris.save.v1';

export const GAME_TITLE = 'SOLMARIS';
export const GAME_TAGLINE = 'A sun-soaked little crime story in Puerto Solmaris';
