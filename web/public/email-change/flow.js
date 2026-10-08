export const EMAIL_CHANGE_GATEWAY_URL = "https://musika-lokal.vercel.app/email-change";
export function buildEmailChangeUrl(tokenHash) {
    if (!tokenHash || !/^[a-zA-Z0-9_-]+$/.test(tokenHash)) {
        throw new Error("Generated email change token was empty or invalid");
    }
    return `${EMAIL_CHANGE_GATEWAY_URL}#${new URLSearchParams({ token_hash: tokenHash, type: "email_change" })}`;
}
export function parseEmailChangeUrl(raw) {
    try {
        const url = new URL(raw);
        const gateway = new URL(EMAIL_CHANGE_GATEWAY_URL);
        if (url.origin !== gateway.origin || url.pathname !== gateway.pathname ||
            url.username || url.password || url.search)
            return null;
        const params = new URLSearchParams(url.hash.slice(1));
        const hash = params.get("token_hash");
        if (params.size !== 2 || params.getAll("type").length !== 1 ||
            params.getAll("token_hash").length !== 1 || params.get("type") !== "email_change" ||
            !hash || !/^[a-zA-Z0-9_-]+$/.test(hash))
            return null;
        return hash;
    }
    catch {
        return null;
    }
}
