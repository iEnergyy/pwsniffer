/**
 * Extract selector from failed test step
 *
 * Handles various selector formats:
 * - CSS selectors: #id, .class, [attr=value], div > span
 * - Playwright locators: getByRole('button'), getByText('Login'), locator('#id')
 * - Text-based: 'Login', "Submit"
 */

/**
 * Extracted selector information
 */
export interface ExtractedSelector {
	selector: string;
	type: "css" | "playwright_locator" | "text" | "unknown";
	originalFormat: string;
	isPlaywrightAPI: boolean;
}

/**
 * Extract selector from a failed step string
 *
 * @param failedStep - The failed step description from test failure
 * @returns Extracted selector information or null if no selector found
 */
export function extractSelector(failedStep: string): ExtractedSelector | null {
	console.log(
		"[extractSelector] Attempting to extract selector from:",
		failedStep,
	);

	if (!failedStep || typeof failedStep !== "string") {
		console.log("[extractSelector] Invalid input - not a string or empty");
		return null;
	}

	// Handle "Locator: " prefix in error messages
	let textToSearch = failedStep;
	if (textToSearch.includes("Locator:")) {
		// Extract the part after "Locator: "
		const locatorMatch = textToSearch.match(/Locator:\s*(.+?)(?:\n|$)/i);
		if (locatorMatch) {
			textToSearch = locatorMatch[1].trim();
			console.log(
				'[extractSelector] Found "Locator:" prefix, extracted:',
				textToSearch,
			);
		}
	}

	// Try to extract Playwright locator patterns first (most common)
	// Patterns: getByRole('button'), getByText('Login'), getByLabel('Email'), etc.
	const playwrightLocatorPatterns = [
		{
			name: "getByRole",
			pattern: /getByRole\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{[^}]*\})?\s*\)/i,
		},
		{ name: "getByText", pattern: /getByText\s*\(\s*['"]([^'"]+)['"]\s*\)/i },
		{ name: "getByLabel", pattern: /getByLabel\s*\(\s*['"]([^'"]+)['"]\s*\)/i },
		{
			name: "getByPlaceholder",
			pattern: /getByPlaceholder\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
		},
		{
			name: "getByAltText",
			pattern: /getByAltText\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
		},
		{ name: "getByTitle", pattern: /getByTitle\s*\(\s*['"]([^'"]+)['"]\s*\)/i },
		{
			name: "getByTestId",
			pattern: /getByTestId\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
		},
		{ name: "locator", pattern: /locator\s*\(\s*['"]([^'"]+)['"]\s*\)/i },
	];

	console.log("[extractSelector] Trying Playwright locator patterns...");
	for (const { name, pattern } of playwrightLocatorPatterns) {
		const match = textToSearch.match(pattern);
		if (match) {
			const selector = match[1];
			const fullMatch = match[0];
			console.log(`[extractSelector] ✓ Matched ${name} pattern:`, {
				selector,
				fullMatch,
			});

			// Determine the Playwright API type
			const apiType =
				fullMatch.match(/getBy(\w+)|locator/i)?.[1]?.toLowerCase() || "locator";
			const isPlaywrightAPI = !fullMatch.toLowerCase().includes("locator(");

			return {
				selector,
				type: "playwright_locator",
				originalFormat: fullMatch,
				isPlaywrightAPI,
			};
		} else {
			console.log(`[extractSelector] ✗ ${name} pattern did not match`);
		}
	}

	// Try to extract CSS selector patterns
	// Patterns: #id, .class, [attr=value], div > span, etc.
	console.log("[extractSelector] Trying CSS selector patterns...");
	const cssSelectorPatterns = [
		{ name: "ID selector (#id)", pattern: /#([\w-]+)/ },
		{ name: "Class selector (.class)", pattern: /\.([\w-]+)/ },
		{
			name: "Attribute selector ([attr=value])",
			pattern: /\[([\w-]+)(?:=["']([^"']+)["'])?\]/,
		},
		{
			name: "Complex CSS (div > span)",
			pattern: /([\w-]+\s*(?:[>+~]\s*[\w-]+|\.[\w-]+|#[\w-]+)+)/,
		},
	];

	for (const { name, pattern } of cssSelectorPatterns) {
		const match = textToSearch.match(pattern);
		if (match) {
			const selector = match[0];
			console.log(`[extractSelector] ✓ Matched ${name} pattern:`, selector);
			return {
				selector,
				type: "css",
				originalFormat: selector,
				isPlaywrightAPI: false,
			};
		} else {
			console.log(`[extractSelector] ✗ ${name} pattern did not match`);
		}
	}

	// Try to extract quoted strings (text-based selectors)
	// Patterns: 'Login', "Submit", 'Click me'
	console.log("[extractSelector] Trying text-based selector patterns...");
	const textPattern = /['"]([^'"]{1,100})['"]/;
	const textMatch = textToSearch.match(textPattern);
	if (textMatch) {
		const selector = textMatch[1];
		console.log("[extractSelector] Found quoted string:", selector);
		// Check if it looks like a selector (not just error text)
		// If it contains common selector characters or is short, likely a selector
		if (
			selector.length < 50 &&
			!selector.includes("Error") &&
			!selector.includes("failed")
		) {
			console.log("[extractSelector] ✓ Quoted string looks like a selector");
			return {
				selector,
				type: "text",
				originalFormat: textMatch[0],
				isPlaywrightAPI: false,
			};
		} else {
			console.log(
				"[extractSelector] ✗ Quoted string rejected (too long or contains error keywords)",
			);
		}
	} else {
		console.log("[extractSelector] ✗ No quoted string found");
	}

	// Try to find any quoted string that might be a selector
	// This is a fallback for edge cases
	console.log("[extractSelector] Trying fallback: any quoted string...");
	const anyQuotedString = textToSearch.match(/['"]([^'"]+)['"]/);
	if (anyQuotedString) {
		const selector = anyQuotedString[1];
		console.log("[extractSelector] Found quoted string in fallback:", selector);
		// Heuristic: if it's a short string and doesn't look like an error message
		if (selector.length < 100 && !selector.toLowerCase().includes("error")) {
			console.log("[extractSelector] ✓ Fallback quoted string accepted");
			return {
				selector,
				type: "unknown",
				originalFormat: anyQuotedString[0],
				isPlaywrightAPI: false,
			};
		} else {
			console.log("[extractSelector] ✗ Fallback quoted string rejected");
		}
	} else {
		console.log("[extractSelector] ✗ No quoted string found in fallback");
	}

	console.log(
		"[extractSelector] ✗ No selector found after trying all patterns",
	);
	return null;
}

/**
 * Extract multiple selectors from a failed step (if multiple are present)
 *
 * @param failedStep - The failed step description
 * @returns Array of extracted selectors
 */
export function extractSelectors(failedStep: string): ExtractedSelector[] {
	const selectors: ExtractedSelector[] = [];
	const extracted = extractSelector(failedStep);

	if (extracted) {
		selectors.push(extracted);
	}

	// Try to find additional selectors in the same step
	// This handles cases like: "click('#button') then wait for '.spinner'"
	const remainingText = failedStep;
	const quotedStrings = remainingText.matchAll(/['"]([^'"]+)['"]/g);

	for (const match of quotedStrings) {
		const potentialSelector = match[1];
		// Skip if we already found this selector
		if (extracted && extracted.selector === potentialSelector) {
			continue;
		}

		// Try to extract this as a selector
		const additional = extractSelector(match[0]);
		if (
			additional &&
			!selectors.some((s) => s.selector === additional.selector)
		) {
			selectors.push(additional);
		}
	}

	return selectors;
}
