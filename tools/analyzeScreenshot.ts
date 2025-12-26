/**
 * Analyze screenshot images for visual clues about page state and blocking elements
 * 
 * Uses LLM vision capabilities to detect:
 * - Error pages (404, 500, etc.)
 * - Loading states
 * - Authentication prompts
 * - Blocking modals/banners
 * - Empty/blank pages
 */

import { generateText, zodSchema, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * Screenshot analysis result
 */
export interface ScreenshotAnalysis {
  pageState: 'loaded' | 'loading' | 'error' | 'blank' | 'unknown';
  blockingElements: string[];
  visibleContent: string[];
  confidence: number;
}

/**
 * Screenshot analysis schema for LLM
 */
const ScreenshotAnalysisSchema = z.object({
  pageState: z.enum(['loaded', 'loading', 'error', 'blank', 'unknown']).describe('State of the page in the screenshot'),
  blockingElements: z.array(z.string()).describe('List of blocking UI elements detected (modals, banners, overlays, etc.)'),
  visibleContent: z.array(z.string()).describe('List of visible content elements or text on the page'),
  confidence: z.number().min(0).max(1).describe('Confidence score for this analysis'),
});

/**
 * Analyze a screenshot image for visual clues
 * 
 * @param screenshot - Screenshot file or buffer
 * @returns Screenshot analysis result
 */
export async function analyzeScreenshot(
  screenshot: File | Buffer
): Promise<ScreenshotAnalysis> {
  try {
    // Convert to base64 for LLM vision API
    const imageBuffer = screenshot instanceof File
      ? Buffer.from(await screenshot.arrayBuffer())
      : screenshot;

    const base64Image = imageBuffer.toString('base64');
    const mimeType = screenshot instanceof File 
      ? screenshot.type 
      : 'image/png';

    // Use GPT-4o with vision capabilities
    const result = await generateText({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this screenshot from a Playwright test failure. Identify:
1. Page state: Is the page fully loaded, still loading, showing an error, or blank?
2. Blocking elements: Are there any modals, overlays, banners, cookie consent dialogs, or other UI elements that might block interactions?
3. Visible content: What text or UI elements are visible on the page?

Be specific and accurate. If the page shows an error (404, 500, etc.), note that. If there's a loading spinner or skeleton screen, note that. If there are blocking elements, describe them clearly.`,
            },
            {
              type: 'image',
              image: `data:${mimeType};base64,${base64Image}`,
            },
          ],
        },
      ],
      output: Output.object({
        schema: zodSchema(ScreenshotAnalysisSchema),
      }),
    });

    return result.output;
  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    
    // Fallback: Return unknown state
    return {
      pageState: 'unknown',
      blockingElements: [],
      visibleContent: [],
      confidence: 0.0,
    };
  }
}

/**
 * Detect blocking UI elements in a screenshot
 * 
 * @param screenshot - Screenshot file or buffer
 * @returns Array of blocking element descriptions
 */
export async function detectBlockingUI(
  screenshot: File | Buffer
): Promise<string[]> {
  const analysis = await analyzeScreenshot(screenshot);
  return analysis.blockingElements;
}

/**
 * Check page state from screenshot
 * 
 * @param screenshot - Screenshot file or buffer
 * @returns Page state
 */
export async function checkPageState(
  screenshot: File | Buffer
): Promise<'loaded' | 'loading' | 'error' | 'blank' | 'unknown'> {
  const analysis = await analyzeScreenshot(screenshot);
  return analysis.pageState;
}

