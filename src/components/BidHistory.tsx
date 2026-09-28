'use client';

interface Bid {
  _id: string;
  amount: number;
  bidder: { _id: string; name: string } | string;
  createdAt: string;
  isAutoBid?: boolean;
}

interface BidHistoryProps {
  bids: Bid[];
}

export default function BidHistory({ bids }: BidHistoryProps) {
  if (bids.length === 0) {
    return (
      <div className="text-gray-500 text-center py-4">
        No bids yet. Be the first to bid!
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {bids.map((bid) => {
        const bidderName =
          typeof bid.bidder === 'string' ? bid.bidder : bid.bidder.name;
        return (
          <div
            key={bid._id}
            className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm"
          >
            <div>
              <span className="font-medium">{bidderName}</span>
              {bid.isAutoBid && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                  Auto
                </span>
              )}
              <span className="text-gray-400 ml-2">
                {new Date(bid.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <span className="font-bold text-amber-600">
              ${bid.amount.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
