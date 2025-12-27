/**
 * Read and parse Playwright trace.zip files
 *
 * Playwright traces are ZIP files containing:
 * - trace.trace - Main trace file (JSONL format - newline-delimited JSON)
 * - resources/ - Network resources (HTML, JS, CSS, images, etc.)
 * - snapshots/ - DOM snapshots at various points in time
 */

import AdmZip from "adm-zip";

/**
 * Action event from Playwright trace
 */
export interface ActionEvent {
	type: string;
	timestamp: number;
	action?: {
		name: string;
		selector?: string;
		url?: string;
		value?: string;
		options?: Record<string, unknown>;
	};
	error?: {
		message: string;
		stack?: string;
	};
	metadata?: Record<string, unknown>;
}

/**
 * Network event from Playwright trace
 */
export interface NetworkEvent {
	timestamp: number;
	type: "request" | "response" | "requestFailed" | "responseReceived";
	url: string;
	method?: string;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	error?: string;
}

/**
 * Console event from Playwright trace
 */
export interface ConsoleEvent {
	timestamp: number;
	type: "log" | "error" | "warning" | "info" | "debug";
	text: string;
	location?: {
		url: string;
		lineNumber?: number;
		columnNumber?: number;
	};
}

/**
 * Snapshot entry from Playwright trace
 */
export interface SnapshotEntry {
	snapshotId: string;
	timestamp: number;
	url: string;
	title?: string;
	html?: string;
	viewport?: {
		width: number;
		height: number;
	};
}

/**
 * Resource entry from Playwright trace
 */
export interface ResourceEntry {
	url: string;
	contentType?: string;
	content?: Buffer | string;
	size?: number;
}

/**
 * Structured trace data extracted from Playwright trace.zip
 */
export interface TraceData {
	actions: ActionEvent[];
	network: NetworkEvent[];
	console: ConsoleEvent[];
	snapshots: SnapshotEntry[];
	resources: ResourceEntry[];
	metadata?: {
		startTime?: number;
		endTime?: number;
		browser?: string;
		viewport?: { width: number; height: number };
	};
}

/**
 * Read Playwright trace.zip file and extract structured data
 *
 * @param traceZip - Playwright trace.zip file as File or Buffer
 * @returns Structured trace data
 */
export async function readTraceZip(
	traceZip: File | Buffer,
): Promise<TraceData> {
	const zipBuffer =
		traceZip instanceof File
			? Buffer.from(await traceZip.arrayBuffer())
			: traceZip;

	let zip = new AdmZip(zipBuffer);
	let entries = zip.getEntries();

	// Check if this zip contains another zip file (nested trace structure)
	// Playwright sometimes creates nested zips
	const nestedZipEntry = entries.find(
		(entry) =>
			!entry.isDirectory &&
			(entry.entryName.toLowerCase().endsWith(".zip") ||
				entry.entryName.toLowerCase().includes("trace")),
	);

	// If we find a nested zip that looks like a trace, extract it
	if (
		nestedZipEntry &&
		nestedZipEntry.entryName.toLowerCase().endsWith(".zip")
	) {
		try {
			const nestedZipData = nestedZipEntry.getData();
			zip = new AdmZip(nestedZipData);
			entries = zip.getEntries();
		} catch {
			// If nested zip extraction fails, continue with original zip
		}
	}

	const traceData: TraceData = {
		actions: [],
		network: [],
		console: [],
		snapshots: [],
		resources: [],
	};

	// Find and parse the main trace file (trace.trace)
	// Look in various possible locations
	let traceEntry = entries.find(
		(entry) =>
			entry.entryName === "trace.trace" ||
			entry.entryName.endsWith("/trace.trace") ||
			entry.entryName.endsWith("\\trace.trace"),
	);

	// If not found, look for any .trace file
	if (!traceEntry) {
		traceEntry = entries.find(
			(entry) => entry.entryName.endsWith(".trace") && !entry.isDirectory,
		);
	}

	// If still not found, look for trace files in subdirectories
	if (!traceEntry) {
		traceEntry = entries.find(
			(entry) =>
				!entry.isDirectory &&
				(entry.entryName.includes("trace") ||
					entry.entryName.includes("Trace")),
		);
	}

	if (!traceEntry) {
		// Log available entries for debugging
		const entryNames = entries
			.filter((e) => !e.isDirectory)
			.map((e) => e.entryName)
			.slice(0, 20);
		console.warn("Available entries in trace.zip:", entryNames);
		throw new Error(
			`trace.trace file not found in trace.zip. Found ${entries.length} entries (${entries.filter((e) => !e.isDirectory).length} files). First few: ${entryNames.join(", ")}`,
		);
	}

	// Parse JSONL format (newline-delimited JSON)
	const traceContent = traceEntry.getData().toString("utf-8");
	const traceLines = traceContent.split("\n").filter((line) => line.trim());

	let startTime: number | undefined;
	let endTime: number | undefined;

	for (const line of traceLines) {
		try {
			const event = JSON.parse(line);

			// Extract metadata
			if (event.type === "context-options" || event.type === "browser") {
				if (event.viewport) {
					traceData.metadata = {
						...traceData.metadata,
						viewport: event.viewport,
						browser: event.name || event.browser,
					};
				}
			}

			// Extract action events
			if (event.type === "action" || event.type === "event") {
				const actionEvent: ActionEvent = {
					type: event.type,
					timestamp: event.timestamp || Date.now(),
					action: event.action,
					error: event.error,
					metadata: event.metadata,
				};
				traceData.actions.push(actionEvent);

				if (!startTime || actionEvent.timestamp < startTime) {
					startTime = actionEvent.timestamp;
				}
				if (!endTime || actionEvent.timestamp > endTime) {
					endTime = actionEvent.timestamp;
				}
			}

			// Extract network events
			if (
				event.type === "resource" ||
				event.type === "request" ||
				event.type === "response"
			) {
				const networkEvent: NetworkEvent = {
					timestamp: event.timestamp || Date.now(),
					type: event.type === "resource" ? "request" : event.type,
					url: event.url || event.request?.url || event.response?.url || "",
					method: event.method || event.request?.method,
					status: event.status || event.response?.status,
					statusText: event.statusText || event.response?.statusText,
					headers:
						event.headers || event.request?.headers || event.response?.headers,
					error: event.error,
				};
				traceData.network.push(networkEvent);
			}

			// Extract console events
			if (event.type === "console") {
				const consoleEvent: ConsoleEvent = {
					timestamp: event.timestamp || Date.now(),
					type: event.level || "log",
					text: event.text || event.message || "",
					location: event.location,
				};
				traceData.console.push(consoleEvent);
			}

			// Extract snapshot metadata
			if (event.type === "snapshot" || event.snapshotId) {
				const snapshotEntry: SnapshotEntry = {
					snapshotId: event.snapshotId || event.id || "",
					timestamp: event.timestamp || Date.now(),
					url: event.url || "",
					title: event.title,
					viewport: event.viewport,
				};
				traceData.snapshots.push(snapshotEntry);
			}
		} catch (error) {
			// Skip malformed JSON lines
			console.warn("Failed to parse trace line:", error);
		}
	}

	// Extract snapshot HTML files
	for (const entry of entries) {
		if (
			entry.entryName.startsWith("snapshots/") &&
			entry.entryName.endsWith(".html")
		) {
			const snapshotId = entry.entryName
				.replace("snapshots/", "")
				.replace(".html", "");

			const snapshot = traceData.snapshots.find(
				(s) => s.snapshotId === snapshotId,
			);
			if (snapshot) {
				snapshot.html = entry.getData().toString("utf-8");
			} else {
				// Create new snapshot entry if not found in trace
				traceData.snapshots.push({
					snapshotId,
					timestamp: Date.now(),
					url: "",
					html: entry.getData().toString("utf-8"),
				});
			}
		}
	}

	// Extract resources
	for (const entry of entries) {
		if (entry.entryName.startsWith("resources/")) {
			const resourceEntry: ResourceEntry = {
				url: entry.entryName.replace("resources/", ""),
				content: entry.getData(),
				size: entry.header.size,
			};
			traceData.resources.push(resourceEntry);
		}
	}

	// Set metadata
	traceData.metadata = {
		...traceData.metadata,
		startTime,
		endTime,
	};

	return traceData;
}

/**
 * Extract action events from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Array of action events
 */
export function extractActionEvents(traceData: TraceData): ActionEvent[] {
	return traceData.actions;
}

/**
 * Extract network events from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Array of network events
 */
export function extractNetworkEvents(traceData: TraceData): NetworkEvent[] {
	return traceData.network;
}

/**
 * Extract console events from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Array of console events
 */
export function extractConsoleEvents(traceData: TraceData): ConsoleEvent[] {
	return traceData.console;
}
