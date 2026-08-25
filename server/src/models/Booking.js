import mongoose from 'mongoose';

const bookedSeatSchema = new mongoose.Schema(
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
    price: {
      type: Number,
      required: true,
      min: [0, 'Seat price cannot be negative'],
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: [true, 'Booking reference is required'],
      unique: true,
      trim: true,
    },
    userRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    showtimeRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Showtime',
      required: [true, 'Showtime reference is required'],
    },
    holdRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hold',
      required: [true, 'Hold reference is required'],
      unique: true,
    },
    paymentIntentId: {
      type: String,
      required: [true, 'Payment intent id is required'],
      unique: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      required: [true, 'Payment status is required'],
    },
    // Denormalised from Showtime.screenName so a booking's ticket can show
    // its screen without populating Cinema.screens.
    screenName: {
      type: String,
    },
    seats: {
      type: [bookedSeatSchema],
      required: [true, 'At least one seat must be selected'],
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length > 0,
          message: 'Booking must include at least one seat',
        },
      ],
    },
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative'],
    },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled'],
      default: 'confirmed',
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

// Indexes (§C6.3)
bookingSchema.index({ userRef: 1, createdAt: -1 });
bookingSchema.index({ showtimeRef: 1 });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
