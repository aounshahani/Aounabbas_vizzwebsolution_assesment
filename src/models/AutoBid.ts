import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type AutoBidStatus = 'active' | 'exhausted' | 'cancelled';
export type IncrementType = 'fixed' | 'percentage';

export interface IAutoBid extends Document {
  _id: Types.ObjectId;
  auction: Types.ObjectId;
  user: Types.ObjectId;
  maxAmount: number;
  incrementType: IncrementType;
  incrementValue: number;
  maxBidCount: number | null;
  bidsPlaced: number;
  status: AutoBidStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AutoBidSchema = new Schema<IAutoBid>(
  {
    auction: {
      type: Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    maxAmount: {
      type: Number,
      required: [true, 'Max amount is required'],
      min: [0.01, 'Max amount must be positive'],
    },
    incrementType: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: true,
    },
    incrementValue: {
      type: Number,
      required: true,
      min: [0.01, 'Increment value must be positive'],
    },
    maxBidCount: {
      type: Number,
      default: null,
      min: 1,
    },
    bidsPlaced: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'exhausted', 'cancelled'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// One auto-bid per user per auction. Setting a new one replaces (upserts) it.
AutoBidSchema.index({ auction: 1, user: 1 }, { unique: true });
// Fast lookup of active auto-bids when processing a bid
AutoBidSchema.index({ auction: 1, status: 1, maxAmount: -1 });

const AutoBid: Model<IAutoBid> =
  mongoose.models.AutoBid ||
  mongoose.model<IAutoBid>('AutoBid', AutoBidSchema);

export default AutoBid;
