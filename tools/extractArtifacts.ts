/**
 * Extract and identify Playwright artifacts from a ZIP file
 */

import AdmZip from "adm-zip";

export interface ExtractedArtifacts {
	reportJson?: Buffer | string;
	reportFileName?: string;
	traceZip?: Buffer;
	traceFileName?: string;
	screenshots?: Array<{ name: string; data: Buffer; type: string }>;
	video?: { name: string; data: Buffer; type: string };
	contextMd?: string;
}

/**
 * Extract and identify Playwright artifacts from a ZIP file
 * Automatically identifies:
 * - report.json (required)
 * - trace.zip or trace files (required)
 * - screenshots (PNG/JPEG)
 * - video files (MP4/WebM)
 * - context.md (optional)
 */
export async function extractArtifactsFromZip(
	zipFile: File | Buffer,
): Promise<ExtractedArtifacts> {
	const zipBuffer =
		zipFile instanceof File
			? Buffer.from(await zipFile.arrayBuffer())
			: zipFile;

	const zip = new AdmZip(zipBuffer);
	const entries = zip.getEntries();

	const artifacts: ExtractedArtifacts = {};
	const screenshotFiles: Array<{ name: string; data: Buffer; type: string }> =
		[];

	for (const entry of entries) {
		if (entry.isDirectory) continue;

		const entryName = entry.entryName.toLowerCase();
		const originalEntryName = entry.entryName;
		const entryData = entry.getData();

		// Identify Playwright report JSON (any .json file that has Playwright structure)
		// Don't check filename - check content structure instead
		if (entryName.endsWith(".json")) {
			// Check if it looks like a Playwright report
			try {
				const jsonStr = entryData.toString("utf-8");
				const parsed = JSON.parse(jsonStr);
				// Playwright reports have 'suites' or 'config' at root
				if (parsed.suites || parsed.config) {
					// Only store if we haven't found one yet, or this one looks more complete
					if (
						!artifacts.reportJson ||
						(parsed.suites && parsed.suites.length > 0)
					) {
						artifacts.reportJson = Buffer.from(entryData);
						artifacts.reportFileName =
							originalEntryName.split("/").pop() || originalEntryName;
					}
				}
			} catch {
				// Not valid JSON, skip
			}
		}

		// Identify trace.zip (any .zip file that might be a trace)
		// Check for common patterns but also accept any .zip if we haven't found one
		if (entryName.endsWith(".zip")) {
			// Prefer files with "trace" in the name, but accept any .zip if we haven't found one
			if (entryName.includes("trace") || !artifacts.traceZip) {
				artifacts.traceZip = Buffer.from(entryData);
				artifacts.traceFileName =
					originalEntryName.split("/").pop() || originalEntryName;
			}
		}

		// Identify screenshots
		if (entryName.match(/\.(png|jpg|jpeg)$/i)) {
			// Create a File-like object for Node.js environment
			// In the browser, we'll convert Buffer to Blob/File in the API route
			const fileName = entry.entryName.split("/").pop() || "screenshot.png";
			const fileData = {
				name: fileName,
				data: entryData,
				type: entryName.endsWith(".png") ? "image/png" : "image/jpeg",
			};
			// Store as Buffer for now, will be converted to File in API route if needed
			screenshotFiles.push(fileData as any);
		}

		// Identify video files
		if (entryName.match(/\.(mp4|webm)$/i)) {
			const fileName = entry.entryName.split("/").pop() || "video.mp4";
			// Store as Buffer for now, will be converted to File in API route if needed
			artifacts.video = {
				name: fileName,
				data: entryData,
				type: entryName.endsWith(".mp4") ? "video/mp4" : "video/webm",
			} as any;
		}

		// Identify context.md
		if (
			entryName.includes("context.md") ||
			(entryName.endsWith(".md") && entryName.includes("context"))
		) {
			artifacts.contextMd = entryData.toString("utf-8");
		}
	}

	// If we found screenshots, add them
	if (screenshotFiles.length > 0) {
		artifacts.screenshots = screenshotFiles;
	}

	return artifacts;
}

/**
 * Check if a file is a ZIP archive
 */
export function isZipFile(file: File): boolean {
	return (
		file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip")
	);
}
