import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaComments,
  FaSearch,
  FaPaperPlane,
  FaPhoneAlt,
  FaVideo,
  FaUserCircle,
  FaPlus,
  FaArrowLeft,
  FaSyncAlt,
} from "react-icons/fa";
import { chatApi } from "../../api/chatApi";
import "./ChatWithUser.css";

function getId(value) {
  return value?.id ?? value?.pk;
}

function getName(user) {
  return (
    user?.name ||
    user?.full_name ||
    user?.fullName ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "User"
  );
}

function getOtherUser(conversation) {
  return conversation?.other_user || conversation?.user || {};
}

function getLastMessage(conversation) {
  const message = conversation?.last_message;
  return typeof message === "string"
    ? message
    : message?.body || "Start a conversation";
}

function getList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name = "User") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function ChatWithUser() {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messagesContainerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);
  const activeConversationId = getId(activeConversation);

  // Keep the active conversation stable during background polling.
  const loadConversations = useCallback(async () => {
    try {
      const result = await chatApi.getConversations();
      const list = getList(result);

      setConversations(list);

      setActiveConversation((current) => {
        if (!current) return current;

        const currentId = getId(current);
        const updatedConversation = list.find(
          (item) => getId(item) === currentId
        );

        // Returning the same object prevents the message effect
        // from restarting every time conversations are refreshed.
        return updatedConversation ? current : current;
      });

      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId) => {
      if (!conversationId) return false;

      try {
        const result = await chatApi.getMessages(conversationId);

        // Ignore responses for a conversation that is no longer active.
        if (getId(activeConversationRef.current) !== conversationId) {
          return false;
        }

        setMessages(getList(result));

        try {
          await chatApi.markRead(conversationId);
        } catch {
          // A read-receipt failure should not prevent messages loading.
        }

        return true;
      } catch {
        return false;
      }
    },
    []
  );

  // Keep the latest active conversation accessible to async callbacks.
  const activeConversationRef = useRef(activeConversation);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Depend on the ID, not the conversation object.
  // Background polling will no longer restart this effect.
  useEffect(() => {
    const conversationId = activeConversationId;

    if (!conversationId) {
      setMessages([]);
      return undefined;
    }

    shouldAutoScrollRef.current = true;
    setMessages([]);

    loadMessages(conversationId);

    const interval = window.setInterval(() => {
      loadMessages(conversationId);
      loadConversations();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeConversationId, loadMessages, loadConversations]);

  // Scroll only if the user was already near the bottom.
  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container || !shouldAutoScrollRef.current) return;

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 100;
  }, []);

  // Search users only after the user pauses typing.
  useEffect(() => {
    const query = search.trim();

    if (!query) {
      setUsers([]);
      setSearchingUsers(false);
      return undefined;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      setSearchingUsers(true);

      try {
        const result = await chatApi.getUsers(query);

        if (!cancelled) {
          setUsers(getList(result));
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingUsers(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search]);

  async function openConversation(conversation) {
    const conversationId = getId(conversation);
    if (!conversationId) {
      return;
    }

    shouldAutoScrollRef.current = true;
    setMobileChatOpen(true);

    if (conversationId === activeConversationId) {
      await loadMessages(conversationId);
      return;
    }

    setActiveConversation(conversation);
  }

  async function startConversation(user) {
    const userId = getId(user);

    if (!userId) {
      return;
    }

    try {
      const result = await chatApi.createConversation(userId);
      const conversation = result?.data ?? result;

      if (!getId(conversation)) {
        throw new Error(
          "The API did not return a conversation ID."
        );
      }

      shouldAutoScrollRef.current = true;

      setSearch("");
      setUsers([]);
      setMobileChatOpen(true);
      setActiveConversation(conversation);

      await loadConversations();

    } catch (error) {
      console.error("Start conversation failed:", error);
    }
  }

  async function handleSend(event) {
    event.preventDefault();

    const body = messageText.trim();
    const conversationId = activeConversationId;

    if (!body) {
      return;
    }

    if (!conversationId || sending) return;

    setSending(true);

    try {
      const result = await chatApi.sendMessage(conversationId, body);
      const sentMessage = result?.data ?? result;

      shouldAutoScrollRef.current = true;

      if (sentMessage?.id) {
        setMessages((current) => {
          // Avoid duplicate messages if the polling request returned it first.
          if (current.some((message) => message.id === sentMessage.id)) {
            return current;
          }
          return [...current, sentMessage];
        });
      } else {
        await loadMessages(conversationId);
      }

      setMessageText("");
      await loadConversations();

    } catch {
      // Message errors are intentionally kept silent in the chat interface.
    } finally {
      setSending(false);
    }
  }

  async function handleCall(callType) {
    const conversationId = activeConversationId;
    if (!conversationId) {
      return;
    }

    try {
      await chatApi.startCall(conversationId, callType);
    } catch {
      // Call errors are intentionally kept silent in the chat interface.
    }
  }

  const activeUser = activeConversation
    ? getOtherUser(activeConversation)
    : null;

  const searchIsActive = search.trim().length > 0;

  const visibleConversations = conversations.filter((conversation) => {
    const person = getOtherUser(conversation);
    const name = getName(person).toLowerCase();
    const email = (person?.email || "").toLowerCase();
    const query = search.trim().toLowerCase();

    return !query || name.includes(query) || email.includes(query);
  });

  return (
    <div className="educhat-page">
      <header className="educhat-heading">
        <div>
          <div className="educhat-eyebrow">COMMUNICATION CENTRE</div>
          <h1>Chat with User</h1>
          <p>Connect with students and mentors from one place.</p>
        </div>

        <button
          className="educhat-refresh"
          type="button"
          onClick={() => {
            loadConversations();

            if (activeConversationId) {
              loadMessages(activeConversationId);
            }
          }}
          title="Refresh conversations"
        >
          <FaSyncAlt />
          <span>Refresh</span>
        </button>
      </header>

      <section className="educhat-shell">
        <aside
          className={`educhat-sidebar ${
            mobileChatOpen ? "educhat-mobile-hidden" : ""
          }`}
        >
          <div className="educhat-sidebar-top">
            <div>
              <h2>Messages</h2>
              <span>{conversations.length} conversations</span>
            </div>

            <span className="educhat-message-icon">
              <FaComments />
            </span>
          </div>

          <label className="educhat-search">
            <FaSearch />
            <input
              type="search"
              placeholder="Search people or start a chat..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          {searchIsActive && (
            <div className="educhat-search-results">
              <div className="educhat-section-label">PEOPLE</div>

              {searchingUsers ? (
                <p className="educhat-muted">Searching users...</p>
              ) : users.length ? (
                users.map((user) => (
                  <button
                    className="educhat-user-result"
                    key={getId(user)}
                    type="button"
                    onClick={() => startConversation(user)}
                  >
                    <span className="educhat-avatar">
                      {initials(getName(user))}
                    </span>

                    <span className="educhat-user-details">
                      <strong>{getName(user)}</strong>
                      <small>{user.email}</small>
                    </span>

                    <FaPlus className="educhat-add-icon" />
                  </button>
                ))
              ) : (
                <p className="educhat-muted">
                  No matching users found.
                </p>
              )}
            </div>
          )}

          <div className="educhat-section-label educhat-conversation-label">
            RECENT CONVERSATIONS
          </div>

          <div className="educhat-conversation-list">
            {loading ? (
              <div className="educhat-empty">
                <span className="educhat-spinner" />
                Loading conversations...
              </div>
            ) : visibleConversations.length ? (
              visibleConversations.map((conversation) => {
                const person = getOtherUser(conversation);
                const isActive =
                  getId(conversation) === activeConversationId;

                return (
                  <button
                    className={`educhat-conversation ${
                      isActive ? "is-active" : ""
                    }`}
                    key={getId(conversation)}
                    type="button"
                    onClick={() => openConversation(conversation)}
                  >
                    <span className="educhat-avatar">
                      {initials(getName(person))}
                    </span>

                    <span className="educhat-conversation-copy">
                      <span className="educhat-conversation-line">
                        <strong>{getName(person)}</strong>
                        <small>
                          {formatTime(conversation.last_message_at)}
                        </small>
                      </span>

                      <span className="educhat-last-message">
                        {getLastMessage(conversation)}
                      </span>
                    </span>

                    {Number(conversation.unread_count) > 0 && (
                      <span className="educhat-unread">
                        {conversation.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="educhat-empty">
                <FaComments />
                <strong>No conversations yet</strong>
                <span>
                  Search for a student or mentor above to start chatting.
                </span>
              </div>
            )}
          </div>
        </aside>

        <main
          className={`educhat-main ${
            mobileChatOpen ? "educhat-main-mobile-open" : ""
          }`}
        >
          {activeConversation && activeUser ? (
            <>
              <header className="educhat-chat-header">
                <button
                  className="educhat-back"
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to conversations"
                >
                  <FaArrowLeft />
                </button>

                <span className="educhat-avatar educhat-avatar-large">
                  {initials(getName(activeUser))}
                </span>

                <div className="educhat-chat-person">
                  <strong>{getName(activeUser)}</strong>
                  <span>{activeUser.email || "EduTrack user"}</span>
                </div>

                <div className="educhat-call-actions">
                  <button
                    type="button"
                    onClick={() => handleCall("voice")}
                    title="Start voice call"
                    aria-label="Start voice call"
                  >
                    <FaPhoneAlt />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCall("video")}
                    title="Start video call"
                    aria-label="Start video call"
                  >
                    <FaVideo />
                  </button>
                </div>
              </header>

              <div className="educhat-date-divider">
                <span>MESSAGES</span>
              </div>

              <div
                className="educhat-messages"
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
              >
                {messages.length ? (
                  messages.map((message, index) => {
                    const mine = Boolean(message.is_mine);

                    return (
                      <div
                        className={`educhat-message-row ${
                          mine ? "mine" : "theirs"
                        }`}
                        key={message.id ?? `${message.created_at}-${index}`}
                      >
                        {!mine && (
                          <span className="educhat-small-avatar">
                            <FaUserCircle />
                          </span>
                        )}

                        <div className="educhat-bubble">
                          <p>
                            {message.is_deleted
                              ? "Message deleted"
                              : message.body}
                          </p>
                          <span>{formatTime(message.created_at)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="educhat-empty educhat-first-message">
                    <span className="educhat-welcome-icon">
                      <FaComments />
                    </span>
                    <strong>Start the conversation</strong>
                    <span>
                      Send a message to {getName(activeUser)}.
                    </span>
                  </div>
                )}
              </div>

              <form className="educhat-composer" onSubmit={handleSend}>
                <input
                  type="text"
                  placeholder="Write a message..."
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  maxLength={5000}
                  aria-label="Message"
                />

                <span className="educhat-character-count">
                  {messageText.length}/5000
                </span>

                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  aria-label="Send message"
                >
                  <FaPaperPlane />
                  <span>{sending ? "Sending..." : "Send"}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="educhat-welcome">
              <span className="educhat-welcome-icon">
                <FaComments />
              </span>

              <h2>Your conversations, in one place.</h2>

              <p>
                Select a conversation or search for a student or mentor to
                start a new chat.
              </p>

              <div className="educhat-welcome-features">
                <span>
                  <FaComments /> Text messaging
                </span>
                <span>
                  <FaPhoneAlt /> Voice call requests
                </span>
                <span>
                  <FaVideo /> Video call requests
                </span>
              </div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
