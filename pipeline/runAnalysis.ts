/**
 * Pipeline orchestration for Playwright failure analysis
 *
 * Orchestrates multiple agents in sequence:
 * - Phase 1: Report Decomposition
 * - Phase 2: Failure Classification
 * - Phase 3: Artifact Correlation
 * - Phase 4: Selector Heuristics
 * - Phase 5: Action Synthesis
 * - Phase 5.5: Solution Suggestion
 */

import type {
	PlaywrightArtifacts,
	FailureCategory,
	ArtifactSignals,
	SelectorAnalysis,
	FinalDiagnosis,
	SolutionSuggestion,
} from "@/types/schemas";
import {
	decomposeReport,
	type ReportDecomposerInput,
} from "@/agents/reportDecomposer";
import { classifyFailures } from "@/agents/failureClassifier";
import { correlateArtifacts } from "@/agents/artifactCorrelator";
import { analyzeSelectorHeuristics } from "@/agents/selectorHeuristics";
import { synthesizeAction } from "@/agents/actionSynthesizer";
import { suggestSolution } from "@/agents/solutionSuggester";
import { readTraceZip } from "@/tools/readTrace";
import { extractDOMSnapshot } from "@/tools/extractDOM";

/**
 * Run the complete analysis pipeline
 *
 * @param artifacts - Playwright artifacts from a single run
 * @returns Analysis results
 */
export async function runAnalysis(artifacts: PlaywrightArtifacts) {
	// Phase 1: Report Decomposition
	const reportJson =
		typeof artifacts.reportJson === "string"
			? artifacts.reportJson
			: artifacts.reportJson.toString("utf-8");

	const decompositionInput: ReportDecomposerInput = {
		reportJson: artifacts.reportJson,
		contextMd: artifacts.contextMd,
	};

	const failureFacts = await decomposeReport(decompositionInput);

	// Phase 2: Failure Classification
	const failureCategories: FailureCategory[] =
		failureFacts.length > 0 ? await classifyFailures(failureFacts) : [];

	// Phase 3: Artifact Correlation (conditional - requires trace.zip)
	const artifactSignals: Array<ArtifactSignals | null> = [];
	let traceData: Awaited<ReturnType<typeof readTraceZip>> | null = null;

	if (artifacts.traceZip && failureFacts.length > 0) {
		// Read trace data once for reuse
		traceData = await readTraceZip(artifacts.traceZip);

		// Correlate artifacts for each failure
		const correlations = await Promise.all(
			failureFacts.map((facts) =>
				correlateArtifacts({
					failureFacts: facts,
					artifacts,
				}),
			),
		);
		artifactSignals.push(...correlations);
	} else {
		// No trace available, return null for each failure
		artifactSignals.push(...failureFacts.map(() => null));
	}

	// Phase 4: Selector Heuristics Agent (conditional - only for selector-related failures)
	const selectorAnalyses: Array<SelectorAnalysis | null> = [];

	if (failureFacts.length > 0 && failureCategories.length > 0) {
		// Extract DOM snapshots for each failure (if trace available)
		const domSnapshots: Array<Awaited<
			ReturnType<typeof extractDOMSnapshot>
		> | null> = [];

		if (traceData) {
			// Extract DOM snapshot for each failure
			for (let i = 0; i < failureFacts.length; i++) {
				const failureTime =
					traceData.metadata?.endTime ||
					(traceData.actions.length > 0
						? Math.max(...traceData.actions.map((a) => a.timestamp))
						: Date.now());
				const domSnapshot = await extractDOMSnapshot(traceData, failureTime);
				domSnapshots.push(domSnapshot);
			}
		} else {
			// No trace available, no DOM snapshots
			domSnapshots.push(...failureFacts.map(() => null));
		}

		// Run selector heuristics for each failure
		for (let i = 0; i < failureFacts.length; i++) {
			const failureCategory = failureCategories[i];
			const domSnapshot = domSnapshots[i];

			// Check if this is a selector-related failure
			const isSelectorRelated =
				failureCategory.category === "selector_not_found" ||
				artifactSignals[i]?.uiState === "element missing" ||
				failureFacts[i].failedStep.toLowerCase().includes("selector") ||
				failureFacts[i].failedStep.toLowerCase().includes("locator");

			// Find the failed action from trace (if available)
			let failedAction:
				| Awaited<ReturnType<typeof readTraceZip>>["actions"][0]
				| null = null;
			if (traceData) {
				console.log(
					`[Pipeline] Looking for failed action in trace. Total actions: ${traceData.actions.length}`,
				);

				// Find actions with errors, closest to failure time
				const failureTime =
					traceData.metadata?.endTime ||
					(traceData.actions.length > 0
						? Math.max(...traceData.actions.map((a) => a.timestamp))
						: Date.now());

				// Find actions with errors, sorted by proximity to failure time
				const actionsWithErrors = traceData.actions
					.filter((a) => a.error)
					.sort(
						(a, b) =>
							Math.abs(a.timestamp - failureTime) -
							Math.abs(b.timestamp - failureTime),
					);

				console.log(
					`[Pipeline] Found ${actionsWithErrors.length} actions with errors`,
				);

				if (actionsWithErrors.length > 0) {
					failedAction = actionsWithErrors[0];
					console.log("[Pipeline] Using failed action:", {
						actionName: failedAction.action?.name,
						selector: failedAction.action?.selector,
						error: failedAction.error?.message?.substring(0, 100),
					});
				} else {
					// If no actions with errors, try to find the last action (might be the one that failed)
					const lastAction =
						traceData.actions.length > 0
							? traceData.actions[traceData.actions.length - 1]
							: null;

					if (lastAction) {
						console.log(
							"[Pipeline] No actions with errors found, using last action:",
							{
								actionName: lastAction.action?.name,
								selector: lastAction.action?.selector,
							},
						);
						failedAction = lastAction;
					}
				}
			} else {
				console.log("[Pipeline] No trace data available");
			}

			if (isSelectorRelated) {
				const analysis = await analyzeSelectorHeuristics({
					failureFacts: failureFacts[i],
					failureCategory,
					domSnapshot,
					failedAction,
				});
				selectorAnalyses.push(analysis);
			} else {
				selectorAnalyses.push(null);
			}
		}
	} else {
		// No failures or categories, return null for each
		selectorAnalyses.push(...failureFacts.map(() => null));
	}

	// Phase 5: Action Synthesis Agent
	const diagnoses: Array<FinalDiagnosis | null> = [];

	if (failureFacts.length > 0) {
		for (let i = 0; i < failureFacts.length; i++) {
			const diagnosis = await synthesizeAction({
				failureFacts: failureFacts[i],
				failureCategory: failureCategories[i],
				artifactSignals: artifactSignals[i],
				selectorAnalysis: selectorAnalyses[i],
			});
			diagnoses.push(diagnosis);
		}
	}

	// Phase 5.5: Solution Suggestion Agent
	const solutionSuggestions: Array<SolutionSuggestion | null> = [];

	if (failureFacts.length > 0 && diagnoses.length > 0) {
		// Extract DOM snapshots for solution suggester (reuse from Phase 4 if available)
		const domSnapshotsForSolutions: Array<Awaited<
			ReturnType<typeof extractDOMSnapshot>
		> | null> = [];

		if (traceData) {
			for (let i = 0; i < failureFacts.length; i++) {
				const failureTime =
					traceData.metadata?.endTime ||
					(traceData.actions.length > 0
						? Math.max(...traceData.actions.map((a) => a.timestamp))
						: Date.now());
				const domSnapshot = await extractDOMSnapshot(traceData, failureTime);
				domSnapshotsForSolutions.push(domSnapshot);
			}
		} else {
			domSnapshotsForSolutions.push(...failureFacts.map(() => null));
		}

		for (let i = 0; i < failureFacts.length; i++) {
			const diagnosis = diagnoses[i];

			// Only suggest solutions if we have a diagnosis
			if (diagnosis) {
				const suggestion = await suggestSolution({
					failureFacts: failureFacts[i],
					failureCategory: failureCategories[i],
					artifactSignals: artifactSignals[i],
					selectorAnalysis: selectorAnalyses[i],
					finalDiagnosis: diagnosis,
					domSnapshot: domSnapshotsForSolutions[i],
				});
				solutionSuggestions.push(suggestion);
			} else {
				solutionSuggestions.push(null);
			}
		}
	} else {
		// No failures or diagnoses, return null for each
		solutionSuggestions.push(...failureFacts.map(() => null));
	}

	return {
		failureFacts,
		failureCategories,
		artifactSignals,
		selectorAnalyses,
		diagnoses,
		solutionSuggestions,
	};
}
