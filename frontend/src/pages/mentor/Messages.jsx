
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Send,
  MessageCircle,
  RefreshCw,
  ArrowLeft,
  Users,
  CheckCheck,
  X,
} from "lucide-react";
import mentorApi from "../../api/mentorApi";
import "./Messages.css";

function displayName(person) {
  return person?.name || person?.full_name || person?.email || "Student";
}

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "ST"
  );
}

function formatTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return sameDay
    ? date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleDateString([], {
        day: "2-digit",
        month: "short",
      });
}

export default function Messages() {
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messageAreaRef = useRef(null);
  const activeConversationRef = useRef(null);
  const previousConversationIdRef = useRef(null);
  const previousLastMessageIdRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const loadContacts = useCallback(async () => {
    try {
      const response = await mentorApi.get("mentor/messages/contacts/");
      setContacts(response.data.students || []);
    } catch (err) {
      console.error("Mentor message contacts error:", err);
      setError(
        err.response?.data?.message ||
          "Unable to load your assigned student contacts."
      );
    }
  }, []);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);

    try {
      const response = await mentorApi.get(
        "mentor/messages/conversations/"
      );
      const next = response.data.conversations || [];
      setConversations(next);

      const currentId = activeConversationRef.current?.id;
      if (currentId) {
        const refreshed = next.find(
          (conversation) => String(conversation.id) === String(currentId)
        );

        if (refreshed) {
          setActiveConversation(refreshed);
          activeConversationRef.current = refreshed;
        }
      }
    } catch (err) {
      console.error("Mentor conversations error:", err);
      if (!quiet) {
        setError(
          err.response?.data?.message ||
            "Unable to load your conversations."
        );
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, quiet = false) => {
    if (!conversationId) return;
    if (!quiet) setMessagesLoading(true);

    try {
      const response = await mentorApi.get(
        `mentor/messages/conversations/${conversationId}/messages/`
      );

      const incomingMessages = response.data.messages || [];

      // Avoid replacing the message array on every polling request when
      // the server returned the same messages. This prevents repeated scrolling.
      setMessages((currentMessages) => {
        const unchanged =
          currentMessages.length === incomingMessages.length &&
          currentMessages.every((current, index) => {
            const incoming = incomingMessages[index];
            return (
              String(current.id) === String(incoming.id) &&
              current.body === incoming.body &&
              current.read_at === incoming.read_at &&
              current.is_deleted === incoming.is_deleted
            );
          });

        return unchanged ? currentMessages : incomingMessages;
      });
    } catch (err) {
      console.error("Mentor message history error:", err);
      if (!quiet) {
        setError(
          err.response?.data?.message ||
            "Unable to load this conversation."
        );
      }
    } finally {
      if (!quiet) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
    loadConversations();
  }, [loadContacts, loadConversations]);

  useEffect(() => {
    const conversationId = activeConversation?.id;

    if (!conversationId) {
      setMessages([]);
      return undefined;
    }

    activeConversationRef.current = activeConversation;
    loadMessages(conversationId);

    const intervalId = window.setInterval(() => {
      loadMessages(conversationId, true);
      loadConversations(true);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [
    activeConversation?.id,
    loadMessages,
    loadConversations,
  ]);

  const handleMessageAreaScroll = () => {
    const element = messageAreaRef.current;
    if (!element) return;

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 100;
  };

  useEffect(() => {
    const conversationId = activeConversation?.id;
    const element = messageAreaRef.current;

    if (!conversationId || !element || messagesLoading || !messages.length) {
      return;
    }

    const conversationChanged =
      String(previousConversationIdRef.current) !== String(conversationId);

    const lastMessageId = messages[messages.length - 1]?.id;
    const newMessageArrived =
      lastMessageId != null &&
      String(previousLastMessageIdRef.current) !== String(lastMessageId);

    if (conversationChanged) {
      // Scroll to the bottom only when opening a different conversation.
      shouldAutoScrollRef.current = true;
      element.scrollTop = element.scrollHeight;
    } else if (newMessageArrived && shouldAutoScrollRef.current) {
      // Follow new messages only if the user was already near the bottom.
      element.scrollTop = element.scrollHeight;
    }

    previousConversationIdRef.current = conversationId;
    previousLastMessageIdRef.current = lastMessageId;
  }, [messages, activeConversation?.id, messagesLoading]);

  const openConversation = async (conversation) => {
    setError("");
    setNotice("");
    setActiveConversation(conversation);
    activeConversationRef.current = conversation;
    setShowContacts(false);
    setMobileChatOpen(true);
    setMessages([]);
    previousConversationIdRef.current = null;
    previousLastMessageIdRef.current = null;
    shouldAutoScrollRef.current = true;
  };

  const startConversation = async (student) => {
    setError("");
    setNotice("");

    try {
      const response = await mentorApi.post(
        "mentor/messages/conversations/",
        { student_id: student.id }
      );

      const conversation = response.data.conversation;

      await loadConversations(true);
      await loadContacts();
      await openConversation(conversation);
    } catch (err) {
      console.error("Start mentor conversation error:", err);
      setError(
        err.response?.data?.message ||
          "Unable to start a conversation with this student."
      );
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    const body = messageText.trim();
    const conversationId = activeConversation?.id;

    if (!body || !conversationId || sending) return;

    setSending(true);
    setError("");
    setNotice("");

    try {
      const response = await mentorApi.post(
        `mentor/messages/conversations/${conversationId}/messages/`,
        { body }
      );

      const sentMessage = response.data.message;

      if (sentMessage) {
        setMessages((previous) => {
          const alreadyAdded = previous.some(
            (message) => String(message.id) === String(sentMessage.id)
          );
          return alreadyAdded ? previous : [...previous, sentMessage];
        });
      }

      setMessageText("");
      await loadConversations(true);
    } catch (err) {
      console.error("Send mentor message error:", err);
      setError(
        err.response?.data?.message ||
          "Message could not be sent. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((conversation) => {
    const person = conversation.other_user;
    const query = messageSearch.trim().toLowerCase();

    if (!query) return true;

    return (
      displayName(person).toLowerCase().includes(query) ||
      String(person?.email || "").toLowerCase().includes(query) ||
      String(conversation.last_message?.body || "")
        .toLowerCase()
        .includes(query)
    );
  });

  const existingStudentIds = new Set(
    conversations.map((conversation) =>
      String(conversation.other_user?.id)
    )
  );

  const filteredContacts = contacts.filter((student) => {
    const query = contactSearch.trim().toLowerCase();

    return (
      !existingStudentIds.has(String(student.id)) &&
      (
        !query ||
        displayName(student).toLowerCase().includes(query) ||
        String(student.email || "").toLowerCase().includes(query)
      )
    );
  });

  const activePerson = activeConversation?.other_user;

  return (
    <main className="mentor-messages-page">
      <header className="mm-heading">
        <div>
          <span className="mm-eyebrow">
            <MessageCircle size={15} />
            MENTOR WORKSPACE
          </span>
          <h1>Messages</h1>
          <p>Communicate with students assigned to your courses.</p>
        </div>

        <button
          type="button"
          className="mm-refresh"
          onClick={() => {
            loadContacts();
            loadConversations();
          }}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="mm-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mm-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mm-chat-layout">
        <aside
          className={`mm-sidebar ${
            mobileChatOpen ? "mm-sidebar-mobile-hidden" : ""
          }`}
        >
          <div className="mm-sidebar-heading">
            <div>
              <h2>Conversations</h2>
              <span>{conversations.length} chats</span>
            </div>

            <button
              type="button"
              className="mm-new-chat"
              onClick={() => {
                setShowContacts((previous) => !previous);
                setContactSearch("");
              }}
              title="Start a conversation"
              aria-label="Start a conversation"
            >
              <Users size={18} />
            </button>
          </div>

          <label className="mm-search">
            <Search size={17} />
            <input
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
            />
          </label>

          {showContacts && (
            <div className="mm-contact-picker">
              <div className="mm-contact-picker-heading">
                <strong>Assigned students</strong>
                <button
                  type="button"
                  onClick={() => setShowContacts(false)}
                  aria-label="Close student list"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="mm-search mm-contact-search">
                <Search size={15} />
                <input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Find a student..."
                  aria-label="Search assigned students"
                />
              </label>

              <div className="mm-contact-list">
                {filteredContacts.length ? (
                  filteredContacts.map((student) => (
                    <button
                      type="button"
                      className="mm-contact-item"
                      key={student.id}
                      onClick={() => startConversation(student)}
                    >
                      <span className="mm-avatar">
                        {initials(displayName(student))}
                      </span>
                      <span className="mm-contact-copy">
                        <strong>{displayName(student)}</strong>
                        <small>{student.email || "Student"}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="mm-small-empty">
                    No new assigned students found.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mm-conversation-list">
            {loading ? (
              <div className="mm-empty-list">Loading conversations...</div>
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => {
                const person = conversation.other_user;
                const isActive =
                  String(conversation.id) ===
                  String(activeConversation?.id);
                const preview = conversation.last_message;

                return (
                  <button
                    type="button"
                    className={`mm-conversation ${
                      isActive ? "is-active" : ""
                    }`}
                    key={conversation.id}
                    onClick={() => openConversation(conversation)}
                  >
                    <span className="mm-avatar">
                      {initials(displayName(person))}
                    </span>

                    <span className="mm-conversation-copy">
                      <span className="mm-conversation-line">
                        <strong>{displayName(person)}</strong>
                        <small>
                          {formatTime(
                            conversation.last_message_at ||
                              preview?.created_at
                          )}
                        </small>
                      </span>

                      <span className="mm-last-message">
                        {preview
                          ? `${preview.is_mine ? "You: " : ""}${preview.body}`
                          : "Start the conversation"}
                      </span>
                    </span>

                    {Number(conversation.unread_count) > 0 && (
                      <span className="mm-unread">
                        {conversation.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="mm-empty-list">
                <MessageCircle size={25} />
                <strong>No conversations yet</strong>
                <span>Use the people icon to message an assigned student.</span>
              </div>
            )}
          </div>
        </aside>

        <section
          className={`mm-chat-main ${
            mobileChatOpen ? "mm-chat-main-mobile-open" : ""
          }`}
        >
          {activeConversation && activePerson ? (
            <>
              <header className="mm-chat-header">
                <button
                  type="button"
                  className="mm-mobile-back"
                  onClick={() => setMobileChatOpen(false)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={19} />
                </button>

                <span className="mm-avatar mm-avatar-large">
                  {initials(displayName(activePerson))}
                </span>

                <div className="mm-chat-person">
                  <h2>{displayName(activePerson)}</h2>
                  <p>{activePerson.email || "Assigned student"}</p>
                </div>

                <span className="mm-secure-label">
                  <CheckCheck size={15} />
                  Mentor chat
                </span>
              </header>

              <div
                className="mm-message-area"
                ref={messageAreaRef}
                onScroll={handleMessageAreaScroll}
              >
                <div className="mm-date-divider">
                  <span>CONVERSATION HISTORY</span>
                </div>

                {messagesLoading ? (
                  <div className="mm-message-state">Loading messages...</div>
                ) : messages.length ? (
                  messages.map((message) => {
                    const mine = Boolean(message.is_mine);

                    return (
                      <div
                        className={`mm-message-row ${
                          mine ? "mm-mine" : "mm-theirs"
                        }`}
                        key={message.id}
                      >
                        <div className="mm-bubble">
                          {!mine && (
                            <span className="mm-sender-name">
                              {message.sender_name || displayName(activePerson)}
                            </span>
                          )}
                          <p>
                            {message.is_deleted
                              ? "[Message deleted]"
                              : message.body}
                          </p>
                          <span className="mm-message-time">
                            {formatTime(message.created_at)}
                            {mine && message.read_at ? " · Read" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="mm-first-message">
                    <span className="mm-first-message-icon">
                      <MessageCircle size={24} />
                    </span>
                    <strong>Start the conversation</strong>
                    <p>
                      Send a message to {displayName(activePerson)}.
                    </p>
                  </div>
                )}

              </div>

              <form className="mm-composer" onSubmit={sendMessage}>
                <input
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Write a message..."
                  maxLength={5000}
                  aria-label="Write a message"
                />
                <span className="mm-character-count">
                  {messageText.length}/5000
                </span>
                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  aria-label="Send message"
                >
                  <Send size={17} />
                  <span>{sending ? "Sending..." : "Send"}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="mm-welcome">
              <span className="mm-welcome-icon">
                <MessageCircle size={30} />
              </span>
              <h2>Your conversations, in one place.</h2>
              <p>
                Select an existing conversation or start a new chat with a
                student assigned to your courses.
              </p>
              <button
                type="button"
                className="mm-start-button"
                onClick={() => setShowContacts(true)}
              >
                <Users size={17} />
                Find a student
              </button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
