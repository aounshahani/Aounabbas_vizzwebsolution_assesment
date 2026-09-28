import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import Bid from '@/models/Bid';
import { verifyAuth } from '@/lib/authGuard';
import { placeBid } from '@/lib/placeBid';
import { processAutoBids } from '@/lib/autoBid';
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

    const bids = await Bid.find({ auction: auctionId })
      .populate('bidder', 'name')
      .sort({ createdAt: -1 });

    return successResponse(bids);
  } catch (error) {
    return handleValidationError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> }
) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    await dbConnect();
    const { auctionId } = await params;
    const { amount } = await request.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return errorResponse('Valid bid amount is required', 400);
    }

    const result = await placeBid({
      auctionId,
      userId: user._id,
      amount,
    });

    if (!result.ok) {
      return errorResponse(result.error, result.status);
    }

    // Let auto-bids from other users respond. A failure here must never
    // fail the manual bid that was already recorded.
    try {
      await processAutoBids(auctionId);
    } catch (autoBidError) {
      console.error('Auto-bid processing failed:', autoBidError);
    }

    return successResponse(result.bid, 201);
  } catch (error) {
    return handleValidationError(error);
  }
}