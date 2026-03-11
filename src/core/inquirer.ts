export function isExitPromptError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}

export async function promptOrExit<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error: unknown) {
    if (isExitPromptError(error)) {
      process.exit(1);
      return await new Promise<T>(() => {});
    }
    throw error;
  }
}
