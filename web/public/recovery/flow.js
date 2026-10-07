export const PASSWORD_RECOVERY_URL = "https://musika-lokal.vercel.app/recovery";
export const RECOVERY_LINK_ERROR = "This reset link is invalid, expired, or already used. Please request a new link.";
function recoveryParams(raw) {
    const url = new URL(raw, PASSWORD_RECOVERY_URL);
    if (url.username || url.password || url.port)
        return null;
    if (url.protocol !== "musikalokal:" &&
        !(url.protocol === "https:" && ["musika-lokal.vercel.app", "musikalokal.app"].includes(url.hostname)))
        return null;
    const route = (url.protocol === "musikalokal:" ? url.hostname + url.pathname : url.pathname).replace(/^\/+|\/+$/g, "");
    const params = new URLSearchParams(url.search);
    for (const [key, value] of new URLSearchParams(url.hash.slice(1)))
        params.append(key, value);
    if (!["recovery", "password_recovery", "change_password"].includes(route))
        return null;
    if (route === "change_password" && !["type", "access_token", "token_hash", "error", "code"].some(key => params.has(key)))
        return null;
    return params;
}
export function parseRecoveryUrl(raw) {
    try {
        const params = recoveryParams(raw);
        if (!params)
            return null;
        for (const key of ["type", "token_hash", "access_token", "refresh_token", "error", "error_code", "code"]) {
            if (params.getAll(key).length > 1)
                return { kind: "invalid" };
        }
        if (params.has("error") || params.has("error_code") || params.has("code") || params.get("type") !== "recovery")
            return { kind: "invalid" };
        const tokenHash = params.get("token_hash")?.trim();
        const accessToken = params.get("access_token")?.trim();
        const refreshToken = params.get("refresh_token")?.trim();
        if (tokenHash && !accessToken && !refreshToken)
            return { kind: "hash", tokenHash };
        if (!tokenHash && accessToken && refreshToken)
            return { kind: "tokens", accessToken, refreshToken };
        return { kind: "invalid" };
    }
    catch {
        return null;
    }
}
export function recoveryCredentialParams(credential) {
    const params = new URLSearchParams({ type: "recovery" });
    if (credential.kind === "hash")
        params.set("token_hash", credential.tokenHash);
    if (credential.kind === "tokens") {
        params.set("access_token", credential.accessToken);
        params.set("refresh_token", credential.refreshToken);
    }
    return params.toString();
}
export function getPasswordRecoveryRoute(raw) {
    const credential = parseRecoveryUrl(raw);
    return credential ? `/password_recovery?${recoveryCredentialParams(credential)}` : null;
}
export async function recoveryRequest(config, path, method, body, token, signal) {
    const response = await fetch(`${config.url}/auth/v1/${path}`, {
        method, signal,
        headers: { apikey: config.anonKey, Authorization: `Bearer ${token || config.anonKey}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (path === "user" && method === "PUT") {
            const code = data.code || data.error_code;
            if (code === "weak_password")
                throw new Error("Choose a stronger password and try again.");
            if (code === "same_password")
                throw new Error("Choose a password different from your current password.");
        }
        if (response.status === 429)
            throw new Error("Too many attempts. Please wait a moment and try again.");
        if (response.status >= 500)
            throw new Error("The reset service is unavailable. Please try again.");
        throw new Error(RECOVERY_LINK_ERROR);
    }
    return data;
}
// Validate the token with Auth before reading its signed recovery claims. Nothing
// here restores, replaces, or persists the application's ordinary session.
export async function establishRecoverySession(config, credential, signal) {
    let accessToken;
    if (credential.kind === "hash") {
        const data = await recoveryRequest(config, "verify", "POST", { token_hash: credential.tokenHash, type: "recovery" }, undefined, signal);
        accessToken = data.access_token;
    }
    else if (credential.kind === "tokens") {
        accessToken = credential.accessToken;
    }
    else {
        throw new Error(RECOVERY_LINK_ERROR);
    }
    if (!accessToken)
        throw new Error(RECOVERY_LINK_ERROR);
    const user = await recoveryRequest(config, "user", "GET", undefined, accessToken, signal);
    try {
        const encoded = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)));
        if (claims.sub !== user.id || claims.iss !== `${config.url}/auth/v1` || claims.exp * 1000 <= Date.now() ||
            (credential.kind === "tokens" && (!Array.isArray(claims.amr) || !claims.amr.some((entry) => ["otp", "recovery"].includes(entry.method || ""))))) {
            throw new Error(RECOVERY_LINK_ERROR);
        }
    }
    catch {
        throw new Error(RECOVERY_LINK_ERROR);
    }
    return { accessToken, userId: user.id, email: user.email || "" };
}
export function validateRecoveryPassword(password, confirmation) {
    if (password.length < 6)
        return "Password must be at least 6 characters.";
    if (password !== confirmation)
        return "New passwords do not match.";
    return null;
}
export async function updateRecoveryPassword(config, session, password, confirmation) {
    const error = validateRecoveryPassword(password, confirmation);
    if (error)
        throw new Error(error);
    const user = await recoveryRequest(config, "user", "PUT", { password }, session.accessToken);
    if (user.id !== session.userId)
        throw new Error(RECOVERY_LINK_ERROR);
}
export async function signOutRecoverySession(config, session) {
    const response = await fetch(`${config.url}/auth/v1/logout?scope=global`, {
        method: "POST", headers: { apikey: config.anonKey, Authorization: `Bearer ${session.accessToken}` },
    });
    if (!response.ok && response.status !== 401 && response.status !== 403)
        throw new Error("Your password was updated, but sign-out failed. Please try signing out again.");
}
