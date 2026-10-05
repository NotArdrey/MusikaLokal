import { buildPostShareUrl } from "./shareLinks";

export { buildPostShareUrl } from "./shareLinks";

export const buildPostShareMessage = (post: any) => {
  const caption =
    typeof post?.body === "string" && post.body.trim()
      ? post.body.trim()
      : typeof post?.content === "string" && post.content.trim()
        ? post.content.trim()
        : "Check out this post on MusikaLokal.";

  return `${caption}\n\nView this post on MusikaLokal:\n${buildPostShareUrl(String(post?.id || ""))}`;
};
