import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

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
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [recentUsers, setRecentUsers] = useState<User[]>([]);

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
        // Simple debounce
        setTimeout(() => {
            if (text === searchQuery || text.length >= 2) {
                searchUsers(text);
            }
        }, 300);
    };

    // Load recent conversations' users when modal opens
    React.useEffect(() => {
        if (visible) {
            loadRecentUsers();
        }
    }, [visible]);

    const loadRecentUsers = async () => {
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
    };

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
            {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <Ionicons name="person" size={20} color="#FFF" />
                </View>
            )}
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
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                    <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>New Message</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Search Input */}
                <View style={[styles.searchContainer, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Search people..."
                        placeholderTextColor={colors.textSecondary}
                        value={searchQuery}
                        onChangeText={handleSearchChange}
                        autoFocus
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity activeOpacity={1} onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : searchQuery.length > 0 ? (
                    // Search results
                    users.length > 0 ? (
                        <FlatList
                            data={users}
                            keyExtractor={(item) => item.id}
                            renderItem={renderUser}
                            contentContainerStyle={styles.list}
                        />
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                No users found
                            </Text>
                        </View>
                    )
                ) : (
                    // Recent users
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
                                />
                            </>
                        )}
                        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                            Search for someone to start a conversation
                        </Text>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: 16,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
        marginLeft: 12,
    },
    userName: {
        fontSize: 16,
        fontWeight: '500',
    },
    userRole: {
        fontSize: 13,
        marginTop: 2,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyText: {
        fontSize: 16,
        marginTop: 12,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 16,
        marginTop: 16,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    hintText: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 32,
    },
});

export default UserSearchModal;
