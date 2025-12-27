/**
 * Pattern matching rules for failure classification
 *
 * These patterns are used to deterministically classify failures
 * before falling back to LLM reasoning for ambiguous cases.
 */

import type { TestFailureFacts } from "@/types/schemas";

export interface PatternMatchResult {
	category:
		| "selector_not_found"
		| "timeout"
		| "assertion_failed"
		| "navigation_error"
		| "auth_error"
		| "unknown";
	confidence: number;
	matchedPatterns: string[];
}

/**
 * Apply pattern matching to classify a failure
 * Returns null if no clear pattern matches
 */
export function applyPatternMatching(
	facts: TestFailureFacts,
): PatternMatchResult | null {
	const errorLower = facts.error.toLowerCase();
	const stepLower = facts.failedStep.toLowerCase();
	const stackTraceText = facts.stackTrace?.join("\n").toLowerCase() || "";

	// Combine all text for pattern matching
	const combinedText = `${errorLower} ${stepLower} ${stackTraceText}`;

	const matches: Array<{
		category: PatternMatchResult["category"];
		score: number;
		patterns: string[];
	}> = [];

	// Check selector_not_found patterns
	const selectorPatterns = [
		/element\(s\) not found/i,
		/locator\.waitfor/i,
		/waiting for selector/i,
		/timeout.*exceeded.*selector/i,
		/selector.*not found/i,
		/locator.*not found/i,
		/getbyrole|getbytext|getbylabel|getbyplaceholder|getbyalttext|getbytitle/i,
		/data-testid|id=|class=/i,
	];
	const selectorMatches = selectorPatterns.filter((p) => p.test(combinedText));
	if (selectorMatches.length > 0) {
		matches.push({
			category: "selector_not_found",
			score:
				selectorMatches.length * 0.15 +
				(errorLower.includes("element") ? 0.2 : 0),
			patterns: selectorMatches.map((p) => p.toString()),
		});
	}

	// Check timeout patterns
	const timeoutPatterns = [
		/timeout.*exceeded/i,
		/timed out/i,
		/waiting for.*timeout/i,
		/exceeded.*waiting/i,
	];
	const timeoutMatches = timeoutPatterns.filter((p) => p.test(combinedText));
	const hasTimeoutValue = facts.timeout !== undefined && facts.timeout > 0;
	if (timeoutMatches.length > 0 || hasTimeoutValue) {
		matches.push({
			category: "timeout",
			score: timeoutMatches.length * 0.2 + (hasTimeoutValue ? 0.3 : 0),
			patterns: timeoutMatches.map((p) => p.toString()),
		});
	}

	// Check assertion_failed patterns
	const assertionPatterns = [
		/expect.*failed/i,
		/tobevisible.*failed/i,
		/tohavetext.*failed/i,
		/tohavevalue.*failed/i,
		/assertionerror/i,
		/expected.*but.*received/i,
		/expected:.*actual:/i,
	];
	const assertionMatches = assertionPatterns.filter((p) =>
		p.test(combinedText),
	);
	const hasExpectInStep = /expect|assert/i.test(stepLower);
	if (assertionMatches.length > 0 || hasExpectInStep) {
		matches.push({
			category: "assertion_failed",
			score: assertionMatches.length * 0.2 + (hasExpectInStep ? 0.25 : 0),
			patterns: assertionMatches.map((p) => p.toString()),
		});
	}

	// Check navigation_error patterns
	const navigationPatterns = [
		/navigation.*timeout/i,
		/page\.goto/i,
		/net::err/i,
		/404|500|502|503|504/i,
		/failed to navigate/i,
		/navigation.*failed/i,
		/network.*error/i,
		/connection.*refused/i,
	];
	const navigationMatches = navigationPatterns.filter((p) =>
		p.test(combinedText),
	);
	const hasNavigationStep = /goto|navigate|reload|go\(/i.test(stepLower);
	if (navigationMatches.length > 0 || hasNavigationStep) {
		matches.push({
			category: "navigation_error",
			score: navigationMatches.length * 0.2 + (hasNavigationStep ? 0.25 : 0),
			patterns: navigationMatches.map((p) => p.toString()),
		});
	}

	// Check auth_error patterns
	const authPatterns = [
		/unauthorized/i,
		/forbidden/i,
		/401|403/i,
		/authentication.*failed/i,
		/login.*failed/i,
		/session.*expired/i,
		/access.*denied/i,
		/invalid.*credentials/i,
	];
	const authMatches = authPatterns.filter((p) => p.test(combinedText));
	const hasAuthStep = /login|auth|session|credential/i.test(stepLower);
	if (authMatches.length > 0 || hasAuthStep) {
		matches.push({
			category: "auth_error",
			score: authMatches.length * 0.2 + (hasAuthStep ? 0.25 : 0),
			patterns: authMatches.map((p) => p.toString()),
		});
	}

	// If no matches, return null (will use LLM)
	if (matches.length === 0) {
		return null;
	}

	// Find the best match (highest score)
	const bestMatch = matches.reduce((best, current) =>
		current.score > best.score ? current : best,
	);

	// Normalize confidence (cap at 0.95 for pattern matching, leave room for LLM)
	const confidence = Math.min(bestMatch.score, 0.95);

	return {
		category: bestMatch.category,
		confidence,
		matchedPatterns: bestMatch.patterns,
	};
}

/**
 * Check if pattern matching result has high confidence
 */
export function isHighConfidence(result: PatternMatchResult): boolean {
	return result.confidence >= 0.8;
}

/**
 * Check if pattern matching result has medium confidence
 */
export function isMediumConfidence(result: PatternMatchResult): boolean {
	return result.confidence >= 0.5 && result.confidence < 0.8;
}
