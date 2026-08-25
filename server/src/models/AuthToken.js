import mongoose from 'mongoose';

const authTokenSchema = new mongoose.Schema(
  {
    userRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },
    kind: {
      type: String,
      enum: {
        values: ['verify_email', 'reset_password'],
        message: '{VALUE} is not a valid auth token kind',
      },
      required: [true, 'Token kind is required'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    usedAt: {
      type: Date,
      default: null,
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

// TTL index: expired tokens self-delete (single-use, short-lived by design)
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthToken = mongoose.model('AuthToken', authTokenSchema);
export default AuthToken;
