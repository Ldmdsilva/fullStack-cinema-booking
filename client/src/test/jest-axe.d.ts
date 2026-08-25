// jest-axe's own bundled types (@types/jest-axe) only augment Jest's global
// `expect` — this project's `expect` comes from Vitest instead (see
// setupTests.ts: `expect.extend(toHaveNoViolations)`), so this mirrors
// @testing-library/jest-dom's own `vitest` augmentation to add the matcher
// to Vitest's `Assertion` type as well.
import 'vitest'

declare module 'vitest' {
  interface Assertion {
    toHaveNoViolations(): void
  }
}
