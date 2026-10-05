import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AdminComment, AdminPost, invokeSocialAdmin, isPostVideo, resolveAdminMediaUrl } from '../../admin/socialFeed';
import { useTheme } from '../../context/ThemeContext';
import InAppMediaViewer from '../InAppMediaViewer';

const PAGE_SIZE = 50;

export default function AdminPostView({ post, onClose, onCommentsChange }: {
  post: AdminPost;
  onClose: () => void;
  onCommentsChange: () => void;
}) {
  const { colors } = useTheme();
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const requestRef = useRef({ sequence: 0 });

  const loadComments = useCallback(async (offset = 0) => {
    const request = ++requestRef.current.sequence;
    try {
      const rows: AdminComment[] = await invokeSocialAdmin({ action: 'admin_list_comments', post_id: post.id, filter: 'all', limit: PAGE_SIZE, offset }) || [];
      if (request !== requestRef.current.sequence) return;
      setComments(previous => offset ? [...previous, ...rows] : rows);
      setHasMore(rows.length === PAGE_SIZE);
      setError('');
    } catch (cause) {
      if (request === requestRef.current.sequence) setError(cause instanceof Error ? cause.message : 'Unable to load comments.');
    } finally {
      if (request === requestRef.current.sequence) setLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    const requestState = requestRef.current;
    const timer = setTimeout(() => void loadComments(), 0);
    return () => { clearTimeout(timer); requestState.sequence++; };
  }, [loadComments]);

  const handleLoadComments = (offset = 0) => {
    setLoading(true);
    setError('');
    void loadComments(offset);
  };

  const moderateComment = async (comment: AdminComment, action: 'approved' | 'blocked' | 'delete') => {
    setBusyId(comment.id);
    setError('');
    try {
      await invokeSocialAdmin(action === 'delete'
        ? { action: 'admin_delete_comment', comment_id: comment.id }
        : { action: 'admin_update_comment_moderation', comment_id: comment.id, status: action, hidden: action !== 'approved' });
      setLoading(true);
      await loadComments();
      onCommentsChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update comment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close post details" />
        <View testID="admin-post-view" accessibilityViewIsModal style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Post details</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close post details" style={styles.close}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.heading, { color: colors.text }]}>{post.author_name || post.author_id.slice(0, 8)}</Text>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{new Date(post.created_at).toLocaleString()} · {post.visibility} · {post.is_hidden ? 'Hidden' : 'Visible'}</Text>
            <Text selectable style={[styles.body, { color: colors.text }]}>{post.body || '(No text)'}</Text>
            {post.media?.length ? (
              <View style={styles.gallery}>
                {post.media.map((media, index) => {
                  const uri = resolveAdminMediaUrl(media.storage_path);
                  const video = isPostVideo(media);
                  return (
                    <View key={media.id} style={[styles.mediaFrame, { borderColor: colors.border }]}>
                      {video ? React.createElement('video', {
                        src: uri, poster: resolveAdminMediaUrl(media.thumbnail_path) || undefined,
                        controls: true, playsInline: true, preload: 'metadata',
                        'aria-label': `Post video ${index + 1}`,
                        style: { width: '100%', maxHeight: 400, display: 'block', backgroundColor: '#111827' },
                      }) : (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Enlarge post image ${index + 1}`} onPress={() => setPreviewUri(uri)}>
                          <Image source={{ uri }} resizeMode="contain" accessibilityLabel={`Post image ${index + 1}`} style={styles.image} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : <Text style={[styles.meta, { color: colors.textSecondary }]}>This post has no attached media.</Text>}
            <View style={[styles.commentsHeader, { borderTopColor: colors.border }]}>
              <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Comments</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>Includes visible, hidden and flagged comments.</Text>
            </View>
            {error ? (
              <View accessibilityRole="alert" style={styles.error}>
                <Text style={[styles.meta, { color: '#ef4444' }]}>{error}</Text>
                <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => handleLoadComments()} style={styles.button}>
                  <Text style={[styles.buttonText, { color: colors.primary }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {comments.map(comment => (
              <View key={comment.id} testID={`admin-post-comment-${comment.id}`} style={[styles.comment, { borderColor: colors.border }]}>
                <View style={styles.commentHeading}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>{comment.author_name || comment.author_id.slice(0, 8)}</Text>
                  <Text style={[styles.meta, { color: comment.is_hidden ? '#d97706' : colors.textSecondary }]}>{comment.is_hidden ? 'Hidden' : comment.moderation_status?.replace(/_/g, ' ') || 'Visible'}</Text>
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{new Date(comment.created_at).toLocaleString()}{comment.parent_comment_id ? ' · Reply' : ''}</Text>
                <Text selectable style={[styles.body, { color: colors.text }]}>{comment.content}</Text>
                {comment.moderation_reason ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{comment.moderation_reason}</Text> : null}
                <View style={styles.actions}>
                  <TouchableOpacity accessibilityRole="button" disabled={busyId !== null || loading} onPress={() => void moderateComment(comment, comment.is_hidden || comment.moderation_status === 'pending_review' ? 'approved' : 'blocked')} style={[styles.button, { backgroundColor: `${colors.primary}12` }]}>
                    <Text style={[styles.buttonText, { color: colors.primary }]}>{comment.is_hidden || comment.moderation_status === 'pending_review' ? 'Approve / restore' : 'Hide'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" disabled={busyId !== null || loading} onPress={() => void moderateComment(comment, 'delete')} style={[styles.button, { backgroundColor: '#ef444412' }]}>
                    <Text style={[styles.buttonText, { color: '#ef4444' }]}>Delete</Text>
                  </TouchableOpacity>
                  {busyId === comment.id ? <ActivityIndicator color={colors.primary} /> : null}
                </View>
              </View>
            ))}
            {loading ? <ActivityIndicator accessibilityLabel="Loading comments" color={colors.primary} /> : !error && !comments.length ? <Text style={[styles.meta, { color: colors.textSecondary }]}>No comments yet.</Text> : null}
            {hasMore && !loading ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => handleLoadComments(comments.length)} style={[styles.button, { borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.buttonText, { color: colors.primary }]}>Load more comments</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
      <InAppMediaViewer visible={!!previewUri} uri={previewUri} title="Post image" onClose={() => setPreviewUri(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.55)', padding: 16 },
  panel: { width: '100%', maxWidth: 760, maxHeight: '92%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, flexShrink: 0 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 12 },
  heading: { fontFamily: 'Poppins_600SemiBold', fontSize: 17 },
  meta: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  body: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 23 },
  gallery: { gap: 12 },
  mediaFrame: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', height: 320, backgroundColor: '#111827' },
  commentsHeader: { borderTopWidth: 1, paddingTop: 20, marginTop: 8, gap: 4 },
  comment: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  commentHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  error: { gap: 8 },
});
