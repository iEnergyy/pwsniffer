import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/pipeline/runAnalysis";
import type { PlaywrightArtifacts } from "@/types/schemas";
import { extractArtifactsFromZip, isZipFile } from "@/tools/extractArtifacts";
import { randomUUID } from "crypto";
import { traceStore } from "../trace/upload/route";

// Allow longer duration for analysis
export const maxDuration = 60;

export async function POST(req: NextRequest) {
	try {
		const formData = await req.formData();

		// Check if a ZIP file was uploaded (primary method)
		const zipFile = formData.get("zip") as File | null;

		let artifacts: PlaywrightArtifacts;

		if (zipFile && isZipFile(zipFile)) {
			// Extract artifacts from ZIP
			const extracted = await extractArtifactsFromZip(zipFile);

			if (!extracted.reportJson) {
				return NextResponse.json(
					{
						error:
							"Could not find a Playwright report JSON file in the ZIP file. Please ensure a JSON file with Playwright test results is included.",
					},
					{ status: 400 },
				);
			}

			if (!extracted.traceZip) {
				return NextResponse.json(
					{
						error:
							"Could not find a trace ZIP file in the ZIP file. Please ensure a trace.zip or similar trace archive is included.",
					},
					{ status: 400 },
				);
			}

			// Convert extracted file data to File objects for the pipeline
			// Note: File and Blob are available in Next.js API routes (Edge Runtime)
			const screenshotFiles = extracted.screenshots?.map((screenshot) => {
				// Create File from Buffer - convert Buffer to Uint8Array for compatibility
				const uint8Array = new Uint8Array(screenshot.data);
				const file = new File([uint8Array], screenshot.name, {
					type: screenshot.type,
				});
				return file;
			});

			const videoFile = extracted.video
				? (() => {
						const uint8Array = new Uint8Array(extracted.video.data);
						return new File([uint8Array], extracted.video.name, {
							type: extracted.video.type,
						});
					})()
				: undefined;

			artifacts = {
				reportJson: extracted.reportJson,
				traceZip: Buffer.from(extracted.traceZip),
				screenshots: screenshotFiles,
				video: videoFile,
				contextMd: extracted.contextMd,
			};
		} else {
			// Fallback to individual file uploads
			const reportFile = formData.get("report") as File | null;
			const traceFile = formData.get("trace") as File | null;

			// Validate required files
			if (!reportFile) {
				return NextResponse.json(
					{
						error:
							"Missing required file: Playwright report JSON file or ZIP file containing artifacts",
					},
					{ status: 400 },
				);
			}

			if (!traceFile) {
				return NextResponse.json(
					{
						error:
							"Missing required file: Trace ZIP file or ZIP file containing artifacts",
					},
					{ status: 400 },
				);
			}

			// Extract optional files
			const screenshots = formData.getAll("screenshots[]") as File[];
			const video = formData.get("video") as File | null;
			const context = formData.get("context") as string | null;

			// Read report JSON
			const reportJson = await reportFile.text();

			// Prepare artifacts
			artifacts = {
				reportJson: Buffer.from(reportJson, "utf-8"),
				traceZip: traceFile,
				screenshots: screenshots.length > 0 ? screenshots : undefined,
				video: video || undefined,
				contextMd: context || undefined,
			};
		}

		// Run analysis pipeline
		const results = await runAnalysis(artifacts);

		// Convert screenshots to data URLs for client display
		const screenshotUrls: string[] = [];
		if (artifacts.screenshots && artifacts.screenshots.length > 0) {
			for (const screenshot of artifacts.screenshots) {
				try {
					const arrayBuffer = await screenshot.arrayBuffer();
					const base64 = Buffer.from(arrayBuffer).toString("base64");
					const mimeType = screenshot.type || "image/png";
					screenshotUrls.push(`data:${mimeType};base64,${base64}`);
				} catch (error) {
					console.warn("Failed to convert screenshot to base64:", error);
				}
			}
		}

		// Upload trace file for trace viewer
		let traceSessionId: string | null = null;
		try {
			// Get trace buffer - it's either already a Buffer or a File
			let traceBuffer: Buffer;
			if (artifacts.traceZip instanceof Buffer) {
				traceBuffer = artifacts.traceZip;
			} else if (artifacts.traceZip instanceof File) {
				const arrayBuffer = await artifacts.traceZip.arrayBuffer();
				traceBuffer = Buffer.from(arrayBuffer);
			} else {
				throw new Error("Invalid trace file format");
			}

			// Generate session ID and store trace
			const sessionId = randomUUID();
			const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
			traceStore.set(sessionId, { buffer: traceBuffer, expiresAt });
			traceSessionId = sessionId;
		} catch (traceError) {
			console.warn("Failed to upload trace for viewer:", traceError);
			// Don't fail the analysis if trace upload fails
		}

		return NextResponse.json({
			success: true,
			results: {
				failureFacts: results.failureFacts,
				failureCategories: results.failureCategories,
				artifactSignals: results.artifactSignals,
				selectorAnalyses: results.selectorAnalyses,
				diagnoses: results.diagnoses,
				solutionSuggestions: results.solutionSuggestions,
				screenshotUrls,
				traceSessionId,
			},
		});
	} catch (error) {
		console.error("Analysis error:", error);

		return NextResponse.json(
			{
				error: "Failed to analyze Playwright artifacts",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
