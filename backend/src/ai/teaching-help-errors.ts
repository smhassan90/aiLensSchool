export type TeachingHelpErrorCode =
  | 'TEACHING_HELP_UNAVAILABLE'
  | 'TEACHING_HELP_AI_FAILED'
  | 'TEACHING_HELP_INVALID_OUTPUT'
  | 'TEACHING_HELP_PROVIDER_ERROR';

export class TeachingHelpGenerationError extends Error {
  constructor(
    public readonly code: TeachingHelpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TeachingHelpGenerationError';
  }
}
