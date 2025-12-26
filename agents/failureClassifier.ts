/**
 * Failure Classification Agent
 * 
 * Categorizes test failures into specific types using pattern matching (rules-first)
 * and LLM reasoning (for ambiguous cases).
 * 
 * Key Requirements:
 * - Rules first, LLM second
 * - Confidence scoring
 * - Explainable reasoning
 * - Fast pattern matching for common cases
 */

import { generateText, zodSchema, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { FailureCategorySchema, type FailureCategory, type TestFailureFacts } from '@/types/schemas';
import { applyPatternMatching, isHighConfidence, isMediumConfidence, type PatternMatchResult } from '@/tools/classifyPatterns';

/**
 * Input for Failure Classification Agent
 */
export interface FailureClassifierInput {
  facts: TestFailureFacts;
}

/**
 * Output from Failure Classification Agent
 */
export type FailureClassifierOutput = FailureCategory;

/**
 * Classify a test failure into a specific category
 * 
 * @param input - Test failure facts
 * @returns Failure category with confidence and reasoning
 */
export async function classifyFailure(
  input: FailureClassifierInput
): Promise<FailureClassifierOutput> {
  const { facts } = input;

  // Step 1: Apply pattern matching first (rules-based)
  const patternResult = applyPatternMatching(facts);

  // Step 2: If high confidence pattern match, return immediately
  if (patternResult && isHighConfidence(patternResult)) {
    return {
      category: patternResult.category,
      confidence: patternResult.confidence,
      reasoning: generatePatternReasoning(facts, patternResult),
    };
  }

  // Step 3: If medium confidence or pattern hint available, use LLM to refine
  if (patternResult && isMediumConfidence(patternResult)) {
    return await classifyWithLLM(facts, patternResult.category);
  }

  // Step 4: If no pattern match or low confidence, use LLM for full classification
  return await classifyWithLLM(facts);
}

/**
 * Classify failure using LLM
 * 
 * @param facts - Test failure facts
 * @param patternHint - Optional category hint from pattern matching
 * @returns Failure category with confidence and reasoning
 */
async function classifyWithLLM(
  facts: TestFailureFacts,
  patternHint?: string
): Promise<FailureCategory> {
  try {
    const prompt = `Classify this Playwright test failure into one of these categories:
- selector_not_found: Element/selector could not be found on the page
- timeout: Operation timed out waiting for something
- assertion_failed: An expect/assert statement failed (element found but assertion failed)
- navigation_error: Page navigation failed (404, 500, network error, etc.)
- auth_error: Authentication or authorization failed (401, 403, login issues)
- unknown: Cannot determine the failure type

Test Name: ${facts.testName}
File: ${facts.file}
Failed Step: ${facts.failedStep}
Error: ${facts.error}
${facts.timeout ? `Timeout: ${facts.timeout}ms` : ''}
${facts.lineNumber ? `Line: ${facts.lineNumber}` : ''}
${facts.stackTrace ? `Stack Trace:\n${facts.stackTrace.join('\n')}` : ''}

${patternHint ? `Pattern matching suggests: ${patternHint} (but confidence is medium, please refine)` : 'No clear pattern match found, please analyze carefully.'}

Provide:
- category: The most likely failure category
- confidence: A confidence score between 0 and 1 (be conservative if uncertain)
- reasoning: A clear explanation of why this category was chosen

Be precise and explainable.`;

    const result = await generateText({
      model: openai('gpt-4o'),
      output: Output.object({
        schema: zodSchema(FailureCategorySchema),
      }),
      prompt,
    });

    // Get the structured output from the result
    return result.output;
  } catch (error) {
    // Fallback: Return unknown category if LLM fails
    console.error('Error in LLM classification, falling back to unknown:', error);
    return {
      category: 'unknown',
      confidence: 0.0,
      reasoning: `Failed to classify: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate reasoning text for pattern-matched results
 */
function generatePatternReasoning(
  facts: TestFailureFacts,
  patternResult: PatternMatchResult
): string {
  const { category, matchedPatterns } = patternResult;

  const categoryExplanations: Record<string, string> = {
    selector_not_found: 'Element or selector could not be found on the page',
    timeout: 'Operation exceeded the timeout limit',
    assertion_failed: 'An assertion (expect statement) failed',
    navigation_error: 'Page navigation failed',
    auth_error: 'Authentication or authorization failed',
    unknown: 'Unable to determine failure type',
  };

  const baseExplanation = categoryExplanations[category] || 'Unknown failure type';
  const patternCount = matchedPatterns.length;

  return `${baseExplanation}. Detected ${patternCount} matching pattern${patternCount > 1 ? 's' : ''} in error message, failed step, and stack trace. Error: "${facts.error.substring(0, 100)}${facts.error.length > 100 ? '...' : ''}"`;
}

/**
 * Classify multiple failures
 * 
 * @param factsArray - Array of test failure facts
 * @returns Array of failure categories
 */
export async function classifyFailures(
  factsArray: TestFailureFacts[]
): Promise<FailureCategory[]> {
  if (factsArray.length === 0) {
    return [];
  }

  // Process all classifications (can be parallelized in future)
  const classifications = await Promise.all(
    factsArray.map(facts => classifyFailure({ facts }))
  );

  return classifications;
}

