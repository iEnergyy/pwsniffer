/**
 * Extract visible text content from DOM snapshots
 *
 * This tool extracts text that would be visible to users and Playwright,
 * which can be used to detect text mismatches and suggest correct selectors.
 */

import type { DOMSnapshot } from "./extractDOM";

/**
 * Extract visible text from DOM HTML
 * Removes script, style, and hidden elements
 */
export function extractVisibleText(html: string): string[] {
	if (!html) return [];

	// Remove script and style tags and their content
	let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
	cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
	cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ""); // Remove comments

	// Extract text from common heading and text elements
	const textElements: string[] = [];

	// Extract headings (h1-h6) - handle nested elements
	const headingMatches = cleaned.matchAll(
		/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi,
	);
	for (const match of headingMatches) {
		// Remove nested HTML tags and get just the text
		const text = match[1]
			.replace(/<[^>]+>/g, "")
			.trim()
			.replace(/\s+/g, " ");
		if (text && !isHidden(match[0])) {
			textElements.push(text);
		}
	}

	// Extract text from elements with role="heading" - handle nested elements
	const roleHeadingMatches = cleaned.matchAll(
		/<[^>]+role=["']heading["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
	);
	for (const match of roleHeadingMatches) {
		// Remove nested HTML tags and get just the text
		const text = match[1]
			.replace(/<[^>]+>/g, "")
			.trim()
			.replace(/\s+/g, " ");
		if (text && !isHidden(match[0])) {
			textElements.push(text);
		}
	}

	// Also extract all text content from any element (fallback for complex structures)
	// This helps catch text that might be in divs, spans, etc. with heading-like text
	const allTextMatches = cleaned.matchAll(/>([^<]{10,})</g);
	for (const match of allTextMatches) {
		const text = match[1].trim().replace(/\s+/g, " ");
		// Only add if it looks like meaningful text (not just whitespace or single words)
		if (text.length > 10 && !text.match(/^[\d\s\W]+$/)) {
			textElements.push(text);
		}
	}

	// Extract aria-label attributes
	const ariaLabelMatches = cleaned.matchAll(/aria-label=["']([^"']+)["']/gi);
	for (const match of ariaLabelMatches) {
		const text = match[1].trim();
		if (text) {
			textElements.push(text);
		}
	}

	// Extract button text
	const buttonMatches = cleaned.matchAll(/<button[^>]*>([^<]+)<\/button>/gi);
	for (const match of buttonMatches) {
		const text = match[1].trim();
		if (text && !isHidden(match[0])) {
			textElements.push(text);
		}
	}

	// Extract text from elements with data-testid (often important for testing)
	const testIdMatches = cleaned.matchAll(
		/<[^>]+data-testid=["']([^"']+)["'][^>]*>([^<]+)<\/[^>]+>/gi,
	);
	for (const match of testIdMatches) {
		const text = match[2].trim();
		if (text && !isHidden(match[0])) {
			textElements.push(text);
		}
	}

	// Remove duplicates and empty strings
	return [...new Set(textElements.filter((t) => t.length > 0))];
}

/**
 * Check if an element is likely hidden
 */
function isHidden(elementHtml: string): boolean {
	const lower = elementHtml.toLowerCase();
	return (
		lower.includes("hidden") ||
		lower.includes("display: none") ||
		lower.includes("visibility: hidden") ||
		lower.includes('aria-hidden="true"')
	);
}

/**
 * Extract text content from a DOM snapshot
 *
 * @param domSnapshot - DOM snapshot from trace
 * @returns Array of visible text strings found on the page
 */
export function extractTextFromDOM(domSnapshot: DOMSnapshot | null): string[] {
	if (!domSnapshot || !domSnapshot.html) {
		return [];
	}

	return extractVisibleText(domSnapshot.html);
}

/**
 * Find similar text using fuzzy matching
 * Useful for detecting typos or close matches
 */
export function findSimilarText(
	expectedText: string,
	actualTexts: string[],
): { text: string; similarity: number } | null {
	if (!expectedText || actualTexts.length === 0) {
		return null;
	}

	const normalizedExpected = expectedText.toLowerCase().trim();

	// Exact match
	for (const actual of actualTexts) {
		if (actual.toLowerCase().trim() === normalizedExpected) {
			return { text: actual, similarity: 1.0 };
		}
	}

	// Contains match
	for (const actual of actualTexts) {
		const normalizedActual = actual.toLowerCase().trim();
		if (
			normalizedActual.includes(normalizedExpected) ||
			normalizedExpected.includes(normalizedActual)
		) {
			return { text: actual, similarity: 0.8 };
		}
	}

	// Fuzzy match - lower threshold for better detection
	let bestMatch: { text: string; similarity: number } | null = null;
	let bestSimilarity = 0.3; // Lower threshold to catch more matches

	for (const actual of actualTexts) {
		const similarity = calculateSimilarity(normalizedExpected, actual);
		if (similarity > bestSimilarity) {
			bestSimilarity = similarity;
			bestMatch = { text: actual, similarity };
		}
	}

	return bestMatch;
}

/**
 * Improved similarity calculation using word-based matching
 * Better for detecting "Thank you for orderRING!" vs "Thank you for your order!"
 */
function calculateSimilarity(str1: string, str2: string): number {
	const longer = str1.length > str2.length ? str1 : str2;
	const shorter = str1.length > str2.length ? str2 : str1;

	if (longer.length === 0) return 1.0;

	// Normalize: lowercase, remove punctuation for comparison
	const normalize = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^\w\s]/g, "")
			.trim();
	const norm1 = normalize(str1);
	const norm2 = normalize(str2);

	// Exact match after normalization
	if (norm1 === norm2) return 1.0;

	// Word-based similarity
	const words1 = norm1.split(/\s+/).filter((w) => w.length > 0);
	const words2 = norm2.split(/\s+/).filter((w) => w.length > 0);

	if (words1.length === 0 || words2.length === 0) return 0;

	// Count matching words
	let matchingWords = 0;
	const shorterWords = words1.length < words2.length ? words1 : words2;
	const longerWords = words1.length >= words2.length ? words1 : words2;

	for (const word of shorterWords) {
		if (longerWords.includes(word)) {
			matchingWords++;
		}
	}

	// Calculate similarity based on word overlap
	const wordSimilarity = matchingWords / Math.max(words1.length, words2.length);

	// Also check character-level similarity for partial matches
	let charMatches = 0;
	const minLen = Math.min(norm1.length, norm2.length);
	for (let i = 0; i < minLen; i++) {
		if (norm1[i] === norm2[i]) {
			charMatches++;
		}
	}
	const charSimilarity = charMatches / Math.max(norm1.length, norm2.length);

	// Combine word and character similarity (weight word similarity more)
	return wordSimilarity * 0.7 + charSimilarity * 0.3;
}
