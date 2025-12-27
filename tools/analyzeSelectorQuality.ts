/**
 * Analyze selector quality using rule-based heuristics
 *
 * Evaluates selectors based on:
 * - Semantic vs CSS (prefer semantic)
 * - Stability (deep nesting, dynamic content)
 * - Uniqueness
 * - Attribute stability (data-testid, aria-label, role)
 * - Specificity balance
 */

import type { ExtractedSelector } from "./extractSelector";

/**
 * Quality analysis result
 */
export interface SelectorQualityAnalysis {
	qualityScore: number; // 0-1
	qualityRating: "excellent" | "good" | "fragile" | "poor";
	issues: string[];
	strengths: string[];
}

/**
 * Analyze selector quality using heuristics
 *
 * @param extractedSelector - The extracted selector information
 * @param domHtml - Optional DOM HTML to check for uniqueness
 * @returns Quality analysis result
 */
export function analyzeSelectorQuality(
	extractedSelector: ExtractedSelector,
	domHtml?: string,
): SelectorQualityAnalysis {
	const issues: string[] = [];
	const strengths: string[] = [];
	let score = 1.0; // Start with perfect score, deduct for issues

	const { selector, type, isPlaywrightAPI } = extractedSelector;

	// Heuristic 1: Semantic vs CSS
	if (type === "playwright_locator" && isPlaywrightAPI) {
		strengths.push("Uses Playwright semantic locator API");
		// Check which semantic API
		if (selector.includes("getByRole")) {
			strengths.push("Uses role-based locator (most stable)");
		} else if (selector.includes("getByTestId")) {
			strengths.push("Uses test ID locator (stable for testing)");
		} else if (selector.includes("getByLabel")) {
			strengths.push("Uses label-based locator (accessible)");
		} else if (selector.includes("getByText")) {
			// Text-based can be fragile if content changes
			issues.push("Text-based selector may break if content changes");
			score -= 0.2;
		}
	} else if (type === "css") {
		issues.push("Uses CSS selector instead of semantic Playwright locator");
		score -= 0.3;

		// Check for fragile CSS patterns
		if (selector.includes(" > ")) {
			const depth = (selector.match(/ > /g) || []).length;
			if (depth >= 3) {
				issues.push(
					`Deep nesting detected (${depth} levels) - fragile to DOM structure changes`,
				);
				score -= 0.2;
			} else if (depth >= 2) {
				issues.push(
					`Moderate nesting (${depth} levels) - may break with layout changes`,
				);
				score -= 0.1;
			}
		}

		// Check for class-based selectors (can be fragile)
		if (selector.startsWith(".") || selector.includes(".")) {
			issues.push("Class-based selector may change with styling updates");
			score -= 0.15;
		}

		// Check for ID selectors (more stable but not semantic)
		if (selector.startsWith("#")) {
			strengths.push("Uses ID selector (relatively stable)");
			score += 0.1; // Slight bonus for ID
		}

		// Check for data attributes (good for testing)
		if (
			selector.includes("[data-testid") ||
			selector.includes("[data-test-id")
		) {
			strengths.push("Uses data-testid attribute (stable for testing)");
			score += 0.2;
		} else if (selector.includes("[data-")) {
			strengths.push("Uses data attribute (more stable than class)");
			score += 0.1;
		}
	} else if (type === "text") {
		issues.push("Text-based selector is fragile to content changes");
		score -= 0.4;

		// Check if text looks dynamic
		if (selector.match(/\d{4}|\d{2}\/\d{2}/)) {
			issues.push("Text contains dates/numbers - likely dynamic content");
			score -= 0.2;
		}
	} else if (type === "unknown") {
		issues.push("Selector type could not be determined");
		score -= 0.1;
	}

	// Heuristic 2: Check for dynamic content indicators
	if (selector.match(/\d+$/)) {
		// Ends with numbers (e.g., "item-123")
		issues.push("Selector ends with numbers - may be dynamically generated");
		score -= 0.15;
	}

	if (
		selector.includes("random") ||
		selector.includes("uuid") ||
		selector.includes("id-")
	) {
		issues.push("Selector contains dynamic identifier patterns");
		score -= 0.25;
	}

	// Heuristic 3: Check specificity (too generic or too specific)
	if (type === "css") {
		// Too generic: single tag name
		if (/^[a-z]+$/.test(selector.trim())) {
			issues.push(
				"Selector is too generic (single tag name) - may match multiple elements",
			);
			score -= 0.3;
		}

		// Too specific: very long selector
		if (selector.length > 100) {
			issues.push("Selector is very long - may be overly specific and fragile");
			score -= 0.15;
		}
	}

	// Heuristic 4: Check for non-unique patterns (if DOM available)
	if (domHtml && type === "css") {
		// Simple check: count occurrences of the selector pattern
		// This is a basic heuristic - full CSS selector matching would require a parser
		const tagMatch = selector.match(/^([a-z]+)/i);
		if (tagMatch) {
			const tagName = tagMatch[1];
			const tagCount = (
				domHtml.match(new RegExp(`<${tagName}[^>]*>`, "gi")) || []
			).length;
			if (tagCount > 10) {
				issues.push(
					`Many ${tagName} elements found in DOM - selector may not be unique`,
				);
				score -= 0.1;
			}
		}
	}

	// Heuristic 5: Check for accessibility attributes
	if (type === "css") {
		if (selector.includes("[aria-label") || selector.includes("[role=")) {
			strengths.push("Uses accessibility attributes (good practice)");
			score += 0.15;
		}
	}

	// Heuristic 6: Check for common anti-patterns
	const antiPatterns = [
		{
			pattern: /body > /i,
			issue: "Selector starts from body - overly specific",
		},
		{
			pattern: /html > /i,
			issue: "Selector starts from html - overly specific",
		},
		{
			pattern: /:nth-child\(\d+\)/i,
			issue: "Uses nth-child - fragile to DOM order changes",
		},
		{
			pattern: /:first-child|:last-child/i,
			issue: "Uses positional pseudo-selectors - fragile",
		},
	];

	for (const { pattern, issue } of antiPatterns) {
		if (pattern.test(selector)) {
			issues.push(issue);
			score -= 0.2;
		}
	}

	// Normalize score to 0-1 range
	score = Math.max(0, Math.min(1, score));

	// Determine quality rating
	let qualityRating: "excellent" | "good" | "fragile" | "poor";
	if (score >= 0.8) {
		qualityRating = "excellent";
	} else if (score >= 0.6) {
		qualityRating = "good";
	} else if (score >= 0.4) {
		qualityRating = "fragile";
	} else {
		qualityRating = "poor";
	}

	return {
		qualityScore: score,
		qualityRating,
		issues: issues.length > 0 ? issues : ["No major issues detected"],
		strengths: strengths.length > 0 ? strengths : [],
	};
}
