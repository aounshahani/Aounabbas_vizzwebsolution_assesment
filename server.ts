import { createServer } from 'node:http';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import mongoose from 'mongoose';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from './src/types/socket';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

// Import models after app prepare to ensure env is loaded
async function getModels() {
  const { default: Auction } = await import('./src/models/Auction');
  const { default: AutoBid } = await import('./src/models/AutoBid');
  return { Auction, AutoBid };
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not set');
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { bufferCommands: false });
    console.log('> MongoDB connected');
  }
}

async function processAuctionTransitions(
  io: SocketServer<ClientToServerEvents, ServerToClientEvents>
) {
  try {
    await connectDB();
    const { Auction, AutoBid } = await getModels();
    const now = new Date();

    // Pending -> Active
    const activatedAuctions = await Auction.find({
      status: 'pending',
      startTime: { $lte: now },
    });

    for (const auction of activatedAuctions) {
      auction.status = 'active';
      await auction.save();
      io.to(`auction:${auction._id}`).emit('auction:started', {
        auctionId: auction._id.toString(),
        status: 'active',
      });
      console.log(`> Auction ${auction._id} started`);
    }

    // Active -> Ended (with winner determination)
    const endedAuctions = await Auction.find({
      status: 'active',
      endTime: { $lte: now },
    });

    for (const auction of endedAuctions) {
      auction.status = 'ended';
      auction.winner = auction.currentBidder;
      await auction.save();

      // Deactivate all auto-bids on this auction
      await AutoBid.updateMany(
        { auction: auction._id, status: 'active' },
        { status: 'cancelled' }
      );

      const populated = await auction.populate('winner', 'name email');
      io.to(`auction:${auction._id}`).emit('auction:ended', {
        auctionId: auction._id.toString(),
        status: 'ended',
        winner: populated.winner
          ? {
              _id: (populated.winner as any)._id.toString(),
              name: (populated.winner as any).name,
              email: (populated.winner as any).email,
            }
          : null,
        finalBid: auction.currentBid,
      });
      console.log(
        `> Auction ${auction._id} ended. Winner: ${
          populated.winner ? (populated.winner as any).name : 'none'
        }`
      );
    }
  } catch (error) {
    console.error('Error processing auction transitions:', error);
  }
}

app.prepare().then(async () => {
  const httpServer = createServer(handler);

  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer
  );

  // Expose io globally so API route handlers can emit events
  (globalThis as any).io = io;

  io.on('connection', (socket) => {
    console.log(`> Client connected: ${socket.id}`);

    socket.on('auction:join', (auctionId: string) => {
      socket.join(`auction:${auctionId}`);
    });

    socket.on('auction:leave', (auctionId: string) => {
      socket.leave(`auction:${auctionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`> Client disconnected: ${socket.id}`);
    });
  });

  // Auction lifecycle scheduler - runs every 10 seconds
  setInterval(() => {
    processAuctionTransitions(io);
  }, 10_000);

  httpServer.once('error', (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});