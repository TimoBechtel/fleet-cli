import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Creates and manages a temporary directory for testing.
 */
export class TempDir implements AsyncDisposable {
  readonly path: string;

  private constructor(pathname: string) {
    this.path = pathname;
  }

  static async create(prefix = 'fleet-cli-test-') {
    return new TempDir(await mkdtemp(path.join(tmpdir(), prefix)));
  }

  async [Symbol.asyncDispose]() {
    await rm(this.path, { recursive: true, force: true });
  }
}
