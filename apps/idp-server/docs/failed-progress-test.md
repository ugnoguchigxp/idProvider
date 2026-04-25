# Backend Refactoring & Coverage Progress Report

## 1. Summary of Current Status
- **Current Total Line Coverage**: 84.88%
- **Target**: 90.00%
- **Status**: Progressing but halted for detailed analysis.

## 2. Low Coverage Files (High Improvement Potential)
The following files are core to the application but remain below the 80% threshold:

| File | Coverage | Reason for Gap |
| :--- | :--- | :--- |
| `src/modules/auth/auth.service.ts` | 68.90% | Complex multi-step flows (Password Reset, Email Verification) and error branches. |
| `src/modules/sessions/session.repository.ts` | 61.70% | Batch revocation and complex joined queries for session metadata. |
| `src/modules/mfa/mfa.repository.ts` | 63.88% | WebAuthn credential lookups with specific indexing logic. |
| `src/core/oidc-provider.ts` | 65.21% | Infrastructure setup and `findAccount` logic that depends on `oidc-provider` internals. |
| `src/core/security-notifier.ts` | 0.00% | No tests implemented yet for email/slack notification dispatch. |
| `src/modules/users/user.repository.ts` | 78.00% | Social identity joining and complex user profile updates. |

## 3. Logic Difficult to Cover
The following areas present technical challenges for high-fidelity testing:

### A. OIDC / Social Federation
- **Challenge**: Mocking the internal state of `oidc-provider` and verifying Google ID Token validation requires a full mock of external OIDC discovery and JWKS endpoints.
- **Status**: Basic success paths covered via integration tests, but deep error handling in the provider remains low.

### B. Complex Database Joins (Drizzle)
- **Challenge**: The current `createDrizzleMock` is a simplified "thenable" mock. It struggles with verifying the exact structure of nested `innerJoin` and `leftJoin` chains in RBAC and Session lookups.
- **Proposed Solution**: Migrate to `drizzle-orm/postgres-js` with a real in-memory Postgres (e.g., via `testcontainers`) if 100% precision is required.

### C. Infrastructure Middleware
- **Challenge**: Verifying that `traceMiddleware` (OpenTelemetry) correctly starts/ends spans is difficult without a full OTLP collector mock in the test environment.
- **Status**: Logic is simple, but execution path is hard to assert.

## 4. Next Steps for 90% Achievement
1. **Implement `SecurityNotifier` tests**: This is a quick win (0% to 100%).
2. **Deepen `AuthService` sad paths**: Add more `ApiError` expectation tests for edge cases in signup/login.
3. **Expand `SessionRepository` tests**: Focus on `revokeByUserId` and `cleanupExpired` methods.
4. **Refine `DrizzleMock`**: Add better support for `innerJoin` inspection or use a physical test DB.
