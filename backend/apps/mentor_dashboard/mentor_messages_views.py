from django.apps import apps
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _model(app_label, model_name):
    try:
        return apps.get_model(app_label, model_name)
    except (LookupError, ValueError):
        return None


def _is_mentor(user):
    if not user or not user.is_authenticated:
        return False

    if user.groups.filter(name__iexact="mentor").exists():
        return True

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)
    return str(role or "").strip().lower() == "mentor"


def _mentor_profile(user):
    MentorProfile = _model("users", "MentorProfile")
    if MentorProfile is None:
        return None
    return MentorProfile.objects.filter(user=user).first()


def _assigned_student_user_ids(mentor_profile):
    MentorAssignment = _model("courses", "MentorAssignment")
    if MentorAssignment is None or mentor_profile is None:
        return []

    return list(
        MentorAssignment.objects.filter(
            mentor=mentor_profile,
            student__is_active=True,
            student__user__is_active=True,
        )
        .values_list("student__user_id", flat=True)
        .distinct()
    )


def _display_name(user):
    return user.get_full_name().strip() or user.get_username()


def _user_data(user):
    return {
        "id": user.pk,
        "name": _display_name(user),
        "email": user.email,
    }


def _message_data(message, request):
    return {
        "id": message.pk,
        "conversation": message.conversation_id,
        "sender": message.sender_id,
        "sender_name": _display_name(message.sender),
        "is_mine": message.sender_id == request.user.pk,
        "body": "[Message deleted]" if message.is_deleted else message.body,
        "created_at": message.created_at.isoformat(),
        "read_at": message.read_at.isoformat() if message.read_at else None,
        "is_deleted": message.is_deleted,
    }


def _conversation_data(conversation, request):
    other_user = (
        conversation.user
        if conversation.admin_id == request.user.pk
        else conversation.admin
    )

    last_message = (
        conversation.messages.filter(is_deleted=False)
        .select_related("sender")
        .order_by("-created_at", "-id")
        .first()
    )

    unread_count = conversation.messages.filter(
        read_at__isnull=True,
        is_deleted=False,
    ).exclude(sender=request.user).count()

    return {
        "id": conversation.pk,
        "other_user": _user_data(other_user),
        "last_message": (
            _message_data(last_message, request) if last_message else None
        ),
        "last_message_at": (
            conversation.last_message_at.isoformat()
            if conversation.last_message_at else None
        ),
        "unread_count": unread_count,
    }


def _mentor_error(request):
    if not _is_mentor(request.user):
        return Response(
            {"success": False, "message": "Mentor access is required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if _mentor_profile(request.user) is None:
        return Response(
            {
                "success": False,
                "message": "No MentorProfile is linked to this account.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None


def _get_authorized_conversation(request, conversation_id):
    Conversation = _model("chat", "Conversation")
    if Conversation is None:
        return None, Response(
            {"success": False, "message": "Conversation model not found."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    student_ids = _assigned_student_user_ids(
        _mentor_profile(request.user)
    )

    conversation = Conversation.objects.filter(
        pk=conversation_id,
        admin=request.user,
        user_id__in=student_ids,
    ).select_related("admin", "user").first()

    if conversation is None:
        return None, Response(
            {
                "success": False,
                "message": "Conversation not found in your authorized scope.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return conversation, None


class MentorMessageContactsView(APIView):
    """GET /api/mentor/messages/contacts/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        error = _mentor_error(request)
        if error:
            return error

        User = _model("auth", "User")
        # Use the configured user model, including custom EduTrack accounts.
        from django.contrib.auth import get_user_model
        User = get_user_model()

        student_ids = _assigned_student_user_ids(
            _mentor_profile(request.user)
        )
        students = User.objects.filter(
            pk__in=student_ids,
            is_active=True,
        )

        search = request.query_params.get("search", "").strip()
        if search:
            students = students.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(username__icontains=search)
                | Q(email__icontains=search)
            )

        data = [_user_data(student) for student in students.order_by(
            "first_name", "last_name", "email"
        )]

        return Response({"success": True, "students": data})


class MentorConversationsView(APIView):
    """
    GET  /api/mentor/messages/conversations/
    POST /api/mentor/messages/conversations/  {"student_id": 123}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        error = _mentor_error(request)
        if error:
            return error

        Conversation = _model("chat", "Conversation")
        if Conversation is None:
            return Response(
                {"success": False, "message": "Conversation model not found."},
                status=500,
            )

        student_ids = _assigned_student_user_ids(
            _mentor_profile(request.user)
        )

        conversations = Conversation.objects.filter(
            admin=request.user,
            user_id__in=student_ids,
            is_archived=False,
        ).select_related("admin", "user").prefetch_related(
            "messages__sender"
        ).order_by("-last_message_at", "-updated_at")

        return Response({
            "success": True,
            "conversations": [
                _conversation_data(conversation, request)
                for conversation in conversations
            ],
        })

    def post(self, request):
        error = _mentor_error(request)
        if error:
            return error

        student_id = request.data.get("student_id")
        if not student_id:
            return Response(
                {"success": False, "message": "student_id is required."},
                status=400,
            )

        try:
            student_id = int(student_id)
        except (TypeError, ValueError):
            return Response(
                {"success": False, "message": "student_id must be an integer."},
                status=400,
            )

        student_ids = _assigned_student_user_ids(
            _mentor_profile(request.user)
        )

        if student_id not in student_ids:
            return Response(
                {
                    "success": False,
                    "message": "You can message only students assigned to you.",
                },
                status=403,
            )

        from django.contrib.auth import get_user_model
        User = get_user_model()
        student_user = User.objects.filter(
            pk=student_id,
            is_active=True,
        ).first()

        if student_user is None:
            return Response(
                {"success": False, "message": "Student account not found."},
                status=404,
            )

        Conversation = _model("chat", "Conversation")
        if Conversation is None:
            return Response(
                {"success": False, "message": "Conversation model not found."},
                status=500,
            )

        conversation, created = Conversation.objects.get_or_create(
            admin=request.user,
            user=student_user,
            defaults={"is_archived": False},
        )

        if conversation.is_archived:
            conversation.is_archived = False
            conversation.save(update_fields=["is_archived", "updated_at"])

        return Response(
            {
                "success": True,
                "conversation": _conversation_data(conversation, request),
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MentorConversationMessagesView(APIView):
    """
    GET  /api/mentor/messages/conversations/<conversation_id>/messages/
    POST /api/mentor/messages/conversations/<conversation_id>/messages/
         {"body": "Hello"}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        error = _mentor_error(request)
        if error:
            return error

        conversation, error = _get_authorized_conversation(
            request, conversation_id
        )
        if error:
            return error

        ChatMessage = _model("chat", "ChatMessage")
        if ChatMessage is None:
            return Response(
                {"success": False, "message": "ChatMessage model not found."},
                status=500,
            )

        # Opening the conversation marks incoming messages as read.
        conversation.messages.filter(
            read_at__isnull=True,
            is_deleted=False,
        ).exclude(sender=request.user).update(read_at=timezone.now())

        messages = conversation.messages.select_related(
            "sender"
        ).order_by("created_at", "id")

        return Response({
            "success": True,
            "messages": [
                _message_data(message, request)
                for message in messages
            ],
        })

    def post(self, request, conversation_id):
        error = _mentor_error(request)
        if error:
            return error

        conversation, error = _get_authorized_conversation(
            request, conversation_id
        )
        if error:
            return error

        body = request.data.get("body", "")
        if not isinstance(body, str) or not body.strip():
            return Response(
                {"success": False, "message": "Message cannot be empty."},
                status=400,
            )

        body = body.strip()
        if len(body) > 5000:
            return Response(
                {
                    "success": False,
                    "message": "Messages cannot exceed 5000 characters.",
                },
                status=400,
            )

        ChatMessage = _model("chat", "ChatMessage")
        if ChatMessage is None:
            return Response(
                {"success": False, "message": "ChatMessage model not found."},
                status=500,
            )

        with transaction.atomic():
            message = ChatMessage.objects.create(
                conversation=conversation,
                sender=request.user,
                body=body,
            )
            conversation.last_message_at = message.created_at
            conversation.save(
                update_fields=["last_message_at", "updated_at"]
            )

        return Response(
            {
                "success": True,
                "message": _message_data(message, request),
            },
            status=status.HTTP_201_CREATED,
        )


class MentorConversationReadView(APIView):
    """POST /api/mentor/messages/conversations/<conversation_id>/read/"""
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        error = _mentor_error(request)
        if error:
            return error

        conversation, error = _get_authorized_conversation(
            request, conversation_id
        )
        if error:
            return error

        updated_count = conversation.messages.filter(
            read_at__isnull=True,
            is_deleted=False,
        ).exclude(sender=request.user).update(read_at=timezone.now())

        return Response({
            "success": True,
            "marked_read": updated_count,
        })