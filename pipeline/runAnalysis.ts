/**
 * Pipeline orchestration for Playwright failure analysis
 * 
 * Orchestrates multiple agents in sequence:
 * - Phase 1: Report Decomposition
 * - Phase 2: Failure Classification
 * - Phase 3: Artifact Correlation
 */

import type { PlaywrightArtifacts, FailureCategory, ArtifactSignals } from '@/types/schemas';
import { decomposeReport, type ReportDecomposerInput } from '@/agents/reportDecomposer';
import { classifyFailures } from '@/agents/failureClassifier';
import { correlateArtifacts } from '@/agents/artifactCorrelator';

/**
 * Run the complete analysis pipeline
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

  // Phase 3: Artifact Correlation (conditional - requires trace.zip)
  const artifactSignals: Array<ArtifactSignals | null> = [];
  
  if (artifacts.traceZip && failureFacts.length > 0) {
    // Correlate artifacts for each failure
    const correlations = await Promise.all(
      failureFacts.map(facts => 
        correlateArtifacts({
          failureFacts: facts,
          artifacts,
        })
      )
    );
    artifactSignals.push(...correlations);
  } else {
    // No trace available, return null for each failure
    artifactSignals.push(...failureFacts.map(() => null));
  }

  // TODO: Phase 4 - Selector Heuristics Agent
  // TODO: Phase 5 - Action Synthesis Agent

  return {
    failureFacts,
    failureCategories,
    artifactSignals,
    // Future phases will add:
    // selectorAnalysis: ...,
    // diagnosis: ...,
  };
}

