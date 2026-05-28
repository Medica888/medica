# Code Quality & Architecture Review Skill

## Purpose
Use this skill after every implementation iteration to review the latest React + Node.js/TypeScript changes before continuing.

Act like a strict senior staff engineer. The goal is to prevent duplicated logic, redundant code, code smells, weak architecture, unsafe backend patterns, and low-quality tests.

## When To Run
Run this review automatically after every implementation task, before saying the work is complete.

Run it especially after changes involving:
- React components
- hooks
- state management
- API clients
- Node.js routes
- services
- repositories
- database migrations
- authentication
- analytics
- tests
- TypeScript types

## Review Scope
Review only the latest changed files unless the change affects architecture across modules. If needed, inspect related files to verify consistency.

Check:

### 1. Code Duplication
- Repeated logic
- Repeated API calls
- Repeated validation schemas
- Repeated DTOs/types
- Repeated React UI blocks
- Repeated SQL queries
- Repeated error handling

### 2. Redundant Code
- Unused imports
- Unused variables
- Dead functions
- Unreachable branches
- Useless wrappers
- Redundant comments
- Duplicate conditions
- Obsolete files

### 3. Code Smells
- Large functions
- Large React components
- Mixed responsibilities
- Business logic inside UI components
- Deep nesting
- Magic numbers
- Weak naming
- Hidden coupling
- Over-engineering
- Inconsistent patterns

### 4. React Best Practices
- Clean component separation
- Hooks used correctly
- No unnecessary `useEffect`
- No duplicated state
- Correct loading/error/empty states
- Avoid unnecessary re-renders
- Memoization only where useful
- Accessible buttons, labels, forms, and keyboard states
- Clean prop contracts
- No API/business logic directly inside presentational components

### 5. Node.js / Backend Best Practices
- Routes stay thin
- Business logic belongs in services
- Database logic belongs in repositories
- Request validation is centralized
- Error handling is centralized
- Async errors are handled safely
- No sensitive error leakage
- Auth checks are consistent
- Transactions are used where data integrity requires them
- SQL is indexed and safe
- No N+1 query patterns where avoidable

### 6. TypeScript Quality
- No `any` unless strongly justified
- Clear DTOs and domain types
- No duplicated interfaces
- Strict null/undefined handling
- Clean imports/exports
- No type lies or unsafe casts
- Runtime validation matches TypeScript types

### 7. Testing Quality
- New behavior has tests
- Critical paths have integration tests
- Error cases are tested
- Edge cases are tested
- Tests are not shallow or fake
- No brittle snapshots unless justified
- Migrations and transaction behavior are tested where relevant

### 8. Maintainability
- Simple readable structure
- Files remain reasonably sized
- No hidden side effects
- No unnecessary abstraction
- Easy future extension
- Consistent naming and folder structure

## Mandatory Commands
Run the relevant commands after review/fixes:

```bash
npm test
npm run build
npm run lint
```

If the project uses separate frontend/backend folders, run the equivalent commands in each package.

## Output Format
Always output the report in this exact structure:

```txt
Code Quality & Architecture Review

Overall Score: __ / 100
Recommendation: APPROVE / FIX BEFORE CONTINUING

1. Critical Issues
- [file:line] issue + why it matters + exact fix

2. Medium Issues
- [file:line] issue + recommended fix

3. Small Cleanup Suggestions
- [file:line] cleanup

4. Duplicated Code Found
- duplicated area + suggested extraction

5. Redundant Code Found
- unused/dead/redundant item + safe removal

6. Code Smells Found
- smell + risk + fix

7. React Review
- component/hook/state/rendering/accessibility findings

8. Node.js / Backend Review
- route/service/repository/DB/auth/error-handling findings

9. TypeScript Review
- typing issues and fixes

10. Testing Gaps
- missing tests and exact cases to add

11. Safe Refactor Plan
Step 1:
Step 2:
Step 3:

12. Commands Run
- command: result

13. Final Status
- tests:
- build:
- lint:
- remaining risks:
```

## Approval Rules
Return `FIX BEFORE CONTINUING` if any of these exist:
- Broken tests
- Failed build
- Auth/security weakness
- Data integrity risk
- Unhandled backend errors
- Serious duplication
- Missing tests for critical logic
- Unsafe database migration
- React state bug
- API contract mismatch

Return `APPROVE` only when the changes are safe, maintainable, tested, and consistent.

## Fix Mode
Do not change code during review unless explicitly asked.

If the user says `fix it`, then:
1. Apply only the safest necessary fixes.
2. Avoid unrelated rewrites.
3. Preserve API compatibility.
4. Add/update tests.
5. Run tests/build/lint.
6. Re-run this review after fixing.

## After Every Iteration Instruction
After each implementation task, before final response, run:

```txt
Apply the Code Quality & Architecture Review Skill to the latest changed React + Node.js/TypeScript files. Do not continue until the review is complete. If the result is FIX BEFORE CONTINUING, fix the issues first, run tests/build/lint, and review again.
```
