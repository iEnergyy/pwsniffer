'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  FileIcon,
  ImageIcon,
  FileTextIcon,
  ArchiveIcon,
  XIcon,
  LoaderIcon,
  PlayIcon,
} from 'lucide-react';
import type { TestFailureFacts } from '@/types/schemas';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default function Page() {
  // Analysis state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [useAdvancedMode, setUseAdvancedMode] = useState(false);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [traceFile, setTraceFile] = useState<File | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [contextText, setContextText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<TestFailureFacts[] | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleParse = async () => {
    // Check if using ZIP (primary method) or individual files (advanced)
    if (!useAdvancedMode && !zipFile) {
      setAnalysisError('Please upload a ZIP file containing Playwright artifacts');
      return;
    }

    if (useAdvancedMode && (!reportFile || !traceFile)) {
      setAnalysisError('Please upload both a Playwright report JSON file and a trace ZIP file');
      return;
    }

    setParsing(true);
    setAnalysisError(null);
    setParsedInfo(null);

    try {
      const formData = new FormData();

      if (!useAdvancedMode && zipFile) {
        // Primary method: Upload ZIP file
        formData.append('zip', zipFile);
      } else {
        // Advanced method: Individual files
        formData.append('report', reportFile!);
        formData.append('trace', traceFile!);
        
        screenshotFiles.forEach(file => {
          formData.append('screenshots[]', file);
        });
        
        if (videoFile) {
          formData.append('video', videoFile);
        }
        
        if (contextText.trim()) {
          formData.append('context', contextText);
        }
      }

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Parsing failed');
      }

      setParsedInfo(data.info);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error occurred');
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

    try {
      const formData = new FormData();

      if (!useAdvancedMode && zipFile) {
        // Primary method: Upload ZIP file
        formData.append('zip', zipFile);
      } else {
        // Advanced method: Individual files
        formData.append('report', reportFile!);
        formData.append('trace', traceFile!);
        
        screenshotFiles.forEach(file => {
          formData.append('screenshots[]', file);
        });
        
        if (videoFile) {
          formData.append('video', videoFile);
        }
        
        if (contextText.trim()) {
          formData.append('context', contextText);
        }
      }

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Analysis failed');
      }

      setAnalysisResults(data.results.failureFacts);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          <Card>
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
                    Upload a ZIP file containing your Playwright artifacts. The system will automatically identify:
                    any Playwright report JSON file (e.g., playwright-report.json), trace.zip, screenshots, videos, and context.md
                  </p>
                  <Input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={e => setZipFile(e.target.files?.[0] || null)}
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
                  onChange={e => setUseAdvancedMode(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="advanced-mode" className="text-sm cursor-pointer">
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
                      Any JSON file containing Playwright test results (e.g., playwright-report.json, report.json, etc.)
                    </p>
                    <Input
                      type="file"
                      accept=".json,application/json"
                      onChange={e => setReportFile(e.target.files?.[0] || null)}
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
                      onChange={e => setTraceFile(e.target.files?.[0] || null)}
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
                    onChange={e => setScreenshotFiles(Array.from(e.target.files || []))}
                  />
                  {screenshotFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {screenshotFiles.map((file, index) => (
                        <Badge key={index} variant="secondary" className="gap-2">
                          <ImageIcon className="size-3" />
                          {file.name}
                          <button
                            type="button"
                            onClick={() => setScreenshotFiles(screenshotFiles.filter((_, i) => i !== index))}
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
                    onChange={e => setVideoFile(e.target.files?.[0] || null)}
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
                    onChange={e => setContextText(e.target.value)}
                    placeholder="Provide any additional context about this test run..."
                    rows={4}
                  />
                </div>
              )}

              {/* Parse Button */}
              {!parsedInfo && (
                <Button
                  onClick={handleParse}
                  disabled={parsing || (!useAdvancedMode && !zipFile) || (useAdvancedMode && (!reportFile || !traceFile))}
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
                    <CardTitle className="text-base">Parsed Artifacts</CardTitle>
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
                          <Badge variant="default" className="text-xs">Found</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Missing</Badge>
                        )}
                      </div>
                      {parsedInfo.report.found && (
                        <div className="ml-6 space-y-1 text-sm text-muted-foreground">
                          <div>File: {parsedInfo.report.fileName}</div>
                          {parsedInfo.report.testCount !== undefined && (
                            <div>
                              Tests: {parsedInfo.report.testCount} total
                              {parsedInfo.report.failedTestCount !== undefined && (
                                <>
                                  {' '}
                                  <span className="text-destructive">
                                    ({parsedInfo.report.failedTestCount} failed)
                                  </span>
                                </>
                              )}
                              {parsedInfo.report.passedTestCount !== undefined && (
                                <>
                                  {' '}
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
                          <Badge variant="default" className="text-xs">Found</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Missing</Badge>
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
                          <span className="text-sm font-medium">Screenshots</span>
                          <Badge variant="default" className="text-xs">
                            {parsedInfo.screenshots.count} found
                          </Badge>
                        </div>
                        {parsedInfo.screenshots.files && parsedInfo.screenshots.files.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {parsedInfo.screenshots.files.slice(0, 3).map((file: string, idx: number) => (
                              <div key={idx} className="text-xs text-muted-foreground">
                                • {file}
                              </div>
                            ))}
                            {parsedInfo.screenshots.files.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                ... and {parsedInfo.screenshots.files.length - 3} more
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
                          <Badge variant="default" className="text-xs">Found</Badge>
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
                          <Badge variant="default" className="text-xs">Found</Badge>
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
                        }}
                        className="flex-1"
                      >
                        <XIcon className="size-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAnalyze}
                        disabled={analyzing || !parsedInfo.report.found || !parsedInfo.trace.found}
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

              {/* Results Display */}
              {analysisResults && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Analysis Results</h3>
                  {analysisResults.length === 0 ? (
                    <Card>
                      <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">
                          No test failures found in this run.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    analysisResults.map((failure, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <CardTitle className="text-base">{failure.testName}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <span className="text-sm font-medium">File: </span>
                            <span className="text-sm">{failure.file}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Failed Step: </span>
                            <span className="text-sm">{failure.failedStep}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Error: </span>
                            <span className="text-sm text-destructive">{failure.error}</span>
                          </div>
                          {failure.timeout && (
                            <div>
                              <span className="text-sm font-medium">Timeout: </span>
                              <span className="text-sm">{failure.timeout}ms</span>
                            </div>
                          )}
                          {(failure.lineNumber || failure.columnNumber) && (
                            <div>
                              <span className="text-sm font-medium">Location: </span>
                              <span className="text-sm">
                                Line {failure.lineNumber}
                                {failure.columnNumber && `, Column ${failure.columnNumber}`}
                              </span>
                            </div>
                          )}
                          {failure.stackTrace && failure.stackTrace.length > 0 && (
                            <div>
                              <span className="text-sm font-medium">Stack Trace: </span>
                              <Card className="bg-muted mt-2">
                                <CardContent className="pt-4">
                                  <pre className="text-xs overflow-auto max-h-48">
                                    {failure.stackTrace.join('\n')}
                                  </pre>
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
