from django.contrib import admin
from .models import Conversation, ChatMessage, CallSession


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ("sender", "body", "created_at", "read_at", "edited_at", "is_deleted")
    can_delete = False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "admin", "user", "is_archived", "created_at", "last_message_at")
    list_filter = ("is_archived", "created_at")
    search_fields = ("admin__email", "user__email")
    inlines = (ChatMessageInline,)


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "created_at", "read_at", "is_deleted")
    list_filter = ("is_deleted", "created_at")
    search_fields = ("body", "sender__email")


@admin.register(CallSession)
class CallSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "call_type", "status", "caller", "callee", "created_at")
    list_filter = ("call_type", "status", "created_at")
    search_fields = ("caller__email", "callee__email")
