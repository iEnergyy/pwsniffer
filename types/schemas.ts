import { z } from 'zod';

/**
 * Output from Report Decomposition Agent
 * Contains structured facts extracted from Playwright report
 */
// Schema for OpenAI structured output (requires nullable instead of optional)
const TestFailureFactsSchemaForAI = z.object({
  testName: z.string().describe('The name of the failed test'),
  file: z.string().describe('The file path where the test is located'),
  failedStep: z.string().describe('The exact step that failed'),
  error: z.string().describe('The error message'),
  timeout: z.number().nullable().describe('Timeout value in milliseconds if applicable, or null if not available'),
  lineNumber: z.number().nullable().describe('Line number where the failure occurred, or null if not available'),
  columnNumber: z.number().nullable().describe('Column number where the failure occurred, or null if not available'),
  stackTrace: z.array(z.string()).nullable().describe('Stack trace lines, or null if not available'),
});

// Schema for internal use (optional fields)
export const TestFailureFactsSchema = z.object({
  testName: z.string().describe('The name of the failed test'),
  file: z.string().describe('The file path where the test is located'),
  failedStep: z.string().describe('The exact step that failed'),
  error: z.string().describe('The error message'),
  timeout: z.number().optional().describe('Timeout value in milliseconds if applicable'),
  lineNumber: z.number().optional().describe('Line number where the failure occurred'),
  columnNumber: z.number().optional().describe('Column number where the failure occurred'),
  stackTrace: z.array(z.string()).optional().describe('Stack trace lines'),
});

export type TestFailureFacts = z.infer<typeof TestFailureFactsSchema>;

// Export the AI schema for use in reportDecomposer
export { TestFailureFactsSchemaForAI };

/**
 * Input structure for the pipeline
 * Represents all artifacts from a single Playwright run
 */
export const PlaywrightArtifactsSchema = z.object({
  reportJson: z.union([z.string(), z.instanceof(Buffer)]).describe('Playwright JSON report (required)'),
  traceZip: z.union([z.instanceof(File), z.instanceof(Buffer)]).optional().describe('Playwright trace.zip (required)'),
  screenshots: z.array(z.instanceof(File)).optional().describe('Screenshot files'),
  video: z.instanceof(File).optional().describe('Video recording file'),
  contextMd: z.string().optional().describe('Optional manual context provided by user'),
});

export type PlaywrightArtifacts = z.infer<typeof PlaywrightArtifactsSchema>;

/**
 * Output from Failure Classification Agent (for Phase 2)
 */
export const FailureCategorySchema = z.object({
  category: z.enum(['selector_not_found', 'timeout', 'assertion_failed', 'navigation_error', 'auth_error', 'unknown']).describe('The type of failure'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  reasoning: z.string().describe('Explanation of why this category was chosen'),
});

export type FailureCategory = z.infer<typeof FailureCategorySchema>;

/**
 * Output from Artifact Correlation Agent (for Phase 3)
 */
export const ArtifactSignalsSchema = z.object({
  uiState: z.string().describe('State of the UI when failure occurred'),
  pageState: z.string().describe('State of the page (loaded, loading, error, etc.)'),
  blockingFactors: z.array(z.string()).describe('Factors that may have blocked the test'),
});

export type ArtifactSignals = z.infer<typeof ArtifactSignalsSchema>;

/**
 * Output from Action Synthesis Agent (for Phase 5)
 */
export const FinalDiagnosisSchema = z.object({
  verdict: z.enum(['test_issue', 'app_issue', 'unclear']).describe('Whether this is a test issue or application issue'),
  recommendedAction: z.string().describe('Recommended next action to take'),
  urgency: z.enum(['low', 'medium', 'high']).describe('Urgency level of the issue'),
  reason: z.string().describe('Explanation of the verdict and recommendation'),
});

export type FinalDiagnosis = z.infer<typeof FinalDiagnosisSchema>;

/**
 * Schema for array of test failures (multiple tests can fail in one run)
 */
export const TestFailureFactsArraySchema = z.array(TestFailureFactsSchema);

export type TestFailureFactsArray = z.infer<typeof TestFailureFactsArraySchema>;

/**
 * Output from Selector Heuristics Agent (for Phase 4)
 */
export const SelectorAnalysisSchema = z.object({
  selectorQuality: z.enum(['excellent', 'good', 'fragile', 'poor']).describe('Quality rating of the selector'),
  qualityScore: z.number().min(0).max(1).describe('Numeric quality score (0-1)'),
  issues: z.array(z.string()).describe('List of issues found with the selector'),
  suggestedSelector: z.string().nullable().describe('Suggested alternative selector, or null if current is good'),
  suggestionReason: z.string().nullable().describe('Explanation of why the suggestion is better'),
  confidence: z.number().min(0).max(1).describe('Confidence in the analysis'),
});

export type SelectorAnalysis = z.infer<typeof SelectorAnalysisSchema>;

/**
 * Output from Solution Suggestion Agent (for Phase 5.5)
 */
export const SolutionSuggestionSchema = z.object({
  suggestedCode: z.string().nullable().describe('Suggested code fix (selector, test logic, etc.) or null if not applicable'),
  originalCode: z.string().nullable().describe('Original code that failed, or null if not extractable'),
  explanation: z.string().describe('Explanation of the suggested fix'),
  steps: z.array(z.string()).describe('Step-by-step instructions for implementing the fix'),
  alternativeApproaches: z.array(z.string()).optional().describe('Alternative approaches if the primary solution doesn\'t work'),
  confidence: z.number().min(0).max(1).describe('Confidence in the solution (0-1)'),
});

export type SolutionSuggestion = z.infer<typeof SolutionSuggestionSchema>;

