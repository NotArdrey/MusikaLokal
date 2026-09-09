const MUSIKALOKAL_WEB_URL = "https://musikalokal.app";

export const buildPostShareUrl = (postId: string) =>
  `${MUSIKALOKAL_WEB_URL}/feed?postId=${encodeURIComponent(postId)}`;

export const buildPostShareMessage = (post: any) => {
  const caption =
    typeof post?.body === "string" && post.body.trim()
      ? post.body.trim()
      : typeof post?.content === "string" && post.content.trim()
        ? post.content.trim()
        : "Check out this post on MusikaLokal.";

  return `${caption}\n\nView this post on MusikaLokal:\n${buildPostShareUrl(String(post?.id || ""))}`;
};

