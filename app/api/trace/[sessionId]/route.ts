import { NextRequest, NextResponse } from "next/server";
import { traceStore } from "../upload/route";

async function checkTraceAvailability(
	sessionId: string,
): Promise<{ available: boolean; expired?: boolean }> {
	const traceData = traceStore.get(sessionId);

	if (!traceData) {
		return { available: false };
	}

	// Check if session expired
	if (traceData.expiresAt < Date.now()) {
		traceStore.delete(sessionId);
		return { available: false, expired: true };
	}

	return { available: true };
}

export async function HEAD(
	req: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const { sessionId } = await params;
		const { available, expired } = await checkTraceAvailability(sessionId);

		if (!available) {
			return new NextResponse(null, {
				status: expired ? 410 : 404, // 410 Gone for expired, 404 for not found
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "HEAD, GET",
				},
			});
		}

		const traceData = traceStore.get(sessionId);
		return new NextResponse(null, {
			status: 200,
			headers: {
				"Content-Type": "application/zip",
				"Content-Length": traceData!.buffer.length.toString(),
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "HEAD, GET",
			},
		});
	} catch (error) {
		console.error("Trace HEAD error:", error);
		return new NextResponse(null, { status: 500 });
	}
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	try {
		const { sessionId } = await params;
		const { available, expired } = await checkTraceAvailability(sessionId);

		if (!available) {
			return NextResponse.json(
				{
					error: expired
						? "Session expired"
						: "Trace not found or session expired",
				},
				{ status: expired ? 410 : 404 },
			);
		}

		const traceData = traceStore.get(sessionId);

		// Return trace file with proper headers
		return new NextResponse(traceData!.buffer, {
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="trace.zip"`,
				"Content-Length": traceData!.buffer.length.toString(),
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, HEAD",
			},
		});
	} catch (error) {
		console.error("Trace serve error:", error);

		return NextResponse.json(
			{
				error: "Failed to serve trace file",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
