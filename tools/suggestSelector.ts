/**
 * Suggest better selectors based on DOM analysis
 * 
 * Analyzes DOM snapshot to find the target element and suggests:
 * - Semantic Playwright locators (getByRole, getByLabel, etc.)
 * - Stable test attributes (data-testid)
 * - Accessible attributes (aria-label, role)
 * - Text content (if stable)
 */

import type { DOMSnapshot } from './extractDOM';
import type { ExtractedSelector } from './extractSelector';

/**
 * Suggested selector with reasoning
 */
export interface SelectorSuggestion {
  suggestedSelector: string;
  reason: string;
  confidence: number;
  type: 'role' | 'testid' | 'label' | 'text' | 'aria-label' | 'css';
}

/**
 * Element attributes extracted from DOM
 */
interface ElementAttributes {
  tag: string;
  id?: string;
  classes?: string[];
  dataTestId?: string;
  ariaLabel?: string;
  role?: string;
  textContent?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  alt?: string;
  title?: string;
  html: string;
}

/**
 * Extract element attributes from HTML
 */
function extractElementAttributes(html: string, tagMatch: string): ElementAttributes {
  const attrs: ElementAttributes = {
    tag: tagMatch.match(/<(\w+)/)?.[1] || 'unknown',
    html: tagMatch,
  };

  // Extract ID
  const idMatch = tagMatch.match(/id=["']([^"']+)["']/i);
  if (idMatch) {
    attrs.id = idMatch[1];
  }

  // Extract classes
  const classMatch = tagMatch.match(/class=["']([^"']+)["']/i);
  if (classMatch) {
    attrs.classes = classMatch[1].split(/\s+/).filter(Boolean);
  }

  // Extract data-testid
  const testIdMatch = tagMatch.match(/data-testid=["']([^"']+)["']/i) ||
                     tagMatch.match(/data-test-id=["']([^"']+)["']/i);
  if (testIdMatch) {
    attrs.dataTestId = testIdMatch[1];
  }

  // Extract aria-label
  const ariaLabelMatch = tagMatch.match(/aria-label=["']([^"']+)["']/i);
  if (ariaLabelMatch) {
    attrs.ariaLabel = ariaLabelMatch[1];
  }

  // Extract role
  const roleMatch = tagMatch.match(/role=["']([^"']+)["']/i);
  if (roleMatch) {
    attrs.role = roleMatch[1];
  }

  // Extract name
  const nameMatch = tagMatch.match(/name=["']([^"']+)["']/i);
  if (nameMatch) {
    attrs.name = nameMatch[1];
  }

  // Extract type
  const typeMatch = tagMatch.match(/type=["']([^"']+)["']/i);
  if (typeMatch) {
    attrs.type = typeMatch[1];
  }

  // Extract placeholder
  const placeholderMatch = tagMatch.match(/placeholder=["']([^"']+)["']/i);
  if (placeholderMatch) {
    attrs.placeholder = placeholderMatch[1];
  }

  // Extract alt
  const altMatch = tagMatch.match(/alt=["']([^"']+)["']/i);
  if (altMatch) {
    attrs.alt = altMatch[1];
  }

  // Extract title
  const titleMatch = tagMatch.match(/title=["']([^"']+)["']/i);
  if (titleMatch) {
    attrs.title = titleMatch[1];
  }

  // Extract text content (simplified - get text between tags)
  const textMatch = tagMatch.match(/>([^<]{1,100})</);
  if (textMatch) {
    const text = textMatch[1].trim();
    if (text && text.length < 100) {
      attrs.textContent = text;
    }
  }

  return attrs;
}

/**
 * Find element HTML in DOM using selector (simplified version)
 */
function findElementHTML(html: string, selector: string): string | null {
  // Try ID selector (#id)
  if (selector.startsWith('#')) {
    const id = selector.substring(1);
    const idRegex = new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, 'i');
    const match = html.match(idRegex);
    if (match) {
      return match[0];
    }
  }

  // Try class selector (.class)
  if (selector.startsWith('.')) {
    const className = selector.substring(1);
    const classRegex = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
    const match = html.match(classRegex);
    if (match) {
      return match[0];
    }
  }

  // Try attribute selector ([attr=value])
  const attrMatch = selector.match(/\[([^=]+)=["']?([^"'\]]+)["']?\]/);
  if (attrMatch) {
    const attrName = attrMatch[1];
    const attrValue = attrMatch[2];
    const attrRegex = new RegExp(`<[^>]+${attrName}=["']${attrValue}["'][^>]*>`, 'i');
    const match = html.match(attrRegex);
    if (match) {
      return match[0];
    }
  }

  // Try tag name
  const tagMatch = selector.match(/^(\w+)/);
  if (tagMatch) {
    const tagName = tagMatch[1];
    const tagRegex = new RegExp(`<${tagName}[^>]*>`, 'i');
    const match = html.match(tagRegex);
    if (match) {
      return match[0];
    }
  }

  // Try text content search
  if (html.includes(selector)) {
    const textRegex = new RegExp(`<[^>]*>[^<]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</[^>]*>`, 'i');
    const match = html.match(textRegex);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Find element in DOM using selector
 */
function findElementBySelector(dom: DOMSnapshot, selector: string): ElementAttributes | null {
  const elementHTML = findElementHTML(dom.html, selector);
  if (!elementHTML) {
    return null;
  }

  return extractElementAttributes(dom.html, elementHTML);
}

/**
 * Generate Playwright locator suggestion based on element attributes
 */
function generatePlaywrightLocator(attrs: ElementAttributes, domHtml: string): SelectorSuggestion | null {
  // Priority 1: data-testid (most stable for testing)
  if (attrs.dataTestId) {
    return {
      suggestedSelector: `getByTestId('${attrs.dataTestId}')`,
      reason: 'Uses data-testid attribute - most stable for testing',
      confidence: 0.95,
      type: 'testid',
    };
  }

  // Priority 2: role + accessible name
  if (attrs.role) {
    const name = attrs.ariaLabel || attrs.textContent || attrs.title;
    if (name && name.length < 50) {
      return {
        suggestedSelector: `getByRole('${attrs.role}', { name: '${name.replace(/'/g, "\\'")}' })`,
        reason: `Uses role='${attrs.role}' with accessible name - semantic and stable`,
        confidence: 0.9,
        type: 'role',
      };
    } else if (attrs.role) {
      return {
        suggestedSelector: `getByRole('${attrs.role}')`,
        reason: `Uses role='${attrs.role}' - semantic locator`,
        confidence: 0.8,
        type: 'role',
      };
    }
  }

  // Priority 3: aria-label
  if (attrs.ariaLabel && attrs.ariaLabel.length < 100) {
    // Try to determine role from tag
    const role = attrs.role || inferRoleFromTag(attrs.tag);
    if (role) {
      return {
        suggestedSelector: `getByRole('${role}', { name: '${attrs.ariaLabel.replace(/'/g, "\\'")}' })`,
        reason: 'Uses aria-label with inferred role - accessible and stable',
        confidence: 0.85,
        type: 'aria-label',
      };
    }
  }

  // Priority 4: label association (for form inputs)
  if (attrs.tag === 'input' || attrs.tag === 'textarea' || attrs.tag === 'select') {
    if (attrs.name) {
      // Try to find associated label
      const labelMatch = domHtml.match(
        new RegExp(`<label[^>]*for=["']${attrs.name}["'][^>]*>([^<]+)</label>`, 'i')
      );
      if (labelMatch) {
        const labelText = labelMatch[1].trim();
        if (labelText && labelText.length < 100) {
          return {
            suggestedSelector: `getByLabel('${labelText.replace(/'/g, "\\'")}')`,
            reason: 'Uses label association - accessible and stable',
            confidence: 0.85,
            type: 'label',
          };
        }
      }
    }

    if (attrs.placeholder && attrs.placeholder.length < 100) {
      return {
        suggestedSelector: `getByPlaceholder('${attrs.placeholder.replace(/'/g, "\\'")}')`,
        reason: 'Uses placeholder text - stable for form inputs',
        confidence: 0.75,
        type: 'label',
      };
    }
  }

  // Priority 5: text content (if stable)
  if (attrs.textContent && attrs.textContent.length > 0 && attrs.textContent.length < 50) {
    // Check if text looks stable (no dates, numbers, etc.)
    if (!attrs.textContent.match(/\d{4}|\d{2}\/\d{2}/)) {
      const role = attrs.role || inferRoleFromTag(attrs.tag);
      if (role) {
        return {
          suggestedSelector: `getByRole('${role}', { name: '${attrs.textContent.replace(/'/g, "\\'")}' })`,
          reason: 'Uses text content with role - semantic locator',
          confidence: 0.7,
          type: 'text',
        };
      } else {
        return {
          suggestedSelector: `getByText('${attrs.textContent.replace(/'/g, "\\'")}')`,
          reason: 'Uses text content - may be fragile if content changes',
          confidence: 0.6,
          type: 'text',
        };
      }
    }
  }

  // Priority 6: alt text (for images)
  if (attrs.tag === 'img' && attrs.alt) {
    return {
      suggestedSelector: `getByAltText('${attrs.alt.replace(/'/g, "\\'")}')`,
      reason: 'Uses alt text - accessible for images',
      confidence: 0.8,
      type: 'aria-label',
    };
  }

  // Priority 7: ID selector (fallback)
  if (attrs.id) {
    return {
      suggestedSelector: `locator('#${attrs.id}')`,
      reason: 'Uses ID selector - relatively stable but not semantic',
      confidence: 0.65,
      type: 'css',
    };
  }

  return null;
}

/**
 * Infer role from HTML tag
 */
function inferRoleFromTag(tag: string): string | null {
  const roleMap: Record<string, string> = {
    button: 'button',
    a: 'link',
    input: 'textbox',
    textarea: 'textbox',
    select: 'combobox',
    img: 'img',
    nav: 'navigation',
    main: 'main',
    article: 'article',
    aside: 'complementary',
    header: 'banner',
    footer: 'contentinfo',
  };

  return roleMap[tag.toLowerCase()] || null;
}

/**
 * Suggest a better selector based on DOM analysis
 * 
 * @param extractedSelector - The current selector
 * @param dom - DOM snapshot at failure point
 * @returns Suggested selector or null if no better option found
 */
export function suggestSelector(
  extractedSelector: ExtractedSelector,
  dom: DOMSnapshot
): SelectorSuggestion | null {
  // Find the element in DOM
  const elementAttrs = findElementBySelector(dom, extractedSelector.selector);
  
  if (!elementAttrs) {
    // Element not found - can't suggest alternative
    return null;
  }

  // Generate Playwright locator suggestion
  const suggestion = generatePlaywrightLocator(elementAttrs, dom.html);
  
  if (!suggestion) {
    // If no semantic suggestion, try to improve CSS selector
    if (extractedSelector.type === 'css') {
      // Try to use data-testid if available
      if (elementAttrs.dataTestId) {
        return {
          suggestedSelector: `getByTestId('${elementAttrs.dataTestId}')`,
          reason: 'Uses data-testid attribute - most stable for testing',
          confidence: 0.95,
          type: 'testid',
        };
      }

      // Try to use ID if available
      if (elementAttrs.id) {
        return {
          suggestedSelector: `locator('#${elementAttrs.id}')`,
          reason: 'Uses ID selector - more stable than complex CSS',
          confidence: 0.7,
          type: 'css',
        };
      }
    }

    return null;
  }

  return suggestion;
}

