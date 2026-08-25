import mongoose from 'mongoose';

// Frozen copy of each held seat's identifying/pricing facts as of the
// moment the hold was created (§C6.2), so a later showtime edit (e.g. a
// basePrice or tier-multiplier change) can never retroactively change what
// an in-flight hold is worth. Mirrors the field set the SRS documents for
// `seatSnapshot` — note this is deliberately narrower than `Booking.js`'s
// `bookedSeatSchema` (no `row`/`number`): the snapshot only needs to freeze
// the facts that affect price/identity, not seating-chart display fields.
const holdSeatSnapshotSchema = new mongoose.Schema(
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
    price: {
      type: Number,
      required: true,
      min: [0, 'Seat price cannot be negative'],
    },
  },
  { _id: false }
);

const holdSchema = new mongoose.Schema(
  {
    userRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    showtimeRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
      required: [true, 'Showtime reference is required'],
      index: true,
    },
    seatIds: {
      type: [String],
      required: [true, 'Seat ids are required'],
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length > 0,
          message: 'A hold must include at least one seat',
        },
      ],
    },
    seatSnapshot: {
      type: [holdSeatSnapshotSchema],
      required: [true, 'Seat snapshot is required'],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative'],
    },
    amountMinor: {
      type: Number,
      required: [true, 'Amount in minor units is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
    },
    // Sparse because most holds are abandoned before payment and never get a
    // PaymentIntent; unique so two holds can never share one (D12).
    paymentIntentId: {
      type: String,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['active', 'released', 'consumed'],
      default: 'active',
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry is required'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
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

// Deliberately NO TTL index on `expiresAt` (§C6.2). Unlike `AuthToken`/
// `RevokedToken`/`RateCounter` (which DO carry TTL indexes because they are
// pure bookkeeping with no audit value once expired), a Hold that expired
// but was actually paid is exactly the record a later phase's
// payment-reconciliation job needs to find and complete — auto-deleting it
// via TTL would destroy that evidence before reconciliation ever runs.
// Expiry is enforced entirely by application logic (every read treats
// `status === 'active' && expiresAt < now` as expired) and a background
// sweeper (a later phase) explicitly transitions `active -> released`
// instead of relying on TTL deletion.
holdSchema.index({ userRef: 1, status: 1 });
holdSchema.index({ showtimeRef: 1, status: 1, expiresAt: 1 });

const Hold = mongoose.model('Hold', holdSchema);
export default Hold;
