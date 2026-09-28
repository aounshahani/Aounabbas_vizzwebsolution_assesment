'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import CountdownTimer from '@/components/CountdownTimer';
import BidForm from '@/components/BidForm';
import BidHistory from '@/components/BidHistory';
import AutoBidPanel from '@/components/AutoBidPanel';
import { useAuth } from '@/hooks/useAuth';
import { useAuction } from '@/hooks/useAuction';

interface AuctionDetail {
  _id: string;
  product: {
    _id: string;
    title: string;
    description: string;
    imageUrl: string;
    startingPrice: number;
  };
  seller: { _id: string; name: string; email: string };
  startTime: string;
  endTime: string;
  status: 'pending' | 'active' | 'ended';
  currentBid: number;
  currentBidder: { _id: string; name: string } | null;
  winner: { _id: string; name: string; email: string } | null;
}

interface BidItem {
  _id: string;
  amount: number;
  bidder: { _id: string; name: string };
  createdAt: string;
  isAutoBid?: boolean;
}

export default function AuctionRoomPage() {
  const params = useParams();
  const auctionId = params.auctionId as string;
  const { user } = useAuth();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuction = useCallback(async () => {
    const [auctionRes, bidsRes] = await Promise.all([
      fetch(`/api/auctions/${auctionId}`),
      fetch(`/api/auctions/${auctionId}/bids`),
    ]);
    const auctionData = await auctionRes.json();
    const bidsData = await bidsRes.json();

    if (auctionData.success) setAuction(auctionData.data);
    if (bidsData.success) setBids(bidsData.data);
    setLoading(false);
  }, [auctionId]);

  useEffect(() => {
    fetchAuction();
  }, [fetchAuction]);

  // Use real-time auction hook
  const initialState = useMemo(
    () => ({
      currentBid: auction?.currentBid ?? 0,
      status: auction?.status ?? ('pending' as const),
      winner: auction?.winner ?? null,
      recentBids: bids,
    }),
    [auction?.currentBid, auction?.status, auction?.winner, bids]
  );

  const liveState = useAuction(auctionId, initialState);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse bg-white rounded-lg shadow h-96" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Auction not found.</p>
      </div>
    );
  }

  // Use live state from socket, fallback to fetched data
  const currentBid = liveState.currentBid || auction.currentBid;
  const currentStatus = liveState.status || auction.status;
  const currentWinner = liveState.winner || auction.winner;
  const displayBids = liveState.recentBids.length > 0 ? liveState.recentBids : bids;

  const isSeller = user?._id === auction.seller._id;
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    active: 'bg-green-100 text-green-700 border-green-300',
    ended: 'bg-gray-100 text-gray-700 border-gray-300',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="md:flex">
          <div className="md:w-1/2">
            <img
              src={auction.product.imageUrl}
              alt={auction.product.title}
              className="w-full h-64 md:h-full object-cover"
            />
          </div>

          <div className="p-6 md:w-1/2">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs px-2 py-1 rounded font-medium border ${
                  statusColors[currentStatus]
                }`}
              >
                {currentStatus === 'active'
                  ? 'LIVE'
                  : currentStatus.toUpperCase()}
              </span>
              {currentStatus === 'active' && (
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>

            <h1 className="text-2xl font-bold mb-1">{auction.product.title}</h1>
            <p className="text-gray-500 text-sm mb-4">
              Sold by {auction.seller.name}
            </p>
            <p className="text-gray-700 mb-4">{auction.product.description}</p>

            <div className="bg-gray-50 p-4 rounded mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500">Current Bid</span>
                <span className="text-3xl font-bold text-amber-600">
                  ${currentBid.toFixed(2)}
                </span>
              </div>
              {auction.currentBidder && (
                <p className="text-sm text-gray-500">
                  Leading: {auction.currentBidder.name}
                </p>
              )}
              <div className="text-sm text-gray-400 mt-1">
                Starting price: ${auction.product.startingPrice.toFixed(2)}
              </div>
            </div>

            {currentStatus === 'pending' && (
              <CountdownTimer
                targetDate={auction.startTime}
                label="Starts in"
              />
            )}
            {currentStatus === 'active' && (
              <CountdownTimer
                targetDate={auction.endTime}
                label="Ends in"
              />
            )}
            {currentStatus === 'ended' && (
              <div className="bg-blue-50 p-4 rounded mb-4">
                <p className="font-semibold text-blue-800">Auction Ended</p>
                {currentWinner ? (
                  <p className="text-blue-600">
                    Winner: {currentWinner.name} with $
                    {currentBid.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-blue-600">No bids were placed.</p>
                )}
              </div>
            )}

            <div className="mt-4">
              <BidForm
                auctionId={auction._id}
                currentBid={currentBid}
                isActive={currentStatus === 'active'}
                isSeller={isSeller}
                isLoggedIn={!!user}
              />
              <AutoBidPanel
                auctionId={auction._id}
                currentBid={currentBid}
                isActive={currentStatus === 'active'}
                isSeller={isSeller}
                isLoggedIn={!!user}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Bid History</h2>
        <BidHistory bids={displayBids} />
      </div>
    </div>
  );
}
