/**
 * Pipeline orchestration for Playwright failure analysis
 * 
 * This is a stub for now. In future phases, this will orchestrate
 * multiple agents in sequence.
 */

import type { PlaywrightArtifacts, FailureCategory } from '@/types/schemas';
import { decomposeReport, type ReportDecomposerInput } from '@/agents/reportDecomposer';
import { classifyFailures } from '@/agents/failureClassifier';

/**
 * Run the complete analysis pipeline
 * Currently runs Phase 1 (Report Decomposition) and Phase 2 (Failure Classification)
 * 
 * @param artifacts - Playwright artifacts from a single run
 * @returns Analysis results
 */
export async function runAnalysis(artifacts: PlaywrightArtifacts) {
  // Phase 1: Report Decomposition
  const reportJson = typeof artifacts.reportJson === 'string' 
    ? artifacts.reportJson 
    : artifacts.reportJson.toString('utf-8');

  const decompositionInput: ReportDecomposerInput = {
    reportJson: artifacts.reportJson,
    contextMd: artifacts.contextMd,
  };

  const failureFacts = await decomposeReport(decompositionInput);

  // Phase 2: Failure Classification
  const failureCategories: FailureCategory[] = failureFacts.length > 0
    ? await classifyFailures(failureFacts)
    : [];

  // TODO: Phase 3 - Artifact Correlation Agent
  // TODO: Phase 4 - Selector Heuristics Agent
  // TODO: Phase 5 - Action Synthesis Agent

  return {
    failureFacts,
    failureCategories,
    // Future phases will add:
    // artifactSignals: ...,
    // selectorAnalysis: ...,
    // diagnosis: ...,
  };
}

