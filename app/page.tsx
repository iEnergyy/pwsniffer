"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
	FileIcon,
	ImageIcon,
	FileTextIcon,
	ArchiveIcon,
	XIcon,
	LoaderIcon,
	PlayIcon,
} from "lucide-react";
import type {
	TestFailureFacts,
	FailureCategory,
	ArtifactSignals,
	SelectorAnalysis,
	FinalDiagnosis,
	SolutionSuggestion,
} from "@/types/schemas";

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function getCategoryBadgeVariant(
	category: FailureCategory["category"],
): "default" | "destructive" | "secondary" | "outline" {
	switch (category) {
		case "selector_not_found":
			return "destructive";
		case "timeout":
			return "outline";
		case "assertion_failed":
			return "secondary";
		case "navigation_error":
			return "destructive";
		case "auth_error":
			return "outline";
		case "unknown":
			return "secondary";
		default:
			return "secondary";
	}
}

function getCategoryLabel(category: FailureCategory["category"]): string {
	switch (category) {
		case "selector_not_found":
			return "Selector Not Found";
		case "timeout":
			return "Timeout";
		case "assertion_failed":
			return "Assertion Failed";
		case "navigation_error":
			return "Navigation Error";
		case "auth_error":
			return "Auth Error";
		case "unknown":
			return "Unknown";
		default:
			return "Unknown";
	}
}

function getConfidenceColor(confidence: number): string {
	if (confidence >= 0.8) return "text-green-600";
	if (confidence >= 0.5) return "text-yellow-600";
	return "text-orange-600";
}

function getPageStateBadgeVariant(
	pageState: string,
): "default" | "destructive" | "secondary" | "outline" {
	switch (pageState.toLowerCase()) {
		case "loaded":
			return "default";
		case "loading":
			return "outline";
		case "error":
		case "failed":
			return "destructive";
		case "timeout":
			return "outline";
		default:
			return "secondary";
	}
}

function getPageStateLabel(pageState: string): string {
	switch (pageState.toLowerCase()) {
		case "loaded":
			return "Loaded";
		case "loading":
			return "Loading";
		case "error":
		case "failed":
			return "Error";
		case "timeout":
			return "Timeout";
		default:
			return "Unknown";
	}
}

function getVerdictBadgeVariant(
	verdict: FinalDiagnosis["verdict"],
): "default" | "destructive" | "secondary" | "outline" {
	switch (verdict) {
		case "test_issue":
			return "secondary";
		case "app_issue":
			return "destructive";
		case "unclear":
			return "outline";
		default:
			return "outline";
	}
}

function getVerdictLabel(verdict: FinalDiagnosis["verdict"]): string {
	switch (verdict) {
		case "test_issue":
			return "Test Issue";
		case "app_issue":
			return "App Issue";
		case "unclear":
			return "Unclear";
		default:
			return "Unknown";
	}
}

function getUrgencyBadgeVariant(
	urgency: FinalDiagnosis["urgency"],
): "default" | "destructive" | "secondary" | "outline" {
	switch (urgency) {
		case "high":
			return "destructive";
		case "medium":
			return "default";
		case "low":
			return "outline";
		default:
			return "outline";
	}
}

function getUrgencyLabel(urgency: FinalDiagnosis["urgency"]): string {
	switch (urgency) {
		case "high":
			return "High";
		case "medium":
			return "Medium";
		case "low":
			return "Low";
		default:
			return "Unknown";
	}
}

export default function Page() {
	// Analysis state
	const [zipFile, setZipFile] = useState<File | null>(null);
	const [useAdvancedMode, setUseAdvancedMode] = useState(false);
	const [reportFile, setReportFile] = useState<File | null>(null);
	const [traceFile, setTraceFile] = useState<File | null>(null);
	const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
	const [videoFile, setVideoFile] = useState<File | null>(null);
	const [contextText, setContextText] = useState("");
	const [parsing, setParsing] = useState(false);
	const [parsedInfo, setParsedInfo] = useState<any>(null);
	const [analyzing, setAnalyzing] = useState(false);
	const [analysisResults, setAnalysisResults] = useState<
		TestFailureFacts[] | null
	>(null);
	const [failureCategories, setFailureCategories] = useState<
		FailureCategory[] | null
	>(null);
	const [artifactSignals, setArtifactSignals] =
		useState<Array<ArtifactSignals | null> | null>(null);
	const [selectorAnalyses, setSelectorAnalyses] =
		useState<Array<SelectorAnalysis | null> | null>(null);
	const [diagnoses, setDiagnoses] =
		useState<Array<FinalDiagnosis | null> | null>(null);
	const [solutionSuggestions, setSolutionSuggestions] =
		useState<Array<SolutionSuggestion | null> | null>(null);
	const [screenshotUrls, setScreenshotUrls] = useState<string[]>([]);
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const [traceSessionId, setTraceSessionId] = useState<string | null>(null);
	const [showTraceViewer, setShowTraceViewer] = useState<boolean>(false);
	const [traceViewerLoading, setTraceViewerLoading] = useState<boolean>(true);
	const [traceViewerError, setTraceViewerError] = useState<boolean>(false);

	const handleParse = async () => {
		// Check if using ZIP (primary method) or individual files (advanced)
		if (!useAdvancedMode && !zipFile) {
			setAnalysisError(
				"Please upload a ZIP file containing Playwright artifacts",
			);
			return;
		}

		if (useAdvancedMode && (!reportFile || !traceFile)) {
			setAnalysisError(
				"Please upload both a Playwright report JSON file and a trace ZIP file",
			);
			return;
		}

		setParsing(true);
		setAnalysisError(null);
		setParsedInfo(null);

		try {
			const formData = new FormData();

			if (!useAdvancedMode && zipFile) {
				// Primary method: Upload ZIP file
				formData.append("zip", zipFile);
			} else {
				// Advanced method: Individual files
				formData.append("report", reportFile!);
				formData.append("trace", traceFile!);

				screenshotFiles.forEach((file) => {
					formData.append("screenshots[]", file);
				});

				if (videoFile) {
					formData.append("video", videoFile);
				}

				if (contextText.trim()) {
					formData.append("context", contextText);
				}
			}

			const response = await fetch("/api/parse", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.message || "Parsing failed");
			}

			setParsedInfo(data.info);
		} catch (error) {
			setAnalysisError(
				error instanceof Error ? error.message : "Unknown error occurred",
			);
		} finally {
			setParsing(false);
		}
	};

	const handleAnalyze = async () => {
		if (!parsedInfo) {
			// If not parsed yet, parse first
			await handleParse();
			return;
		}

		setAnalyzing(true);
		setAnalysisError(null);
		setAnalysisResults(null);
		setFailureCategories(null);
		setArtifactSignals(null);
		setSelectorAnalyses(null);
		setDiagnoses(null);
		setSolutionSuggestions(null);
		setScreenshotUrls([]);

		try {
			const formData = new FormData();
			let screenshotsToProcess: File[] = [];

			if (!useAdvancedMode && zipFile) {
				// Primary method: Upload ZIP file
				formData.append("zip", zipFile);
				// Note: Screenshot extraction from ZIP happens on server side
				// We'll get screenshot URLs from the API response if available
			} else {
				// Advanced method: Individual files
				formData.append("report", reportFile!);
				formData.append("trace", traceFile!);

				screenshotFiles.forEach((file) => {
					formData.append("screenshots[]", file);
					screenshotsToProcess.push(file);
				});

				if (videoFile) {
					formData.append("video", videoFile);
				}

				if (contextText.trim()) {
					formData.append("context", contextText);
				}
			}

			// For individual file uploads, convert screenshots to data URLs for immediate display
			// For ZIP files, screenshots will come from the API response
			if (screenshotsToProcess.length > 0) {
				const urls: string[] = [];
				for (const screenshot of screenshotsToProcess) {
					const arrayBuffer = await screenshot.arrayBuffer();
					const base64 = btoa(
						String.fromCharCode(...new Uint8Array(arrayBuffer)),
					);
					const mimeType = screenshot.type || "image/png";
					urls.push(`data:${mimeType};base64,${base64}`);
				}
				setScreenshotUrls(urls);
			}

			const response = await fetch("/api/analyze", {
				method: "POST",
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.message || "Analysis failed");
			}

			setAnalysisResults(data.results.failureFacts);
			setFailureCategories(data.results.failureCategories || null);
			setArtifactSignals(data.results.artifactSignals || null);
			setSelectorAnalyses(data.results.selectorAnalyses || null);
			setDiagnoses(data.results.diagnoses || null);
			setSolutionSuggestions(data.results.solutionSuggestions || null);

			// Update screenshot URLs from API response (for ZIP files)
			if (
				data.results.screenshotUrls &&
				data.results.screenshotUrls.length > 0
			) {
				setScreenshotUrls(data.results.screenshotUrls);
			}

			// Set trace session ID from API response (trace upload handled on server)
			if (data.results.traceSessionId) {
				setTraceSessionId(data.results.traceSessionId);
			}
		} catch (error) {
			setAnalysisError(
				error instanceof Error ? error.message : "Unknown error occurred",
			);
		} finally {
			setAnalyzing(false);
		}
	};

	return (
		<div className="flex flex-col h-screen max-w-7xl mx-auto p-4">
			<div className="flex-1 overflow-y-auto mb-4">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<Card className="h-fit">
						<CardHeader>
							<CardTitle>Upload Playwright Artifacts</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Simple ZIP Upload (Primary Method) */}
							{!useAdvancedMode && (
								<div>
									<label className="text-sm font-medium mb-2 block">
										ZIP File (contains all artifacts)
									</label>
									<p className="text-xs text-muted-foreground mb-2">
										Upload a ZIP file containing your Playwright artifacts. The
										system will automatically identify: any Playwright report
										JSON file (e.g., playwright-report.json), trace.zip,
										screenshots, videos, and context.md
									</p>
									<Input
										type="file"
										accept=".zip,application/zip"
										onChange={(e) => setZipFile(e.target.files?.[0] || null)}
									/>
									{zipFile && (
										<div className="mt-2 flex items-center gap-2">
											<ArchiveIcon className="size-4" />
											<span className="text-sm">{zipFile.name}</span>
											<span className="text-xs text-muted-foreground">
												({formatFileSize(zipFile.size)})
											</span>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setZipFile(null)}
											>
												<XIcon className="size-3" />
											</Button>
										</div>
									)}
								</div>
							)}

							{/* Advanced Mode Toggle */}
							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="advanced-mode"
									checked={useAdvancedMode}
									onChange={(e) => setUseAdvancedMode(e.target.checked)}
									className="rounded"
								/>
								<label
									htmlFor="advanced-mode"
									className="text-sm cursor-pointer"
								>
									Use advanced mode (upload individual files)
								</label>
							</div>

							{/* Advanced Mode: Individual Files */}
							{useAdvancedMode && (
								<>
									{/* Report File */}
									<div>
										<label className="text-sm font-medium mb-2 block">
											Playwright Report JSON (required)
										</label>
										<p className="text-xs text-muted-foreground mb-2">
											Any JSON file containing Playwright test results (e.g.,
											playwright-report.json, report.json, etc.)
										</p>
										<Input
											type="file"
											accept=".json,application/json"
											onChange={(e) =>
												setReportFile(e.target.files?.[0] || null)
											}
										/>
										{reportFile && (
											<div className="mt-2 flex items-center gap-2">
												<FileTextIcon className="size-4" />
												<span className="text-sm">{reportFile.name}</span>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => setReportFile(null)}
												>
													<XIcon className="size-3" />
												</Button>
											</div>
										)}
									</div>

									{/* Trace File */}
									<div>
										<label className="text-sm font-medium mb-2 block">
											Trace ZIP (required)
										</label>
										<Input
											type="file"
											accept=".zip,application/zip"
											onChange={(e) =>
												setTraceFile(e.target.files?.[0] || null)
											}
										/>
										{traceFile && (
											<div className="mt-2 flex items-center gap-2">
												<ArchiveIcon className="size-4" />
												<span className="text-sm">{traceFile.name}</span>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => setTraceFile(null)}
												>
													<XIcon className="size-3" />
												</Button>
											</div>
										)}
									</div>
								</>
							)}

							{/* Screenshots (Advanced Mode Only) */}
							{useAdvancedMode && (
								<div>
									<label className="text-sm font-medium mb-2 block">
										Screenshots (optional)
									</label>
									<Input
										type="file"
										accept="image/*"
										multiple
										onChange={(e) =>
											setScreenshotFiles(Array.from(e.target.files || []))
										}
									/>
									{screenshotFiles.length > 0 && (
										<div className="mt-2 flex flex-wrap gap-2">
											{screenshotFiles.map((file, index) => (
												<Badge
													key={index}
													variant="secondary"
													className="gap-2"
												>
													<ImageIcon className="size-3" />
													{file.name}
													<button
														type="button"
														onClick={() =>
															setScreenshotFiles(
																screenshotFiles.filter((_, i) => i !== index),
															)
														}
													>
														<XIcon className="size-3" />
													</button>
												</Badge>
											))}
										</div>
									)}
								</div>
							)}

							{/* Video (Advanced Mode Only) */}
							{useAdvancedMode && (
								<div>
									<label className="text-sm font-medium mb-2 block">
										Video (optional)
									</label>
									<Input
										type="file"
										accept="video/*"
										onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
									/>
									{videoFile && (
										<div className="mt-2 flex items-center gap-2">
											<FileIcon className="size-4" />
											<span className="text-sm">{videoFile.name}</span>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setVideoFile(null)}
											>
												<XIcon className="size-3" />
											</Button>
										</div>
									)}
								</div>
							)}

							{/* Context (Advanced Mode Only) */}
							{useAdvancedMode && (
								<div>
									<label className="text-sm font-medium mb-2 block">
										Additional Context (optional)
									</label>
									<Textarea
										value={contextText}
										onChange={(e) => setContextText(e.target.value)}
										placeholder="Provide any additional context about this test run..."
										rows={4}
									/>
								</div>
							)}

							{/* Parse Button */}
							{!parsedInfo && (
								<Button
									onClick={handleParse}
									disabled={
										parsing ||
										(!useAdvancedMode && !zipFile) ||
										(useAdvancedMode && (!reportFile || !traceFile))
									}
									className="w-full"
								>
									{parsing ? (
										<>
											<LoaderIcon className="size-4 mr-2 animate-spin" />
											Parsing artifacts...
										</>
									) : (
										<>
											<FileIcon className="size-4 mr-2" />
											Parse Artifacts
										</>
									)}
								</Button>
							)}

							{/* Parsed Info Preview */}
							{parsedInfo && (
								<Card className="bg-muted/50 border-2">
									<CardHeader>
										<CardTitle className="text-base">
											Parsed Artifacts
										</CardTitle>
										<p className="text-xs text-muted-foreground">
											Review what was found before analyzing
										</p>
									</CardHeader>
									<CardContent className="space-y-4">
										{/* Report Info */}
										<div className="space-y-2">
											<div className="flex items-center gap-2">
												<FileTextIcon className="size-4" />
												<span className="text-sm font-medium">Report JSON</span>
												{parsedInfo.report.found ? (
													<Badge variant="default" className="text-xs">
														Found
													</Badge>
												) : (
													<Badge variant="destructive" className="text-xs">
														Missing
													</Badge>
												)}
											</div>
											{parsedInfo.report.found && (
												<div className="ml-6 space-y-1 text-sm text-muted-foreground">
													<div>File: {parsedInfo.report.fileName}</div>
													{parsedInfo.report.testCount !== undefined && (
														<div>
															Tests: {parsedInfo.report.testCount} total
															{parsedInfo.report.failedTestCount !==
																undefined && (
																<>
																	{" "}
																	<span className="text-destructive">
																		({parsedInfo.report.failedTestCount} failed)
																	</span>
																</>
															)}
															{parsedInfo.report.passedTestCount !==
																undefined && (
																<>
																	{" "}
																	<span className="text-green-600">
																		({parsedInfo.report.passedTestCount} passed)
																	</span>
																</>
															)}
														</div>
													)}
												</div>
											)}
										</div>

										{/* Trace Info */}
										<div className="space-y-2">
											<div className="flex items-center gap-2">
												<ArchiveIcon className="size-4" />
												<span className="text-sm font-medium">Trace ZIP</span>
												{parsedInfo.trace.found ? (
													<Badge variant="default" className="text-xs">
														Found
													</Badge>
												) : (
													<Badge variant="destructive" className="text-xs">
														Missing
													</Badge>
												)}
											</div>
											{parsedInfo.trace.found && (
												<div className="ml-6 text-sm text-muted-foreground">
													File: {parsedInfo.trace.fileName}
												</div>
											)}
										</div>

										{/* Screenshots Info */}
										{parsedInfo.screenshots.found && (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<ImageIcon className="size-4" />
													<span className="text-sm font-medium">
														Screenshots
													</span>
													<Badge variant="default" className="text-xs">
														{parsedInfo.screenshots.count} found
													</Badge>
												</div>
												{parsedInfo.screenshots.files &&
													parsedInfo.screenshots.files.length > 0 && (
														<div className="ml-6 space-y-1">
															{parsedInfo.screenshots.files
																.slice(0, 3)
																.map((file: string, idx: number) => (
																	<div
																		key={idx}
																		className="text-xs text-muted-foreground"
																	>
																		• {file}
																	</div>
																))}
															{parsedInfo.screenshots.files.length > 3 && (
																<div className="text-xs text-muted-foreground">
																	... and{" "}
																	{parsedInfo.screenshots.files.length - 3} more
																</div>
															)}
														</div>
													)}
											</div>
										)}

										{/* Video Info */}
										{parsedInfo.video.found && (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<FileIcon className="size-4" />
													<span className="text-sm font-medium">Video</span>
													<Badge variant="default" className="text-xs">
														Found
													</Badge>
												</div>
												<div className="ml-6 text-sm text-muted-foreground">
													File: {parsedInfo.video.fileName}
												</div>
											</div>
										)}

										{/* Context Info */}
										{parsedInfo.context.found && (
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<FileTextIcon className="size-4" />
													<span className="text-sm font-medium">Context</span>
													<Badge variant="default" className="text-xs">
														Found
													</Badge>
												</div>
												{parsedInfo.context.preview && (
													<Card className="bg-background ml-6">
														<CardContent className="pt-4">
															<pre className="text-xs whitespace-pre-wrap overflow-auto max-h-32">
																{parsedInfo.context.preview}
															</pre>
														</CardContent>
													</Card>
												)}
											</div>
										)}

										{/* Confirm and Analyze Button */}
										<div className="flex gap-2 pt-2">
											<Button
												variant="outline"
												onClick={() => {
													setParsedInfo(null);
													setAnalysisResults(null);
													setFailureCategories(null);
													setArtifactSignals(null);
													setSelectorAnalyses(null);
													setDiagnoses(null);
												}}
												className="flex-1"
											>
												<XIcon className="size-4 mr-2" />
												Cancel
											</Button>
											<Button
												onClick={handleAnalyze}
												disabled={
													analyzing ||
													!parsedInfo.report.found ||
													!parsedInfo.trace.found
												}
												className="flex-1"
											>
												{analyzing ? (
													<>
														<LoaderIcon className="size-4 mr-2 animate-spin" />
														Analyzing...
													</>
												) : (
													<>
														<PlayIcon className="size-4 mr-2" />
														Confirm & Analyze
													</>
												)}
											</Button>
										</div>
									</CardContent>
								</Card>
							)}

							{/* Error Display */}
							{analysisError && (
								<Card className="bg-destructive/10 border-destructive">
									<CardContent className="pt-6">
										<p className="text-sm text-destructive">{analysisError}</p>
									</CardContent>
								</Card>
							)}
						</CardContent>
					</Card>

					{/* Analysis Results Section */}
					<Card className="h-fit">
						<CardHeader>
							<CardTitle>Analysis Results</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Results Display */}
							{analysisResults && (
								<div className="space-y-4">
									{analysisResults.length === 0 ? (
										<Card>
											<CardContent className="pt-6">
												<p className="text-sm text-muted-foreground">
													No test failures found in this run.
												</p>
											</CardContent>
										</Card>
									) : (
										analysisResults.map((failure, index) => {
											const category = failureCategories?.[index];
											const signals = artifactSignals?.[index];
											const selectorAnalysis = selectorAnalyses?.[index];
											const diagnosis = diagnoses?.[index];
											const solutionSuggestion = solutionSuggestions?.[index];
											return (
												<Card key={index}>
													<CardHeader>
														<div className="flex items-center justify-between">
															<CardTitle className="text-base">
																{failure.testName}
															</CardTitle>
															<div className="flex items-center gap-2">
																{category && (
																	<>
																		<Badge
																			variant={getCategoryBadgeVariant(
																				category.category,
																			)}
																		>
																			{getCategoryLabel(category.category)}
																		</Badge>
																		<span
																			className={`text-xs ${getConfidenceColor(category.confidence)}`}
																		>
																			{(category.confidence * 100).toFixed(0)}%
																		</span>
																	</>
																)}
																{traceSessionId && (
																	<Button
																		variant="outline"
																		size="sm"
																		onClick={async () => {
																			// Verify trace is still available before opening viewer
																			try {
																				const response = await fetch(
																					`/api/trace/${traceSessionId}`,
																					{
																						method: "HEAD",
																					},
																				);
																				if (response.ok) {
																					setTraceViewerLoading(true);
																					setTraceViewerError(false);
																					setShowTraceViewer(true);
																				} else {
																					setAnalysisError(
																						"Trace session expired. Please re-analyze to view trace.",
																					);
																					setTraceSessionId(null);
																				}
																			} catch (error) {
																				setAnalysisError(
																					"Failed to verify trace availability.",
																				);
																			}
																		}}
																		className="flex items-center gap-1"
																	>
																		<FileTextIcon className="h-3 w-3" />
																		View Trace
																	</Button>
																)}
															</div>
														</div>
														{category && (
															<p className="text-xs text-muted-foreground mt-2">
																{category.reasoning}
															</p>
														)}
													</CardHeader>
													<CardContent className="space-y-2">
														{/* Diagnosis Section - Prominent at top */}
														{diagnosis && (
															<Card
																className={`mb-4 ${
																	diagnosis.verdict === "app_issue"
																		? "bg-destructive/10 border-destructive/20"
																		: diagnosis.verdict === "test_issue"
																			? "bg-secondary/10 border-secondary/20"
																			: "bg-muted/50"
																}`}
															>
																<CardContent className="pt-4">
																	<div className="space-y-3">
																		<div className="flex items-center gap-3 flex-wrap">
																			<div>
																				<span className="text-sm font-medium">
																					Verdict:{" "}
																				</span>
																				<Badge
																					variant={getVerdictBadgeVariant(
																						diagnosis.verdict,
																					)}
																					className="ml-2"
																				>
																					{getVerdictLabel(diagnosis.verdict)}
																				</Badge>
																			</div>
																			<div>
																				<span className="text-sm font-medium">
																					Urgency:{" "}
																				</span>
																				<Badge
																					variant={getUrgencyBadgeVariant(
																						diagnosis.urgency,
																					)}
																					className="ml-2"
																				>
																					{getUrgencyLabel(diagnosis.urgency)}
																				</Badge>
																			</div>
																		</div>
																		<div>
																			<span className="text-sm font-semibold">
																				Recommended Action:{" "}
																			</span>
																			<span className="text-sm font-medium text-primary ml-2">
																				{diagnosis.recommendedAction}
																			</span>
																		</div>
																		<div>
																			<span className="text-sm font-medium">
																				Reason:{" "}
																			</span>
																			<p className="text-sm text-muted-foreground mt-1">
																				{diagnosis.reason}
																			</p>
																		</div>
																	</div>
																</CardContent>
															</Card>
														)}

														{/* Solution Suggestion Section - After Diagnosis */}
														{solutionSuggestion && (
															<Card className="mb-4 bg-primary/5 border-primary/20">
																<CardHeader>
																	<CardTitle className="text-base">
																		Suggested Solution
																	</CardTitle>
																</CardHeader>
																<CardContent className="space-y-4">
																	{solutionSuggestion.explanation && (
																		<div>
																			<span className="text-sm font-medium">
																				Explanation:{" "}
																			</span>
																			<p className="text-sm text-muted-foreground mt-1">
																				{solutionSuggestion.explanation}
																			</p>
																		</div>
																	)}

																	{/* Before/After Code Comparison */}
																	{(solutionSuggestion.originalCode ||
																		solutionSuggestion.suggestedCode) && (
																		<div className="space-y-3">
																			{solutionSuggestion.originalCode && (
																				<div>
																					<span className="text-sm font-medium">
																						Original Code:{" "}
																					</span>
																					<Card className="bg-muted mt-2">
																						<CardContent className="pt-4">
																							<div className="flex items-center justify-between mb-2">
																								<span className="text-xs text-muted-foreground">
																									Before
																								</span>
																							</div>
																							<pre className="text-xs overflow-auto max-h-32">
																								<code>
																									{
																										solutionSuggestion.originalCode
																									}
																								</code>
																							</pre>
																						</CardContent>
																					</Card>
																				</div>
																			)}

																			{solutionSuggestion.suggestedCode && (
																				<div>
																					<span className="text-sm font-medium">
																						Suggested Code:{" "}
																					</span>
																					<Card className="bg-muted mt-2">
																						<CardContent className="pt-4">
																							<div className="flex items-center justify-between mb-2">
																								<span className="text-xs text-muted-foreground">
																									After
																								</span>
																								<Button
																									variant="outline"
																									size="sm"
																									onClick={() => {
																										navigator.clipboard.writeText(
																											solutionSuggestion.suggestedCode ||
																												"",
																										);
																									}}
																									className="h-6 text-xs"
																								>
																									Copy Code
																								</Button>
																							</div>
																							<pre className="text-xs overflow-auto max-h-64">
																								<code>
																									{
																										solutionSuggestion.suggestedCode
																									}
																								</code>
																							</pre>
																						</CardContent>
																					</Card>
																				</div>
																			)}
																		</div>
																	)}

																	{/* Step-by-step Instructions */}
																	{solutionSuggestion.steps &&
																		solutionSuggestion.steps.length > 0 && (
																			<div>
																				<span className="text-sm font-semibold">
																					Implementation Steps:{" "}
																				</span>
																				<ol className="list-decimal list-inside mt-2 space-y-1">
																					{solutionSuggestion.steps.map(
																						(step, stepIndex) => (
																							<li
																								key={stepIndex}
																								className="text-sm text-muted-foreground"
																							>
																								{step}
																							</li>
																						),
																					)}
																				</ol>
																			</div>
																		)}

																	{/* Alternative Approaches */}
																	{solutionSuggestion.alternativeApproaches &&
																		solutionSuggestion.alternativeApproaches
																			.length > 0 && (
																			<div>
																				<span className="text-sm font-semibold">
																					Alternative Approaches:{" "}
																				</span>
																				<ul className="list-disc list-inside mt-2 space-y-1">
																					{solutionSuggestion.alternativeApproaches.map(
																						(approach, altIndex) => (
																							<li
																								key={altIndex}
																								className="text-sm text-muted-foreground"
																							>
																								{approach}
																							</li>
																						),
																					)}
																				</ul>
																			</div>
																		)}

																	{/* Confidence Score */}
																	<div>
																		<span className="text-xs text-muted-foreground">
																			Confidence:{" "}
																			{(
																				solutionSuggestion.confidence * 100
																			).toFixed(0)}
																			%
																		</span>
																	</div>
																</CardContent>
															</Card>
														)}

														<div>
															<span className="text-sm font-medium">
																File:{" "}
															</span>
															<span className="text-sm">{failure.file}</span>
														</div>
														<div>
															<span className="text-sm font-medium">
																Failed Step:{" "}
															</span>
															<span className="text-sm">
																{failure.failedStep}
															</span>
														</div>
														<div>
															<span className="text-sm font-medium">
																Error:{" "}
															</span>
															<span className="text-sm text-destructive">
																{failure.error}
															</span>
														</div>
														{failure.timeout && (
															<div>
																<span className="text-sm font-medium">
																	Timeout:{" "}
																</span>
																<span className="text-sm">
																	{failure.timeout}ms
																</span>
															</div>
														)}
														{(failure.lineNumber || failure.columnNumber) && (
															<div>
																<span className="text-sm font-medium">
																	Location:{" "}
																</span>
																<span className="text-sm">
																	Line {failure.lineNumber}
																	{failure.columnNumber &&
																		`, Column ${failure.columnNumber}`}
																</span>
															</div>
														)}
														{failure.stackTrace &&
															failure.stackTrace.length > 0 && (
																<div>
																	<span className="text-sm font-medium">
																		Stack Trace:{" "}
																	</span>
																	<Card className="bg-muted mt-2">
																		<CardContent className="pt-4">
																			<pre className="text-xs overflow-auto max-h-48">
																				{failure.stackTrace.join("\n")}
																			</pre>
																		</CardContent>
																	</Card>
																</div>
															)}

														{/* Screenshot Display */}
														{screenshotUrls.length > 0 && (
															<div className="mt-4 pt-4 border-t">
																<h4 className="text-sm font-semibold mb-3">
																	Screenshots
																</h4>
																<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
																	{screenshotUrls.map((url, imgIndex) => (
																		<div key={imgIndex} className="relative">
																			<img
																				src={url}
																				alt={`Screenshot ${imgIndex + 1}`}
																				className="w-full h-auto rounded border border-border max-h-96 object-contain bg-muted"
																			/>
																		</div>
																	))}
																</div>
															</div>
														)}

														{/* Artifact Signals Section */}
														{signals && (
															<div className="mt-4 pt-4 border-t">
																<h4 className="text-sm font-semibold mb-3">
																	UI State Analysis
																</h4>
																<div className="space-y-3">
																	<div>
																		<span className="text-sm font-medium">
																			Page State:{" "}
																		</span>
																		<Badge
																			variant={getPageStateBadgeVariant(
																				signals.pageState,
																			)}
																			className="ml-2"
																		>
																			{getPageStateLabel(signals.pageState)}
																		</Badge>
																	</div>
																	<div>
																		<span className="text-sm font-medium">
																			UI State:{" "}
																		</span>
																		<span className="text-sm text-muted-foreground ml-2">
																			{signals.uiState}
																		</span>
																	</div>
																	{signals.blockingFactors &&
																		signals.blockingFactors.length > 0 && (
																			<div>
																				<span className="text-sm font-medium">
																					Blocking Factors:{" "}
																				</span>
																				<ul className="list-disc list-inside mt-1 space-y-1">
																					{signals.blockingFactors.map(
																						(factor, factorIndex) => (
																							<li
																								key={factorIndex}
																								className="text-sm text-muted-foreground"
																							>
																								{factor}
																							</li>
																						),
																					)}
																				</ul>
																			</div>
																		)}
																</div>
															</div>
														)}
														{signals === null && artifactSignals !== null && (
															<div className="mt-4 pt-4 border-t">
																<p className="text-xs text-muted-foreground">
																	Artifact correlation unavailable (trace.zip
																	required)
																</p>
															</div>
														)}

														{/* Selector Analysis Section */}
														{selectorAnalysis && (
															<div className="mt-4 pt-4 border-t">
																<h4 className="text-sm font-semibold mb-3">
																	Selector Analysis
																</h4>
																<div className="space-y-3">
																	<div>
																		<span className="text-sm font-medium">
																			Quality:{" "}
																		</span>
																		<Badge
																			variant={
																				selectorAnalysis.selectorQuality ===
																				"excellent"
																					? "default"
																					: selectorAnalysis.selectorQuality ===
																							"good"
																						? "default"
																						: selectorAnalysis.selectorQuality ===
																								"fragile"
																							? "secondary"
																							: "destructive"
																			}
																			className="ml-2"
																		>
																			{selectorAnalysis.selectorQuality}
																		</Badge>
																		<span className="text-xs text-muted-foreground ml-2">
																			(Score:{" "}
																			{(
																				selectorAnalysis.qualityScore * 100
																			).toFixed(0)}
																			%)
																		</span>
																	</div>
																	{selectorAnalysis.issues &&
																		selectorAnalysis.issues.length > 0 && (
																			<div>
																				<span className="text-sm font-medium">
																					Issues:{" "}
																				</span>
																				<ul className="list-disc list-inside mt-1 space-y-1">
																					{selectorAnalysis.issues.map(
																						(issue, issueIndex) => (
																							<li
																								key={issueIndex}
																								className="text-sm text-muted-foreground"
																							>
																								{issue}
																							</li>
																						),
																					)}
																				</ul>
																			</div>
																		)}
																	{selectorAnalysis.suggestedSelector && (
																		<div>
																			<span className="text-sm font-medium">
																				Suggested Selector:{" "}
																			</span>
																			<Card className="bg-muted mt-2">
																				<CardContent className="pt-4">
																					<code className="text-xs text-primary font-mono">
																						{selectorAnalysis.suggestedSelector}
																					</code>
																				</CardContent>
																			</Card>
																			{selectorAnalysis.suggestionReason && (
																				<p className="text-xs text-muted-foreground mt-2">
																					{selectorAnalysis.suggestionReason}
																				</p>
																			)}
																		</div>
																	)}
																	<div>
																		<span className="text-xs text-muted-foreground">
																			Confidence:{" "}
																			{(
																				selectorAnalysis.confidence * 100
																			).toFixed(0)}
																			%
																		</span>
																	</div>
																</div>
															</div>
														)}
														{selectorAnalysis === null &&
															selectorAnalyses !== null &&
															category?.category === "selector_not_found" && (
																<div className="mt-4 pt-4 border-t">
																	<p className="text-xs text-muted-foreground">
																		Selector analysis unavailable (could not
																		extract selector from failed step)
																	</p>
																</div>
															)}

														{/* Diagnosis unavailable message */}
														{diagnosis === null && diagnoses !== null && (
															<div className="mt-4 pt-4 border-t">
																<p className="text-xs text-muted-foreground">
																	Diagnosis unavailable (insufficient data to
																	determine verdict)
																</p>
															</div>
														)}
													</CardContent>
												</Card>
											);
										})
									)}
								</div>
							)}
							{!analysisResults && (
								<p className="text-sm text-muted-foreground text-center py-8">
									Upload and analyze artifacts to see results here
								</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Trace Viewer Modal */}
			{showTraceViewer && traceSessionId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="bg-background rounded-lg shadow-lg w-full h-full max-w-7xl max-h-[90vh] m-4 flex flex-col">
						<div className="flex items-center justify-between p-4 border-b">
							<h2 className="text-lg font-semibold">Playwright Trace Viewer</h2>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										// Download trace file
										const url = `/api/trace/${traceSessionId}`;
										const link = document.createElement("a");
										link.href = url;
										link.download = "trace.zip";
										link.click();
									}}
								>
									Download Trace
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setShowTraceViewer(false);
										setTraceViewerLoading(true);
										setTraceViewerError(false);
									}}
								>
									<XIcon className="h-4 w-4" />
								</Button>
							</div>
						</div>
						<div className="flex-1 relative flex items-center justify-center p-8">
							<div className="text-center max-w-2xl space-y-4">
								<FileTextIcon className="h-16 w-16 mx-auto text-muted-foreground" />
								<h3 className="text-lg font-semibold">Trace Viewer</h3>
								<p className="text-sm text-muted-foreground">
									Due to browser security restrictions, the trace viewer cannot
									be embedded directly. You can view your trace using one of
									these methods:
								</p>
								<div className="space-y-3 mt-6">
									<div className="border rounded-lg p-4 text-left">
										<h4 className="font-medium mb-2">
											Option 1: Download and View Locally
										</h4>
										<p className="text-xs text-muted-foreground mb-3">
											Download the trace file and use Playwright's CLI to view
											it.
										</p>
										<div className="flex gap-2">
											<Button
												variant="default"
												size="sm"
												onClick={async () => {
													try {
														const response = await fetch(
															`/api/trace/${traceSessionId}`,
														);
														if (response.ok) {
															const blob = await response.blob();
															const url = URL.createObjectURL(blob);
															const link = document.createElement("a");
															link.href = url;
															link.download = "trace.zip";
															document.body.appendChild(link);
															link.click();
															document.body.removeChild(link);
															URL.revokeObjectURL(url);
														}
													} catch (error) {
														setAnalysisError("Failed to download trace file.");
													}
												}}
											>
												Download Trace
											</Button>
											<p className="text-xs text-muted-foreground self-center ml-2">
												Then run:{" "}
												<code className="bg-muted px-1 py-0.5 rounded">
													npx playwright show-trace trace.zip
												</code>
											</p>
										</div>
									</div>
									<div className="border rounded-lg p-4 text-left">
										<h4 className="font-medium mb-2">
											Option 2: Open in Trace Viewer Website
										</h4>
										<p className="text-xs text-muted-foreground mb-3">
											Open the trace viewer website and upload your trace file
											there.
										</p>
										<Button
											variant="outline"
											size="sm"
											onClick={async () => {
												try {
													const response = await fetch(
														`/api/trace/${traceSessionId}`,
													);
													if (response.ok) {
														const blob = await response.blob();
														const url = URL.createObjectURL(blob);
														// Open trace viewer in new tab
														window.open(
															"https://trace.playwright.dev/",
															"_blank",
														);
														// Store blob URL temporarily for user to upload
														(window as any).__traceBlobUrl = url;
														alert(
															"Trace viewer opened. Please upload the trace file that will be downloaded.",
														);
														// Trigger download
														const link = document.createElement("a");
														link.href = url;
														link.download = "trace.zip";
														document.body.appendChild(link);
														link.click();
														document.body.removeChild(link);
													}
												} catch (error) {
													setAnalysisError("Failed to open trace viewer.");
												}
											}}
										>
											Open Trace Viewer
										</Button>
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setShowTraceViewer(false);
										setTraceViewerLoading(true);
										setTraceViewerError(false);
									}}
									className="mt-4"
								>
									Close
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
