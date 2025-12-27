/**
 * Extract and analyze DOM snapshots from Playwright traces
 *
 * This tool extracts DOM snapshots at the failure point and analyzes:
 * - Element visibility
 * - Blocking elements (modals, banners, overlays)
 * - Page state indicators
 */

import type { TraceData, SnapshotEntry } from "./readTrace";

/**
 * DOM snapshot structure
 */
export interface DOMSnapshot {
	html: string;
	timestamp: number;
	url: string;
	viewport: { width: number; height: number };
}

/**
 * Element visibility result
 */
export interface VisibilityResult {
	exists: boolean;
	visible: boolean;
	reason?: string;
	computedStyles?: {
		display?: string;
		visibility?: string;
		opacity?: string;
		zIndex?: string;
	};
}

/**
 * Blocking element detected in DOM
 */
export interface BlockingElement {
	type:
		| "modal"
		| "overlay"
		| "banner"
		| "spinner"
		| "error"
		| "auth"
		| "cookie"
		| "unknown";
	selector: string;
	description: string;
	confidence: number;
}

/**
 * Extract DOM snapshot closest to the failure timestamp
 *
 * @param traceData - Parsed trace data
 * @param failureTime - Timestamp when failure occurred (in milliseconds)
 * @returns DOM snapshot at or before the failure point
 */
export async function extractDOMSnapshot(
	traceData: TraceData,
	failureTime: number,
): Promise<DOMSnapshot | null> {
	// Find the snapshot closest to (but not after) the failure time
	const snapshots = traceData.snapshots
		.filter((s) => s.timestamp <= failureTime && s.html)
		.sort((a, b) => b.timestamp - a.timestamp); // Most recent first

	if (snapshots.length === 0) {
		// If no snapshot before failure, try to get the most recent one
		const allSnapshots = traceData.snapshots
			.filter((s) => s.html)
			.sort((a, b) => b.timestamp - a.timestamp);

		if (allSnapshots.length === 0) {
			return null;
		}

		const snapshot = allSnapshots[0];
		return {
			html: snapshot.html || "",
			timestamp: snapshot.timestamp,
			url: snapshot.url || "",
			viewport: snapshot.viewport || { width: 1280, height: 720 },
		};
	}

	const snapshot = snapshots[0];
	return {
		html: snapshot.html || "",
		timestamp: snapshot.timestamp,
		url: snapshot.url || "",
		viewport: snapshot.viewport || { width: 1280, height: 720 },
	};
}

/**
 * Check if an element exists and is visible in the DOM snapshot
 *
 * @param dom - DOM snapshot
 * @param selector - CSS selector or text content to search for
 * @returns Visibility result
 */
/**
 * Simple HTML element finder using regex (no external dependencies)
 */
function findElementInHTML(
	html: string,
	selector: string,
): { found: boolean; html: string; style: string; classes: string } | null {
	// Try ID selector (#id)
	if (selector.startsWith("#")) {
		const id = selector.substring(1);
		const idRegex = new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, "i");
		const match = html.match(idRegex);
		if (match) {
			const styleMatch = match[0].match(/style=["']([^"']+)["']/i);
			const classMatch = match[0].match(/class=["']([^"']+)["']/i);
			return {
				found: true,
				html: match[0],
				style: styleMatch?.[1] || "",
				classes: classMatch?.[1] || "",
			};
		}
	}

	// Try class selector (.class)
	if (selector.startsWith(".")) {
		const className = selector.substring(1);
		const classRegex = new RegExp(
			`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
			"i",
		);
		const match = html.match(classRegex);
		if (match) {
			const styleMatch = match[0].match(/style=["']([^"']+)["']/i);
			const classMatch = match[0].match(/class=["']([^"']+)["']/i);
			return {
				found: true,
				html: match[0],
				style: styleMatch?.[1] || "",
				classes: classMatch?.[1] || "",
			};
		}
	}

	// Try attribute selector ([attr=value])
	const attrMatch = selector.match(/\[([^=]+)=["']?([^"'\]]+)["']?\]/);
	if (attrMatch) {
		const attrName = attrMatch[1];
		const attrValue = attrMatch[2];
		const attrRegex = new RegExp(
			`<[^>]+${attrName}=["']${attrValue}["'][^>]*>`,
			"i",
		);
		const match = html.match(attrRegex);
		if (match) {
			const styleMatch = match[0].match(/style=["']([^"']+)["']/i);
			const classMatch = match[0].match(/class=["']([^"']+)["']/i);
			return {
				found: true,
				html: match[0],
				style: styleMatch?.[1] || "",
				classes: classMatch?.[1] || "",
			};
		}
	}

	// Try tag name
	const tagMatch = selector.match(/^(\w+)/);
	if (tagMatch) {
		const tagName = tagMatch[1];
		const tagRegex = new RegExp(`<${tagName}[^>]*>`, "i");
		const match = html.match(tagRegex);
		if (match) {
			const styleMatch = match[0].match(/style=["']([^"']+)["']/i);
			const classMatch = match[0].match(/class=["']([^"']+)["']/i);
			return {
				found: true,
				html: match[0],
				style: styleMatch?.[1] || "",
				classes: classMatch?.[1] || "",
			};
		}
	}

	// Try text content search
	if (html.includes(selector)) {
		// Find the element containing this text
		const textRegex = new RegExp(
			`<[^>]*>[^<]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^<]*</[^>]*>`,
			"i",
		);
		const match = html.match(textRegex);
		if (match) {
			const styleMatch = match[0].match(/style=["']([^"']+)["']/i);
			const classMatch = match[0].match(/class=["']([^"']+)["']/i);
			return {
				found: true,
				html: match[0],
				style: styleMatch?.[1] || "",
				classes: classMatch?.[1] || "",
			};
		}
	}

	return null;
}

export function checkElementVisibility(
	dom: DOMSnapshot,
	selector: string,
): VisibilityResult {
	try {
		const element = findElementInHTML(dom.html, selector);

		if (!element || !element.found) {
			return {
				exists: false,
				visible: false,
				reason: "Element not found in DOM",
			};
		}

		// Check for common hiding patterns
		const isHidden =
			element.style.includes("display: none") ||
			element.style.includes("visibility: hidden") ||
			element.style.includes("opacity: 0") ||
			element.classes.includes("hidden") ||
			element.html.includes("hidden") ||
			element.html.toLowerCase().includes("<script") ||
			element.html.toLowerCase().includes("<style") ||
			element.html.toLowerCase().includes("<noscript");

		return {
			exists: true,
			visible: !isHidden,
			reason: isHidden
				? "Element exists but is hidden"
				: "Element exists and appears visible",
			computedStyles: {
				display: element.style.match(/display:\s*([^;]+)/)?.[1]?.trim(),
				visibility: element.style.match(/visibility:\s*([^;]+)/)?.[1]?.trim(),
				opacity: element.style.match(/opacity:\s*([^;]+)/)?.[1]?.trim(),
				zIndex: element.style.match(/z-index:\s*([^;]+)/)?.[1]?.trim(),
			},
		};
	} catch (error) {
		return {
			exists: false,
			visible: false,
			reason: `Error parsing DOM: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Find blocking elements in the DOM snapshot
 *
 * @param dom - DOM snapshot
 * @returns Array of blocking elements detected
 */
export function findBlockingElements(dom: DOMSnapshot): BlockingElement[] {
	const blockingElements: BlockingElement[] = [];
	const html = dom.html.toLowerCase();

	try {
		// Common patterns for blocking elements (using regex matching)
		const patterns = [
			// Modals and overlays
			{
				regex: [
					/role=["']dialog["']/i,
					/role=["']alertdialog["']/i,
					/class=["'][^"']*modal[^"']*["']/i,
					/class=["'][^"']*overlay[^"']*["']/i,
					/class=["'][^"']*backdrop[^"']*["']/i,
					/class=["'][^"']*dialog[^"']*["']/i,
					/id=["'][^"']*modal[^"']*["']/i,
					/id=["'][^"']*overlay[^"']*["']/i,
				],
				type: "modal" as const,
				description: "Modal or overlay dialog",
			},
			// Cookie banners
			{
				regex: [
					/class=["'][^"']*cookie[^"']*["']/i,
					/id=["'][^"']*cookie[^"']*["']/i,
					/class=["'][^"']*consent[^"']*["']/i,
					/id=["'][^"']*consent[^"']*["']/i,
					/class=["'][^"']*gdpr[^"']*["']/i,
					/id=["'][^"']*gdpr[^"']*["']/i,
				],
				type: "cookie" as const,
				description: "Cookie consent banner",
			},
			// Loading spinners
			{
				regex: [
					/class=["'][^"']*loading[^"']*["']/i,
					/class=["'][^"']*spinner[^"']*["']/i,
					/class=["'][^"']*loader[^"']*["']/i,
					/id=["'][^"']*loading[^"']*["']/i,
					/id=["'][^"']*spinner[^"']*["']/i,
					/aria-label=["'][^"']*loading[^"']*["']/i,
				],
				type: "spinner" as const,
				description: "Loading spinner or indicator",
			},
			// Error messages
			{
				regex: [
					/class=["'][^"']*error[^"']*["']/i,
					/id=["'][^"']*error[^"']*["']/i,
					/role=["']alert["']/i,
					/class=["'][^"']*alert[^"']*["']/i,
					/class=["'][^"']*exception[^"']*["']/i,
				],
				type: "error" as const,
				description: "Error message or alert",
			},
			// Authentication prompts
			{
				regex: [
					/class=["'][^"']*login[^"']*["']/i,
					/id=["'][^"']*login[^"']*["']/i,
					/class=["'][^"']*auth[^"']*["']/i,
					/id=["'][^"']*auth[^"']*["']/i,
					/class=["'][^"']*signin[^"']*["']/i,
					/id=["'][^"']*signin[^"']*["']/i,
					/action=["'][^"']*login[^"']*["']/i,
					/action=["'][^"']*auth[^"']*["']/i,
				],
				type: "auth" as const,
				description: "Authentication or login prompt",
			},
			// Banners (general)
			{
				regex: [
					/class=["'][^"']*banner[^"']*["']/i,
					/id=["'][^"']*banner[^"']*["']/i,
					/class=["'][^"']*notification[^"']*["']/i,
					/id=["'][^"']*notification[^"']*["']/i,
					/class=["'][^"']*toast[^"']*["']/i,
					/id=["'][^"']*toast[^"']*["']/i,
				],
				type: "banner" as const,
				description: "Notification banner or toast",
			},
		];

		for (const pattern of patterns) {
			for (const regex of pattern.regex) {
				const matches = dom.html.match(regex);
				if (matches) {
					// Extract the full element tag
					const matchIndex = dom.html.indexOf(matches[0]);
					if (matchIndex !== -1) {
						// Find the opening tag
						const beforeMatch = dom.html.substring(
							Math.max(0, matchIndex - 200),
							matchIndex,
						);
						const tagStart = beforeMatch.lastIndexOf("<");
						const afterMatch = dom.html.substring(matchIndex, matchIndex + 500);
						const tagEnd = afterMatch.indexOf(">");

						if (tagStart !== -1 && tagEnd !== -1) {
							const fullTag = dom.html.substring(
								Math.max(0, matchIndex - 200) + tagStart,
								matchIndex + tagEnd + 1,
							);

							// Check if element is likely visible (not hidden)
							const styleMatch = fullTag.match(/style=["']([^"']+)["']/i);
							const style = styleMatch?.[1] || "";
							const isHidden =
								style.includes("display: none") ||
								style.includes("visibility: hidden") ||
								fullTag.includes("hidden");

							if (!isHidden) {
								// Check if it's positioned to block content (high z-index, fixed/absolute)
								const zIndexMatch = style.match(/z-index:\s*(\d+)/);
								const zIndex = zIndexMatch?.[1];
								const positionMatch = style.match(/position:\s*([^;]+)/);
								const position = positionMatch?.[1]?.trim();
								const isBlocking =
									(zIndex && parseInt(zIndex) > 100) ||
									position === "fixed" ||
									position === "absolute";

								if (
									isBlocking ||
									pattern.type === "spinner" ||
									pattern.type === "error"
								) {
									// Extract text content (simplified)
									const textMatch = fullTag.match(/>([^<]{0,100})</);
									const text = textMatch?.[1]?.trim().substring(0, 100) || "";

									blockingElements.push({
										type: pattern.type,
										selector: regex.toString(),
										description: `${pattern.description}${text ? `: ${text}` : ""}`,
										confidence: isBlocking ? 0.9 : 0.6,
									});
								}
							}
						}
					}
				}
			}
		}

		// Remove duplicates (same type and similar description)
		const unique: BlockingElement[] = [];
		for (const element of blockingElements) {
			const existing = unique.find(
				(e) =>
					e.type === element.type &&
					e.description.substring(0, 50) ===
						element.description.substring(0, 50),
			);
			if (!existing) {
				unique.push(element);
			}
		}

		return unique;
	} catch (error) {
		console.warn("Error finding blocking elements:", error);
		return [];
	}
}
