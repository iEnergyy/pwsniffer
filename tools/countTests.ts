/**
 * Helper functions to count tests from Playwright report structure
 * Handles nested suites structure
 */

/**
 * Recursively collect all tests from a suite (handles nested suites)
 */
function collectTestsFromSuite(suite: any): any[] {
  const tests: any[] = [];

  // Collect tests from specs in this suite
  if (suite.specs) {
    for (const spec of suite.specs) {
      if (spec.tests) {
        tests.push(...spec.tests);
      }
    }
  }

  // Recursively collect tests from nested suites
  if (suite.suites) {
    for (const nestedSuite of suite.suites) {
      tests.push(...collectTestsFromSuite(nestedSuite));
    }
  }

  return tests;
}

/**
 * Count tests from Playwright report structure
 * Handles nested suites and uses stats if available
 */
export function countTestsFromReport(reportData: any): {
  total: number;
  failed: number;
  passed: number;
  skipped: number;
} {
  // First, try to use stats if available (most reliable)
  if (reportData.stats) {
    const stats = reportData.stats;
    return {
      total: (stats.expected || 0) + (stats.unexpected || 0) + (stats.skipped || 0) + (stats.flaky || 0),
      failed: stats.unexpected || 0,
      passed: stats.expected || 0,
      skipped: stats.skipped || 0,
    };
  }

  // Fallback: traverse the structure manually
  const allTests: any[] = [];

  if (reportData.suites) {
    for (const suite of reportData.suites) {
      allTests.push(...collectTestsFromSuite(suite));
    }
  }

  const failedTests = allTests.filter(test => {
    return test.results?.some((r: any) => 
      r.status === 'failed' || 
      r.status === 'timedOut' ||
      test.status === 'unexpected'
    );
  });

  const passedTests = allTests.filter(test => {
    return test.results?.some((r: any) => r.status === 'passed') ||
           test.status === 'expected';
  });

  const skippedTests = allTests.filter(test => {
    return test.results?.some((r: any) => r.status === 'skipped') ||
           test.status === 'skipped';
  });

  return {
    total: allTests.length,
    failed: failedTests.length,
    passed: passedTests.length,
    skipped: skippedTests.length,
  };
}

