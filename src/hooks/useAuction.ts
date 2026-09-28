'use client';

import { useEffect, useState } from 'react';
import { useSocket } from '@/components/providers/SocketProvider';

interface BidData {
  _id: string;
  amount: number;
  bidder: { _id: string; name: string };
  createdAt: string;
  isAutoBid?: boolean;
}

interface AuctionState {
  currentBid: number;
  status: 'pending' | 'active' | 'ended';
  winner: { _id: string; name: string; email: string } | null;
  recentBids: BidData[];
}

export function useAuction(auctionId: string, initialState: AuctionState) {
  const { socket } = useSocket();
  const [state, setState] = useState<AuctionState>(initialState);

  // Sync with parent state changes (e.g., after fetch refresh)
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('auction:join', auctionId);

    const handleBidPlaced = (data: {
      auctionId: string;
      bid: BidData;
      currentBid: number;
    }) => {
      if (data.auctionId === auctionId) {
        setState((prev) => ({
          ...prev,
          currentBid: data.currentBid,
          recentBids: [data.bid, ...prev.recentBids],
        }));
      }
    };

    const handleAuctionStarted = (data: {
      auctionId: string;
      status: 'active';
    }) => {
      if (data.auctionId === auctionId) {
        setState((prev) => ({ ...prev, status: 'active' }));
      }
    };

    const handleAuctionEnded = (data: {
      auctionId: string;
      status: 'ended';
      winner: { _id: string; name: string; email: string } | null;
      finalBid: number;
    }) => {
      if (data.auctionId === auctionId) {
        setState((prev) => ({
          ...prev,
          status: 'ended',
          winner: data.winner,
          currentBid: data.finalBid,
        }));
      }
    };

    socket.on('bid:placed', handleBidPlaced);
    socket.on('auction:started', handleAuctionStarted);
    socket.on('auction:ended', handleAuctionEnded);

    return () => {
      socket.emit('auction:leave', auctionId);
      socket.off('bid:placed', handleBidPlaced);
      socket.off('auction:started', handleAuctionStarted);
      socket.off('auction:ended', handleAuctionEnded);
    };
  }, [socket, auctionId]);

  return state;
}
