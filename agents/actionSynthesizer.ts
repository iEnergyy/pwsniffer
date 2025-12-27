/**
 * Action Synthesis Agent
 *
 * Synthesizes all previous agent outputs into a clear verdict and recommended action.
 * This is the final decision layer that answers: "What should I do next?"
 *
 * Key Requirements:
 * - Rules-first approach with LLM synthesis for complex cases
 * - Clear verdict: test_issue, app_issue, or unclear
 * - Actionable recommendations
 * - Urgency assessment
 * - Explainable reasoning
 */

import { generateText, zodSchema, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type {
	TestFailureFacts,
	FailureCategory,
	ArtifactSignals,
	SelectorAnalysis,
	FinalDiagnosis,
} from "@/types/schemas";
import { FinalDiagnosisSchema } from "@/types/schemas";

/**
 * Input for Action Synthesis Agent
 */
export interface ActionSynthesizerInput {
	failureFacts: TestFailureFacts;
	failureCategory: FailureCategory;
	artifactSignals: ArtifactSignals | null;
	selectorAnalysis: SelectorAnalysis | null;
}

/**
 * Output from Action Synthesis Agent
 */
export type ActionSynthesizerOutput = FinalDiagnosis | null;

/**
 * Synthesize a final diagnosis and recommended action
 *
 * @param input - All agent outputs combined
 * @returns Final diagnosis or null if insufficient data
 */
export async function synthesizeAction(
	input: ActionSynthesizerInput,
): Promise<ActionSynthesizerOutput> {
	const { failureFacts, failureCategory, artifactSignals, selectorAnalysis } =
		input;

	console.log("[ActionSynthesizer] Starting synthesis for:", {
		testName: failureFacts.testName,
		category: failureCategory.category,
		hasArtifactSignals: !!artifactSignals,
		hasSelectorAnalysis: !!selectorAnalysis,
	});

	// Step 1: Apply rule-based heuristics first
	const heuristicResult = applyHeuristics(input);

	// Step 2: If we have a high-confidence heuristic result, use it
	if (heuristicResult && heuristicResult.confidence >= 0.8) {
		console.log(
			"[ActionSynthesizer] Using high-confidence heuristic result:",
			heuristicResult,
		);
		return heuristicResult;
	}

	// Step 3: Use LLM synthesis for complex cases or when heuristics are uncertain
	try {
		const llmResult = await synthesizeWithLLM(input, heuristicResult);
		console.log("[ActionSynthesizer] LLM synthesis result:", llmResult);
		return llmResult;
	} catch (error) {
		console.error("[ActionSynthesizer] Error in LLM synthesis:", error);

		// Fallback to heuristic result if available, otherwise return unclear
		if (heuristicResult) {
			return heuristicResult;
		}

		return {
			verdict: "unclear",
			recommendedAction: "review failure details manually",
			urgency: "low",
			reason: `Unable to synthesize diagnosis: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Apply rule-based heuristics to determine verdict and action
 */
function applyHeuristics(input: ActionSynthesizerInput): FinalDiagnosis | null {
	const { failureCategory, artifactSignals, selectorAnalysis } = input;

	// Rule 1: Navigation errors → app_issue
	if (failureCategory.category === "navigation_error") {
		return {
			verdict: "app_issue",
			recommendedAction: "investigate app",
			urgency: "high",
			reason:
				"Navigation error indicates an application issue. Check server logs, network connectivity, and application health.",
		};
	}

	// Rule 2: Auth errors → app_issue (usually) or environment issue
	if (failureCategory.category === "auth_error") {
		return {
			verdict: "app_issue",
			recommendedAction: "check environment",
			urgency: "high",
			reason:
				"Authentication error suggests an application or environment configuration issue. Verify credentials, session management, and auth service status.",
		};
	}

	// Rule 3: Selector not found + page loaded + element missing → test_issue
	if (
		failureCategory.category === "selector_not_found" &&
		artifactSignals &&
		artifactSignals.pageState === "loaded" &&
		(artifactSignals.uiState.includes("element missing") ||
			artifactSignals.uiState.includes("element not found"))
	) {
		// If selector is fragile, definitely test issue
		if (
			selectorAnalysis &&
			(selectorAnalysis.selectorQuality === "fragile" ||
				selectorAnalysis.selectorQuality === "poor")
		) {
			return {
				verdict: "test_issue",
				recommendedAction: selectorAnalysis.suggestedSelector
					? "fix selector"
					: "review selector strategy",
				urgency: "medium",
				reason: `Fragile selector detected (quality: ${selectorAnalysis.selectorQuality}). Page loaded successfully but element not found, indicating a test selector issue. ${selectorAnalysis.suggestedSelector ? `Suggested: ${selectorAnalysis.suggestedSelector}` : ""}`,
			};
		}

		// Even without fragile selector, if page loaded and element missing, likely test issue
		return {
			verdict: "test_issue",
			recommendedAction: "fix selector",
			urgency: "medium",
			reason:
				"Page loaded successfully but element not found in DOM. This suggests the selector may be incorrect or the element structure changed.",
		};
	}

	// Rule 4: Selector not found + blocking factors → app_issue
	if (
		failureCategory.category === "selector_not_found" &&
		artifactSignals &&
		artifactSignals.blockingFactors.length > 0 &&
		!artifactSignals.blockingFactors.every((f) =>
			f.includes("No blocking factors"),
		)
	) {
		return {
			verdict: "app_issue",
			recommendedAction: "investigate app",
			urgency: "high",
			reason: `Element not found but blocking factors detected: ${artifactSignals.blockingFactors.join(", ")}. This suggests the application may not be rendering correctly.`,
		};
	}

	// Rule 5: Timeout + page still loading → unclear or app_issue
	if (
		failureCategory.category === "timeout" &&
		artifactSignals &&
		(artifactSignals.pageState === "loading" ||
			artifactSignals.pageState === "timeout")
	) {
		return {
			verdict: "app_issue",
			recommendedAction: "increase timeout",
			urgency: "medium",
			reason:
				"Page failed to load within timeout period. This could indicate slow network, slow application response, or resource loading issues.",
		};
	}

	// Rule 6: Assertion failed + page loaded + correct state → test_issue
	if (
		failureCategory.category === "assertion_failed" &&
		artifactSignals &&
		artifactSignals.pageState === "loaded" &&
		!artifactSignals.uiState.includes("error")
	) {
		return {
			verdict: "test_issue",
			recommendedAction: "review test logic",
			urgency: "medium",
			reason:
				"Assertion failed but page loaded correctly. This suggests the test expectations may be incorrect or the test logic needs review.",
		};
	}

	// Rule 7: Fragile selector detected → test_issue
	if (
		selectorAnalysis &&
		(selectorAnalysis.selectorQuality === "fragile" ||
			selectorAnalysis.selectorQuality === "poor")
	) {
		return {
			verdict: "test_issue",
			recommendedAction: selectorAnalysis.suggestedSelector
				? "fix selector"
				: "review selector strategy",
			urgency: "low",
			reason: `Fragile selector detected (quality: ${selectorAnalysis.selectorQuality}). Consider using a more stable selector. ${selectorAnalysis.suggestedSelector ? `Suggested: ${selectorAnalysis.suggestedSelector}` : ""}`,
		};
	}

	// Rule 8: Page failed to load (error state) → app_issue
	if (
		artifactSignals &&
		(artifactSignals.pageState === "error" ||
			artifactSignals.pageState === "timeout") &&
		artifactSignals.blockingFactors.some(
			(f) => f.includes("network") || f.includes("error"),
		)
	) {
		return {
			verdict: "app_issue",
			recommendedAction: "investigate app",
			urgency: "high",
			reason: `Page failed to load with errors: ${artifactSignals.blockingFactors.filter((f) => f.includes("network") || f.includes("error")).join(", ")}. This indicates an application or infrastructure issue.`,
		};
	}

	// If no clear heuristic match, return null to trigger LLM synthesis
	return null;
}

/**
 * Synthesize diagnosis using LLM
 */
async function synthesizeWithLLM(
	input: ActionSynthesizerInput,
	heuristicHint: FinalDiagnosis | null,
): Promise<FinalDiagnosis> {
	const { failureFacts, failureCategory, artifactSignals, selectorAnalysis } =
		input;

	// Build comprehensive context
	const context = `
Test Failure Context:
- Test: ${failureFacts.testName}
- File: ${failureFacts.file}
- Failed Step: ${failureFacts.failedStep}
- Error: ${failureFacts.error}
${failureFacts.timeout ? `- Timeout: ${failureFacts.timeout}ms` : ""}

Failure Category:
- Category: ${failureCategory.category}
- Confidence: ${(failureCategory.confidence * 100).toFixed(0)}%
- Reasoning: ${failureCategory.reasoning}

${
	artifactSignals
		? `
UI State Analysis:
- Page State: ${artifactSignals.pageState}
- UI State: ${artifactSignals.uiState}
- Blocking Factors: ${artifactSignals.blockingFactors.length > 0 ? artifactSignals.blockingFactors.join("; ") : "None"}
`
		: "UI State Analysis: Not available (trace.zip required)"
}

${
	selectorAnalysis
		? `
Selector Analysis:
- Quality: ${selectorAnalysis.selectorQuality} (score: ${(selectorAnalysis.qualityScore * 100).toFixed(0)}%)
- Issues: ${selectorAnalysis.issues.length > 0 ? selectorAnalysis.issues.join("; ") : "None"}
- Suggested Selector: ${selectorAnalysis.suggestedSelector || "None"}
- Suggestion Reason: ${selectorAnalysis.suggestionReason || "N/A"}
- Confidence: ${(selectorAnalysis.confidence * 100).toFixed(0)}%
`
		: "Selector Analysis: Not applicable or unavailable"
}

${
	heuristicHint
		? `
Heuristic Analysis Hint:
- Verdict: ${heuristicHint.verdict}
- Recommended Action: ${heuristicHint.recommendedAction}
- Urgency: ${heuristicHint.urgency}
- Reason: ${heuristicHint.reason}
(Note: This is a heuristic suggestion with medium confidence. Please refine based on all available signals.)
`
		: ""
}
`;

	const prompt = `You are an expert QA engineer analyzing a Playwright test failure. Your task is to synthesize all available information into a clear, actionable diagnosis.

${context}

Based on ALL the information above, determine:

1. **verdict**: One of:
   - "test_issue": The test itself has a problem (wrong selector, incorrect expectations, flaky logic)
   - "app_issue": The application has a problem (bugs, errors, missing features, infrastructure issues)
   - "unclear": Insufficient information or conflicting signals

2. **recommendedAction**: A specific, actionable recommendation. Common actions include:
   - "retry" - for potentially flaky tests
   - "fix selector" - when selector is wrong or fragile
   - "increase timeout" - for slow page loads
   - "investigate app" - for application bugs or errors
   - "check environment" - for auth, config, or environment issues
   - "review test logic" - for assertion failures or test design issues
   - Or a custom specific action if needed

3. **urgency**: 
   - "high" - App issues, blocking failures, production-critical
   - "medium" - Test issues that need fixing, moderate impact
   - "low" - Minor improvements, unclear cases, non-blocking

4. **reason**: A clear, concise explanation (2-3 sentences) that:
   - Explains why you chose this verdict
   - Justifies the recommended action
   - References specific signals that led to this conclusion

Be decisive but honest. If the signals are conflicting or insufficient, choose "unclear" rather than guessing. Prioritize actionable recommendations over vague advice.`;

	try {
		const result = await generateText({
			model: openai("gpt-4o"),
			output: Output.object({
				schema: zodSchema(FinalDiagnosisSchema),
			}),
			prompt,
		});

		return result.output;
	} catch (error) {
		console.error("Error in LLM synthesis:", error);
		throw error;
	}
}

/**
 * Synthesize actions for multiple failures
 *
 * @param inputs - Array of action synthesizer inputs
 * @returns Array of final diagnoses (or null for each)
 */
export async function synthesizeActions(
	inputs: ActionSynthesizerInput[],
): Promise<Array<FinalDiagnosis | null>> {
	if (inputs.length === 0) {
		return [];
	}

	// Process all syntheses (can be parallelized)
	const syntheses = await Promise.all(
		inputs.map((input) => synthesizeAction(input)),
	);

	return syntheses;
}
