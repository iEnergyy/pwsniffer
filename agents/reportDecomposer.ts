/**
 * Report Decomposition Agent
 *
 * Converts raw Playwright artifacts into structured, machine-readable facts.
 * This agent establishes ground truth for all downstream reasoning.
 *
 * Key Requirements:
 * - Deterministic: Same input = same output
 * - No reasoning: Just facts extraction
 * - Error handling: Gracefully handle malformed reports
 * - Validation: Use Zod schemas to ensure output correctness
 */

import { generateText, zodSchema, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import {
	TestFailureFactsArraySchema,
	TestFailureFactsSchemaForAI,
	type TestFailureFacts,
} from "@/types/schemas";
import { parsePlaywrightReport } from "@/tools/parseReport";

/**
 * Input for Report Decomposition Agent
 */
export interface ReportDecomposerInput {
	reportJson: string | Buffer;
	contextMd?: string;
}

/**
 * Output from Report Decomposition Agent
 */
export type ReportDecomposerOutput = TestFailureFacts[];

/**
 * Decompose Playwright report into structured failure facts
 *
 * @param input - Playwright artifacts (report JSON and optional context)
 * @returns Array of TestFailureFacts for each failed test
 */
export async function decomposeReport(
	input: ReportDecomposerInput,
): Promise<ReportDecomposerOutput> {
	try {
		// Step 1: Parse the report using deterministic tools
		const parsedFailures = parsePlaywrightReport(input.reportJson);

		// If no failures found, return empty array
		if (parsedFailures.length === 0) {
			return [];
		}

		// Step 2: Use AI to enhance and structure the extracted data
		// This ensures we capture all nuances while maintaining determinism
		const enhancedFailures: TestFailureFacts[] = [];

		for (const failure of parsedFailures) {
			// Use AI to validate and enhance the extracted facts
			// The AI helps ensure we haven't missed any important details
			const result = await generateText({
				model: openai("gpt-4o"),
				output: Output.object({
					schema: zodSchema(TestFailureFactsSchemaForAI),
				}),
				prompt: `Extract and structure the failure facts from this Playwright test failure.

Test Name: ${failure.testName}
File: ${failure.file}
Failed Step: ${failure.failedStep}
Error: ${failure.error}
${failure.timeout ? `Timeout: ${failure.timeout}ms` : ""}
${failure.lineNumber ? `Line: ${failure.lineNumber}` : ""}
${failure.stackTrace ? `Stack Trace:\n${failure.stackTrace.join("\n")}` : ""}

${input.contextMd ? `Additional Context:\n${input.contextMd}` : ""}

Extract the facts exactly as provided. Do not add reasoning or interpretation. Only extract:
- testName: The exact test name
- file: The file path
- failedStep: The exact step that failed
- error: The error message
- timeout: Timeout value if applicable
- lineNumber: Line number if available
- columnNumber: Column number if available
- stackTrace: Stack trace lines if available

Be precise and deterministic.`,
			});

			// Get the structured output from the result
			const structuredOutput = result.output;

			// Convert null values back to undefined for consistency with our type system
			const enhanced = {
				...structuredOutput,
				timeout: structuredOutput.timeout ?? undefined,
				lineNumber: structuredOutput.lineNumber ?? undefined,
				columnNumber: structuredOutput.columnNumber ?? undefined,
				stackTrace: structuredOutput.stackTrace ?? undefined,
			};
			enhancedFailures.push(enhanced);
		}

		// Step 3: Validate the output
		const validated = TestFailureFactsArraySchema.parse(enhancedFailures);

		return validated;
	} catch (error) {
		// Error handling: If AI fails, fall back to deterministic parsing
		console.error(
			"Error in report decomposition, falling back to deterministic parsing:",
			error,
		);

		try {
			const fallbackFailures = parsePlaywrightReport(input.reportJson);
			return fallbackFailures;
		} catch (parseError) {
			throw new Error(
				`Failed to decompose report: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}

/**
 * Decompose report using only deterministic parsing (no AI)
 * Useful for testing or when AI is unavailable
 */
export function decomposeReportDeterministic(
	input: ReportDecomposerInput,
): ReportDecomposerOutput {
	return parsePlaywrightReport(input.reportJson);
}
