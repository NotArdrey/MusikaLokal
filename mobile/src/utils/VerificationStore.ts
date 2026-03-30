
// Simple singleton to track verification success across components
// This prevents race conditions between deep link handlers (index.tsx) and manual pollers (signup.tsx)

let isVerificationSuccessful = false;

export const VerificationStore = {
    setSuccess: (value: boolean) => {
        isVerificationSuccessful = value;
    },
    isSuccess: () => {
        return isVerificationSuccessful;
    },
    reset: () => {
        isVerificationSuccessful = false;
    }
};
