/**
 * Pipeline orchestration for Playwright failure analysis
 * 
 * This is a stub for now. In future phases, this will orchestrate
 * multiple agents in sequence.
 */

import type { PlaywrightArtifacts } from '@/types/schemas';
import { decomposeReport, type ReportDecomposerInput } from '@/agents/reportDecomposer';

/**
 * Run the complete analysis pipeline
 * Currently only runs Phase 1 (Report Decomposition)
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

  // TODO: Phase 2 - Failure Classification Agent
  // TODO: Phase 3 - Artifact Correlation Agent
  // TODO: Phase 4 - Selector Heuristics Agent
  // TODO: Phase 5 - Action Synthesis Agent

  return {
    failureFacts,
    // Future phases will add:
    // failureCategory: ...,
    // artifactSignals: ...,
    // selectorAnalysis: ...,
    // diagnosis: ...,
  };
}

