import mongoose from 'mongoose';

const filmSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Film title is required'],
    trim: true,
  },
  synopsis: {
    type: String,
    required: [true, 'Synopsis is required'],
    trim: true,
  },
  certificate: {
    type: String,
    enum: ['U', 'PG', '12A', '15', '18'],
    required: [true, 'Certificate is required'],
  },
  runtimeMinutes: {
    type: Number,
    required: [true, 'Runtime is required'],
    min: [1, 'Runtime must be at least 1 minute'],
  },
  genre: {
    type: [String],
    required: true,
    validate: {
      validator: (value) => Array.isArray(value) && value.length > 0,
      message: 'At least one genre is required',
    },
  },
  posterUrl: {
    type: String,
    trim: true,
  },
  releaseDate: {
    type: Date,
    required: [true, 'Release date is required'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
},
{
  toJSON: {
    transform: (_, ret) => {
      delete ret.__v;
      return ret;
    },
  },
});

// Indexes (§C6.3)
filmSchema.index({ title: 'text', synopsis: 'text' });
filmSchema.index({ genre: 1 });

const Film = mongoose.model('Film', filmSchema);
export default Film;
