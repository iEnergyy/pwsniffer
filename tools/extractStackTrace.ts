/**
 * Extract and normalize stack traces from error messages
 */

export interface StackTraceLine {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  raw: string;
}

/**
 * Parse error message and extract stack trace
 * @param error - Error message or stack trace string
 * @returns Array of normalized stack trace lines
 */
export function extractStackTrace(error: string): string[] {
  if (!error) return [];

  const lines = error.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Find the stack trace section (usually starts with "Error:" or "at")
  const stackStartIndex = lines.findIndex(line => 
    line.startsWith('at ') || 
    line.startsWith('Error:') ||
    line.includes('at ')
  );

  if (stackStartIndex === -1) {
    // No stack trace found, return the error message as a single line
    return [error];
  }

  // Extract stack trace lines
  const stackLines = lines.slice(stackStartIndex);
  
  return stackLines;
}

/**
 * Parse a stack trace line to extract file, line, and column information
 * @param line - A single stack trace line
 * @returns Parsed stack trace information
 */
export function parseStackTraceLine(line: string): StackTraceLine {
  const result: StackTraceLine = {
    raw: line,
  };

  // Pattern: at functionName (file:line:column) or at file:line:column
  // Example: "at Object.<anonymous> (/tests/login.spec.ts:15:5)"
  const atPattern = /at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/;
  const atPatternSimple = /at\s+(.+?):(\d+):(\d+)/;
  
  const match = line.match(atPattern) || line.match(atPatternSimple);
  
  if (match) {
    if (match.length === 5) {
      // Full pattern with function name
      result.function = match[1].trim();
      result.file = match[2].trim();
      result.line = parseInt(match[3], 10);
      result.column = parseInt(match[4], 10);
    } else if (match.length === 4) {
      // Simple pattern without function name
      result.file = match[1].trim();
      result.line = parseInt(match[2], 10);
      result.column = parseInt(match[3], 10);
    }
  }

  return result;
}

/**
 * Extract file path and line number from error message
 * @param error - Error message or stack trace
 * @returns Object with file path and line number if found
 */
export function extractFileLocation(error: string): { file?: string; line?: number; column?: number } {
  const stackLines = extractStackTrace(error);
  
  for (const line of stackLines) {
    const parsed = parseStackTraceLine(line);
    if (parsed.file && parsed.line) {
      return {
        file: parsed.file,
        line: parsed.line,
        column: parsed.column,
      };
    }
  }

  return {};
}

