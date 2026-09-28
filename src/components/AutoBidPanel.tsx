'use client';

import { FormEvent, useEffect, useState } from 'react';

type AutoBid = {
  _id: string;
  maxAmount: number;
  incrementType: 'fixed' | 'percentage';
  incrementValue: number;
  maxBidCount: number | null;
  bidsPlaced: number;
  status: 'active' | 'exhausted' | 'cancelled';
};

interface AutoBidPanelProps {
  auctionId: string;
  currentBid: number;
  isActive: boolean;
  isSeller: boolean;
  isLoggedIn: boolean;
}

export default function AutoBidPanel({
  auctionId,
  currentBid,
  isActive,
  isSeller,
  isLoggedIn,
}: AutoBidPanelProps) {
  const [autoBid, setAutoBid] = useState<AutoBid | null>(null);
  const [maxAmount, setMaxAmount] = useState('');
  const [incrementType, setIncrementType] = useState<'fixed' | 'percentage'>(
    'fixed'
  );
  const [incrementValue, setIncrementValue] = useState('');
  const [maxBidCount, setMaxBidCount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !isActive || isSeller) return;

    let cancelled = false;
    fetch(`/api/auctions/${auctionId}/auto-bid`, { credentials: 'include' })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled && result.success) setAutoBid(result.data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your auto-bid.');
      });

    return () => {
      cancelled = true;
    };
  }, [auctionId, currentBid, isActive, isLoggedIn, isSeller]);

  const submitAutoBid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const cap = Number(maxAmount);
    const increment = Number(incrementValue);
    const bidLimit = maxBidCount === '' ? null : Number(maxBidCount);
    if (!Number.isFinite(cap) || cap <= currentBid) {
      setError(`Cap must be greater than $${currentBid.toFixed(2)}.`);
      return;
    }
    if (!Number.isFinite(increment) || increment <= 0) {
      setError('Enter an increment greater than zero.');
      return;
    }
    if (bidLimit !== null && (!Number.isInteger(bidLimit) || bidLimit < 1)) {
      setError('Maximum bids must be a whole number of at least 1.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/auctions/${auctionId}/auto-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          maxAmount: cap,
          incrementType,
          incrementValue: increment,
          maxBidCount: bidLimit,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Could not save auto-bid.');
        return;
      }

      setAutoBid(result.data);
      setMessage('Auto-bid saved.');
      setMaxAmount('');
      setIncrementValue('');
      setMaxBidCount('');
    } catch {
      setError('Could not save auto-bid.');
    } finally {
      setLoading(false);
    }
  };

  const cancelAutoBid = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await fetch(`/api/auctions/${auctionId}/auto-bid`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || 'Could not cancel auto-bid.');
        return;
      }

      setAutoBid(result.data);
      setMessage('Auto-bid cancelled.');
    } catch {
      setError('Could not cancel auto-bid.');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn || isSeller || !isActive) return null;

  return (
    <section className="mt-4 border-t border-gray-200 pt-4" aria-label="Auto-bid">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">Auto-bid</h2>
        {autoBid && (
          <span
            className={`rounded px-2 py-1 text-xs font-semibold ${
              autoBid.status === 'active'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {autoBid.status === 'active' ? 'ACTIVE' : 'EXHAUSTED'}
          </span>
        )}
      </div>

      {autoBid && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50 p-3 text-sm">
          <div>
            <p>
              Cap <strong>${autoBid.maxAmount.toFixed(2)}</strong>
              <span className="mx-2 text-gray-400">|</span>
              Bids used <strong>{autoBid.bidsPlaced}</strong>
              {autoBid.maxBidCount != null && ` of ${autoBid.maxBidCount}`}
            </p>
            <p className="mt-1 text-gray-600">
              {autoBid.incrementType === 'fixed'
                ? `+$${autoBid.incrementValue.toFixed(2)} per response`
                : `+${autoBid.incrementValue}% per response`}
            </p>
          </div>
          {autoBid.status === 'active' && (
            <button
              type="button"
              onClick={cancelAutoBid}
              disabled={loading}
              className="border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <form onSubmit={submitAutoBid} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Maximum cap ($)
            <input
              type="number"
              min={currentBid + 0.01}
              step="0.01"
              required
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              placeholder={`More than $${currentBid.toFixed(2)}`}
              className="mt-1 block w-full border border-gray-300 px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Increment type
            <select
              value={incrementType}
              onChange={(event) =>
                setIncrementType(event.target.value as 'fixed' | 'percentage')
              }
              className="mt-1 block w-full border border-gray-300 bg-white px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="fixed">Fixed amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            {incrementType === 'fixed' ? 'Increment ($)' : 'Increment (%)'}
            <input
              type="number"
              min="0.01"
              max={incrementType === 'percentage' ? 100 : undefined}
              step="0.01"
              required
              value={incrementValue}
              onChange={(event) => setIncrementValue(event.target.value)}
              className="mt-1 block w-full border border-gray-300 px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Maximum automatic bids <span className="font-normal text-gray-500">(optional)</span>
            <input
              type="number"
              min="1"
              step="1"
              value={maxBidCount}
              onChange={(event) => setMaxBidCount(event.target.value)}
              placeholder="Until cap is reached"
              className="mt-1 block w-full border border-gray-300 px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : autoBid?.status === 'active' ? 'Replace auto-bid' : 'Set auto-bid'}
        </button>
      </form>
    </section>
  );
}
