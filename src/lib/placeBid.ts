import { Types } from 'mongoose';
import Auction from '@/models/Auction';
import AutoBid from '@/models/AutoBid';
import Bid, { IBid } from '@/models/Bid';

export interface PlaceBidParams {
  auctionId: string;
  userId: string | Types.ObjectId;
  amount: number;
  isAutoBid?: boolean;
}

export type PlaceBidResult =
  | { ok: true; bid: IBid; currentBid: number }
  | { ok: false; status: number; error: string };

function fail(status: number, error: string): PlaceBidResult {
  return { ok: false, status, error };
}

/**
 * Single code path for placing a bid (manual or automatic).
 * Validation, the atomic conditional update, bid creation and the
 * Socket.io emit all live here so both flows behave identically.
 */
export async function placeBid({
  auctionId,
  userId,
  amount,
  isAutoBid = false,
}: PlaceBidParams): Promise<PlaceBidResult> {
  const auction = await Auction.findById(auctionId);
  if (!auction) {
    return fail(404, 'Auction not found');
  }

  // On-demand status update
  const now = new Date();
  if (auction.status === 'pending' && auction.startTime <= now) {
    auction.status = 'active';
    await auction.save();
  }
  if (auction.status === 'active' && auction.endTime <= now) {
    auction.status = 'ended';
    auction.winner = auction.currentBidder;
    await auction.save();
    // Auction is over: deactivate every auto-bid on it
    await AutoBid.updateMany(
      { auction: auction._id, status: 'active' },
      { status: 'cancelled' }
    );
    return fail(400, 'Auction has ended');
  }

  if (auction.status !== 'active') {
    return fail(400, `Auction is ${auction.status}, not accepting bids`);
  }

  // Seller cannot bid on own auction
  if (auction.seller.toString() === userId.toString()) {
    return fail(400, 'You cannot bid on your own auction');
  }

  // Bid must be higher than current highest
  if (amount <= auction.currentBid) {
    return fail(
      400,
      `Bid must be higher than current bid of $${auction.currentBid.toFixed(2)}`
    );
  }

  // Atomic update to prevent race conditions
  const updated = await Auction.findOneAndUpdate(
    {
      _id: auctionId,
      status: 'active',
      endTime: { $gt: now },
      currentBid: { $lt: amount },
    },
    {
      currentBid: amount,
      currentBidder: userId,
    },
    { new: true }
  );

  if (!updated) {
    return fail(
      409,
      'Bid was outbid by another user. Try again with a higher amount.'
    );
  }

  const bid = await Bid.create({
    auction: auctionId,
    bidder: userId,
    amount,
    isAutoBid,
  });

  // Socket.io emit (same event for manual and auto bids)
  const io = (globalThis as any).io;
  if (io) {
    const populatedBid = await bid.populate('bidder', 'name');
    io.to(`auction:${auctionId}`).emit('bid:placed', {
      auctionId,
      bid: {
        _id: bid._id.toString(),
        amount: bid.amount,
        bidder: populatedBid.bidder,
        createdAt: bid.createdAt.toISOString(),
        isAutoBid: bid.isAutoBid,
      },
      currentBid: updated.currentBid,
    });
  }

  return { ok: true, bid, currentBid: updated.currentBid };
}
