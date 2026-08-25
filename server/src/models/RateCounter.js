import mongoose from 'mongoose';

const rateCounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Key is required'],
      unique: true,
      index: true,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// TTL index: fixed windows self-clean once expired
rateCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateCounter = mongoose.model('RateCounter', rateCounterSchema);
export default RateCounter;
