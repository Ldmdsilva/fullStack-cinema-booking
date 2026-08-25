import mongoose from 'mongoose';

const revokedTokenSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: {
        values: ['jti', 'user'],
        message: '{VALUE} is not a valid revocation kind',
      },
      required: [true, 'Revocation kind is required'],
    },
    jti: {
      type: String,
      required: [
        function requiredWhenJti() {
          return this.kind === 'jti';
        },
        'jti is required when kind is "jti"',
      ],
    },
    userRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [
        function requiredWhenUser() {
          return this.kind === 'user';
        },
        'userRef is required when kind is "user"',
      ],
      index: true,
    },
    revokedBefore: {
      type: Date,
      required: [
        function requiredWhenUser() {
          return this.kind === 'user';
        },
        'revokedBefore is required when kind is "user"',
      ],
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

// Sparse unique index: most rows won't have jti (kind === 'user' rows omit it)
revokedTokenSchema.index({ jti: 1 }, { unique: true, sparse: true });

// TTL index: revocation record auto-expires once the JWT it targets would
// have expired anyway via the app's normal JWT TTL.
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);
export default RevokedToken;
