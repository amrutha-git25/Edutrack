
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Conversation(models.Model):
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="admin_chat_conversations",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_chat_conversations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["-last_message_at", "-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["admin", "user"],
                name="unique_admin_user_conversation",
            ),
            models.CheckConstraint(
                condition=~Q(admin=models.F("user")),
                name="chat_admin_and_user_must_differ",
            ),
        ]
        indexes = [
            models.Index(fields=["admin", "is_archived"]),
            models.Index(fields=["user", "is_archived"]),
        ]

    def __str__(self):
        return f"Conversation {self.pk}: {self.admin_id} - {self.user_id}"


class ChatMessage(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_chat_messages",
    )
    body = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "read_at"]),
        ]

    def __str__(self):
        return f"Message {self.pk} in conversation {self.conversation_id}"


class CallSession(models.Model):
    class CallType(models.TextChoices):
        VOICE = "voice", "Voice"
        VIDEO = "video", "Video"

    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        RINGING = "ringing", "Ringing"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        ENDED = "ended", "Ended"
        MISSED = "missed", "Missed"
        CANCELLED = "cancelled", "Cancelled"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="calls",
    )
    caller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_chat_calls",
    )
    callee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_chat_calls",
    )
    call_type = models.CharField(max_length=10, choices=CallType.choices)
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.INITIATED,
    )
    room_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["callee", "status"]),
        ]

    def __str__(self):
        return f"{self.call_type} call {self.pk} ({self.status})"
