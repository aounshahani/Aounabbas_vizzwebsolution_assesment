import Auction from '@/models/Auction';
import AutoBid, { IAutoBid } from '@/models/AutoBid';
import { placeBid } from '@/lib/placeBid';

/** Safety limit so competing auto-bids can never loop forever. */
export const MAX_AUTO_BID_ROUNDS = 50;

const MIN_INCREMENT = 0.01;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Counter-bid for an auto-bid against the opposing (current) bid.
 * - fixed:      opposing + value
 * - percentage: opposing + value% of opposing
 * Always at least one cent above the opposing bid, and never above maxAmount
 * (if the calculated amount exceeds the cap, bid exactly the cap).
 */
export function calculateCounterBid(
  autoBid: Pick<IAutoBid, 'incrementType' | 'incrementValue' | 'maxAmount'>,
  opposingBid: number
): number {
  const raw =
    autoBid.incrementType === 'fixed'
      ? opposingBid + autoBid.incrementValue
      : opposingBid * (1 + autoBid.incrementValue / 100);

  const stepped = Math.max(round2(raw), round2(opposingBid + MIN_INCREMENT));
  return Math.min(stepped, autoBid.maxAmount);
}

async function markExhausted(autoBidId: IAutoBid['_id']) {
  await AutoBid.updateOne(
    { _id: autoBidId, status: 'active' },
    { status: 'exhausted' }
  );
}

/** Deactivate every active auto-bid on an auction (used when it ends). */
export async function deactivateAutoBids(auctionId: string) {
  await AutoBid.updateMany(
    { auction: auctionId, status: 'active' },
    { status: 'cancelled' }
  );
}

/**
 * Run after any successful bid. Lets qualifying auto-bids respond, and keeps
 * going while competing auto-bids outbid each other (bidding war) until one
 * side is exhausted or MAX_AUTO_BID_ROUNDS is hit.
 *
 * Each round re-reads the auction, so it always works from fresh state.
 * Bids go through placeBid(), which uses the same atomic conditional update
 * as manual bids: if two processors race, one gets a 409 and simply
 * re-evaluates on the next round (by which point the leader is the winner's
 * user, who is excluded, so no duplicate response is placed).
 *
 * @returns number of auto-bids placed
 */
export async function processAutoBids(auctionId: string): Promise<number> {
  let placedCount = 0;

  for (let round = 0; round < MAX_AUTO_BID_ROUNDS; round++) {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== 'active' || auction.endTime <= new Date()) {
      break;
    }

    // Only auto-bids from users who are NOT currently leading.
    // This is what prevents an auto-bid from reacting to its own bid.
    const filter: Record<string, unknown> = {
      auction: auction._id,
      status: 'active',
    };
    if (auction.currentBidder) {
      filter.user = { $ne: auction.currentBidder };
    }

    // Highest cap gets priority (earliest created wins ties)
    const candidates = await AutoBid.find(filter).sort({
      maxAmount: -1,
      createdAt: 1,
    });

    let progressed = false;
    let abort = false;

    for (const candidate of candidates) {
      // Bid count used up
      if (
        candidate.maxBidCount != null &&
        candidate.bidsPlaced >= candidate.maxBidCount
      ) {
        await markExhausted(candidate._id);
        continue;
      }

      // Cap can no longer beat the current bid
      if (candidate.maxAmount <= auction.currentBid) {
        await markExhausted(candidate._id);
        continue;
      }

      const amount = calculateCounterBid(candidate, auction.currentBid);
      if (amount <= auction.currentBid) {
        await markExhausted(candidate._id);
        continue;
      }

      const updated = await AutoBid.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'active',
          ...(candidate.maxBidCount != null
            ? { bidsPlaced: { $lt: candidate.maxBidCount } }
            : {}),
        },
        { $inc: { bidsPlaced: 1 } },
        { new: true }
      );
      if (!updated) continue;

      const result = await placeBid({
        auctionId,
        userId: candidate.user,
        amount,
        isAutoBid: true,
      });

      if (!result.ok) {
        await AutoBid.updateOne(
          { _id: candidate._id, bidsPlaced: { $gt: 0 } },
          { $inc: { bidsPlaced: -1 } }
        );
        if (result.status === 409) {
          // Lost a race: state changed under us, re-evaluate next round
          progressed = true;
        } else {
          abort = true;
        }
        break;
      }

      placedCount++;
      progressed = true;

      if (
        (amount >= updated.maxAmount ||
          (updated.maxBidCount != null &&
            updated.bidsPlaced >= updated.maxBidCount))
      ) {
        await markExhausted(updated._id);
      }

      // The leader changed: go back to the top and let the others respond
      break;
    }

    if (abort || !progressed) break;
  }

  return placedCount;
}
