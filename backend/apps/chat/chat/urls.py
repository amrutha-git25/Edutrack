from django.urls import path
from . import views

app_name = "chat"

urlpatterns = [
    path("users/", views.chat_users, name="chat-users"),
    path("conversations/", views.conversations_list_create, name="conversations-list-create"),
    path("conversations/<int:conversation_id>/", views.conversation_detail, name="conversation-detail"),
    path("conversations/<int:conversation_id>/messages/", views.conversation_messages, name="conversation-messages"),
    path("conversations/<int:conversation_id>/read/", views.mark_conversation_read, name="conversation-read"),
    path("conversations/<int:conversation_id>/calls/", views.start_call, name="start-call"),
    path("calls/", views.calls_list, name="calls-list"),
    path("calls/<uuid:call_id>/", views.call_detail, name="call-detail"),
]
