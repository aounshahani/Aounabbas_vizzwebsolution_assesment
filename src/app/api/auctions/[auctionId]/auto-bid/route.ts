import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import Auction from '@/models/Auction';
import AutoBid from '@/models/AutoBid';
import { verifyAuth } from '@/lib/authGuard';
import {
  successResponse,
  errorResponse,
  handleValidationError,
} from '@/lib/apiResponse';

type RouteContext = { params: Promise<{ auctionId: string }> };

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET: current user's auto-bid on this auction (active or exhausted), else null
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    await dbConnect();
    const { auctionId } = await params;

    const autoBid = await AutoBid.findOne({
      auction: auctionId,
      user: user._id,
      status: { $in: ['active', 'exhausted'] },
    });

    return successResponse(autoBid);
  } catch (error) {
    return handleValidationError(error);
  }
}

// POST: create or replace the current user's auto-bid on this auction
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    await dbConnect();
    const { auctionId } = await params;
    const { maxAmount, incrementType, incrementValue, maxBidCount } =
      await request.json();

    if (
      typeof maxAmount !== 'number' ||
      !Number.isFinite(maxAmount) ||
      maxAmount <= 0
    ) {
      return errorResponse('Valid max amount is required', 400);
    }
    if (incrementType !== 'fixed' && incrementType !== 'percentage') {
      return errorResponse('Increment type must be "fixed" or "percentage"', 400);
    }
    if (
      typeof incrementValue !== 'number' ||
      !Number.isFinite(incrementValue) ||
      incrementValue <= 0
    ) {
      return errorResponse('Increment value must be greater than 0', 400);
    }
    if (incrementType === 'percentage' && incrementValue > 100) {
      return errorResponse('Percentage increment cannot exceed 100', 400);
    }
    if (
      maxBidCount !== undefined &&
      maxBidCount !== null &&
      (!Number.isInteger(maxBidCount) || maxBidCount < 1)
    ) {
      return errorResponse('Max bid count must be a whole number of at least 1', 400);
    }

    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return errorResponse('Auction not found', 404);
    }

    if (auction.status !== 'active' || auction.endTime <= new Date()) {
      return errorResponse('Auction is not active', 400);
    }

    if (auction.seller.toString() === user._id.toString()) {
      return errorResponse('You cannot set an auto-bid on your own auction', 400);
    }

    const cap = round2(maxAmount);
    if (cap <= auction.currentBid) {
      return errorResponse(
        `Max amount must be higher than current bid of $${auction.currentBid.toFixed(2)}`,
        400
      );
    }

    // Upsert on the unique (auction, user) index: one auto-bid per user per
    // auction, and a new one replaces the previous (counters reset).
    const autoBid = await AutoBid.findOneAndUpdate(
      { auction: auctionId, user: user._id },
      {
        $set: {
          maxAmount: cap,
          incrementType,
          incrementValue,
          maxBidCount: maxBidCount ?? null,
          bidsPlaced: 0,
          status: 'active',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    return successResponse(autoBid, 201);
  } catch (error) {
    return handleValidationError(error);
  }
}

// DELETE: cancel the current user's active auto-bid on this auction
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    await dbConnect();
    const { auctionId } = await params;

    const autoBid = await AutoBid.findOneAndUpdate(
      { auction: auctionId, user: user._id, status: 'active' },
      { status: 'cancelled' },
      { new: true }
    );

    if (!autoBid) {
      return errorResponse('No active auto-bid found', 404);
    }

    return successResponse(autoBid);
  } catch (error) {
    return handleValidationError(error);
  }
}