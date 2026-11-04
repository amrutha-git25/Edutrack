
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Conversation, ChatMessage, CallSession

User = get_user_model()


def display_name(user):
    full_name = user.get_full_name().strip()
    return full_name or getattr(user, "email", "") or str(user.pk)


class ChatUserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "name", "email")

    def get_name(self, obj):
        return display_name(obj)


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = (
            "id",
            "conversation",
            "sender",
            "sender_name",
            "is_mine",
            "body",
            "created_at",
            "read_at",
            "edited_at",
            "is_deleted",
        )
        read_only_fields = (
            "id",
            "conversation",
            "sender",
            "sender_name",
            "is_mine",
            "created_at",
            "read_at",
            "edited_at",
            "is_deleted",
        )

    def get_sender_name(self, obj):
        return display_name(obj.sender)

    def get_is_mine(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated
                    and obj.sender_id == request.user.pk)


class ConversationSerializer(serializers.ModelSerializer):
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "admin",
            "user",
            "other_user",
            "last_message",
            "unread_count",
            "created_at",
            "updated_at",
            "last_message_at",
            "is_archived",
        )
        read_only_fields = fields

    def get_other_user(self, obj):
        request = self.context.get("request")

        if request and request.user.pk == obj.admin_id:
            other = obj.user
        else:
            other = obj.admin

        return ChatUserSerializer(other).data

    def get_last_message(self, obj):
        message = (
            obj.messages.filter(is_deleted=False)
            .select_related("sender")
            .order_by("-created_at", "-id")
            .first()
        )

        if not message:
            return None

        return ChatMessageSerializer(
            message, context=self.context
        ).data

    def get_unread_count(self, obj):
        request = self.context.get("request")

        if not request or not request.user.is_authenticated:
            return 0

        return obj.messages.filter(
            read_at__isnull=True,
            is_deleted=False,
        ).exclude(sender=request.user).count()


class CallSessionSerializer(serializers.ModelSerializer):
    caller_name = serializers.SerializerMethodField()
    callee_name = serializers.SerializerMethodField()

    class Meta:
        model = CallSession
        fields = (
            "id",
            "conversation",
            "caller",
            "caller_name",
            "callee",
            "callee_name",
            "call_type",
            "status",
            "room_id",
            "created_at",
            "accepted_at",
            "ended_at",
        )
        read_only_fields = fields

    def get_caller_name(self, obj):
        return display_name(obj.caller)

    def get_callee_name(self, obj):
        return display_name(obj.callee)
