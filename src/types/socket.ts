export interface ServerToClientEvents {
  'bid:placed': (data: {
    auctionId: string;
    bid: {
      _id: string;
      amount: number;
      bidder: { _id: string; name: string };
      createdAt: string;
      isAutoBid?: boolean;
    };
    currentBid: number;
  }) => void;

  'auction:started': (data: {
    auctionId: string;
    status: 'active';
  }) => void;

  'auction:ended': (data: {
    auctionId: string;
    status: 'ended';
    winner: { _id: string; name: string; email: string } | null;
    finalBid: number;
  }) => void;
}

export interface ClientToServerEvents {
  'auction:join': (auctionId: string) => void;
  'auction:leave': (auctionId: string) => void;
}
