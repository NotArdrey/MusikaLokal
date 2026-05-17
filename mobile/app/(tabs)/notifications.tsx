import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import GuestSignInGate from '../../src/components/GuestSignInGate';
import Header from '../../src/components/header';
import Navbar from '../../src/components/navbar';
import { useBottomBarClearance } from '../../src/hooks/useBottomBarClearance';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useNotificationsQuery } from '../../src/data/hooks';
import { queryKeys } from '../../src/data/queryKeys';
import { usePageLoadLogger } from '../../src/utils/loadTimeLogger';
import {
    buildNotificationRouteMeta,
    resolveNotificationNavigationTarget,
} from '../../src/utils/notificationNavigation';

const DEFAULT_NOTIFICATION_IMAGE = 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop';
const KNOWN_IMAGE_BUCKETS = ['listings', 'avatars', 'profile-images', 'group-images', 'studio-images', 'gig-images', 'documents', 'portfolio', 'images', 'public-assets'];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/i;
const IMAGE_OBJECT_FIELDS = [
    'image',
    'image_url',
    'avatar_url',
    'logo_url',
    'cover_image_url',
    'primary_image',
    'public_url',
    'publicUrl',
    'url',
    'storage_path',
    'storagePath',
    'media_url',
    'mediaUrl',
];

type NotificationEntityRefs = {
    profileIds: string[];
    groupIds: string[];
    productionTeamIds: string[];
    studioIds: string[];
    gigIds: string[];
};

type NotificationImageLookup = {
    profiles: Map<string, string[]>;
    groups: Map<string, string[]>;
    productionTeams: Map<string, string[]>;
    studios: Map<string, string[]>;
    gigs: Map<string, string[]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readStringId = (...values: unknown[]) => {
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized) return normalized;
    }

    return null;
};

const normalizeEntityType = (value: unknown) =>
    String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const addUniqueString = (target: string[], value: unknown, blockedValue?: string | null) => {
    const normalized = readStringId(value);
    if (!normalized || normalized === blockedValue || target.includes(normalized)) return;
    target.push(normalized);
};

const collectNotificationEntityRefs = (
    item: any,
    currentUserId?: string | null,
): NotificationEntityRefs => {
    const meta = isRecord(item?.meta) ? item.meta : {};
    const refs: NotificationEntityRefs = {
        profileIds: [],
        groupIds: [],
        productionTeamIds: [],
        studioIds: [],
        gigIds: [],
    };

    const addProfile = (...values: unknown[]) =>
        values.forEach((value) => addUniqueString(refs.profileIds, value, currentUserId || null));
    const addGroup = (...values: unknown[]) =>
        values.forEach((value) => addUniqueString(refs.groupIds, value));
    const addProductionTeam = (...values: unknown[]) =>
        values.forEach((value) => addUniqueString(refs.productionTeamIds, value));
    const addStudio = (...values: unknown[]) =>
        values.forEach((value) => addUniqueString(refs.studioIds, value));
    const addGig = (...values: unknown[]) =>
        values.forEach((value) => addUniqueString(refs.gigIds, value));

    const addByEntityType = (entityType: unknown, entityId: unknown) => {
        const normalizedType = normalizeEntityType(entityType);
        if (!normalizedType) return;

        if (normalizedType === 'musician' || normalizedType === 'profile' || normalizedType === 'user') {
            addProfile(entityId);
        } else if (normalizedType === 'group' || normalizedType === 'duo') {
            addGroup(entityId);
        } else if (normalizedType === 'production_team' || normalizedType === 'production') {
            addProductionTeam(entityId);
        } else if (normalizedType === 'studio') {
            addStudio(entityId);
        } else if (normalizedType === 'gig') {
            addGig(entityId);
        }
    };

    addByEntityType(meta.sender_entity_type, meta.sender_entity_id);
    addByEntityType(meta.senderEntityType, meta.senderEntityId);
    addByEntityType(meta.receiver_entity_type, meta.receiver_entity_id);
    addByEntityType(meta.receiverEntityType, meta.receiverEntityId);
    addByEntityType(meta.listing_type, meta.listing_id);
    addByEntityType(meta.listingType, meta.listingId);

    addProfile(
        meta.sender_id,
        meta.senderId,
        meta.actor_id,
        meta.actorId,
        meta.follower_id,
        meta.followerId,
        meta.profile_id,
        meta.profileId,
        meta.member_id,
        meta.memberId,
        meta.musician_id,
        meta.musicianId,
        meta.from_user_id,
        meta.fromUserId,
    );

    addGroup(item?.group_id, meta.group_id, meta.groupId);
    addProductionTeam(
        item?.production_team_id,
        item?.team_id,
        meta.production_team_id,
        meta.productionTeamId,
        meta.team_id,
        meta.teamId,
    );
    addStudio(item?.studio_id, meta.studio_id, meta.studioId);
    addGig(item?.gig_id, meta.gig_id, meta.gigId);

    return refs;
};

const addLookupCandidate = (
    target: Map<string, string[]>,
    key: unknown,
    rawImage: unknown,
) => {
    const normalizedKey = readStringId(key);
    if (!normalizedKey) return;

    const candidates = collectNotificationImageCandidates(rawImage, []);
    if (candidates.length === 0) return;

    const existing = target.get(normalizedKey) || [];
    candidates.forEach((candidate) => {
        if (!existing.includes(candidate)) {
            existing.push(candidate);
        }
    });
    target.set(normalizedKey, existing);
};

const buildHydratedImageCandidates = (
    item: any,
    lookup: NotificationImageLookup,
    currentUserId?: string | null,
) => {
    const refs = collectNotificationEntityRefs(item, currentUserId);
    const candidates: string[] = [];
    const append = (source: Map<string, string[]>, ids: string[]) => {
        ids.forEach((id) => {
            (source.get(id) || []).forEach((image) => {
                if (!candidates.includes(image)) candidates.push(image);
            });
        });
    };

    append(lookup.productionTeams, refs.productionTeamIds);
    append(lookup.groups, refs.groupIds);
    append(lookup.studios, refs.studioIds);
    append(lookup.gigs, refs.gigIds);
    append(lookup.profiles, refs.profileIds);

    return candidates;
};

const getSupabaseBaseUrl = () => {
    const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    return envBase.endsWith('/') ? envBase.slice(0, -1) : envBase;
};

const normalizeNotificationImageUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'none') return null;
    if (DATE_ONLY_PATTERN.test(trimmed) || ISO_TIMESTAMP_PATTERN.test(trimmed)) return null;

    if (trimmed.startsWith('/storage/v1/') || trimmed.startsWith('storage/v1/')) {
        const base = getSupabaseBaseUrl();
        const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        return base ? `${base}${normalizedPath}` : normalizedPath;
    }

    if (trimmed.includes('/storage/v1/object/avatars/')) {
        return trimmed.replace('/storage/v1/object/avatars/', '/storage/v1/object/public/avatars/');
    }

    if (trimmed.includes('/storage/v1/object/public/') || trimmed.includes('/storage/v1/render/image/public/')) {
        return trimmed;
    }

    if (/^(https?:\/\/|data:|file:\/\/|content:\/\/|blob:|asset:)/i.test(trimmed)) {
        return trimmed;
    }

    const normalized = trimmed.replace(/^\/+/, '');
    const directParts = normalized.split('/');
    const hasFileLikeSuffix = /\.[a-z0-9]{2,5}(\?|#|$)/i.test(normalized);

    if (!hasFileLikeSuffix && directParts.length < 2) {
        return null;
    }

    if (directParts.length > 1) {
        const directBucket = directParts[0];
        const directPath = directParts.slice(1).join('/');

        if (KNOWN_IMAGE_BUCKETS.includes(directBucket) || hasFileLikeSuffix) {
            const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
            if (data?.publicUrl) return data.publicUrl;
        }
    }

    for (const bucket of KNOWN_IMAGE_BUCKETS) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
        if (data?.publicUrl) return data.publicUrl;
    }

    return null;
};

const collectNotificationImageCandidates = (raw: unknown, candidates: string[] = []) => {
    if (!raw) return candidates;

    if (Array.isArray(raw)) {
        raw.forEach((entry) => collectNotificationImageCandidates(entry, candidates));
        return candidates;
    }

    if (typeof raw === 'object') {
        const source = raw as Record<string, unknown>;
        IMAGE_OBJECT_FIELDS.forEach((field) => collectNotificationImageCandidates(source[field], candidates));
        return candidates;
    }

    if (typeof raw !== 'string') return candidates;

    const trimmed = raw.trim();
    if (!trimmed) return candidates;

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
            collectNotificationImageCandidates(JSON.parse(trimmed), candidates);
            return candidates;
        } catch (_) {
            // Fall through and treat it as a plain URL/path candidate.
        }
    }

    const normalized = normalizeNotificationImageUrl(trimmed);
    if (normalized && !candidates.includes(normalized)) {
        candidates.push(normalized);
    }

    return candidates;
};


export default function NotificationsScreen() {
    const { colors, isDark } = useTheme();
    const { userId, isGuest } = useAuth();
    const queryClient = useQueryClient();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [notificationImageOverrides, setNotificationImageOverrides] = useState<Record<string, string[]>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: any[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
        const lowerTitle = (title || '').toLowerCase();
        let type: AlertType = 'info';
        if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('invalid')) {
            type = 'error';
        } else if (lowerTitle.includes('success')) {
            type = 'success';
        } else if (lowerTitle.includes('warning') || lowerTitle.includes('decline')) {
            type = 'warning';
        }
        showAlert(type, title || 'Notice', message || '', buttons);
    };

    const Alert = { alert: showAlertNative };

    const notificationsQuery = useNotificationsQuery(userId, { limit: 30 });
    const queriedNotifications = useMemo(
        () =>
            (notificationsQuery.data?.pages || []).flatMap((page: any) =>
                Array.isArray(page?.items) ? page.items : Array.isArray(page?.data) ? page.data : [],
            ),
        [notificationsQuery.data],
    );

    useEffect(() => {
        setNotifications(queriedNotifications);
    }, [queriedNotifications]);

    useEffect(() => {
        let cancelled = false;

        const hydrateNotificationImages = async () => {
            const notificationRows = queriedNotifications.filter((item: any) => item?.id);
            if (notificationRows.length === 0) {
                setNotificationImageOverrides({});
                return;
            }

            const profileIds = new Set<string>();
            const groupIds = new Set<string>();
            const productionTeamIds = new Set<string>();
            const studioIds = new Set<string>();
            const gigIds = new Set<string>();

            notificationRows.forEach((item: any) => {
                const refs = collectNotificationEntityRefs(item, userId);
                refs.profileIds.forEach((id) => profileIds.add(id));
                refs.groupIds.forEach((id) => groupIds.add(id));
                refs.productionTeamIds.forEach((id) => productionTeamIds.add(id));
                refs.studioIds.forEach((id) => studioIds.add(id));
                refs.gigIds.forEach((id) => gigIds.add(id));
            });

            const lookup: NotificationImageLookup = {
                profiles: new Map(),
                groups: new Map(),
                productionTeams: new Map(),
                studios: new Map(),
                gigs: new Map(),
            };

            const [
                profileResult,
                groupMediaResult,
                productionTeamResult,
                studioMediaResult,
                gigMediaResult,
            ] = await Promise.all([
                profileIds.size > 0
                    ? supabase
                        .from('profiles')
                        .select('id, avatar_url')
                        .in('id', Array.from(profileIds))
                    : Promise.resolve({ data: [], error: null } as any),
                groupIds.size > 0
                    ? supabase
                        .from('group_media')
                        .select('group_id, media_url, sort_order, created_at')
                        .in('group_id', Array.from(groupIds))
                        .eq('media_type', 'image')
                        .order('sort_order', { ascending: true })
                        .order('created_at', { ascending: true })
                    : Promise.resolve({ data: [], error: null } as any),
                productionTeamIds.size > 0
                    ? supabase
                        .from('production_teams')
                        .select('id, logo_url')
                        .in('id', Array.from(productionTeamIds))
                    : Promise.resolve({ data: [], error: null } as any),
                studioIds.size > 0
                    ? supabase
                        .from('studio_media')
                        .select('studio_id, media_url, sort_order, created_at')
                        .in('studio_id', Array.from(studioIds))
                        .eq('media_type', 'image')
                        .order('sort_order', { ascending: true })
                        .order('created_at', { ascending: true })
                    : Promise.resolve({ data: [], error: null } as any),
                gigIds.size > 0
                    ? supabase
                        .from('gig_media')
                        .select('gig_id, media_url, sort_order, created_at')
                        .in('gig_id', Array.from(gigIds))
                        .eq('media_type', 'image')
                        .order('sort_order', { ascending: true })
                        .order('created_at', { ascending: true })
                    : Promise.resolve({ data: [], error: null } as any),
            ]);

            if (cancelled) return;

            if (profileResult.error) {
                console.warn('Failed to hydrate notification profile images:', profileResult.error);
            } else {
                (profileResult.data || []).forEach((row: any) =>
                    addLookupCandidate(lookup.profiles, row?.id, row?.avatar_url),
                );
            }

            if (groupMediaResult.error) {
                console.warn('Failed to hydrate notification group images:', groupMediaResult.error);
            } else {
                (groupMediaResult.data || []).forEach((row: any) =>
                    addLookupCandidate(lookup.groups, row?.group_id, row?.media_url),
                );
            }

            if (productionTeamResult.error) {
                console.warn('Failed to hydrate notification production team images:', productionTeamResult.error);
            } else {
                (productionTeamResult.data || []).forEach((row: any) =>
                    addLookupCandidate(lookup.productionTeams, row?.id, row?.logo_url),
                );
            }

            if (studioMediaResult.error) {
                console.warn('Failed to hydrate notification studio images:', studioMediaResult.error);
            } else {
                (studioMediaResult.data || []).forEach((row: any) =>
                    addLookupCandidate(lookup.studios, row?.studio_id, row?.media_url),
                );
            }

            if (gigMediaResult.error) {
                console.warn('Failed to hydrate notification gig images:', gigMediaResult.error);
            } else {
                (gigMediaResult.data || []).forEach((row: any) =>
                    addLookupCandidate(lookup.gigs, row?.gig_id, row?.media_url),
                );
            }

            const nextOverrides: Record<string, string[]> = {};
            notificationRows.forEach((item: any) => {
                const candidates = buildHydratedImageCandidates(item, lookup, userId);
                if (candidates.length > 0) {
                    nextOverrides[item.id] = candidates;
                }
            });

            setNotificationImageOverrides(nextOverrides);
        };

        void hydrateNotificationImages();

        return () => {
            cancelled = true;
        };
    }, [queriedNotifications, userId]);

    const resolveNotificationImages = useCallback((item: any) => {
        const rawCandidates = [
            item?.image,
            item?.image_url,
            item?.avatar_url,
            item?.logo_url,
            item?.cover_image_url,
            item?.primary_image,
            item?.meta?.image,
            item?.meta?.images,
            item?.meta?.image_url,
            item?.meta?.avatar_url,
            item?.meta?.logo_url,
            item?.meta?.cover_image_url,
            item?.meta?.primary_image,
            item?.meta?.sender_image,
            item?.meta?.sender_avatar_url,
            item?.meta?.actor_avatar_url,
            item?.meta?.team_logo_url,
            item?.meta?.production_team_logo_url,
            item?.meta?.studio_image,
            item?.meta?.studio_images,
            item?.meta?.gig_image,
            item?.meta?.gig_images,
            item?.meta?.group_image,
            item?.meta?.group_images,
            notificationImageOverrides[item?.id],
        ];

        const candidates = rawCandidates.flatMap((raw) => collectNotificationImageCandidates(raw, []));
        return [...candidates, DEFAULT_NOTIFICATION_IMAGE].filter((candidate, index, all) => all.indexOf(candidate) === index);
    }, [notificationImageOverrides]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await notificationsQuery.refetch();
        setRefreshing(false);
    }, [notificationsQuery]);

    const markAsRead = async (id: string, currentReadStatus: boolean) => {
        if (currentReadStatus) return; // Already read

        // Optimistic update
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));

        try {
            if (!userId) return;

            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId, notificationId: id }
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
        } catch (e) {
        }
    };

    const markAllAsRead = async () => {
        // Optimistic update
        setNotifications(notifications.map(n => ({ ...n, read: true })));

        try {
            if (!userId) return;

            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId, all: true }
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
        } catch (e) {
        }
    };

    // Leadership Transfer Handlers
    const handleAcceptTransfer = async (notification: any) => {
        const requestId = notification.meta?.request_id;
        if (!requestId) {
            Alert.alert('Error', 'Invalid transfer request');
            return;
        }

        Alert.alert(
            'Accept Leadership',
            `Are you sure you want to become the leader of "${notification.meta?.group_name || 'this group'}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Accept',
                    onPress: async () => {
                        setProcessingTransferId(requestId);
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const { error } = await supabase.rpc('accept_leadership_transfer', {
                                request_id: requestId
                            });

                            if (error) throw error;

                            // Send notifications
                            const { data: request } = await supabase
                                .from('leadership_transfer_requests')
                                .select('from_user_id, group_id, groups:group_id(name, images)')
                                .eq('id', requestId)
                                .single();

                            if (request) {
                                // Get current user's profile for the avatar
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('avatar_url')
                                    .eq('id', user?.id)
                                    .single();

                                const groupImage = (request.groups as any)?.images?.[0];
                                const userAvatar = profile?.avatar_url;

                                // Notify old leader
                                await supabase.functions.invoke('listings-crud', {
                                    body: {
                                        action: 'create_notification',
                                        userId: user?.id,
                                        targetUserId: request.from_user_id,
                                        type: 'success',
                                        title: 'Leadership Transfer Accepted',
                                        message: `Your leadership transfer request for "${(request.groups as any)?.name}" was accepted.`,
                                        image: userAvatar || groupImage,
                                        meta: buildNotificationRouteMeta('/group_details', { id: request.group_id }, {
                                            type: 'leadership_transfer_accepted',
                                            group_id: request.group_id,
                                        })
                                    }
                                });

                                // Notify group members
                                const { data: members } = await supabase
                                    .from('group_members')
                                    .select('user_id')
                                    .eq('group_id', request.group_id)
                                    .neq('user_id', request.from_user_id);

                                if (members && members.length > 0 && user) {
                                    const memberNotifications = members
                                        .filter(m => m.user_id !== user.id)
                                        .map(m => ({
                                            user_id: m.user_id,
                                            type: 'info',
                                            title: 'Group Leadership Changed',
                                            message: `"${(request.groups as any)?.name}" has a new leader.`,
                                            image: groupImage || userAvatar,
                                            meta: buildNotificationRouteMeta('/group_details', { id: request.group_id }, {
                                                type: 'leadership_changed',
                                                group_id: request.group_id,
                                            })
                                        }));

                                    if (memberNotifications.length > 0) {
                                        await supabase.functions.invoke('listings-crud', {
                                            body: {
                                                action: 'create_notifications',
                                                userId: user?.id,
                                                notifications: memberNotifications
                                            }
                                        });
                                    }
                                }
                            }

                            Alert.alert('Success', 'You are now the group leader!');

                            // Mark notification as processed/read
                            markAsRead(notification.id, false);
                            void notificationsQuery.refetch();

                        } catch (e: any) {
                            console.error('Error accepting transfer:', e);
                            Alert.alert('Error', e.message || 'Failed to accept transfer');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleDeclineTransfer = async (notification: any) => {
        const requestId = notification.meta?.request_id;
        if (!requestId) {
            Alert.alert('Error', 'Invalid transfer request');
            return;
        }

        Alert.alert(
            'Decline Leadership',
            'Are you sure you want to decline this leadership transfer?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Decline',
                    style: 'destructive',
                    onPress: async () => {
                        setProcessingTransferId(requestId);
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const { error } = await supabase.rpc('decline_leadership_transfer', {
                                request_id: requestId
                            });

                            if (error) throw error;

                            // Notify old leader
                            const { data: request } = await supabase
                                .from('leadership_transfer_requests')
                                .select('from_user_id, group_id, groups:group_id(name, images)')
                                .eq('id', requestId)
                                .single();

                            if (request) {
                                // Get current user's profile for the avatar
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('avatar_url')
                                    .eq('id', user?.id)
                                    .single();

                                const groupImage = (request.groups as any)?.images?.[0];
                                const userAvatar = profile?.avatar_url;

                                await supabase.functions.invoke('listings-crud', {
                                    body: {
                                        action: 'create_notification',
                                        userId: user?.id,
                                        targetUserId: request.from_user_id,
                                        type: 'warning',
                                        title: 'Leadership Transfer Declined',
                                        message: `Your leadership transfer request for "${(request.groups as any)?.name}" was declined.`,
                                        image: userAvatar || groupImage,
                                        meta: buildNotificationRouteMeta('/group_details', { id: request.group_id }, {
                                            type: 'leadership_transfer_declined',
                                            group_id: request.group_id,
                                        })
                                    }
                                });
                            }

                            Alert.alert('Declined', 'Leadership transfer request has been declined.');
                            markAsRead(notification.id, false);
                            void notificationsQuery.refetch();

                        } catch (e: any) {
                            console.error('Error declining transfer:', e);
                            Alert.alert('Error', e.message || 'Failed to decline transfer');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    };

    const isLeadershipTransfer = (notification: any) => {
        return notification.meta?.type === 'leadership_transfer';
    };

    const handleNotificationPress = async (notification: any) => {
        await markAsRead(notification.id, notification.read);

        const target = resolveNotificationNavigationTarget(notification);
        if (!target || target.pathname === '/notifications') {
            return;
        }

        if (target.params && Object.keys(target.params).length > 0) {
            router.push({ pathname: target.pathname as any, params: target.params } as any);
            return;
        }

        router.push(target.pathname as any);
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const minuteMs = 60 * 1000;
        const hourMs = 60 * minuteMs;
        const dayMs = 24 * hourMs;

        const timeLabel = date.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
        });

        if (diffMs < minuteMs) {
            return 'Just now';
        }

        if (diffMs < hourMs) {
            const diffMins = Math.floor(diffMs / minuteMs);
            return `${diffMins}m ago`;
        }

        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayDiff = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / dayMs);

        if (dayDiff === 0) {
            return `Today at ${timeLabel}`;
        }

        if (dayDiff === 1) {
            return `Yesterday at ${timeLabel}`;
        }

        if (dayDiff < 7) {
            const weekdayLabel = date.toLocaleDateString([], { weekday: 'short' });
            return `${weekdayLabel} at ${timeLabel}`;
        }

        if (date.getFullYear() === now.getFullYear()) {
            const monthDayLabel = date.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
            });
            return `${monthDayLabel} at ${timeLabel}`;
        }

        const fullDateLabel = date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        return `${fullDateLabel} at ${timeLabel}`;
    };

    const today = new Date().toDateString();
    const loading = notificationsQuery.isLoading && notifications.length === 0;
    const todayNotifications = notifications.filter(n => new Date(n.created_at).toDateString() === today);
    const earlierNotifications = notifications.filter(n => new Date(n.created_at).toDateString() !== today);

    usePageLoadLogger({
        counts: {
            earlier: earlierNotifications.length,
            total: notifications.length,
            today: todayNotifications.length,
            unread: unreadCount,
        },
        details: {
            hasNextPage: Boolean(notificationsQuery.hasNextPage),
            userId: userId ? 'signed-in' : 'guest',
        },
        loading,
        page: 'Notifications',
        queries: { notifications: notificationsQuery },
        ready: !loading,
        refreshing,
    });

    const sections = [
        { title: 'Today', data: todayNotifications },
        { title: 'Earlier', data: earlierNotifications }
    ].filter(section => section.data.length > 0);

    const NotificationItem = ({ item }: { item: any }) => {
        const isTransfer = isLeadershipTransfer(item);
        const isRead = item.read;
        const imageCandidates = useMemo(() => resolveNotificationImages(item), [item, resolveNotificationImages]);
        const [imageCandidateIndex, setImageCandidateIndex] = useState(0);

        useEffect(() => {
            setImageCandidateIndex(0);
        }, [imageCandidates]);

        const resolvedImage = imageCandidates[imageCandidateIndex] || DEFAULT_NOTIFICATION_IMAGE;

        return (
            <TouchableOpacity activeOpacity={1}
                style={[
                    styles.notificationItem,
                    {
                        backgroundColor: isRead ? 'transparent' : (isDark ? 'rgba(99, 102, 241, 0.05)' : '#F0F4FF'),
                        borderLeftWidth: isRead ? 0 : 4,
                        borderLeftColor: colors.primary,
                        opacity: isRead ? 0.7 : 1,
                        paddingLeft: isRead ? 20 : 16,
                    }
                ]}
                onPress={() => {
                    if (!isTransfer) {
                        void handleNotificationPress(item);
                    }
                }}
            >
                <View style={styles.notificationContent}>
                    <View style={styles.leftContent}>
                        <View style={[styles.avatarContainer, { borderColor: colors.border }]}>
                            <Image
                                source={{ uri: resolvedImage }}
                                style={styles.avatarImage}
                                resizeMode="cover"
                                onError={() => {
                                    setImageCandidateIndex((currentIndex) => {
                                        const nextIndex = currentIndex + 1;
                                        return nextIndex < imageCandidates.length ? nextIndex : currentIndex;
                                    });
                                }}
                            />
                        </View>
                    </View>

                    <View style={styles.rightContent}>
                        <View style={styles.headerRow}>
                            <Text
                                style={[
                                    styles.titleText,
                                    {
                                        color: colors.text,
                                        fontFamily: isRead ? 'Poppins_500Medium' : 'Poppins_600SemiBold'
                                    }
                                ]}
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                                {formatTime(item.created_at)}
                            </Text>
                        </View>

                        <Text
                            style={[
                                styles.messageText,
                                { color: colors.textSecondary }
                            ]}
                            numberOfLines={isTransfer ? undefined : 2}
                        >
                            {item.message}
                        </Text>

                        {isTransfer && !isRead && (
                            <View style={styles.actionButtonsContainer}>
                                {processingTransferId === item.meta?.request_id ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                                ) : (
                                    <View style={styles.actionButtonsRow}>
                                        <TouchableOpacity activeOpacity={1}
                                            style={[styles.actionButton, styles.declineButton, { borderColor: colors.border }]}
                                            onPress={() => handleDeclineTransfer(item)}
                                        >
                                            <Text style={[styles.actionButtonText, { color: colors.text }]}>Decline</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity activeOpacity={1}
                                            style={[styles.actionButton, styles.acceptButton]}
                                            onPress={() => handleAcceptTransfer(item)}
                                        >
                                            <Text style={[styles.actionButtonText, { color: 'white' }]}>Accept</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (isGuest) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header title="Notifications" />
                <GuestSignInGate message="Sign in to view your notifications." />
                <View style={styles.navbarContainer}>
                    <Navbar />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Header title="Notifications" />

            {unreadCount > 0 && (
                <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.unreadText, { color: colors.primary }]}>{unreadCount} unread</Text>
                    <TouchableOpacity activeOpacity={1} onPress={markAllAsRead}>
                        <Text style={[styles.markReadText, { color: colors.textSecondary }]}>Mark all as read</Text>
                    </TouchableOpacity>
                </View>
            )}

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <NotificationItem item={item} />}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                        <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>{title}</Text>
                    </View>
                )}
                contentContainerStyle={[styles.listContent, { paddingBottom: contentBottomPadding }]}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
                onEndReached={() => {
                    if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
                        void notificationsQuery.fetchNextPage();
                    }
                }}
                onEndReachedThreshold={0.35}
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5' }]}>
                                <Ionicons name="notifications-outline" size={32} color={colors.textSecondary} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Notifications</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>We will let you know when something updates.</Text>
                        </View>
                    ) : null
                }
                ListFooterComponent={
                    loading || notificationsQuery.isFetchingNextPage ? (
                        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
                    ) : (
                        <View style={{ height: 24 }} />
                    )
                }
            />

            <View style={styles.navbarContainer}>
                <Navbar />
            </View>

            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    unreadText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    markReadText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
    },
    listContent: {
        paddingTop: 10,
        paddingBottom: 100,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    sectionHeaderText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    notificationItem: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 1, // Separator line effect if distinct backgrounds, or just spacing
    },
    notificationContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    leftContent: {
        marginRight: 16,
    },
    rightContent: {
        flex: 1,
    },
    avatarContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        position: 'relative',
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    titleText: {
        fontSize: 14,
        flex: 1,
        marginRight: 8,
    },
    timeText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    messageText: {
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
    },
    actionButtonsContainer: {
        marginTop: 12,
        width: '100%',
    },
    actionButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    declineButton: {
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    acceptButton: {
        backgroundColor: '#10B981',
    },
    actionButtonText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
    },
    navbarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
});
