/**
 * Parse Playwright JSON report and extract failure information
 */

import type { TestFailureFacts } from '@/types/schemas';
import { extractStackTrace, extractFileLocation } from './extractStackTrace';

/**
 * Playwright JSON report structure (simplified)
 */
interface PlaywrightReport {
  config?: {
    testDir?: string;
    timeout?: number;
  };
  suites?: PlaywrightSuite[];
}

interface PlaywrightSuite {
  title?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[]; // Nested suites
}

interface PlaywrightSpec {
  title?: string;
  file?: string;
  line?: number;
  column?: number;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  title?: string;
  line?: number;
  column?: number;
  results?: PlaywrightTestResult[];
}

interface PlaywrightTestResult {
  status?: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration?: number;
  retry?: number;
  steps?: PlaywrightStep[];
  error?: {
    message?: string;
    stack?: string;
  };
}

interface PlaywrightStep {
  title?: string;
  duration?: number;
  error?: {
    message?: string;
    stack?: string;
  };
  steps?: PlaywrightStep[];
}

/**
 * Parse Playwright JSON report and extract all failed tests
 * @param reportJson - Playwright JSON report as string or Buffer
 * @returns Array of TestFailureFacts for each failed test
 */
/**
 * Recursively traverse a suite to find all tests (handles nested suites)
 */
function traverseSuiteForFailures(suite: any, failures: TestFailureFacts[]): void {
  // Check specs in this suite
  if (suite.specs) {
    for (const spec of suite.specs) {
      if (spec.tests) {
        for (const test of spec.tests) {
          if (test.results) {
            for (const result of test.results) {
              if (result.status === 'failed' || result.status === 'timedOut') {
                const failure = extractFailureFacts(spec, test, result);
                if (failure) {
                  failures.push(failure);
                }
              }
            }
          }
        }
      }
    }
  }

  // Recursively check nested suites
  if (suite.suites) {
    for (const nestedSuite of suite.suites) {
      traverseSuiteForFailures(nestedSuite, failures);
    }
  }
}

export function parsePlaywrightReport(reportJson: string | Buffer): TestFailureFacts[] {
  const reportString = typeof reportJson === 'string' ? reportJson : reportJson.toString('utf-8');
  const report: PlaywrightReport = JSON.parse(reportString);

  const failures: TestFailureFacts[] = [];

  // Traverse the report structure to find all failed tests (handles nested suites)
  if (report.suites) {
    for (const suite of report.suites) {
      traverseSuiteForFailures(suite, failures);
    }
  }

  return failures;
}

/**
 * Extract failure facts from a single test result
 */
function extractFailureFacts(
  spec: PlaywrightSpec,
  test: PlaywrightTest,
  result: PlaywrightTestResult
): TestFailureFacts | null {
  if (!result.error && !result.steps?.some(s => s.error)) {
    return null;
  }

  // Find the failing step
  const failingStep = findFailingStep(result.steps || []);
  const error = result.error || failingStep?.error || { message: 'Unknown error' };
  const errorMessage = error.message || 'Unknown error';
  const errorStack = error.stack || errorMessage;

  // Extract file location from stack trace
  const location = extractFileLocation(errorStack);
  
  // Extract stack trace lines
  const stackTrace = extractStackTrace(errorStack);

  // Get timeout from config or default
  const timeout = result.duration || undefined;

  // Determine the failed step name
  const failedStepName = failingStep?.title || 'Unknown step';

  // In Playwright reports, the test name is typically on the spec, not the test object
  // Fallback to test.title if spec.title is not available
  const testName = spec.title || test.title || 'Unknown test';

  return {
    testName,
    file: location.file || spec.file || 'Unknown file',
    failedStep: failedStepName,
    error: errorMessage,
    timeout,
    lineNumber: location.line || spec.line || test.line,
    columnNumber: location.column || spec.column || test.column,
    stackTrace: stackTrace.length > 0 ? stackTrace : undefined,
  };
}

/**
 * Recursively find the first step that has an error
 */
function findFailingStep(steps: PlaywrightStep[]): PlaywrightStep | null {
  for (const step of steps) {
    if (step.error) {
      return step;
    }
    if (step.steps) {
      const nestedFailure = findFailingStep(step.steps);
      if (nestedFailure) {
        return nestedFailure;
      }
    }
  }
  return null;
}

/**
 * Extract failed steps from a test result
 * @param result - Playwright test result
 * @returns Array of failed step information
 */
export function extractFailedSteps(result: PlaywrightTestResult): Array<{
  stepName: string;
  action?: string;
  selector?: string;
  duration?: number;
  error?: string;
}> {
  const failedSteps: Array<{
    stepName: string;
    action?: string;
    selector?: string;
    duration?: number;
    error?: string;
  }> = [];

  function traverseSteps(steps: PlaywrightStep[], prefix = '') {
    for (const step of steps) {
      const stepName = prefix ? `${prefix} > ${step.title}` : step.title || 'Unknown step';
      
      if (step.error) {
        // Try to extract action and selector from step title
        const actionMatch = step.title?.match(/^(\w+)\(/);
        const selectorMatch = step.title?.match(/['"]([^'"]+)['"]/);
        
        failedSteps.push({
          stepName,
          action: actionMatch?.[1],
          selector: selectorMatch?.[1],
          duration: step.duration,
          error: step.error.message || 'Unknown error',
        });
      }

      if (step.steps) {
        traverseSteps(step.steps, stepName);
      }
    }
  }

  if (result.steps) {
    traverseSteps(result.steps);
  }

  return failedSteps;
}

