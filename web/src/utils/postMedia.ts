export const normalizePostMedia = (post: any, resolveUrl: (value: unknown) => string) => {
  const attachments = Array.isArray(post?.media) ? post.media
    : Array.isArray(post?.post_media) ? post.post_media : [];
  return [...attachments]
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
    .map((item) => {
      const url = resolveUrl(item.url || item.media_url || item.public_url || item.storage_path);
      const thumbnailUrl = resolveUrl(item.thumbnail_url || item.thumbnail_path) || url;
      return url || thumbnailUrl ? { ...item, url: url || thumbnailUrl, thumbnail_url: thumbnailUrl } : null;
    })
    .filter((item) => item !== null);
};
