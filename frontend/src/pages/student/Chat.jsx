
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Send,
  MessageCircle,
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  Check,
  CheckCheck,
  Users,
  Plus,
  RefreshCw,
  X,
  PhoneCall,
  VideoIcon,
  CircleAlert,
} from "lucide-react";
import { useAdminTheme } from "../../context/ThemeContext";
import "./Chat.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com/api"
).replace(/\/+$/, "");

const CHAT_API = `${API_BASE}/chat`;

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    sessionStorage.getItem("access") ||
    ""
  );
}

function getCurrentUser() {
  try {
    return JSON.parse(
      localStorage.getItem("user") ||
        sessionStorage.getItem("user") ||
        "{}"
    );
  } catch {
    return {};
  }
}

function unwrapResponse(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }
  return payload;
}

function getErrorMessage(payload, fallback) {
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.detail === "string") return payload.detail;

  if (Array.isArray(payload?.non_field_errors)) {
    return payload.non_field_errors.join(" ");
  }

  return fallback;
}

function getDisplayName(person) {
  if (!person) return "Unknown user";

  const fullName =
    person.name ||
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ");

  return fullName || person.email || "EduTrack user";
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

function formatConversationDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  return sameDay
    ? formatTime(value)
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function getOtherParticipant(conversation, currentUserId) {
  if (conversation?.other_user) return conversation.other_user;
  if (conversation?.other_participant) return conversation.other_participant;

  const adminId = conversation?.admin?.id ?? conversation?.admin;
  const userId = conversation?.user?.id ?? conversation?.user;

  if (String(adminId) === String(currentUserId)) {
    return typeof conversation?.user === "object"
      ? conversation.user
      : null;
  }

  if (String(userId) === String(currentUserId)) {
    return typeof conversation?.admin === "object"
      ? conversation.admin
      : null;
  }

  return null;
}

function getConversationPreview(conversation) {
  const lastMessage = conversation?.last_message;

  if (typeof lastMessage === "string") return lastMessage;
  if (lastMessage?.body) return lastMessage.body;

  return "Start a conversation";
}

export default function Chat() {
  const { theme } = useAdminTheme();
  const normalizedTheme = String(theme || "dark").toLowerCase().includes("yellow")
    ? "yellow"
    : String(theme || "dark").toLowerCase().includes("light")
      ? "light"
      : "dark";
  const currentUser = useMemo(() => getCurrentUser(), []);
  const currentUserId = currentUser?.id ?? currentUser?.pk ?? null;

  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [startingCall, setStartingCall] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [calls, setCalls] = useState([]);

  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const activeConversationRef = useRef(null);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  const request = useCallback(async (path, options = {}) => {
    const token = getAccessToken();

    const response = await fetch(`${CHAT_API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(
        getErrorMessage(
          payload,
          response.status === 401
            ? "Your session has expired. Please log in again."
            : `Request failed (${response.status}).`
        )
      );
    }

    if (payload?.success === false) {
      throw new Error(getErrorMessage(payload, "The request failed."));
    }

    return unwrapResponse(payload);
  }, []);

  const loadConversations = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoadingConversations(true);

      try {
        const result = await request("/conversations/");
        const list = Array.isArray(result)
          ? result
          : result?.results || result?.conversations || [];

        setConversations(list);

        const selected = activeConversationRef.current;
        if (selected) {
          const refreshed = list.find(
            (item) => String(item.id) === String(selected.id)
          );

          if (refreshed) {
            setActiveConversation(refreshed);
          }
        }

        setError("");
      } catch (err) {
        if (!quiet) setError(err.message || "Unable to load conversations.");
      } finally {
        if (!quiet) setLoadingConversations(false);
      }
    },
    [request]
  );

  const loadMessages = useCallback(
    async (conversationId, { quiet = false } = {}) => {
      if (!conversationId) return;

      if (!quiet) setLoadingMessages(true);

      try {
        const result = await request(
          `/conversations/${conversationId}/messages/`
        );

        const list = Array.isArray(result)
          ? result
          : result?.results || result?.messages || [];

        setMessages(list);
        setError("");

        if (!quiet) {
          request(`/conversations/${conversationId}/read/`, {
            method: "POST",
          }).catch(() => {});
        }
      } catch (err) {
        if (!quiet) setError(err.message || "Unable to load messages.");
      } finally {
        if (!quiet) setLoadingMessages(false);
      }
    },
    [request]
  );

  const loadCalls = useCallback(async () => {
    try {
      const result = await request("/calls/");
      const list = Array.isArray(result)
        ? result
        : result?.results || result?.calls || [];

      setCalls(list);
    } catch {
      // Call history is optional. Do not block chat if this endpoint
      // has not been added to the backend yet.
    }
  }, [request]);

  const loadContacts = useCallback(async () => {
    try {
      const query = contactSearch.trim();
      const result = await request(
        `/users/${query ? `?search=${encodeURIComponent(query)}` : ""}`
      );

      const list = Array.isArray(result)
        ? result
        : result?.results || result?.users || [];

      setContacts(list);
    } catch (err) {
      setError(err.message || "Unable to load contacts.");
      setContacts([]);
    }
  }, [contactSearch, request]);

  useEffect(() => {
    loadConversations();
    loadCalls();
  }, [loadConversations, loadCalls]);

  useEffect(() => {
    if (!activeConversation?.id) {
      setMessages([]);
      return undefined;
    }

    loadMessages(activeConversation.id);

    const intervalId = window.setInterval(() => {
      loadMessages(activeConversation.id, { quiet: true });
      loadConversations({ quiet: true });
      loadCalls();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [
    activeConversation?.id,
    loadMessages,
    loadConversations,
    loadCalls,
  ]);
  useEffect(() => {
    if (showContacts) loadContacts();
  }, [showContacts, loadContacts]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conversation) => {
      const person = getOtherParticipant(conversation, currentUserId);
      return (
        getDisplayName(person).toLowerCase().includes(query) ||
        String(person?.email || "").toLowerCase().includes(query) ||
        getConversationPreview(conversation).toLowerCase().includes(query)
      );
    });
  }, [conversations, search, currentUserId]);

  const filteredContacts = useMemo(() => {
    const existingIds = new Set(
      conversations
        .map((conversation) =>
          getOtherParticipant(conversation, currentUserId)
        )
        .filter(Boolean)
        .map((person) => String(person.id ?? person.pk))
    );

    return contacts.filter(
      (person) =>
        !existingIds.has(String(person.id ?? person.pk)) &&
        String(person.id ?? person.pk) !== String(currentUserId)
    );
  }, [contacts, conversations, currentUserId]);

  async function openConversation(conversation) {
    setActiveConversation(conversation);
    activeConversationRef.current = conversation;
    setShowContacts(false);
    setShowMobileChat(true);
    setError("");
    setNotice("");
  }

  async function startConversation(person) {
    const personId = person?.id ?? person?.pk;
    if (!personId) {
      setError("This contact does not have a valid user ID.");
      return;
    }

    setError("");
    setNotice("");

    try {
      const result = await request("/conversations/", {
        method: "POST",
        body: JSON.stringify({ user_id: personId }),
      });

      const conversation = result?.conversation || result;
      if (!conversation?.id) {
        throw new Error("The server did not return a conversation ID.");
      }

      await loadConversations();
      await openConversation(conversation);
      setNotice(`Conversation opened with ${getDisplayName(person)}.`);
    } catch (err) {
      setError(err.message || "Unable to start a conversation.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    const body = messageText.trim();
    const conversationId = activeConversation?.id;

    if (!body || !conversationId || sending) return;

    setSending(true);
    setError("");

    try {
      const result = await request(
        `/conversations/${conversationId}/messages/`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      );

      const sentMessage = result?.message || result;
      if (sentMessage?.id) {
        setMessages((previous) => {
          const exists = previous.some(
            (message) => String(message.id) === String(sentMessage.id)
          );

          return exists ? previous : [...previous, sentMessage];
        });
      }

      setMessageText("");
      await loadConversations({ quiet: true });
      messageInputRef.current?.focus();
    } catch (err) {
      setError(err.message || "Unable to send the message.");
    } finally {
      setSending(false);
    }
  }

  async function startCall(callType) {
    if (!activeConversation?.id || startingCall) return;

    setStartingCall(callType);
    setError("");
    setNotice("");

    try {
      const result = await request(
        `/conversations/${activeConversation.id}/calls/`,
        {
          method: "POST",
          body: JSON.stringify({ call_type: callType }),
        }
      );

      const call = result?.call || result;
      setNotice(
        `${callType === "video" ? "Video" : "Voice"} call request created. ` +
          "Live media needs WebRTC integration."
      );

      if (call?.id) {
        setCalls((previous) => [call, ...previous]);
      }

      await loadCalls();
    } catch (err) {
      setError(err.message || "Unable to create the call request.");
    } finally {
      setStartingCall("");
    }
  }

  async function updateCall(callId, action) {
    try {
      await request(`/calls/${callId}/`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });

      await loadCalls();
      setNotice(`Call ${action}ed.`);
    } catch (err) {
      setError(err.message || "Unable to update call status.");
    }
  }

  const activePerson = activeConversation
    ? getOtherParticipant(activeConversation, currentUserId)
    : null;

  const incomingCalls = calls.filter(
    (call) =>
      String(call.callee) === String(currentUserId) &&
      String(call.status).toLowerCase() === "ringing"
  );

  return (
    <main className={`educhat-page theme-${normalizedTheme}`}>
      <header className="educhat-page-header">
        <div>
          <span className="educhat-eyebrow">EDUTRACK CONNECT</span>
          <h1>Messages</h1>
          <p>Connect with your learning community.</p>
        </div>

        <button
          className="educhat-icon-button"
          type="button"
          onClick={() => {
            loadConversations();
            loadCalls();
            if (activeConversation?.id) {
              loadMessages(activeConversation.id);
            }
          }}
          aria-label="Refresh chats"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </header>

      {error && (
        <div className="educhat-alert educhat-alert-error" role="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="educhat-alert educhat-alert-success" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {incomingCalls.length > 0 && (
        <section className="educhat-incoming-call" aria-label="Incoming calls">
          <div className="educhat-incoming-icon">
            <PhoneCall size={19} />
          </div>
          <div className="educhat-incoming-copy">
            <strong>Incoming call request</strong>
            <span>
              {incomingCalls[0].caller_name || "A contact"} is requesting a{" "}
              {incomingCalls[0].call_type} call.
            </span>
          </div>
          <div className="educhat-incoming-actions">
            <button
              type="button"
              className="educhat-button educhat-button-primary"
              onClick={() => updateCall(incomingCalls[0].id, "accept")}
            >
              Accept
            </button>
            <button
              type="button"
              className="educhat-button educhat-button-secondary"
              onClick={() => updateCall(incomingCalls[0].id, "reject")}
            >
              Decline
            </button>
          </div>
        </section>
      )}

      <section
        className={`educhat-workspace ${
          showMobileChat ? "educhat-mobile-chat-open" : ""
        }`}
      >
        <aside className="educhat-sidebar">
          <div className="educhat-sidebar-heading">
            <div>
              <h2>Your conversations</h2>
              <span>{conversations.length} chats</span>
            </div>
            <button
              className="educhat-icon-button educhat-new-chat"
              type="button"
              onClick={() => {
                setShowContacts(true);
                setContactSearch("");
                setContacts([]);
              }}
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <Plus size={19} />
            </button>
          </div>

          <label className="educhat-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search conversations..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </label>

          <div className="educhat-conversation-list">
            {loadingConversations ? (
              <div className="educhat-empty-state">
                <span className="educhat-spinner" />
                <p>Loading conversations...</p>
              </div>
            ) : filteredConversations.length ? (
              filteredConversations.map((conversation) => {
                const person = getOtherParticipant(
                  conversation,
                  currentUserId
                );
                const selected =
                  String(activeConversation?.id) ===
                  String(conversation.id);

                return (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`educhat-conversation ${
                      selected ? "is-active" : ""
                    }`}
                    onClick={() => openConversation(conversation)}
                  >
                    <span className="educhat-avatar">
                      {getDisplayName(person).charAt(0).toUpperCase()}
                    </span>

                    <span className="educhat-conversation-content">
                      <span className="educhat-conversation-top">
                        <strong>{getDisplayName(person)}</strong>
                        <time>
                          {formatConversationDate(
                            conversation.last_message_at ||
                              conversation.updated_at
                          )}
                        </time>
                      </span>
                      <span className="educhat-conversation-bottom">
                        <span>{getConversationPreview(conversation)}</span>
                        {Number(conversation.unread_count) > 0 && (
                          <span className="educhat-unread-badge">
                            {conversation.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="educhat-empty-state">
                <MessageCircle size={28} />
                <strong>No conversations yet</strong>
                <p>Start a conversation with a permitted contact.</p>
                <button
                  type="button"
                  className="educhat-button educhat-button-primary"
                  onClick={() => setShowContacts(true)}
                >
                  <Plus size={16} />
                  New conversation
                </button>
              </div>
            )}
          </div>

          <div className="educhat-sidebar-footer">
            <Users size={16} />
            <span>EduTrack learning community</span>
          </div>
        </aside>

        <section className="educhat-chat-panel">
          {activeConversation ? (
            <>
              <header className="educhat-chat-header">
                <button
                  type="button"
                  className="educhat-icon-button educhat-mobile-back"
                  onClick={() => setShowMobileChat(false)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={19} />
                </button>

                <span className="educhat-avatar educhat-header-avatar">
                  {getDisplayName(activePerson).charAt(0).toUpperCase()}
                </span>

                <div className="educhat-chat-person">
                  <strong>{getDisplayName(activePerson)}</strong>
                  <span>{activePerson?.email || "EduTrack contact"}</span>
                </div>

                <div className="educhat-chat-actions">
                  <button
                    type="button"
                    className="educhat-icon-button"
                    aria-label="Start voice call"
                    title="Voice call request"
                    disabled={Boolean(startingCall)}
                    onClick={() => startCall("voice")}
                  >
                    <Phone size={18} />
                  </button>
                  <button
                    type="button"
                    className="educhat-icon-button"
                    aria-label="Start video call"
                    title="Video call request"
                    disabled={Boolean(startingCall)}
                    onClick={() => startCall("video")}
                  >
                    <Video size={19} />
                  </button>
                  <button
                    type="button"
                    className="educhat-icon-button"
                    aria-label="Refresh messages"
                    title="Refresh messages"
                    onClick={() => loadMessages(activeConversation.id)}
                  >
                    <MoreVertical size={19} />
                  </button>
                </div>
              </header>

              <div className="educhat-chat-notice">
                <MessageCircle size={15} />
                <span>
                  Keep your learning conversations friendly and respectful.
                </span>
              </div>

              <div className="educhat-message-list">
                {loadingMessages ? (
                  <div className="educhat-empty-state">
                    <span className="educhat-spinner" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length ? (
                  messages.map((message) => {
                    const mine =
                      message.is_mine !== undefined
                        ? Boolean(message.is_mine)
                        : String(message.sender) === String(currentUserId);

                    return (
                      <div
                        key={message.id}
                        className={`educhat-message-row ${
                          mine ? "is-mine" : "is-theirs"
                        }`}
                      >
                        <div className="educhat-message-bubble">
                          {!mine && (
                            <span className="educhat-message-sender">
                              {message.sender_name || getDisplayName(activePerson)}
                            </span>
                          )}
                          <p>
                            {message.is_deleted
                              ? "This message was deleted."
                              : message.body}
                          </p>
                          <span className="educhat-message-meta">
                            <time>{formatTime(message.created_at)}</time>
                            {mine && (
                              message.read_at ? (
                                <CheckCheck size={14} aria-label="Read" />
                              ) : (
                                <Check size={14} aria-label="Sent" />
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="educhat-empty-state educhat-first-message">
                    <span className="educhat-empty-icon">
                      <MessageCircle size={27} />
                    </span>
                    <strong>Start the conversation</strong>
                    <p>Send a message to begin chatting.</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="educhat-composer" onSubmit={sendMessage}>
                <input
                  ref={messageInputRef}
                  type="text"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Write a message..."
                  maxLength={5000}
                  aria-label="Message"
                  autoComplete="off"
                />
                <span className="educhat-character-count">
                  {messageText.length}/5000
                </span>
                <button
                  type="submit"
                  className="educhat-send-button"
                  disabled={!messageText.trim() || sending}
                  aria-label="Send message"
                  title="Send message"
                >
                  {sending ? (
                    <span className="educhat-button-spinner" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="educhat-welcome">
              <div className="educhat-welcome-art">
                <MessageCircle size={39} />
                <span className="educhat-art-dot" />
              </div>
              <span className="educhat-eyebrow">YOUR LEARNING COMMUNITY</span>
              <h2>Good conversations start here.</h2>
              <p>
                Choose a conversation from the sidebar or start a new one to
                connect with your permitted EduTrack contacts.
              </p>
              <button
                type="button"
                className="educhat-button educhat-button-primary"
                onClick={() => setShowContacts(true)}
              >
                <Plus size={17} />
                Start a conversation
              </button>
            </div>
          )}
        </section>
      </section>

      {showContacts && (
        <div
          className="educhat-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowContacts(false);
            }
          }}
        >
          <section
            className="educhat-contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="educhat-contact-title"
          >
            <header className="educhat-modal-header">
              <div>
                <span className="educhat-eyebrow">EDUTRACK CONNECT</span>
                <h2 id="educhat-contact-title">New conversation</h2>
                <p>Find a contact to start chatting.</p>
              </div>
              <button
                type="button"
                className="educhat-icon-button"
                aria-label="Close"
                onClick={() => setShowContacts(false)}
              >
                <X size={19} />
              </button>
            </header>

            <label className="educhat-search educhat-modal-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search by name or email..."
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                autoFocus
              />
            </label>

            <div className="educhat-contact-list">
              {contacts.length ? (
                filteredContacts.map((person) => (
                  <button
                    key={person.id ?? person.pk}
                    type="button"
                    className="educhat-contact-item"
                    onClick={() => startConversation(person)}
                  >
                    <span className="educhat-avatar">
                      {getDisplayName(person).charAt(0).toUpperCase()}
                    </span>
                    <span className="educhat-contact-info">
                      <strong>{getDisplayName(person)}</strong>
                      <span>{person.email || "EduTrack contact"}</span>
                    </span>
                    <Plus size={18} />
                  </button>
                ))
              ) : (
                <div className="educhat-empty-state">
                  <Users size={26} />
                  <strong>No contacts found</strong>
                  <p>
                    Try another search, or check whether your account can
                    access the contacts endpoint.
                  </p>
                  <button
                    type="button"
                    className="educhat-button educhat-button-secondary"
                    onClick={loadContacts}
                  >
                    <RefreshCw size={15} />
                    Retry
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
