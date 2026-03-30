import { useCallback, useEffect, useRef, useState } from "react";
import { IoArrowBack, IoChatbubbles, IoSend } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import GuestSignInGate from "../components/GuestSignInGate";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Conversation {
  id: string;
  other_user_id: string;
  other_user_name: string;
  other_user_avatar: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_group: boolean;
  group_name: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

export default function ChatPage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoadError("");
    try {
      // Get all conversation IDs the user participates in
      const { data: participations, error: partError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", session.user.id);

      if (partError) throw partError;

      const convoIds = participations?.map((p) => p.conversation_id) || [];
      if (convoIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Fetch conversations (group_name/group_avatar_url were dropped from this table)
      const { data: convos, error: convoError } = await supabase
        .from("conversations")
        .select("id, is_group, updated_at")
        .in("id", convoIds)
        .order("updated_at", { ascending: false });

      if (convoError) throw convoError;

      // Fetch group display data from the projection view
      const { data: displayRows } = await supabase
        .from("conversations_display_projection")
        .select("id, group_name, group_avatar_url")
        .in("id", convoIds);

      const displayMap = new Map(
        (displayRows || []).map((d: any) => [d.id, d]),
      );

      // Get all participants with profile data
      const { data: allParticipants } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", convoIds);

      // Get unique user IDs (not current user) for profile lookups
      const otherUserIds = [
        ...new Set(
          (allParticipants || [])
            .filter((p) => p.user_id !== session.user.id)
            .map((p) => p.user_id),
        ),
      ];

      // Fetch profiles for other users
      const { data: profiles } =
        otherUserIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .in("id", otherUserIds)
          : { data: [] };

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Build participant map: conversation_id -> other user(s)
      const convoOtherUsers = new Map<string, string>();
      for (const p of allParticipants || []) {
        if (p.user_id !== session.user.id) {
          convoOtherUsers.set(p.conversation_id, p.user_id);
        }
      }

      // Process each conversation
      const processed: Conversation[] = await Promise.all(
        (convos || []).map(async (conv) => {
          const display = displayMap.get(conv.id);

          // Get last message
          const { data: lastMsg } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Get unread count
          const { count: unreadCount } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", session.user.id)
            .is("read_at", null);

          const otherUserId = convoOtherUsers.get(conv.id) || "";
          const otherProfile = profileMap.get(otherUserId);

          return {
            id: conv.id,
            other_user_id: otherUserId,
            other_user_name: conv.is_group
              ? display?.group_name || "Group Chat"
              : otherProfile?.full_name || "Unknown",
            other_user_avatar: conv.is_group
              ? display?.group_avatar_url || null
              : otherProfile?.avatar_url || null,
            last_message: lastMsg?.content || "",
            last_message_at: lastMsg?.created_at || conv.updated_at || "",
            unread_count: unreadCount || 0,
            is_group: conv.is_group,
            group_name: display?.group_name || null,
          };
        }),
      );

      // Sort by last message time
      processed.sort(
        (a, b) =>
          new Date(b.last_message_at).getTime() -
          new Date(a.last_message_at).getTime(),
      );

      setConversations(processed);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setConversations([]);
      setLoadError("Could not load conversations. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(
    async (conversationId: string) => {
      if (!session?.user?.id) return;
      try {
        const { data, error } = await supabase
          .from("messages")
          .select(
            "id, sender_id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name)",
          )
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        setMessages(
          (data || []).map((m: any) => ({
            id: m.id,
            sender_id: m.sender_id,
            content: m.content,
            created_at: m.created_at,
            sender_name: m.sender?.full_name || "Unknown",
          })),
        );

        // Mark messages as read
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .neq("sender_id", session.user.id)
          .is("read_at", null);
      } catch (err) {
        console.error("Error fetching messages:", err);
        setMessages([]);
      }
    },
    [session?.user?.id],
  );

  useEffect(() => {
    if (activeConvo) fetchMessages(activeConvo.id);
  }, [activeConvo, fetchMessages]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!activeConvo) return;

    const channel = supabase
      .channel(`messages:${activeConvo.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvo.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;

          // Fetch sender name
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", newMsg.sender_id)
            .single();

          const message: Message = {
            id: newMsg.id,
            sender_id: newMsg.sender_id,
            content: newMsg.content,
            created_at: newMsg.created_at,
            sender_name: senderProfile?.full_name || "Unknown",
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });

          // Auto mark as read if not from current user
          if (newMsg.sender_id !== session?.user?.id) {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id)
              .then();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConvo, session?.user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvo || !session?.user?.id || sending)
      return;
    const content = newMessage.trim();
    setNewMessage("");
    setSending(true);

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: session.user.id,
        content,
        created_at: new Date().toISOString(),
        sender_name: session.user.user_metadata?.full_name || "You",
      },
    ]);

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: activeConvo.id,
        sender_id: session.user.id,
        content,
        message_type: "text",
      });

      if (error) throw error;

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeConvo.id);

      // Refresh messages to get the real ID
      fetchMessages(activeConvo.id);
    } catch (err) {
      console.error("Error sending message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  if (isGuest) {
    return (
      <div className="page-container">
        <Header title="Messages" />
        <GuestSignInGate message="Sign in to access messages" />
      </div>
    );
  }

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="page-container">
      <div className="flex h-[calc(100vh-7rem)] lg:h-[calc(100vh-2rem)]">
        {/* Conversations List */}
        <div
          className={`w-full border-r lg:w-96 flex flex-col ${activeConvo ? "hidden lg:flex" : "flex"}`}
          style={{ borderColor: colors.border }}
        >
          <div
            className="flex items-center gap-3 px-6 pt-6 pb-4 border-b"
            style={{ borderColor: colors.border }}
          >
            <button
              onClick={() => navigate(-1)}
              className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700 lg:hidden"
            >
              <IoArrowBack size={22} color={colors.text} />
            </button>
            <IoChatbubbles size={24} color={colors.primary} />
            <h1 className="text-xl font-bold" style={{ color: colors.text }}>
              Messages
            </h1>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-16">
                <div
                  className="spinner"
                  style={{ color: colors.primary, width: 28, height: 28 }}
                />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <IoChatbubbles
                  size={44}
                  color={colors.muted}
                  className="mb-3"
                />
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {loadError}
                </p>
                <button
                  onClick={() => {
                    setLoading(true);
                    fetchConversations();
                  }}
                  className="mt-4 text-sm font-medium transition-colors hover:underline"
                  style={{ color: colors.primary }}
                >
                  Retry
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <IoChatbubbles
                  size={44}
                  color={colors.muted}
                  className="mb-3"
                />
                <p
                  className="text-base font-semibold"
                  style={{ color: colors.text }}
                >
                  No conversations yet
                </p>
                <p
                  className="text-sm mt-1"
                  style={{ color: colors.textSecondary }}
                >
                  Start a conversation by messaging someone
                </p>
              </div>
            ) : (
              conversations.map((convo) => (
                <button
                  key={convo.id}
                  onClick={() => setActiveConvo(convo)}
                  className={`flex w-full items-center gap-4 px-6 py-4 text-left transition-all hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                    activeConvo?.id === convo.id
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border-r-2 border-r-indigo-500"
                      : ""
                  }`}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                    {convo.other_user_avatar ? (
                      <img
                        src={convo.other_user_avatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-base font-bold"
                        style={{ color: colors.textSecondary }}
                      >
                        {convo.other_user_name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: colors.text }}
                      >
                        {convo.other_user_name}
                      </p>
                      <span
                        className="text-xs shrink-0 ml-2"
                        style={{ color: colors.muted }}
                      >
                        {timeAgo(convo.last_message_at)}
                      </span>
                    </div>
                    <p
                      className="text-sm truncate mt-0.5"
                      style={{ color: colors.textSecondary }}
                    >
                      {convo.last_message}
                    </p>
                  </div>
                  {convo.unread_count > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shrink-0">
                      {convo.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div
          className={`flex-1 flex flex-col ${!activeConvo ? "hidden lg:flex" : "flex"}`}
        >
          {activeConvo ? (
            <>
              {/* Thread header */}
              <div
                className="flex items-center gap-4 border-b px-6 py-4"
                style={{
                  borderColor: colors.border,
                  backgroundColor: isDark
                    ? "rgba(15,23,42,0.5)"
                    : "rgba(249,250,251,0.8)",
                }}
              >
                <button
                  onClick={() => setActiveConvo(null)}
                  className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700 lg:hidden"
                >
                  <IoArrowBack size={22} color={colors.text} />
                </button>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                  {activeConvo.other_user_avatar ? (
                    <img
                      src={activeConvo.other_user_avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-sm font-bold"
                      style={{ color: colors.textSecondary }}
                    >
                      {activeConvo.other_user_name?.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p
                    className="font-semibold text-base"
                    style={{ color: colors.text }}
                  >
                    {activeConvo.other_user_name}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
                style={{
                  backgroundColor: isDark
                    ? "rgba(15,23,42,0.3)"
                    : "rgba(249,250,251,0.5)",
                }}
              >
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p
                      className="text-sm"
                      style={{ color: colors.textSecondary }}
                    >
                      No messages yet. Say hello!
                    </p>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.sender_id === session?.user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-md ${isMine ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                            isMine
                              ? "bg-indigo-600 text-white rounded-br-md"
                              : "rounded-bl-md"
                          }`}
                          style={
                            !isMine
                              ? {
                                  backgroundColor: isDark
                                    ? colors.surface
                                    : "#F3F4F6",
                                  color: colors.text,
                                }
                              : undefined
                          }
                        >
                          {msg.content}
                        </div>
                        <p
                          className={`text-[10px] mt-1 ${isMine ? "text-right" : "text-left"}`}
                          style={{ color: colors.muted }}
                        >
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="border-t px-6 py-4"
                style={{
                  borderColor: colors.border,
                  backgroundColor: isDark ? "rgba(15,23,42,0.6)" : "#ffffff",
                }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    className="input-field flex-1"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && sendMessage()
                    }
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-700 hover:shadow-lg disabled:opacity-50"
                  >
                    <IoSend size={20} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <IoChatbubbles
                  size={56}
                  color={colors.muted}
                  className="mx-auto mb-4"
                />
                <p
                  className="text-lg font-semibold"
                  style={{ color: colors.text }}
                >
                  Select a conversation
                </p>
                <p
                  className="text-sm mt-1"
                  style={{ color: colors.textSecondary }}
                >
                  Choose from your existing conversations
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
