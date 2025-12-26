import { NextRequest, NextResponse } from 'next/server';
import { extractArtifactsFromZip, isZipFile } from '@/tools/extractArtifacts';
import { parsePlaywrightReport } from '@/tools/parseReport';
import { countTestsFromReport } from '@/tools/countTests';

// Allow longer duration for parsing
export const maxDuration = 30;

export interface ParsedArtifactsInfo {
  report: {
    found: boolean;
    fileName?: string;
    testCount?: number;
    failedTestCount?: number;
    passedTestCount?: number;
  };
  trace: {
    found: boolean;
    fileName?: string;
  };
  screenshots: {
    found: boolean;
    count: number;
    files?: string[];
  };
  video: {
    found: boolean;
    fileName?: string;
  };
  context: {
    found: boolean;
    preview?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Check if a ZIP file was uploaded (primary method)
    const zipFile = formData.get('zip') as File | null;
    
    const info: ParsedArtifactsInfo = {
      report: { found: false },
      trace: { found: false },
      screenshots: { found: false, count: 0 },
      video: { found: false },
      context: { found: false },
    };

    if (zipFile && isZipFile(zipFile)) {
      // Extract artifacts from ZIP
      const extracted = await extractArtifactsFromZip(zipFile);

      // Report info
      if (extracted.reportJson) {
        try {
          const reportBuffer = Buffer.isBuffer(extracted.reportJson) 
            ? extracted.reportJson 
            : Buffer.from(extracted.reportJson, 'utf-8');
          const failures = parsePlaywrightReport(reportBuffer);
          
          // Count tests from the report structure (handles nested suites)
          const reportStr = reportBuffer.toString('utf-8');
          const reportData = JSON.parse(reportStr);
          const counts = countTestsFromReport(reportData);

          info.report = {
            found: true,
            fileName: extracted.reportFileName || 'report.json',
            testCount: counts.total,
            failedTestCount: counts.failed,
            passedTestCount: counts.passed,
          };
        } catch (error) {
          info.report = {
            found: true,
            fileName: extracted.reportFileName || 'report.json',
          };
        }
      }

      // Trace info
      if (extracted.traceZip) {
        info.trace = {
          found: true,
          fileName: extracted.traceFileName || 'trace.zip',
        };
      }

      // Screenshots info
      if (extracted.screenshots && extracted.screenshots.length > 0) {
        info.screenshots = {
          found: true,
          count: extracted.screenshots.length,
          files: extracted.screenshots.map(s => s.name),
        };
      }

      // Video info
      if (extracted.video) {
        info.video = {
          found: true,
          fileName: extracted.video.name,
        };
      }

      // Context info
      if (extracted.contextMd) {
        info.context = {
          found: true,
          preview: extracted.contextMd.substring(0, 200) + (extracted.contextMd.length > 200 ? '...' : ''),
        };
      }
    } else {
      // Fallback to individual file uploads
      const reportFile = formData.get('report') as File | null;
      const traceFile = formData.get('trace') as File | null;
      const screenshots = formData.getAll('screenshots[]') as File[];
      const video = formData.get('video') as File | null;
      const context = formData.get('context') as string | null;

      // Report info
      if (reportFile) {
        try {
          const reportText = await reportFile.text();
          const failures = parsePlaywrightReport(reportText);
          const reportData = JSON.parse(reportText);
          
          // Count tests from the report structure (handles nested suites)
          const counts = countTestsFromReport(reportData);

          info.report = {
            found: true,
            fileName: reportFile.name,
            testCount: counts.total,
            failedTestCount: counts.failed,
            passedTestCount: counts.passed,
          };
        } catch (error) {
          info.report = {
            found: true,
            fileName: reportFile.name,
          };
        }
      }

      // Trace info
      if (traceFile) {
        info.trace = {
          found: true,
          fileName: traceFile.name,
        };
      }

      // Screenshots info
      if (screenshots.length > 0) {
        info.screenshots = {
          found: true,
          count: screenshots.length,
          files: screenshots.map(f => f.name),
        };
      }

      // Video info
      if (video) {
        info.video = {
          found: true,
          fileName: video.name,
        };
      }

      // Context info
      if (context) {
        info.context = {
          found: true,
          preview: context.substring(0, 200) + (context.length > 200 ? '...' : ''),
        };
      }
    }

    return NextResponse.json({
      success: true,
      info,
    });
  } catch (error) {
    console.error('Parse error:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to parse Playwright artifacts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

