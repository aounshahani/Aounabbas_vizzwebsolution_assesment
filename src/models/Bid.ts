import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IBid extends Document {
  _id: Types.ObjectId;
  auction: Types.ObjectId;
  bidder: Types.ObjectId;
  amount: number;
  isAutoBid: boolean;
  createdAt: Date;
}

const BidSchema = new Schema<IBid>(
  {
    auction: {
      type: Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    bidder: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Bid amount is required'],
      min: [0.01, 'Bid amount must be positive'],
    },
    isAutoBid: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

BidSchema.index({ auction: 1, createdAt: -1 });

const Bid: Model<IBid> =
  mongoose.models.Bid || mongoose.model<IBid>('Bid', BidSchema);

export default Bid;
