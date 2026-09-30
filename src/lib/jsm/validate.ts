import type { z } from 'zod';
import { JSMSchema, type JSM } from './schema';
import {
  indexJson,
  JsonSyntaxError,
  locatePath,
  offsetToLineColumn,
  pathKey,
  type JsonPath,
} from './jsonLocate';

export interface ValidationIssue {
  /** Path to the offending value in the (normalised) JSM, e.g. ['states', 0, 'name'] */
  path: (string | number)[];
  /** Human-readable description of the problem */
  message: string;
  /** Human-readable breadcrumb of where the problem is, e.g. 'Pending › Landing Page › Entry action 1' */
  location: string;
}

export interface JsmIssue extends ValidationIssue {
  line?: number;
  column?: number;
  start?: number;
  end?: number;
}

export type ValidationResult =
  | { success: true; data: JSM }
  | { success: false; error: string; issues: ValidationIssue[] };

export type TextValidationResult =
  | { success: true; data: JSM }
  | { success: false; error: string; issues: JsmIssue[] };

interface RawEntryAction {
  goto?: unknown;
  goTo?: unknown;
  [key: string]: unknown;
}

interface RawExitCheck {
  goto?: unknown;
  goTo?: unknown;
  [key: string]: unknown;
}

interface RawState {
  entryActions?: RawEntryAction[];
  exitChecks?: RawExitCheck[];
  children?: RawState[];
  [key: string]: unknown;
}

interface RawJSM {
  start?: unknown;
  entryStateName?: unknown;
  states?: RawState[];
  [key: string]: unknown;
}

// Normalize input to handle both naming conventions
function normalizeJSM(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;

  const obj = input as RawJSM;

  // Handle both 'start' and 'entryStateName'
  if (!('entryStateName' in obj) && 'start' in obj) {
    obj.entryStateName = obj.start;
    delete obj.start;
  }

  // Normalize exitChecks: handle both 'goto' and 'goTo'
  if (obj.states && Array.isArray(obj.states)) {
    const normalizeStates = (states: RawState[]): RawState[] => {
      return states.map(state => {
        if (!state || typeof state !== 'object') return state;
        if (state.entryActions && Array.isArray(state.entryActions)) {
          state.entryActions = state.entryActions.map((action: RawEntryAction) => {
            if (action && typeof action === 'object' && !('goTo' in action) && 'goto' in action) {
              action.goTo = action.goto;
              delete action.goto;
            }
            return action;
          });
        }
        if (state.exitChecks && Array.isArray(state.exitChecks)) {
          state.exitChecks = state.exitChecks.map((check: RawExitCheck) => {
            // Handle both 'goto' and 'goTo'
            if (check && typeof check === 'object' && !('goTo' in check) && 'goto' in check) {
              check.goTo = check.goto;
              delete check.goto;
            }
            return check;
          });
        }
        // Recursively normalize children
        if (state.children && Array.isArray(state.children)) {
          state.children = normalizeStates(state.children);
        }
        return state;
      });
    };
    obj.states = normalizeStates(obj.states);
  }

  return obj;
}

const COLLECTION_LABELS: Record<string, string> = {
  states: 'State',
  children: 'State',
  entryActions: 'Entry action',
  exitChecks: 'Exit check',
};

function getAt(root: unknown, path: JsonPath): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function describeType(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') return `the text ${JSON.stringify(value)}`;
  return `a ${typeof value} (${String(value)})`;
}

function describeExpected(expected: string): string {
  switch (expected) {
    case 'array': return 'a list';
    case 'object': return 'an object';
    case 'string': return 'text';
    default: return `a ${expected}`;
  }
}

/** Builds a readable breadcrumb such as `Pending › Landing Page › Entry action 1 › check`. */
export function describePath(root: unknown, path: JsonPath): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const next = path[i + 1];
    if (typeof segment === 'string' && typeof next === 'number' && segment in COLLECTION_LABELS) {
      const item = getAt(root, path.slice(0, i + 2));
      const name = (segment === 'states' || segment === 'children')
        && item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
        ? (item as { name: string }).name
        : null;
      parts.push(name ?? `${COLLECTION_LABELS[segment]} ${next + 1}`);
      i++;
      continue;
    }
    parts.push(String(segment));
  }
  return parts.length ? parts.join(' › ') : 'Document';
}

function describeIssue(root: unknown, issue: z.core.$ZodIssue): string {
  const field = issue.path[issue.path.length - 1];
  const fieldName = typeof field === 'string' ? `"${field}"` : 'This item';
  switch (issue.code) {
    case 'invalid_type': {
      const actual = getAt(root, issue.path as JsonPath);
      if (actual === undefined && typeof field === 'string') {
        return `Missing required field ${fieldName} (expected ${describeExpected(issue.expected)})`;
      }
      if (issue.path.length === 0) {
        return `The JSM must be ${describeExpected(issue.expected)}, but got ${describeType(actual)}`;
      }
      return `${fieldName} should be ${describeExpected(issue.expected)}, but got ${describeType(actual)}`;
    }
    case 'unrecognized_keys':
      return `Unknown field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.map(k => `"${k}"`).join(', ')}`;
    default:
      return issue.message;
  }
}

function toIssues(root: unknown, error: z.ZodError): ValidationIssue[] {
  return error.issues.map(issue => {
    const path = issue.path.filter(
      (p): p is string | number => typeof p === 'string' || typeof p === 'number',
    );
    return {
      path,
      message: describeIssue(root, issue),
      location: describePath(root, path),
    };
  });
}

function summarise(issues: ValidationIssue[]): string {
  return issues.map(i => `${i.location}: ${i.message}`).join('\n');
}

export function validateJSM(input: unknown): ValidationResult {
  const normalized = normalizeJSM(input);
  const result = JSMSchema.safeParse(normalized);
  if (result.success) return { success: true, data: result.data };
  const issues = toIssues(normalized, result.error);
  return { success: false, error: summarise(issues), issues };
}

/**
 * Parses and validates raw JSM text, returning issues annotated with
 * line/column and source ranges so they can be highlighted in the editor.
 */
export function validateJSMText(raw: string): TextValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    let issue: JsmIssue = {
      path: [],
      message: e instanceof Error ? e.message : 'Invalid JSON',
      location: 'JSON syntax',
    };
    try {
      indexJson(raw);
    } catch (syntax) {
      if (syntax instanceof JsonSyntaxError) {
        const { line, column } = offsetToLineColumn(raw, syntax.offset);
        issue = {
          ...issue,
          message: syntax.message,
          line,
          column,
          start: syntax.offset,
          end: Math.min(syntax.offset + 1, raw.length),
        };
      }
    }
    return { success: false, error: `Invalid JSON: ${issue.message}`, issues: [issue] };
  }

  const result = validateJSM(parsed);
  if (result.success) return result;

  let ranges: ReturnType<typeof indexJson> | null = null;
  try {
    ranges = indexJson(raw);
  } catch {
    ranges = null;
  }

  // Normalisation renames legacy keys, so map them back when locating in the source text
  const toSourcePath = (path: JsonPath): JsonPath => {
    if (!ranges) return path;
    const out: (string | number)[] = [];
    for (const segment of path) {
      out.push(segment);
      if (ranges.has(pathKey(out))) continue;
      const legacy = segment === 'entryStateName' ? 'start' : segment === 'goTo' ? 'goto' : null;
      if (legacy && ranges.has(pathKey([...out.slice(0, -1), legacy]))) out[out.length - 1] = legacy;
    }
    return out;
  };

  const issues: JsmIssue[] = result.issues.map(issue => {
    const range = ranges ? locatePath(ranges, toSourcePath(issue.path)) : null;
    if (!range) return issue;
    const { line, column } = offsetToLineColumn(raw, range.start);
    return { ...issue, line, column, start: range.start, end: range.end };
  });

  return { success: false, error: result.error, issues };
}
