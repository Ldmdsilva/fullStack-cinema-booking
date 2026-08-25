import mongoose from 'mongoose';
import { MAX_SEATS_PER_SCREEN } from '../config/seatTiers.js';

// Seat-layout sub-schema, embedded twice-nested: Cinema -> screens[] -> seatLayout[].
// `section` (STANDARD/PREMIUM/RECLINER, §C6.2) is the key addition vs Venue's
// flat seatLayout — it lets Showtime creation apply seat-tier pricing later.
const seatLayoutSchema = new mongoose.Schema(
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
  },
  { _id: false }
);

const screenSchema = new mongoose.Schema(
  {
    screenId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    seatLayout: {
      type: [seatLayoutSchema],
      required: true,
      validate: [
        {
          validator: (arr) => arr && arr.length > 0 && arr.length <= MAX_SEATS_PER_SCREEN,
          message: `Screen seat layout must contain between 1 and ${MAX_SEATS_PER_SCREEN} seats (§C6.2, ADR-002 action 1)`,
        },
      ],
    },
    capacity: {
      type: Number,
      default: function () {
        return this.seatLayout ? this.seatLayout.length : 0;
      },
    },
  },
  { _id: false }
);

const cinemaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Cinema name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Cinema address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'Cinema city is required'],
      trim: true,
    },
    screens: {
      type: [screenSchema],
      required: [true, 'At least one screen is required'],
      validate: [
        {
          validator: (arr) => arr && arr.length > 0,
          message: 'A cinema must have at least one screen',
        },
        {
          validator: (arr) => new Set(arr.map((s) => s.screenId)).size === arr.length,
          message: 'Screen IDs must be unique within a cinema',
        },
      ],
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

// Keep each screen's capacity synchronized with its seatLayout length
cinemaSchema.pre('save', function () {
  if (this.screens) {
    for (const screen of this.screens) {
      if (screen.seatLayout) {
        screen.capacity = screen.seatLayout.length;
      }
    }
  }
});

const Cinema = mongoose.model('Cinema', cinemaSchema);
export default Cinema;
