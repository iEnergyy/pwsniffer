import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// In-memory storage for trace files (session-only)
// Map<sessionId, { buffer: Buffer, expiresAt: number }>
const traceStore = new Map<string, { buffer: Buffer; expiresAt: number }>();

// Cleanup expired sessions every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_EXPIRY = 60 * 60 * 1000; // 1 hour

// Start cleanup interval if not already running
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval() {
	if (cleanupInterval) return;

	cleanupInterval = setInterval(() => {
		const now = Date.now();
		for (const [sessionId, data] of traceStore.entries()) {
			if (data.expiresAt < now) {
				traceStore.delete(sessionId);
			}
		}
	}, CLEANUP_INTERVAL);
}

// Export traceStore for use in other routes
export { traceStore };

export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();
		const traceFile = formData.get("trace") as File | null;

		if (!traceFile) {
			return NextResponse.json(
				{ error: "Missing trace file" },
				{ status: 400 },
			);
		}

		// Validate file size (limit to 100MB)
		const maxSize = 100 * 1024 * 1024; // 100MB
		if (traceFile.size > maxSize) {
			return NextResponse.json(
				{ error: "Trace file too large. Maximum size is 100MB" },
				{ status: 400 },
			);
		}

		// Read trace file into buffer
		const arrayBuffer = await traceFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Generate unique session ID
		const sessionId = randomUUID();
		const expiresAt = Date.now() + SESSION_EXPIRY;

		// Store trace in memory
		traceStore.set(sessionId, { buffer, expiresAt });

		// Start cleanup interval if not running
		startCleanupInterval();

		return NextResponse.json({
			success: true,
			sessionId,
			expiresAt,
		});
	} catch (error) {
		console.error("Trace upload error:", error);

		return NextResponse.json(
			{
				error: "Failed to upload trace file",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
