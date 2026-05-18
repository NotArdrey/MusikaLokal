import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import ProfileAvatar from './ProfileAvatar';

interface User {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
}

interface UserSearchModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectUser: (user: User) => void;
    currentUserId: string;
}

const UserSearchModal: React.FC<UserSearchModalProps> = ({
    visible,
    onClose,
    onSelectUser,
    currentUserId,
}) => {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [recentUsers, setRecentUsers] = useState<User[]>([]);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Search users
    const searchUsers = useCallback(async (query: string) => {
        if (!query.trim()) {
            setUsers([]);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url, role')
                .neq('id', currentUserId)
                .ilike('full_name', `%${query}%`)
                .limit(20);

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error searching users:', err);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    // Debounced search
    const handleSearchChange = (text: string) => {
        setSearchQuery(text);
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        const trimmed = text.trim();
        if (trimmed.length < 2) {
            setUsers([]);
            setLoading(false);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            void searchUsers(trimmed);
        }, 300);
    };

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    const loadRecentUsers = useCallback(async () => {
        try {
            const { data: myParticipations, error: participationError } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', currentUserId);

            if (participationError) throw participationError;

            const conversationIds = myParticipations?.map((p) => p.conversation_id) || [];
            if (conversationIds.length === 0) {
                setRecentUsers([]);
                return;
            }

            const { data: recentConversations, error: recentConversationError } = await supabase
                .from('conversations')
                .select('id, updated_at')
                .eq('is_group', false)
                .in('id', conversationIds)
                .order('updated_at', { ascending: false })
                .limit(10);

            if (recentConversationError) throw recentConversationError;

            const recentConversationIds = recentConversations?.map((c) => c.id) || [];
            if (recentConversationIds.length === 0) {
                setRecentUsers([]);
                return;
            }

            const { data: otherParticipants, error: otherParticipantsError } = await supabase
                .from('conversation_participants')
                .select('user_id')
                .in('conversation_id', recentConversationIds)
                .neq('user_id', currentUserId);

            if (otherParticipantsError) throw otherParticipantsError;

            const otherUserIds = Array.from(new Set(
                (otherParticipants || []).map((participant) => participant.user_id).filter(Boolean)
            ));

            if (otherUserIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, avatar_url, role')
                    .in('id', otherUserIds);

                setRecentUsers(profiles || []);
            }
        } catch (err) {
            console.error('Error loading recent users:', err);
        }
    }, [currentUserId]);

    // Load recent conversations' users when modal opens
    React.useEffect(() => {
        if (visible) {
            loadRecentUsers();
        }
    }, [visible, loadRecentUsers]);

    const handleSelectUser = (user: User) => {
        onSelectUser(user);
        setSearchQuery('');
        setUsers([]);
    };

    const renderUser = ({ item }: { item: User }) => (
        <TouchableOpacity activeOpacity={1}
            style={styles.userItem}
            onPress={() => handleSelectUser(item)}
        >
            <ProfileAvatar
                uri={item.avatar_url}
                style={styles.avatar}
                backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                iconColor={colors.textSecondary}
            />
            <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: colors.text }]}>
                    {item.full_name || 'Unknown User'}
                </Text>
                <Text style={[styles.userRole, { color: colors.textSecondary }]}>
                    {item.role?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'User'}
                </Text>
            </View>
            <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable
                    style={[
                        styles.popover,
                        {
                            backgroundColor: isDark ? '#111827' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                            width: Math.min(width - 32, 420),
                            maxHeight: Math.min(height - insets.top - 40, 560),
                        },
                    ]}
                    onPress={(event) => event.stopPropagation()}
                >
                    <View style={styles.header}>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>New Message</Text>
                        <TouchableOpacity activeOpacity={1} onPress={onClose} style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F2F5' }]}>
                            <Ionicons name="close" size={18} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F2F5' }]}>
                        <Ionicons name="search" size={18} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Search people"
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={handleSearchChange}
                            autoFocus
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity activeOpacity={1} onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0084FF" />
                        </View>
                    ) : searchQuery.length > 0 ? (
                        users.length > 0 ? (
                            <FlatList
                                data={users}
                                keyExtractor={(item) => item.id}
                                renderItem={renderUser}
                                contentContainerStyle={styles.list}
                                keyboardShouldPersistTaps="handled"
                            />
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    No users found
                                </Text>
                            </View>
                        )
                    ) : (
                        <View>
                            {recentUsers.length > 0 && (
                                <>
                                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                                        Recent
                                    </Text>
                                    <FlatList
                                        data={recentUsers}
                                        keyExtractor={(item) => item.id}
                                        renderItem={renderUser}
                                        contentContainerStyle={styles.list}
                                        scrollEnabled={false}
                                        keyboardShouldPersistTaps="handled"
                                    />
                                </>
                            )}
                            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                                Search for someone to start a conversation
                            </Text>
                        </View>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.24)',
    },
    popover: {
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 24,
        elevation: 18,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 10,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 10,
        paddingHorizontal: 12,
        minHeight: 38,
        borderRadius: 19,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        paddingVertical: 8,
    },
    loadingContainer: {
        minHeight: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 9,
        borderRadius: 10,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        marginLeft: 10,
    },
    userName: {
        fontSize: 15,
        fontWeight: '600',
    },
    userRole: {
        fontSize: 12,
        marginTop: 2,
    },
    emptyContainer: {
        minHeight: 180,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyText: {
        fontSize: 14,
        marginTop: 10,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        marginLeft: 16,
        marginTop: 4,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    hintText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 24,
        marginBottom: 28,
        paddingHorizontal: 32,
    },
});

export default UserSearchModal;
