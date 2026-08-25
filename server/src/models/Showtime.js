import mongoose from 'mongoose';
import { SEAT_TIERS } from '../config/seatTiers.js';

/**
 * Per-seat sub-document, one entry per physical seat in the screen,
 * generated at showtime-creation time from the cinema screen's
 * `seatLayout` (§C6.2). `tier` and `price` are derived and frozen at
 * creation — see `showtimeService.createShowtime`'s tier-assignment rule.
 */
const showtimeSeatSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    row: {
      type: String,
      required: true,
      trim: true,
    },
    number: {
      type: Number,
      required: true,
    },
    tier: {
      type: String,
      enum: SEAT_TIERS,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Seat price cannot be negative'],
    },
    status: {
      type: String,
      enum: ['available', 'held', 'booked'],
      default: 'available',
    },
    // Set by a later phase's hold-creation logic (Hold model, §C6.2). Present
    // now so that phase needs no migration. Never read directly — always via
    // `showtimeSerializer.effectiveSeatStatus` (ADR-012 action 4 / FR-31).
    holdExpiresAt: {
      type: Date,
    },
    // Ditto — the `Hold` model doesn't exist yet. Referencing by the string
    // 'Hold' is safe in Mongoose ahead of that model being registered, as
    // long as `.populate('holdRef')` isn't called before it exists.
    holdRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hold',
    },
  },
  { _id: false }
);

const showtimeSchema = new mongoose.Schema(
  {
    filmRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Film',
      required: true,
    },
    cinemaRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cinema',
      required: true,
    },
    screenId: {
      type: String,
      required: true,
      trim: true,
    },
    // Denormalised copy of the screen's display name at creation time —
    // avoids populating full Cinema docs (with up to 300-seat layouts per
    // screen) just to show which screen a listing is in (§C6.2).
    screenName: {
      type: String,
      required: true,
      trim: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    // Un-tiered STANDARD-tier base price in minor units; a seat's actual
    // price = tierPrice(basePrice, seat.tier), frozen at creation.
    basePrice: {
      type: Number,
      required: true,
      min: [0, 'Base price cannot be negative'],
    },
    seats: {
      type: [showtimeSeatSchema],
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled'],
      default: 'scheduled',
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform: (_, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes (§C6.3)
showtimeSchema.index({ startsAt: 1, status: 1 });
showtimeSchema.index({ filmRef: 1, startsAt: 1 });
showtimeSchema.index({ cinemaRef: 1, startsAt: 1 });

// `{"seats.holdExpiresAt": 1}` is deliberately NOT indexed (§C6.3 "dropped").
// Hold is its own collection (D6); the future hold-sweeper queries `holds`
// directly (`{status:'active', expiresAt:{$lt: now}}`) rather than scanning
// every showtime's embedded seat array, so a multikey index here would tax
// every hold-related write for a reader that doesn't exist.

const Showtime = mongoose.model('Showtime', showtimeSchema);
export default Showtime;
