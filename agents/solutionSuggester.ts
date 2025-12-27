/**
 * Solution Suggestion Agent
 *
 * Generates actionable code fixes and solutions based on the final diagnosis.
 * This agent runs after the Action Synthesis Agent and provides developers with
 * ready-to-use code snippets and fix instructions.
 *
 * Key Requirements:
 * - Rule-based templates first (high confidence cases)
 * - LLM synthesis for complex or ambiguous cases
 * - Copy-paste ready code snippets
 * - Step-by-step instructions
 * - Alternative approaches when applicable
 */

import { generateText, zodSchema, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type {
	TestFailureFacts,
	FailureCategory,
	ArtifactSignals,
	SelectorAnalysis,
	FinalDiagnosis,
	SolutionSuggestion,
} from "@/types/schemas";
import { SolutionSuggestionSchema } from "@/types/schemas";
import { extractSelector } from "@/tools/extractSelector";
import type { DOMSnapshot } from "@/tools/extractDOM";
import { extractTextFromDOM, findSimilarText } from "@/tools/extractPageText";

/**
 * Input for Solution Suggestion Agent
 */
export interface SolutionSuggesterInput {
	failureFacts: TestFailureFacts;
	failureCategory: FailureCategory;
	artifactSignals: ArtifactSignals | null;
	selectorAnalysis: SelectorAnalysis | null;
	finalDiagnosis: FinalDiagnosis;
	domSnapshot?: DOMSnapshot | null; // Optional: DOM snapshot for text extraction
}

/**
 * Output from Solution Suggestion Agent
 */
export type SolutionSuggesterOutput = SolutionSuggestion | null;

/**
 * Suggest a solution based on the diagnosis
 *
 * @param input - All agent outputs including final diagnosis
 * @returns Solution suggestion or null if insufficient data
 */
export async function suggestSolution(
	input: SolutionSuggesterInput,
): Promise<SolutionSuggesterOutput> {
	const { failureFacts, finalDiagnosis } = input;

	console.log("[SolutionSuggester] Starting solution suggestion for:", {
		testName: failureFacts.testName,
		recommendedAction: finalDiagnosis.recommendedAction,
		verdict: finalDiagnosis.verdict,
	});

	// Step 1: Apply rule-based templates first
	const templateResult = applySolutionTemplates(input);

	// Step 2: If we have a high-confidence template result, use it
	if (templateResult && templateResult.confidence >= 0.8) {
		console.log("[SolutionSuggester] Using high-confidence template result");
		return templateResult;
	}

	// Step 3: Use LLM synthesis for complex cases or when templates are uncertain
	try {
		const llmResult = await synthesizeSolutionWithLLM(input, templateResult);
		console.log("[SolutionSuggester] LLM synthesis result");
		return llmResult;
	} catch (error) {
		console.error("[SolutionSuggester] Error in LLM synthesis:", error);

		// Fallback to template result if available, otherwise return null
		if (templateResult) {
			return templateResult;
		}

		return null;
	}
}

/**
 * Extract full locator from error message
 * Error messages often contain: "Locator: getByRole('heading', { name: 'text' })"
 * Improved to handle nested quotes, braces, and various Playwright API formats
 */
function extractFullLocatorFromError(error: string): string | null {
	// Look for "Locator: " pattern which contains the full locator
	// This is the most reliable source as it shows exactly what Playwright tried to use
	// Handle multiline locators by matching until "Expected:" or end of line
	const locatorMatch = error.match(/Locator:\s*([^\n]+?)(?:\s+Expected:|$)/i);
	if (locatorMatch) {
		return locatorMatch[1].trim();
	}

	// Also try a simpler pattern if the above doesn't match
	const locatorMatch2 = error.match(/Locator:\s*([^\n]+)/i);
	if (locatorMatch2) {
		return locatorMatch2[1].trim();
	}

	// Try to extract getByRole with full options object
	// Match: getByRole('heading', { name: 'text' }) or getByRole('heading', { name: "text" })
	// Handle nested quotes and braces more carefully
	const getByRolePatterns = [
		// Pattern with single quotes: getByRole('heading', { name: 'text' })
		/getByRole\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{[^}]*name:\s*['"]([^'"]+)['"][^}]*\}\s*\)/,
		// Pattern with double quotes: getByRole("heading", { name: "text" })
		/getByRole\s*\(\s*["']([^"']+)["']\s*,\s*\{[^}]*name:\s*["']([^"']+)["'][^}]*\}\s*\)/,
		// Pattern without name option: getByRole('heading')
		/getByRole\s*\(\s*['"]([^'"]+)['"]\s*\)/,
	];

	for (const pattern of getByRolePatterns) {
		const match = error.match(pattern);
		if (match) {
			return match[0];
		}
	}

	// Try other Playwright locator APIs
	const otherLocatorPatterns = [
		/getByText\s*\(\s*['"]([^'"]+)['"]\s*\)/,
		/getByLabel\s*\(\s*['"]([^'"]+)['"]\s*\)/,
		/getByPlaceholder\s*\(\s*['"]([^'"]+)['"]\s*\)/,
		/getByTestId\s*\(\s*['"]([^'"]+)['"]\s*\)/,
		/locator\s*\(\s*['"]([^'"]+)['"]\s*\)/,
	];

	for (const pattern of otherLocatorPatterns) {
		const match = error.match(pattern);
		if (match) {
			return match[0];
		}
	}

	return null;
}

/**
 * Apply rule-based solution templates
 */
function applySolutionTemplates(
	input: SolutionSuggesterInput,
): SolutionSuggestion | null {
	const { failureFacts, failureCategory, selectorAnalysis, finalDiagnosis } =
		input;

	// Template 1: Selector fixes
	if (
		finalDiagnosis.recommendedAction === "fix selector" ||
		finalDiagnosis.recommendedAction === "review selector strategy"
	) {
		if (selectorAnalysis?.suggestedSelector) {
			// Extract original selector - prioritize error message which has full locator
			const fullLocatorFromError = extractFullLocatorFromError(
				failureFacts.error,
			);
			const extractedSelector =
				extractSelector(failureFacts.failedStep) ||
				extractSelector(failureFacts.error);
			const originalCode =
				fullLocatorFromError ||
				extractedSelector?.originalFormat ||
				failureFacts.failedStep;

			return {
				suggestedCode: selectorAnalysis.suggestedSelector,
				originalCode: originalCode,
				explanation:
					selectorAnalysis.suggestionReason ||
					`Replace the fragile selector with a more stable Playwright locator. ${selectorAnalysis.issues.length > 0 ? `Issues found: ${selectorAnalysis.issues.join(", ")}.` : ""}`,
				steps: [
					`Locate the failing test in ${failureFacts.file}`,
					`Find the line where the selector is used (around line ${failureFacts.lineNumber || "N/A"})`,
					`Replace the current selector with: ${selectorAnalysis.suggestedSelector}`,
					`Run the test again to verify the fix`,
				],
				alternativeApproaches: [
					`If the suggested selector doesn't work, try using getByRole with the element's accessible role`,
					`Consider adding a data-testid attribute to the element for more stable testing`,
					`Use getByText if the element has unique visible text`,
				],
				confidence: selectorAnalysis.confidence * 0.9, // Slightly lower than selector analysis confidence
			};
		}
	}

	// Template 2: Timeout fixes
	if (finalDiagnosis.recommendedAction === "increase timeout") {
		const currentTimeout = failureFacts.timeout || 30000; // Default Playwright timeout
		const suggestedTimeout = Math.max(currentTimeout * 2, 60000); // At least 60s

		return {
			suggestedCode: `// Option 1: Set timeout for specific action\nawait page.locator('selector').click({ timeout: ${suggestedTimeout} });\n\n// Option 2: Set timeout globally in test\nawait page.setDefaultTimeout(${suggestedTimeout});\n\n// Option 3: Set timeout in playwright.config.ts\ntest.setTimeout(${suggestedTimeout});`,
			originalCode: failureFacts.timeout
				? `timeout: ${failureFacts.timeout}ms`
				: "default timeout (30s)",
			explanation: `The test timed out after ${currentTimeout}ms. Increase the timeout to ${suggestedTimeout}ms to allow more time for the page or element to load. This is especially important for slow networks or heavy pages.`,
			steps: [
				`Identify the action that timed out: ${failureFacts.failedStep}`,
				`Add a timeout parameter to the specific action, or set a global timeout for the test`,
				`Consider investigating why the page is slow (network issues, heavy resources, etc.)`,
				`Run the test again with the increased timeout`,
			],
			alternativeApproaches: [
				`Instead of increasing timeout, wait for specific conditions: await page.waitForLoadState('networkidle')`,
				`Use waitForSelector with a longer timeout: await page.waitForSelector('selector', { timeout: ${suggestedTimeout} })`,
				`Check if the page has blocking elements (modals, banners) that need to be dismissed first`,
			],
			confidence: 0.75,
		};
	}

	// Template 3: Test logic fixes (assertion failures)
	if (
		finalDiagnosis.recommendedAction === "review test logic" &&
		failureCategory.category === "assertion_failed"
	) {
		return {
			suggestedCode: `// Review your assertion logic\n// Original assertion likely failed because:\n// 1. Expected value doesn't match actual value\n// 2. Element state changed before assertion\n// 3. Async operation not awaited\n\n// Example fix:\nawait expect(page.locator('selector')).toHaveText('expected text');\n// Or:\nawait expect(page.locator('selector')).toBeVisible();`,
			originalCode: failureFacts.failedStep,
			explanation: `The assertion failed, but the page loaded correctly. This suggests the test expectations may be incorrect or the assertion logic needs review. Check if you're asserting the right values or if async operations are properly awaited.`,
			steps: [
				`Review the assertion that failed: ${failureFacts.failedStep}`,
				`Check what the actual value was (see error message or screenshots)`,
				`Verify the expected value matches what the application actually renders`,
				`Ensure all async operations are properly awaited before assertions`,
				`Update the assertion to match the actual behavior`,
			],
			alternativeApproaches: [
				`Use Playwright's auto-waiting assertions: expect(locator).toHaveText() instead of manual checks`,
				`Add explicit waits before assertions: await page.waitForSelector('selector')`,
				`Check if the element state changed between action and assertion`,
			],
			confidence: 0.7,
		};
	}

	// Template 4: Environment/Config fixes (auth errors)
	if (
		finalDiagnosis.recommendedAction === "check environment" &&
		failureCategory.category === "auth_error"
	) {
		return {
			suggestedCode: `// Option 1: Set up authentication in test\nawait page.goto('/login');\nawait page.fill('input[name="email"]', process.env.TEST_EMAIL);\nawait page.fill('input[name="password"]', process.env.TEST_PASSWORD);\nawait page.click('button[type="submit"]');\nawait page.waitForURL('/dashboard');\n\n// Option 2: Use Playwright's authentication storage\n// Save auth state: await page.context().storageState({ path: 'auth.json' });\n// Reuse in tests: use: { storageState: 'auth.json' }`,
			originalCode: null,
			explanation: `Authentication error detected. This suggests the test environment may not be properly configured with credentials, or the authentication flow has changed. Set up proper authentication in your test setup.`,
			steps: [
				`Verify test credentials are available (check environment variables)`,
				`Set up authentication before running the test (in beforeEach or test setup)`,
				`Consider using Playwright's storageState to persist authentication across tests`,
				`Check if the authentication endpoint or flow has changed`,
				`Verify the test environment matches the expected authentication configuration`,
			],
			alternativeApproaches: [
				`Use Playwright's request context for API-based authentication`,
				`Mock authentication in tests if appropriate for your use case`,
				`Check if authentication cookies or tokens are being properly set`,
			],
			confidence: 0.7,
		};
	}

	// Template 5: Navigation errors
	if (
		finalDiagnosis.recommendedAction === "investigate app" &&
		failureCategory.category === "navigation_error"
	) {
		return {
			suggestedCode: `// Add error handling and debugging\nawait page.goto('/path', { waitUntil: 'networkidle', timeout: 60000 });\n\n// Or check for navigation errors:\ntry {\n  await page.goto('/path');\n} catch (error) {\n  console.error('Navigation failed:', error);\n  // Check network tab, server logs, etc.\n}`,
			originalCode: failureFacts.failedStep,
			explanation: `Navigation error indicates the application may be down, the URL is incorrect, or there's a network/server issue. This is typically an application problem, not a test issue.`,
			steps: [
				`Verify the application is running and accessible`,
				`Check if the URL is correct and the route exists`,
				`Review server logs for errors`,
				`Check network connectivity and firewall settings`,
				`Verify the test environment configuration matches the application environment`,
			],
			alternativeApproaches: [
				`Add retry logic for transient network issues`,
				`Use a different waitUntil strategy: 'domcontentloaded' or 'load'`,
				`Check if the application requires specific headers or authentication`,
			],
			confidence: 0.8,
		};
	}

	// No template match, return null to trigger LLM synthesis
	return null;
}

/**
 * Synthesize solution using LLM
 */
async function synthesizeSolutionWithLLM(
	input: SolutionSuggesterInput,
	templateHint: SolutionSuggestion | null,
): Promise<SolutionSuggestion> {
	const {
		failureFacts,
		failureCategory,
		artifactSignals,
		selectorAnalysis,
		finalDiagnosis,
		domSnapshot,
	} = input;

	// Extract original code - prioritize error message which contains full locator
	const fullLocatorFromError = extractFullLocatorFromError(failureFacts.error);
	const extractedSelector =
		extractSelector(failureFacts.failedStep) ||
		extractSelector(failureFacts.error);
	const originalCode =
		fullLocatorFromError ||
		extractedSelector?.originalFormat ||
		failureFacts.failedStep ||
		null;

	// Extract expected text from error message if it's a text-based selector
	let expectedText: string | null = null;
	if (
		failureFacts.error.includes("name:") ||
		failureFacts.error.includes("'") ||
		failureFacts.error.includes('"')
	) {
		// Try to extract text from getByRole with name option
		const nameMatch = failureFacts.error.match(/name:\s*['"]([^'"]+)['"]/);
		if (nameMatch) {
			expectedText = nameMatch[1];
		}
	}

	// Extract actual text from DOM snapshot
	let actualPageTexts = domSnapshot ? extractTextFromDOM(domSnapshot) : [];

	// Also use screenshot analysis visibleContent if available (more reliable for actual visible text)
	if (artifactSignals && artifactSignals.uiState) {
		// Try to extract text hints from UI state description
		// This is a fallback if DOM extraction doesn't work well
	}

	// Detect text mismatch if we have expected text and actual page text
	let textMismatch: {
		expected: string;
		actual: string;
		similarity: number;
	} | null = null;
	if (expectedText) {
		// Always try to find similar text, even if we don't have many page texts
		if (actualPageTexts.length > 0) {
			const similarText = findSimilarText(expectedText, actualPageTexts);
			if (similarText) {
				// If similarity is reasonable and text is different, it's a mismatch
				if (
					similarText.similarity > 0.3 &&
					similarText.text.toLowerCase() !== expectedText.toLowerCase()
				) {
					textMismatch = {
						expected: expectedText,
						actual: similarText.text,
						similarity: similarText.similarity,
					};
				}
			}
		}

		// Also check if expected text contains obvious typos or issues
		// "orderRING!" is likely a typo for "your order!"
		if (
			!textMismatch &&
			expectedText.toLowerCase().includes("ordering") &&
			!expectedText.toLowerCase().includes("your")
		) {
			// This is a hint that there might be a typo, but we need actual page text to confirm
		}
	}

	// Build comprehensive context
	const context = `
Test Failure Context:
- Test: ${failureFacts.testName}
- File: ${failureFacts.file}
- Failed Step: ${failureFacts.failedStep}
- Error: ${failureFacts.error}
${failureFacts.timeout ? `- Timeout: ${failureFacts.timeout}ms` : ""}
${failureFacts.lineNumber ? `- Line: ${failureFacts.lineNumber}` : ""}
${expectedText ? `- Expected Text in Selector: "${expectedText}"` : ""}
${textMismatch ? `- TEXT MISMATCH DETECTED: Test expected "${textMismatch.expected}" but page shows "${textMismatch.actual}" (similarity: ${(textMismatch.similarity * 100).toFixed(0)}%)` : ""}
${actualPageTexts.length > 0 ? `- Actual Text Found on Page: ${actualPageTexts.slice(0, 10).join(", ")}${actualPageTexts.length > 10 ? "..." : ""}` : ""}

Failure Category:
- Category: ${failureCategory.category}
- Confidence: ${(failureCategory.confidence * 100).toFixed(0)}%
- Reasoning: ${failureCategory.reasoning}

Final Diagnosis:
- Verdict: ${finalDiagnosis.verdict}
- Recommended Action: ${finalDiagnosis.recommendedAction}
- Urgency: ${finalDiagnosis.urgency}
- Reason: ${finalDiagnosis.reason}

${
	artifactSignals
		? `
UI State Analysis:
- Page State: ${artifactSignals.pageState}
- UI State: ${artifactSignals.uiState}
- Blocking Factors: ${artifactSignals.blockingFactors.length > 0 ? artifactSignals.blockingFactors.join("; ") : "None"}
`
		: "UI State Analysis: Not available"
}

${
	selectorAnalysis
		? `
Selector Analysis:
- Quality: ${selectorAnalysis.selectorQuality} (score: ${(selectorAnalysis.qualityScore * 100).toFixed(0)}%)
- Issues: ${selectorAnalysis.issues.length > 0 ? selectorAnalysis.issues.join("; ") : "None"}
- Suggested Selector: ${selectorAnalysis.suggestedSelector || "None"}
- Suggestion Reason: ${selectorAnalysis.suggestionReason || "N/A"}
`
		: "Selector Analysis: Not applicable"
}

${originalCode ? `Original Code (from error message): ${originalCode}` : ""}

${
	templateHint
		? `
Template Hint (low confidence, please refine):
- Suggested Code: ${templateHint.suggestedCode || "None"}
- Explanation: ${templateHint.explanation}
`
		: ""
}
`;

	const prompt = `You are an expert Playwright test engineer. Your task is to generate actionable, copy-paste ready code fixes for a failed test.

${context}

CRITICAL: Pay close attention to the error message and actual page content:

1. **Error Message Analysis**: The error message shows the EXACT locator that was used (e.g., "Locator: getByRole('heading', { name: 'Thank you for orderRING!' })")

2. **Text Mismatch Detection**: ${
		textMismatch
			? `🚨 CRITICAL: A TEXT MISMATCH WAS DETECTED! The test expected "${textMismatch.expected}" but the page actually shows "${textMismatch.actual}" (similarity: ${(textMismatch.similarity * 100).toFixed(0)}%). 

YOU MUST USE THE ACTUAL TEXT "${textMismatch.actual}" IN YOUR SUGGESTED CODE, NOT THE INCORRECT EXPECTED TEXT "${textMismatch.expected}".

For example, if the test has: getByRole('heading', { name: '${textMismatch.expected}' })
You MUST suggest: getByRole('heading', { name: '${textMismatch.actual}' })

DO NOT use the incorrect expected text. DO NOT suggest getByText with the wrong text. ALWAYS use "${textMismatch.actual}" which is what's actually on the page.`
			: "Check if there's a text mismatch between what the test expected and what's on the page."
	}

3. **Actual Page Content**: ${actualPageTexts.length > 0 ? `The following text was found on the actual page: ${actualPageTexts.slice(0, 20).join(", ")}. ${textMismatch ? `The correct text "${textMismatch.actual}" is in this list.` : "Use this to suggest the CORRECT selector that matches what's actually visible."}` : "Use the actual page text provided above to suggest the correct selector."}

4. **Selector Correction**: ${textMismatch ? `CRITICAL: You MUST override any selector analysis suggestions and use the CORRECT text "${textMismatch.actual}" instead of the incorrect "${textMismatch.expected}". The selector analysis might suggest the wrong text - IGNORE IT and use the actual text.` : "If the error shows a text mismatch, suggest the CORRECT text that matches what's actually on the page, not the incorrect expected text."}

Based on ALL the information above, provide a comprehensive solution that includes:

1. **suggestedCode**: Specific Playwright code that fixes the issue. This should be:
   - Copy-paste ready
   - Complete and runnable
   - Use proper Playwright best practices (getByRole, getByText, etc. over CSS selectors)
   - ${
			textMismatch
				? `🚨 CRITICAL: You MUST use the ACTUAL text "${textMismatch.actual}" that appears on the page, NOT the incorrect expected text "${textMismatch.expected}". 

Example: If original was getByRole('heading', { name: '${textMismatch.expected}' }), suggest getByRole('heading', { name: '${textMismatch.actual}' }).

DO NOT use "${textMismatch.expected}" - it's wrong. ALWAYS use "${textMismatch.actual}".`
				: "If the error shows a text mismatch, use the CORRECT text that actually appears on the page"
		}
   - ${actualPageTexts.length > 0 && !textMismatch ? `Use one of these actual texts from the page: ${actualPageTexts.slice(0, 5).join(", ")}` : ""}
   - ${textMismatch ? `IGNORE any selector analysis suggestions that use the wrong text. Use "${textMismatch.actual}" instead.` : ""}
   - If the error message shows the full locator with options, match that format exactly
   - Include necessary imports if relevant
   - If no code fix is applicable, return null

2. **originalCode**: The original code that failed. Extract the FULL locator from the error message (e.g., "getByRole('heading', { name: 'Thank you for orderRING!' })"), not just the partial selector. If the error shows "Locator: ...", use that exact locator.

3. **explanation**: A clear 2-3 sentence explanation of:
   - What the fix does
   - Why it solves the problem (e.g., "The test expected 'orderRING!' but the page shows 'your order!' - use the correct text")
   - What was wrong with the original approach

4. **steps**: Step-by-step instructions (3-5 steps) for implementing the fix:
   - Be specific and actionable
   - Reference the file and line number if available
   - Include verification steps

5. **alternativeApproaches**: 2-3 alternative solutions if the primary fix doesn't work or if there are multiple valid approaches

6. **confidence**: Your confidence in this solution (0-1), considering:
   - How clear the failure cause is
   - Whether you have enough context
   - How certain you are the fix will work

Important guidelines:
- If the error message shows a text mismatch, the solution MUST use the correct text that appears on the page
- Prioritize Playwright best practices (semantic selectors over CSS)
- Make code snippets complete and runnable
- Be specific to this exact failure, not generic advice
- Extract the FULL original locator from the error message, including all options
- If the recommended action is "investigate app", focus on debugging steps rather than code fixes
- If confidence is low (< 0.6), still provide a solution but make it clear it's a best guess`;

	try {
		const result = await generateText({
			model: openai("gpt-4o"),
			output: Output.object({
				schema: zodSchema(SolutionSuggestionSchema),
			}),
			prompt,
		});

		return result.output;
	} catch (error) {
		console.error("Error in LLM solution synthesis:", error);
		throw error;
	}
}

/**
 * Suggest solutions for multiple failures
 *
 * @param inputs - Array of solution suggester inputs
 * @returns Array of solution suggestions (or null for each)
 */
export async function suggestSolutions(
	inputs: SolutionSuggesterInput[],
): Promise<Array<SolutionSuggestion | null>> {
	if (inputs.length === 0) {
		return [];
	}

	// Process all suggestions (can be parallelized)
	const suggestions = await Promise.all(
		inputs.map((input) => suggestSolution(input)),
	);

	return suggestions;
}
