import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import Auction from '@/models/Auction';
import { deactivateAutoBids } from '@/lib/autoBid';
import {
  successResponse,
  errorResponse,
  handleValidationError,
} from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  try {
    await dbConnect();
    const { auctionId } = await params;

    const auction = await Auction.findById(auctionId)
      .populate('product', 'title description imageUrl startingPrice')
      .populate('seller', 'name email')
      .populate('currentBidder', 'name')
      .populate('winner', 'name email');

    if (!auction) {
      return errorResponse('Auction not found', 404);
    }

    // On-demand status check
    const now = new Date();
    let updated = false;

    if (auction.status === 'pending' && auction.startTime <= now) {
      auction.status = 'active';
      updated = true;
    }

    if (auction.status === 'active' && auction.endTime <= now) {
      auction.status = 'ended';
      auction.winner = auction.currentBidder;
      updated = true;
    }

    if (updated) {
      await auction.save();
      if (auction.status === 'ended') {
        await deactivateAutoBids(auctionId);
      }
    }

    return successResponse(auction);
  } catch (error) {
    return handleValidationError(error);
  }
}
