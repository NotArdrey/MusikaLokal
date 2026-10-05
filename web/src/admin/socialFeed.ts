import { supabase } from '../../lib/supabase';
import { getEdgeFunctionErrorMessage } from '../utils/edgeFunctionErrors';

export type AdminPostMedia = {
  id: string;
  media_type: string;
  storage_path: string;
  thumbnail_path?: string | null;
  mime_type?: string | null;
};

export type AdminPost = {
  id: string;
  author_id: string;
  author_name?: string | null;
  body?: string | null;
  created_at: string;
  is_hidden: boolean;
  report_count: number;
  comment_count: number;
  reaction_count: number;
  visibility: string;
  post_type: string;
  media: AdminPostMedia[];
};

export type AdminComment = {
  id: string;
  post_id: string;
  parent_comment_id?: string | null;
  author_id: string;
  author_name?: string | null;
  content: string;
  created_at: string;
  is_hidden: boolean;
  moderation_status?: string;
  moderation_reason?: string | null;
};

export async function invokeSocialAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-social-feed-management', { body });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'Unable to reach social feed admin tools.'));
  if (data?.error) throw new Error(String(data.error));
  return data?.data;
}

export function resolveAdminMediaUrl(path: string | null | undefined, bucket = 'post-media') {
  if (!path?.trim()) return '';
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, '');
  const storagePath = normalized.startsWith(`${bucket}/`) ? normalized.slice(bucket.length + 1) : normalized;
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export function isPostVideo(media: AdminPostMedia) {
  return media.media_type === 'video' || media.media_type === 'teaser_clip' || !!media.mime_type?.startsWith('video/');
}
