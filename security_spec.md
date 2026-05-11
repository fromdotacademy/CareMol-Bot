# Security Specification: caremol-bot

## 1. Data Invariants
- A `Booking` must always have a valid `userId` matching the authenticated user (unless system-created).
- A `User` can only manage their own profile and bookings.
- `Booking` status transitions should be controlled.
- Admin access is restricted to verified emails and explicit database roles.
- All timestamps must be server-generated or validated.

## 2. The "Dirty Dozen" Payloads (Expected DENIED)

1.  **Identity Spoofing**: `create` a booking for another user's `userId`.
2.  **Shadow Field Injection**: `create` a booking with an extra `isVerified: true` field.
3.  **State Shortcutting**: `update` a booking status from `Created` directly to `Completed` without admin rights.
4.  **Resource Poisoning**: Use a 2KB string as a `bookingId`.
5.  **PII Leak**: A non-admin user trying to `get` another user's profile.
6.  **Immutable Field Mutation**: Trying to change `createdAt` on an existing booking.
7.  **Unverified Admin**: Accessing admin routes with an unverified email.
8.  **Empty ID injection**: Using empty string as `userId`.
9.  **Type Poisoning**: Sending `price: "free"` instead of a number.
10. **Query Scrape**: Listing all bookings without a `userId` filter.
11. **Orphaned Record**: Creating a booking for a `userId` that doesn't exist in the `users` collection.
12. **Self-Promotion**: A user updating their own profile to add `role: "admin"`.

## 3. Test Runner (Draft: firestore.rules.test.ts)
```typescript
// This file is used for documentation and manual verification logic.
// In a real environment, you would use @firebase/rules-unit-testing.

describe('caremol-bot Security Rules', () => {
  // 1. Identity Spoofing
  test('should deny creating booking for another user', () => { ... });
  
  // 2. Shadow Field Injection
  test('should deny extra fields in booking', () => { ... });
  
  // ... (Full implementation would be here)
});
```
