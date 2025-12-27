/**
 * Selector Heuristics Agent
 *
 * Evaluates selector quality and suggests better alternatives using:
 * - Rule-based heuristics (fast, deterministic)
 * - DOM analysis (finds element attributes)
 * - LLM synthesis (final quality score and reasoning)
 *
 * Key Requirements:
 * - Only runs for selector-related failures
 * - Tools-first approach before LLM
 * - Graceful degradation when DOM unavailable
 * - Playwright-first suggestions
 */

import { generateText, zodSchema, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type {
	TestFailureFacts,
	FailureCategory,
	SelectorAnalysis,
} from "@/types/schemas";
import { SelectorAnalysisSchema } from "@/types/schemas";
import type { DOMSnapshot } from "@/tools/extractDOM";
import type { ActionEvent } from "@/tools/readTrace";
import { extractSelector } from "@/tools/extractSelector";
import { analyzeSelectorQuality } from "@/tools/analyzeSelectorQuality";
import { suggestSelector } from "@/tools/suggestSelector";

/**
 * Input for Selector Heuristics Agent
 */
export interface SelectorHeuristicsInput {
	failureFacts: TestFailureFacts;
	failureCategory: FailureCategory;
	domSnapshot: DOMSnapshot | null;
	failedAction?: ActionEvent | null; // Optional: failed action from trace
}

/**
 * Output from Selector Heuristics Agent
 */
export type SelectorHeuristicsOutput = SelectorAnalysis | null;

/**
 * Analyze selector quality and suggest improvements
 *
 * @param input - Failure facts, category, and DOM snapshot
 * @returns Selector analysis or null if not applicable
 */
export async function analyzeSelectorHeuristics(
	input: SelectorHeuristicsInput,
): Promise<SelectorHeuristicsOutput> {
	const { failureFacts, failureCategory, domSnapshot } = input;

	console.log("[SelectorHeuristics] Starting analysis for:", {
		testName: failureFacts.testName,
		failedStep: failureFacts.failedStep,
		error: failureFacts.error,
		category: failureCategory.category,
	});

	// Step 1: Check if this is selector-related
	const isSelectorRelated =
		failureCategory.category === "selector_not_found" ||
		failureFacts.failedStep.toLowerCase().includes("selector") ||
		failureFacts.failedStep.toLowerCase().includes("locator") ||
		failureFacts.error.toLowerCase().includes("element") ||
		failureFacts.error.toLowerCase().includes("selector");

	console.log("[SelectorHeuristics] Selector-related check:", {
		isSelectorRelated,
		category: failureCategory.category,
		failedStepContainsSelector: failureFacts.failedStep
			.toLowerCase()
			.includes("selector"),
		failedStepContainsLocator: failureFacts.failedStep
			.toLowerCase()
			.includes("locator"),
		errorContainsElement: failureFacts.error.toLowerCase().includes("element"),
		errorContainsSelector: failureFacts.error
			.toLowerCase()
			.includes("selector"),
	});

	if (!isSelectorRelated) {
		console.log(
			"[SelectorHeuristics] Not a selector-related failure, skipping",
		);
		return null; // Not a selector-related failure
	}

	// Step 2: Extract selector from failed step, error message, or trace action
	console.log("[SelectorHeuristics] Attempting to extract selector from:");
	console.log("  - Failed step:", failureFacts.failedStep);
	console.log("  - Error message:", failureFacts.error.substring(0, 200));

	// Try failed step first
	let extractedSelector = extractSelector(failureFacts.failedStep);

	// If not found in failed step, try error message (often contains "Locator: ...")
	if (!extractedSelector) {
		console.log(
			"[SelectorHeuristics] Trying to extract selector from error message...",
		);
		extractedSelector = extractSelector(failureFacts.error);

		if (extractedSelector) {
			console.log(
				"[SelectorHeuristics] Successfully extracted selector from error message:",
				{
					selector: extractedSelector.selector,
					type: extractedSelector.type,
					originalFormat: extractedSelector.originalFormat,
				},
			);
		} else {
			console.log(
				"[SelectorHeuristics] Failed to extract selector from error message",
			);
		}
	} else {
		console.log(
			"[SelectorHeuristics] Successfully extracted selector from failed step:",
			{
				selector: extractedSelector.selector,
				type: extractedSelector.type,
				originalFormat: extractedSelector.originalFormat,
			},
		);
	}

	// If no selector found in failed step text, try to get it from trace action
	if (!extractedSelector && input.failedAction?.action?.selector) {
		const traceSelector = input.failedAction.action.selector;
		console.log(
			"[SelectorHeuristics] Found selector in trace action:",
			traceSelector,
		);

		// Determine selector type
		let selectorType: "css" | "playwright_locator" | "text" | "unknown";
		if (
			traceSelector.startsWith("#") ||
			traceSelector.startsWith(".") ||
			traceSelector.includes("[")
		) {
			selectorType = "css";
		} else if (
			traceSelector.includes("getBy") ||
			traceSelector.includes("locator")
		) {
			selectorType = "playwright_locator";
		} else {
			selectorType = "unknown";
		}

		// Create a synthetic extracted selector from trace
		extractedSelector = {
			selector: traceSelector,
			type: selectorType,
			originalFormat: traceSelector,
			isPlaywrightAPI:
				traceSelector.includes("getBy") || traceSelector.includes("locator"),
		};
		console.log(
			"[SelectorHeuristics] Created extracted selector from trace:",
			extractedSelector,
		);
	} else if (!extractedSelector) {
		console.log("[SelectorHeuristics] No selector found in trace action:", {
			hasFailedAction: !!input.failedAction,
			hasAction: !!input.failedAction?.action,
			hasSelector: !!input.failedAction?.action?.selector,
			actionName: input.failedAction?.action?.name,
			fullAction: input.failedAction?.action,
		});
	}

	if (!extractedSelector) {
		console.log(
			"[SelectorHeuristics] No selector found - cannot analyze. Summary:",
			{
				failedStep: failureFacts.failedStep,
				error: failureFacts.error,
				hasTraceAction: !!input.failedAction,
				traceActionSelector: input.failedAction?.action?.selector || "N/A",
			},
		);
		// No selector found - can't analyze
		return null;
	}

	// At this point, extractedSelector is guaranteed to be non-null
	const selector = extractedSelector;

	// Step 3: Analyze selector quality using heuristics
	const qualityAnalysis = analyzeSelectorQuality(selector, domSnapshot?.html);

	// Step 4: Suggest alternative selector if DOM available
	let selectorSuggestion: {
		suggestedSelector: string;
		reason: string;
		confidence: number;
	} | null = null;
	if (domSnapshot) {
		const suggestion = suggestSelector(selector, domSnapshot);
		if (suggestion) {
			selectorSuggestion = {
				suggestedSelector: suggestion.suggestedSelector,
				reason: suggestion.reason,
				confidence: suggestion.confidence,
			};
		}
	}

	// Step 5: Synthesize final analysis using LLM
	const finalAnalysis = await synthesizeSelectorAnalysis({
		extractedSelector: selector,
		qualityAnalysis,
		selectorSuggestion,
		failureFacts,
		failureCategory,
	});

	return finalAnalysis;
}

/**
 * Internal structure for synthesis
 */
interface SynthesisInput {
	extractedSelector: ReturnType<typeof extractSelector>;
	qualityAnalysis: ReturnType<typeof analyzeSelectorQuality>;
	selectorSuggestion: {
		suggestedSelector: string;
		reason: string;
		confidence: number;
	} | null;
	failureFacts: TestFailureFacts;
	failureCategory: FailureCategory;
}

/**
 * Synthesize selector analysis using LLM
 */
async function synthesizeSelectorAnalysis(
	input: SynthesisInput,
): Promise<SelectorAnalysis> {
	const {
		extractedSelector,
		qualityAnalysis,
		selectorSuggestion,
		failureFacts,
		failureCategory,
	} = input;

	// extractedSelector is guaranteed to be non-null (checked before calling this function)
	if (!extractedSelector) {
		throw new Error("extractedSelector is required for synthesis");
	}

	// Build context for LLM
	const context = `
Test Failure Context:
- Test: ${failureFacts.testName}
- Failed Step: ${failureFacts.failedStep}
- Error: ${failureFacts.error}
- Failure Category: ${failureCategory.category} (confidence: ${failureCategory.confidence})

Extracted Selector:
- Selector: ${extractedSelector.selector}
- Type: ${extractedSelector.type}
- Format: ${extractedSelector.originalFormat}
- Is Playwright API: ${extractedSelector.isPlaywrightAPI}

Quality Analysis (Heuristics):
- Quality Score: ${qualityAnalysis.qualityScore.toFixed(2)}
- Quality Rating: ${qualityAnalysis.qualityRating}
- Issues Found: ${qualityAnalysis.issues.length > 0 ? qualityAnalysis.issues.join("; ") : "None"}
- Strengths: ${qualityAnalysis.strengths.length > 0 ? qualityAnalysis.strengths.join("; ") : "None"}

${
	selectorSuggestion
		? `
Suggested Alternative:
- Selector: ${selectorSuggestion.suggestedSelector}
- Reason: ${selectorSuggestion.reason}
- Confidence: ${selectorSuggestion.confidence.toFixed(2)}
`
		: "No alternative selector suggested (element not found in DOM or current selector is already optimal)"
}
`;

	try {
		const result = await generateText({
			model: openai("gpt-4o"),
			output: Output.object({
				schema: zodSchema(SelectorAnalysisSchema),
			}),
			prompt: `Analyze this Playwright selector and provide a comprehensive quality assessment.

${context}

Based on the heuristics analysis and DOM inspection, provide:
1. selectorQuality: Overall quality rating (excellent/good/fragile/poor)
2. qualityScore: Numeric score 0-1 (use the heuristic score as baseline, adjust if needed)
3. issues: List of specific issues with the selector (use heuristic issues, add any additional concerns)
4. suggestedSelector: The suggested alternative selector if one was found, or null if current selector is good
5. suggestionReason: Explanation of why the suggestion is better, or null if no suggestion
6. confidence: Confidence in your analysis (0-1)

Be specific and actionable. If the selector is fragile, explain why. If a better alternative exists, provide it in Playwright locator syntax.`,
		});

		return result.output;
	} catch (error) {
		console.error("Error synthesizing selector analysis:", error);

		// Fallback: Create basic analysis from heuristics
		return {
			selectorQuality: qualityAnalysis.qualityRating,
			qualityScore: qualityAnalysis.qualityScore,
			issues: qualityAnalysis.issues,
			suggestedSelector: selectorSuggestion?.suggestedSelector || null,
			suggestionReason: selectorSuggestion?.reason || null,
			confidence: selectorSuggestion?.confidence || 0.7,
		};
	}
}

/**
 * Analyze selectors for multiple failures
 *
 * @param inputs - Array of selector heuristics inputs
 * @returns Array of selector analyses (or null for each)
 */
export async function analyzeSelectorHeuristicsMultiple(
	inputs: SelectorHeuristicsInput[],
): Promise<Array<SelectorAnalysis | null>> {
	if (inputs.length === 0) {
		return [];
	}

	// Process all analyses (can be parallelized)
	const analyses = await Promise.all(
		inputs.map((input) => analyzeSelectorHeuristics(input)),
	);

	return analyses;
}
