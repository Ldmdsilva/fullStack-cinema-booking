import '../config/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { normaliseLk } from '../utils/phone.js';
import { deriveSeatsFromScreen } from '../services/showtimeService.js';
import { MAX_SEATS_PER_SCREEN } from '../config/seatTiers.js';
import User from '../models/User.js';
import Film from '../models/Film.js';
import Cinema from '../models/Cinema.js';
import Showtime from '../models/Showtime.js';

// `node src/scripts/seed.js --fresh` (see `run()`) additionally drops legacy
// collections left over from the pre-migration concert domain. Without the
// flag this script only ever adds to the current cinema-domain collections
// (films/cinemas/showtimes/users) — it never touches the legacy ones.
const isFresh = process.argv.includes('--fresh');

// Collections that no code path in this codebase writes to any more (the
// `Venue`/`Event`/`WebhookEvent` models were removed by earlier phases of
// this migration). Dropped via the raw driver, not a Mongoose model, since
// the models themselves no longer exist. This is a dev-database cleanup
// convenience, NOT a data migration (§D4 — "no data-migration script"):
// a dev database may still have these collections lying around from before
// the migration, and `--fresh` gives a one-time way to clear them out.
const LEGACY_COLLECTIONS = ['events', 'venues', 'webhookevents'];

/**
 * Build a screen's `seatLayout` from a list of row-groups, each mapped to a
 * seat tier section (`standard`/`premium`/`recliner` — matches
 * `showtimeService`'s `SECTION_TO_TIER` lookup keys case-insensitively).
 * Seat `id` is `${row}${number}`, e.g. `A1`.
 * @param {Array<{section: string, rows: string[], seatsPerRow: number}>} groups
 * @returns {Array}
 */
function buildSeatLayout(groups) {
  const seatLayout = [];
  for (const group of groups) {
    for (const row of group.rows) {
      for (let number = 1; number <= group.seatsPerRow; number++) {
        seatLayout.push({ id: `${row}${number}`, section: group.section, row, number });
      }
    }
  }

  if (seatLayout.length === 0 || seatLayout.length > MAX_SEATS_PER_SCREEN) {
    throw new Error(
      `[seed] generated seat layout has ${seatLayout.length} seats, must be between 1 and ${MAX_SEATS_PER_SCREEN}`
    );
  }

  return seatLayout;
}

/**
 * Compute a showtime start time relative to "now" (never a hardcoded
 * calendar date — a hardcoded date silently becomes "always in the past"
 * once real time passes it, breaking `listShowtimes`'s default
 * "exclude past showtimes" filter). `daysFromNow` and the resulting
 * millisecond offset are both derived from `Date.now()`; `hour`/`minute`
 * just give the seeded showtime a believable time-of-day instead of
 * whatever moment the script happens to run at.
 * @param {number} daysFromNow
 * @param {number} hour - 0-23, local time
 * @param {number} [minute]
 * @returns {Date}
 */
function showtimeAt(daysFromNow, hour, minute = 0) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  date.setHours(hour, minute, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// Cinemas — 2 cinemas, 3 screens total (§D5). Seat counts per screen sit in
// the 112-180 range: comfortably realistic for a cinema screen, comfortably
// under `MAX_SEATS_PER_SCREEN` (300).
// ---------------------------------------------------------------------------

const CINEMAS = [
  {
    name: 'Liberty Cineplex',
    address: '10 Galle Road, Colombo 03',
    city: 'Colombo',
    screens: [
      {
        screenId: '1',
        name: 'Screen 1',
        seatLayout: buildSeatLayout([
          { section: 'standard', rows: ['A', 'B', 'C', 'D', 'E', 'F'], seatsPerRow: 16 },
          { section: 'premium', rows: ['G', 'H'], seatsPerRow: 16 },
          { section: 'recliner', rows: ['J'], seatsPerRow: 12 },
        ]), // 96 + 32 + 12 = 140 seats
      },
      {
        screenId: '2',
        name: 'Screen 2',
        seatLayout: buildSeatLayout([
          { section: 'standard', rows: ['A', 'B', 'C', 'D', 'E'], seatsPerRow: 14 },
          { section: 'premium', rows: ['F', 'G'], seatsPerRow: 14 },
          { section: 'recliner', rows: ['H'], seatsPerRow: 14 },
        ]), // 70 + 28 + 14 = 112 seats
      },
    ],
  },
  {
    name: 'Hilltop Cinema',
    address: '45 Peradeniya Road',
    city: 'Kandy',
    screens: [
      {
        screenId: '1',
        name: 'Screen 1',
        seatLayout: buildSeatLayout([
          { section: 'standard', rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], seatsPerRow: 14 },
          { section: 'premium', rows: ['H', 'I'], seatsPerRow: 14 },
          { section: 'recliner', rows: ['J', 'K'], seatsPerRow: 17 },
        ]), // 98 + 28 + 34 = 160 seats
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Films — 5 films (§D5).
// ---------------------------------------------------------------------------

const FILMS = [
  {
    title: 'The Last Ember',
    synopsis:
      'A wildfire lookout stationed in a remote highland reserve uncovers a decades-old conspiracy after a blaze reveals what was buried beneath the old ranger station.',
    certificate: '12A',
    runtimeMinutes: 128,
    genre: ['Drama', 'Adventure'],
    posterUrl: 'https://picsum.photos/seed/the-last-ember/600/900',
    releaseDateOffsetDays: -21,
  },
  {
    title: 'Midnight Circuit',
    synopsis:
      'A retired getaway driver is pulled back for one last job when a rival crew threatens the underground street-racing circuit that raised her.',
    certificate: '15',
    runtimeMinutes: 118,
    genre: ['Action', 'Thriller'],
    posterUrl: 'https://picsum.photos/seed/midnight-circuit/600/900',
    releaseDateOffsetDays: -7,
  },
  {
    title: 'Whiskers & Co.',
    synopsis:
      'A tiny detective agency run entirely by cats takes on the biggest case of their nine lives: a missing goldfish and the fishmonger who might be behind it.',
    certificate: 'U',
    runtimeMinutes: 95,
    genre: ['Animation', 'Family'],
    posterUrl: 'https://picsum.photos/seed/whiskers-and-co/600/900',
    releaseDateOffsetDays: 3,
  },
  {
    title: 'Silent Tide',
    synopsis:
      'When the tide stops going out on a small coastal village, a marine biologist and a sceptical local police officer race to understand what is rising from beneath the harbour.',
    certificate: '15',
    runtimeMinutes: 104,
    genre: ['Horror', 'Mystery'],
    posterUrl: 'https://picsum.photos/seed/silent-tide/600/900',
    releaseDateOffsetDays: 10,
  },
  {
    title: 'Comet Season',
    synopsis:
      'Two rival astronomers stationed at opposite ends of the same observatory fall for each other while racing to name the comet that only appears once a generation.',
    certificate: 'PG',
    runtimeMinutes: 112,
    genre: ['Sci-Fi', 'Romance'],
    posterUrl: 'https://picsum.photos/seed/comet-season/600/900',
    releaseDateOffsetDays: 30,
  },
];

// ---------------------------------------------------------------------------
// Showtimes — 12 showtimes spread across the 5 films, 2 cinemas, and all 3
// screens, over the next ~14 days (§D5). `daysFromNow`/`hour`/`minute` feed
// `showtimeAt()`, which always computes `startsAt` relative to `Date.now()`.
// `basePrice` is in minor LKR units (cents); actual seat prices are derived
// per-tier by `deriveSeatsFromScreen` via `tierPrice()`.
// ---------------------------------------------------------------------------

const SHOWTIME_PLAN = [
  { filmTitle: 'The Last Ember', cinemaName: 'Liberty Cineplex', screenId: '1', daysFromNow: 1, hour: 14, basePrice: 100000 },
  { filmTitle: 'The Last Ember', cinemaName: 'Liberty Cineplex', screenId: '1', daysFromNow: 4, hour: 19, minute: 30, basePrice: 110000 },
  { filmTitle: 'Midnight Circuit', cinemaName: 'Liberty Cineplex', screenId: '2', daysFromNow: 1, hour: 20, basePrice: 105000 },
  { filmTitle: 'Midnight Circuit', cinemaName: 'Liberty Cineplex', screenId: '2', daysFromNow: 6, hour: 21, minute: 15, basePrice: 105000 },
  { filmTitle: 'Midnight Circuit', cinemaName: 'Hilltop Cinema', screenId: '1', daysFromNow: 13, hour: 21, basePrice: 105000 },
  { filmTitle: 'Whiskers & Co.', cinemaName: 'Liberty Cineplex', screenId: '1', daysFromNow: 2, hour: 11, basePrice: 85000 },
  { filmTitle: 'Whiskers & Co.', cinemaName: 'Hilltop Cinema', screenId: '1', daysFromNow: 3, hour: 10, minute: 30, basePrice: 80000 },
  { filmTitle: 'Silent Tide', cinemaName: 'Hilltop Cinema', screenId: '1', daysFromNow: 5, hour: 20, minute: 30, basePrice: 95000 },
  { filmTitle: 'Silent Tide', cinemaName: 'Liberty Cineplex', screenId: '2', daysFromNow: 8, hour: 22, basePrice: 95000 },
  { filmTitle: 'Comet Season', cinemaName: 'Hilltop Cinema', screenId: '1', daysFromNow: 2, hour: 17, basePrice: 90000 },
  { filmTitle: 'Comet Season', cinemaName: 'Liberty Cineplex', screenId: '1', daysFromNow: 9, hour: 16, minute: 30, basePrice: 90000 },
  { filmTitle: 'Comet Season', cinemaName: 'Hilltop Cinema', screenId: '1', daysFromNow: 12, hour: 19, basePrice: 90000 },
];

// ---------------------------------------------------------------------------
// Users — 1 admin, 3 pre-verified customers, 1 deliberately unverified
// customer (§D5, FR-6). Phones are normalised to `94XXXXXXXXX` via
// `normaliseLk` to satisfy `User.js`'s phone validator.
// ---------------------------------------------------------------------------

const ADMIN_USER = {
  name: 'Encore Admin',
  email: 'admin@encore.live',
  password: 'Admin123!',
  phone: '0771234567',
  role: 'admin',
  emailVerified: true,
};

const CUSTOMER_USERS = [
  { name: 'Priya Nair', email: 'priya.nair@example.com', password: 'Password123!', phone: '0711234567', emailVerified: true },
  { name: 'Theo Blackwell', email: 'theo.blackwell@example.com', password: 'Password123!', phone: '0721234567', emailVerified: true },
  { name: 'Nadeesha Fernando', email: 'nadeesha.fernando@example.com', password: 'Password123!', phone: '0731234567', emailVerified: true },
];

// FR-6 fixture: a registered-but-never-verified customer, so the
// "must verify before booking" gate (booking/hold creation rejects an
// unverified account) has something to test against locally. Deliberately
// left unverified — do not "fix" this by flipping it to true.
const UNVERIFIED_USER = {
  name: 'Unverified Customer',
  email: 'unverified@example.com',
  password: 'Password123!',
  phone: '0741234567',
  emailVerified: false,
};

async function dropLegacyCollections() {
  for (const name of LEGACY_COLLECTIONS) {
    try {
      await mongoose.connection.db.collection(name).drop();
      console.log(`[seed] --fresh: dropped legacy collection: ${name}`);
    } catch (error) {
      // 26 = NamespaceNotFound, i.e. the collection doesn't exist. Expected
      // on any database that never had the legacy concert-domain data (or
      // has already been cleaned up) — safe to ignore. Anything else is a
      // real failure and should stop the script.
      if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
        console.log(`[seed] --fresh: legacy collection already absent, skipping: ${name}`);
      } else {
        throw error;
      }
    }
  }
}

async function seedUsers() {
  for (const candidate of [ADMIN_USER, ...CUSTOMER_USERS, UNVERIFIED_USER]) {
    const existing = await User.findOne({ email: candidate.email });
    if (existing) {
      console.log(`[seed] user already exists, skipping: ${candidate.email}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(candidate.password, 10);
    await User.create({
      name: candidate.name,
      email: candidate.email,
      passwordHash,
      phone: normaliseLk(candidate.phone),
      role: candidate.role || 'customer',
      emailVerified: candidate.emailVerified,
    });
    console.log(`[seed] created user: ${candidate.email} (emailVerified=${candidate.emailVerified})`);
  }
}

async function seedCinemas() {
  const cinemaByName = new Map();

  for (const candidate of CINEMAS) {
    let cinema = await Cinema.findOne({ name: candidate.name });
    if (!cinema) {
      cinema = await Cinema.create({
        name: candidate.name,
        address: candidate.address,
        city: candidate.city,
        screens: candidate.screens,
      });
      console.log(`[seed] created cinema: ${candidate.name} (${cinema.screens.length} screen(s))`);
    } else {
      console.log(`[seed] cinema already exists, skipping: ${candidate.name}`);
    }
    cinemaByName.set(candidate.name, cinema);
  }

  return cinemaByName;
}

async function seedFilms() {
  const filmByTitle = new Map();

  for (const candidate of FILMS) {
    let film = await Film.findOne({ title: candidate.title });
    if (!film) {
      film = await Film.create({
        title: candidate.title,
        synopsis: candidate.synopsis,
        certificate: candidate.certificate,
        runtimeMinutes: candidate.runtimeMinutes,
        genre: candidate.genre,
        posterUrl: candidate.posterUrl,
        releaseDate: new Date(Date.now() + candidate.releaseDateOffsetDays * 24 * 60 * 60 * 1000),
      });
      console.log(`[seed] created film: ${candidate.title}`);
    } else {
      console.log(`[seed] film already exists, skipping: ${candidate.title}`);
    }
    filmByTitle.set(candidate.title, film);
  }

  return filmByTitle;
}

async function seedShowtimes(filmByTitle, cinemaByName) {
  // Showtimes have no natural, time-independent unique key (unlike
  // films/cinemas/users, which dedupe on title/name/email) — every
  // `startsAt` here is deliberately computed relative to `Date.now()`, so
  // the same logical showtime resolves to a different absolute date on
  // every run. Re-running this script hours or days apart, per-row
  // dedup-by-startsAt would either never match (creating dozens of
  // duplicates over time) or require inventing a synthetic key that has no
  // home in the Showtime schema. Instead, treat the whole collection as
  // seeded-or-not: if any showtime already exists, assume this script has
  // already run against this database and skip seeding more.
  const existingCount = await Showtime.countDocuments();
  if (existingCount > 0) {
    console.log(`[seed] showtimes already exist (${existingCount}), skipping showtime seeding`);
    return;
  }

  for (const plan of SHOWTIME_PLAN) {
    const film = filmByTitle.get(plan.filmTitle);
    const cinema = cinemaByName.get(plan.cinemaName);
    const screen = cinema.screens.find((s) => s.screenId === plan.screenId);

    const startsAt = showtimeAt(plan.daysFromNow, plan.hour, plan.minute || 0);
    const seats = deriveSeatsFromScreen(screen, plan.basePrice);

    await Showtime.create({
      filmRef: film._id,
      cinemaRef: cinema._id,
      screenId: screen.screenId,
      screenName: screen.name,
      startsAt,
      basePrice: plan.basePrice,
      seats,
      status: 'scheduled',
    });
    console.log(
      `[seed] created showtime: ${plan.filmTitle} @ ${plan.cinemaName}/${screen.name} on ${startsAt.toISOString()}`
    );
  }
}

async function run() {
  await connectDB(env.MONGODB_URI);

  if (isFresh) {
    await dropLegacyCollections();
  }

  await seedUsers();
  const cinemaByName = await seedCinemas();
  const filmByTitle = await seedFilms();
  await seedShowtimes(filmByTitle, cinemaByName);

  await disconnectDB();
  console.log('[seed] Done.');
}

run().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
