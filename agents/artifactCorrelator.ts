/**
 * Artifact Correlation Agent
 * 
 * Correlates test expectations with actual UI state by analyzing:
 * - Playwright traces (DOM snapshots, network events, actions)
 * - Screenshots (visual analysis)
 * - Page lifecycle events
 * 
 * Key Requirements:
 * - Tools-first approach: Extract signals from artifacts
 * - LLM synthesis: Combine signals into coherent analysis
 * - Graceful degradation: Handle missing artifacts
 * - Explainable: Clear reasoning for each signal
 */

import { generateText, zodSchema, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { TestFailureFacts, ArtifactSignals, PlaywrightArtifacts } from '@/types/schemas';
import { ArtifactSignalsSchema } from '@/types/schemas';
import { readTraceZip, type TraceData } from '@/tools/readTrace';
import { extractDOMSnapshot, checkElementVisibility, findBlockingElements, type DOMSnapshot } from '@/tools/extractDOM';
import { detectPageLoadState, detectNavigationEvents, detectRedirects, type PageLoadState } from '@/tools/detectPageLifecycle';
import { analyzeScreenshot, type ScreenshotAnalysis } from '@/tools/analyzeScreenshot';

/**
 * Input for Artifact Correlation Agent
 */
export interface ArtifactCorrelatorInput {
  failureFacts: TestFailureFacts;
  artifacts: PlaywrightArtifacts;
}

/**
 * Output from Artifact Correlation Agent
 */
export type ArtifactCorrelatorOutput = ArtifactSignals | null;

/**
 * Correlate test expectations with actual UI state
 * 
 * @param input - Failure facts and artifacts
 * @returns Artifact signals or null if insufficient data
 */
export async function correlateArtifacts(
  input: ArtifactCorrelatorInput
): Promise<ArtifactCorrelatorOutput> {
  const { failureFacts, artifacts } = input;

  // Check if trace is available (required for correlation)
  if (!artifacts.traceZip) {
    return null; // Insufficient data
  }

  try {
    // Step 1: Read trace data
    const traceData = await readTraceZip(artifacts.traceZip);

    // Step 2: Extract DOM snapshot at failure point
    // Use the most recent snapshot (closest to failure) or trace end time
    const failureTime = traceData.metadata?.endTime || 
                       (traceData.actions.length > 0 
                         ? Math.max(...traceData.actions.map(a => a.timestamp))
                         : Date.now());
    const domSnapshot = await extractDOMSnapshot(traceData, failureTime);

    // Step 3: Detect page lifecycle state
    const pageLoadState = detectPageLoadState(traceData);
    const navigationEvents = detectNavigationEvents(traceData);
    const redirects = detectRedirects(traceData);

    // Step 4: Check element visibility if we have a selector in the failed step
    let elementVisibility: { exists: boolean; visible: boolean; reason?: string } | null = null;
    if (domSnapshot && failureFacts.failedStep) {
      // Try to extract selector from failed step
      const selectorMatch = failureFacts.failedStep.match(/['"]([^'"]+)['"]/);
      if (selectorMatch) {
        const selector = selectorMatch[1];
        const visibility = checkElementVisibility(domSnapshot, selector);
        elementVisibility = visibility;
      }
    }

    // Step 5: Find blocking elements in DOM
    const blockingElements = domSnapshot ? findBlockingElements(domSnapshot) : [];

    // Step 6: Analyze screenshots if available
    let screenshotAnalysis: ScreenshotAnalysis | null = null;
    if (artifacts.screenshots && artifacts.screenshots.length > 0) {
      // Use the first screenshot (usually the failure screenshot)
      screenshotAnalysis = await analyzeScreenshot(artifacts.screenshots[0]);
    }

    // Step 7: Synthesize signals using LLM
    const signals = await synthesizeSignals({
      failureFacts,
      pageLoadState,
      navigationEvents,
      redirects,
      elementVisibility,
      blockingElements,
      screenshotAnalysis,
      domSnapshot,
    });

    return signals;
  } catch (error) {
    console.error('Error correlating artifacts:', error);
    
    // Return basic signals on error
    return {
      uiState: 'unknown',
      pageState: 'unknown',
      blockingFactors: [`Error analyzing artifacts: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Internal structure for signal synthesis
 */
interface SignalSynthesisInput {
  failureFacts: TestFailureFacts;
  pageLoadState: PageLoadState;
  navigationEvents: ReturnType<typeof detectNavigationEvents>;
  redirects: ReturnType<typeof detectRedirects>;
  elementVisibility: { exists: boolean; visible: boolean; reason?: string } | null;
  blockingElements: ReturnType<typeof findBlockingElements>;
  screenshotAnalysis: ScreenshotAnalysis | null;
  domSnapshot: DOMSnapshot | null;
}

/**
 * Synthesize all signals into coherent ArtifactSignals using LLM
 */
async function synthesizeSignals(
  input: SignalSynthesisInput
): Promise<ArtifactSignals> {
  const {
    failureFacts,
    pageLoadState,
    navigationEvents,
    redirects,
    elementVisibility,
    blockingElements,
    screenshotAnalysis,
  } = input;

  // Build context for LLM
  const context = `
Test Failure Context:
- Test: ${failureFacts.testName}
- Failed Step: ${failureFacts.failedStep}
- Error: ${failureFacts.error}

Page Load State:
- State: ${pageLoadState.state}
- Load Time: ${pageLoadState.loadTime ? new Date(pageLoadState.loadTime).toISOString() : 'N/A'}
- Network Errors: ${pageLoadState.networkErrors.length > 0 ? pageLoadState.networkErrors.join(', ') : 'None'}
- Failed Requests: ${pageLoadState.failedRequests.length > 0 ? pageLoadState.failedRequests.map(r => `${r.url} (${r.status || 'error'})`).join(', ') : 'None'}

Navigation Events:
${navigationEvents.length > 0 ? navigationEvents.map(e => `- ${e.type} to ${e.url} (${e.success ? 'success' : 'failed'})`).join('\n') : 'None'}

Redirects:
${redirects.length > 0 ? redirects.map(r => `- ${r.from} → ${r.to} (${r.type}, ${r.statusCode || 'N/A'})`).join('\n') : 'None'}

Element Visibility:
${elementVisibility ? `- Exists: ${elementVisibility.exists}, Visible: ${elementVisibility.visible}, Reason: ${elementVisibility.reason || 'N/A'}` : 'Not checked'}

Blocking Elements (DOM):
${blockingElements.length > 0 ? blockingElements.map(e => `- ${e.type}: ${e.description} (confidence: ${e.confidence})`).join('\n') : 'None detected'}

Screenshot Analysis:
${screenshotAnalysis ? `- Page State: ${screenshotAnalysis.pageState}
- Blocking Elements: ${screenshotAnalysis.blockingElements.length > 0 ? screenshotAnalysis.blockingElements.join(', ') : 'None'}
- Visible Content: ${screenshotAnalysis.visibleContent.length > 0 ? screenshotAnalysis.visibleContent.slice(0, 5).join(', ') : 'None'}
- Confidence: ${screenshotAnalysis.confidence}` : 'Not available'}
`;

  try {
    const result = await generateText({
      model: openai('gpt-4o'),
      output: Output.object({
        schema: zodSchema(ArtifactSignalsSchema),
      }),
      prompt: `Analyze the following Playwright test failure artifacts and provide a clear assessment of the UI state vs test expectations.

${context}

Based on this information, determine:
1. uiState: What is the actual state of the UI when the failure occurred? (e.g., "element missing", "page loaded with blocking modal", "page still loading", "error page displayed", etc.)
2. pageState: What is the page load state? (e.g., "loaded", "loading", "error", "timeout", "unknown")
3. blockingFactors: List any factors that may have blocked the test from succeeding (modals, banners, loading states, network errors, etc.)

Be specific and actionable. If the page was loaded but an element was missing, say so. If something was blocking the element, identify it. If the page failed to load, explain why.`,
    });

    return result.output;
  } catch (error) {
    console.error('Error synthesizing signals:', error);
    
    // Fallback: Create basic signals from available data
    const blockingFactors: string[] = [];
    
    if (pageLoadState.networkErrors.length > 0) {
      blockingFactors.push(...pageLoadState.networkErrors);
    }
    
    if (blockingElements.length > 0) {
      blockingFactors.push(...blockingElements.map(e => e.description));
    }
    
    if (screenshotAnalysis?.blockingElements) {
      blockingFactors.push(...screenshotAnalysis.blockingElements);
    }

    let uiState = 'unknown';
    if (elementVisibility) {
      if (!elementVisibility.exists) {
        uiState = 'element missing';
      } else if (!elementVisibility.visible) {
        uiState = 'element hidden';
      } else {
        uiState = 'element visible';
      }
    }

    return {
      uiState,
      pageState: pageLoadState.state,
      blockingFactors: blockingFactors.length > 0 ? blockingFactors : ['No blocking factors detected'],
    };
  }
}

/**
 * Correlate artifacts for multiple failures
 * 
 * @param inputs - Array of failure facts and artifacts
 * @returns Array of artifact signals (or null for each)
 */
export async function correlateArtifactsMultiple(
  inputs: Array<{ failureFacts: TestFailureFacts; artifacts: PlaywrightArtifacts }>
): Promise<Array<ArtifactSignals | null>> {
  if (inputs.length === 0) {
    return [];
  }

  // Process all correlations (can be parallelized)
  const correlations = await Promise.all(
    inputs.map(input => correlateArtifacts(input))
  );

  return correlations;
}

