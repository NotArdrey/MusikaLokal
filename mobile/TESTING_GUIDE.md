# Signup & Verification Testing Guide

This guide outlines the steps to verify the recent fixes to the MusikaLokal signup flow. The goal is to ensure that users cannot bypass identity verification and that the system correctly handles various user states.

## Prerequisites

- Ensure the local development server is running (`npx expo start`).
- Ensure the `didit-webhook` is deployed or you are testing against a local instance handling the webhook events.
- Have access to the Supabase Dashboard to view the `auth.users` and `public.profiles` tables (optional but recommended).

## Test Case 1: New User Registration

**Objective:** Verify that a new user is redirected to verification and cannot log in until verified.

1.  **Navigate to Signup:** Open the app and go to the "Sign Up" screen.
2.  **Enter Details:** Fill in a valid email and password. Select a role.
3.  **Submit:** Click "Create Account".
4.  **Expected Behavior:**
    - You should NOT be automatically logged in.
    - You should be redirected to the "Verify Your Identity" screen.
    - If you inspect the Local Storage or Auth State, it should show no active session (or a session that is filtered out).
5.  **Action:** Click "Start Verification".
6.  **Verification Flow:** Complete the Didit verification process (or simulate it if in a dev environment).
7.  **Post-Verification:**
    - Upon successful verification, you should be redirected back to the app.
    - You should now be able to log in.
    - **Verification:** Check Supabase `profiles` table. The user should have `is_verified: true` and `role` set correctly.

## Test Case 2: Existing Unverified User

**Objective:** Verify that a user who previously abandoned verification can resume it.

1.  **Setup:** Create an account (Test Case 1) but close the app/browser when you reach the "Verify Your Identity" screen.
2.  **Retry Signup:** specific functionality: Open the app and try to Sign Up *with the same email*.
3.  **Expected Behavior:**
    - The app should detect the existing account.
    - It should **not** show an error like "User already exists".
    - Instead, it should automatically redirect you to the "Verify Your Identity" screen.
4.  **Action:** Complete verification.
5.  **Success:** Ensure you can log in afterwards.

## Test Case 3: Blocked Login for Unverified Users

**Objective:** Verify that an unverified user cannot force a login.

1.  **Setup:** Create an unverified account.
2.  **Action:** Try to Log In using the "Login" screen with these credentials.
3.  **Expected Behavior:**
    - The login should fail or immediately redirect you to a state indicating verification is required (depending on current Login screen implementation).
    - *Note:* The `AuthContext` is now hardened to ignore sessions from unverified users, so even if Supabase returns a session, the app will treat it as "not logged in".

## Troubleshooting

- **"Account Exists" Error:** If you see this for an unverified user, it means the logic in `signup.tsx` failed to find the profile check or the profile was created with `is_verified: true` incorrectly.
- **Stuck on Verification:** If the redirect after Didit doesn't work, ensure the deep link URL scheme (`musikalokal://`) is correctly responding on your device/simulator.

## Validating Fixes

The following code changes enforce these rules:

- **`signup.tsx`**: Uses `supabase.auth.signOut()` immediately after creation.
- **`AuthContext.tsx`**: Filters out sessions where `user_metadata.is_verified` is false.
- **`didit-webhook`**: Adds `is_verified: true` to user metadata upon success.
