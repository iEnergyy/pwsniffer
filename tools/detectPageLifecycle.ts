/**
 * Detect page lifecycle events from Playwright trace data
 *
 * Analyzes network events, navigation events, and page load states
 * to determine if the page was fully loaded, still loading, or failed.
 */

import type { TraceData, NetworkEvent, ActionEvent } from "./readTrace";

/**
 * Page load state
 */
export interface PageLoadState {
	state: "loaded" | "loading" | "failed" | "timeout" | "unknown";
	loadTime?: number;
	domContentLoadedTime?: number;
	networkErrors: string[];
	failedRequests: Array<{
		url: string;
		status?: number;
		error?: string;
	}>;
}

/**
 * Navigation event
 */
export interface NavigationEvent {
	type: "goto" | "reload" | "goBack" | "goForward" | "click";
	url: string;
	timestamp: number;
	success: boolean;
	error?: string;
}

/**
 * Redirect event
 */
export interface RedirectEvent {
	from: string;
	to: string;
	type: "http" | "meta" | "javascript" | "unknown";
	timestamp: number;
	statusCode?: number;
}

/**
 * Detect page load state from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Page load state information
 */
export function detectPageLoadState(traceData: TraceData): PageLoadState {
	const networkEvents = traceData.network;
	const actions = traceData.actions;

	const loadState: PageLoadState = {
		state: "unknown",
		networkErrors: [],
		failedRequests: [],
	};

	// Find main document request (usually the first navigation request)
	const documentRequests = networkEvents.filter(
		(e) =>
			e.type === "request" &&
			(e.url.endsWith(".html") ||
				!e.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/i)),
	);

	// Find load events in actions
	const loadEvents = actions.filter(
		(a) =>
			a.action?.name === "load" ||
			a.action?.name === "domcontentloaded" ||
			(a.type === "event" &&
				(a.metadata?.name === "load" ||
					a.metadata?.name === "DOMContentLoaded")),
	);

	// Check for network errors
	const failedRequests = networkEvents.filter(
		(e) =>
			e.type === "requestFailed" ||
			(e.type === "response" &&
				e.status &&
				(e.status >= 400 || e.status === 0)),
	);

	for (const request of failedRequests) {
		loadState.failedRequests.push({
			url: request.url,
			status: request.status,
			error:
				request.error || `HTTP ${request.status} ${request.statusText || ""}`,
		});

		if (request.error) {
			loadState.networkErrors.push(`${request.url}: ${request.error}`);
		} else if (request.status) {
			loadState.networkErrors.push(`${request.url}: HTTP ${request.status}`);
		}
	}

	// Determine load state
	if (loadState.networkErrors.length > 0) {
		// Check if main document failed
		const mainDocFailed = documentRequests.some((r) =>
			loadState.failedRequests.some((f) => f.url === r.url),
		);

		if (mainDocFailed) {
			loadState.state = "failed";
		} else {
			// Some resources failed but page might still be usable
			loadState.state = "loaded";
		}
	} else if (loadEvents.length > 0) {
		// Find the most recent load event
		const latestLoad = loadEvents.sort((a, b) => b.timestamp - a.timestamp)[0];
		loadState.loadTime = latestLoad.timestamp;

		// Check for DOMContentLoaded
		const domContentLoaded = loadEvents.find(
			(e) =>
				e.action?.name === "domcontentloaded" ||
				e.metadata?.name === "DOMContentLoaded",
		);
		if (domContentLoaded) {
			loadState.domContentLoadedTime = domContentLoaded.timestamp;
		}

		loadState.state = "loaded";
	} else {
		// Check if there are pending requests (page might still be loading)
		const recentRequests = networkEvents.filter(
			(e) => e.timestamp > Date.now() - 10000, // Last 10 seconds
		);

		if (recentRequests.length > 0) {
			loadState.state = "loading";
		} else {
			// No clear indicators
			loadState.state = "unknown";
		}
	}

	// Check for timeout indicators
	const timeoutActions = actions.filter(
		(a) =>
			a.error?.message?.toLowerCase().includes("timeout") ||
			a.error?.message?.toLowerCase().includes("exceeded"),
	);

	if (timeoutActions.length > 0 && loadState.state !== "failed") {
		loadState.state = "timeout";
	}

	return loadState;
}

/**
 * Detect navigation events from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Array of navigation events
 */
export function detectNavigationEvents(
	traceData: TraceData,
): NavigationEvent[] {
	const navigationEvents: NavigationEvent[] = [];
	const actions = traceData.actions;

	for (const action of actions) {
		const actionName = action.action?.name || "";
		const url = action.action?.url || "";

		if (actionName === "goto" || actionName === "navigate") {
			navigationEvents.push({
				type: "goto",
				url: url || action.action?.selector || "",
				timestamp: action.timestamp,
				success: !action.error,
				error: action.error?.message,
			});
		} else if (actionName === "reload") {
			navigationEvents.push({
				type: "reload",
				url: url || "current page",
				timestamp: action.timestamp,
				success: !action.error,
				error: action.error?.message,
			});
		} else if (actionName === "goBack") {
			navigationEvents.push({
				type: "goBack",
				url: "previous page",
				timestamp: action.timestamp,
				success: !action.error,
				error: action.error?.message,
			});
		} else if (actionName === "goForward") {
			navigationEvents.push({
				type: "goForward",
				url: "next page",
				timestamp: action.timestamp,
				success: !action.error,
				error: action.error?.message,
			});
		} else if (actionName === "click" && url) {
			// Click that triggered navigation
			navigationEvents.push({
				type: "click",
				url,
				timestamp: action.timestamp,
				success: !action.error,
				error: action.error?.message,
			});
		}
	}

	return navigationEvents;
}

/**
 * Detect redirects from trace data
 *
 * @param traceData - Parsed trace data
 * @returns Array of redirect events
 */
export function detectRedirects(traceData: TraceData): RedirectEvent[] {
	const redirects: RedirectEvent[] = [];
	const networkEvents = traceData.network;

	// Track request-response pairs
	const requestMap = new Map<string, NetworkEvent>();
	const responseMap = new Map<string, NetworkEvent[]>();

	for (const event of networkEvents) {
		if (event.type === "request") {
			requestMap.set(event.url, event);
		} else if (event.type === "response") {
			if (!responseMap.has(event.url)) {
				responseMap.set(event.url, []);
			}
			responseMap.get(event.url)?.push(event);
		}
	}

	// Find redirects (3xx status codes)
	for (const [url, responses] of responseMap.entries()) {
		for (const response of responses) {
			if (response.status && response.status >= 300 && response.status < 400) {
				// Check for Location header
				const location =
					response.headers?.["location"] ||
					response.headers?.["Location"] ||
					response.headers?.["LOCATION"];

				if (location) {
					// Resolve relative URLs
					const redirectUrl = location.startsWith("http")
						? location
						: new URL(location, url).toString();

					redirects.push({
						from: url,
						to: redirectUrl,
						type: "http",
						timestamp: response.timestamp,
						statusCode: response.status,
					});
				}
			}
		}
	}

	// Check for meta refresh redirects in snapshots
	for (const snapshot of traceData.snapshots) {
		if (snapshot.html) {
			const metaRefreshMatch = snapshot.html.match(
				/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;\s*url=([^"']+)["']/i,
			);

			if (metaRefreshMatch) {
				const redirectUrl = metaRefreshMatch[1];
				redirects.push({
					from: snapshot.url,
					to: redirectUrl,
					type: "meta",
					timestamp: snapshot.timestamp,
				});
			}

			// Check for JavaScript redirects (window.location)
			const jsRedirectMatch = snapshot.html.match(
				/window\.location\s*=\s*["']([^"']+)["']/i,
			);

			if (jsRedirectMatch) {
				const redirectUrl = jsRedirectMatch[1];
				redirects.push({
					from: snapshot.url,
					to: redirectUrl,
					type: "javascript",
					timestamp: snapshot.timestamp,
				});
			}
		}
	}

	// Remove duplicates
	const uniqueRedirects: RedirectEvent[] = [];
	for (const redirect of redirects) {
		const existing = uniqueRedirects.find(
			(r) => r.from === redirect.from && r.to === redirect.to,
		);
		if (!existing) {
			uniqueRedirects.push(redirect);
		}
	}

	return uniqueRedirects;
}
