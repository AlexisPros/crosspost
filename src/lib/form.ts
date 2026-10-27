/** State returned by Server Actions used with useActionState. */
export type FormState = {
  error?: string;
  // Submitted values echoed back so the form keeps them after an error.
  values?: Record<string, string>;
};
