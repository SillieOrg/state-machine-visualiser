import { z } from 'zod';

/**
 * An entry action is either:
 * - a plain action: `{ action, check? }` — run `action` (optionally only when `check` is truthy)
 * - an event: `{ event, schema?, goTo?, check? }` — wait for `event` (optionally validated against
 *   `schema`) and then transition to `goTo`
 */
export const EntryActionSchema = z
  .object({
    check: z.string().optional(),
    action: z.string().optional(),
    event: z.string().optional(),
    schema: z.string().optional(),
    goTo: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAction = value.action !== undefined;
    const hasEvent = value.event !== undefined;
    if (!hasAction && !hasEvent) {
      ctx.addIssue({
        code: 'custom',
        message: 'Entry action needs either an "action" or an "event"',
      });
    } else if (hasAction && hasEvent) {
      ctx.addIssue({
        code: 'custom',
        message: 'Entry action cannot have both an "action" and an "event"',
      });
    }
  });

export const ExitCheckSchema = z.object({
  check: z.string().optional(),
  goTo: z.string(),
});

export type EntryAction = z.infer<typeof EntryActionSchema>;
export type ExitCheck = z.infer<typeof ExitCheckSchema>;

type StateInput = {
  name: string;
  entryActions?: EntryAction[];
  exitChecks?: ExitCheck[];
  children?: StateInput[];
};

export const StateSchema: z.ZodType<StateInput> = z.object({
  name: z.string(),
  entryActions: z.array(EntryActionSchema).optional(),
  exitChecks: z.array(ExitCheckSchema).optional(),
  children: z.lazy(() => z.array(StateSchema)).optional(),
});

export const JSMSchema = z.object({
  entryStateName: z.string(),
  states: z.array(StateSchema),
});

export type State = z.infer<typeof StateSchema>;
export type JSM = z.infer<typeof JSMSchema>;

export function isEventAction(action: EntryAction): boolean {
  return action.event !== undefined;
}
