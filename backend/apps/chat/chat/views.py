
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.users.models import Student, MentorProfile

from .models import Conversation, ChatMessage, CallSession
from .serializers import (
    ChatUserSerializer,
    ConversationSerializer,
    ChatMessageSerializer,
    CallSessionSerializer,
)

User = get_user_model()


def user_role(user):
    """Support a role field if one exists on the user model."""
    role = getattr(user, "role", "")

    if hasattr(role, "name"):
        role = role.name
    elif hasattr(role, "role_name"):
        role = role.role_name

    return str(role).strip().lower()


def is_active_authenticated_user(user):
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "is_active", False)
    )


def is_admin(user):
    """Identify active administrators using Django flags or the role field."""
    return bool(
        is_active_authenticated_user(user)
        and (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or user_role(user) == "admin"
        )
    )


def is_student_user(user):
    """
    Recognize active student accounts by profile or role.

    Some installations may have a valid Student role before a Student profile
    has been linked. The role fallback lets the account enter chat; contact
    eligibility is still checked separately by can_contact().
    """
    if not is_active_authenticated_user(user):
        return False

    if Student.objects.filter(
        user_id=user.pk,
        is_active=True,
        user__is_active=True,
    ).exists():
        return True

    return user_role(user) == "student"


def is_mentor_user(user):
    """Recognize active mentor accounts by profile or role."""
    if not is_active_authenticated_user(user):
        return False

    if MentorProfile.objects.filter(
        user_id=user.pk,
        is_active=True,
        user__is_active=True,
    ).exists():
        return True

    return user_role(user) == "mentor"


def is_chat_profile_user(user):
    return is_student_user(user) or is_mentor_user(user)


def is_chat_user(user):
    """Allow active Admin, Student, and Mentor accounts to use chat."""
    return bool(
        is_active_authenticated_user(user)
        and (
            is_admin(user)
            or is_student_user(user)
            or is_mentor_user(user)
        )
    )


def can_contact(requester, target):
    """Restrict contacts to the roles supported by EduTrack chat."""
    if not is_chat_user(requester) or not is_chat_user(target):
        return False
    if requester.pk == target.pk:
        return False

    requester_admin = is_admin(requester)
    target_admin = is_admin(target)
    requester_student = is_student_user(requester)
    requester_mentor = is_mentor_user(requester)
    target_student = is_student_user(target)
    target_mentor = is_mentor_user(target)

    if requester_admin:
        return target_student or target_mentor
    if target_admin:
        return requester_student or requester_mentor
    if requester_student:
        return target_mentor
    if requester_mentor:
        return target_student
    return False


def can_access_conversation(user, conversation):
    return user.pk in {conversation.admin_id, conversation.user_id}


def conversation_queryset(user):
    return Conversation.objects.select_related("admin", "user").filter(
        Q(admin_id=user.pk) | Q(user_id=user.pk)
    )


def get_or_create_pair_conversation(first_user, second_user):
    """Use stable participant ordering while remaining compatible with old rows."""
    existing = Conversation.objects.filter(
        Q(admin_id=first_user.pk, user_id=second_user.pk)
        | Q(admin_id=second_user.pk, user_id=first_user.pk)
    ).first()
    if existing:
        return existing, False

    lower, higher = sorted((first_user, second_user), key=lambda item: item.pk)
    return Conversation.objects.get_or_create(admin=lower, user=higher)


def error_response(message, code=status.HTTP_400_BAD_REQUEST):
    return Response(
        {"success": False, "message": message},
        status=code,
    )


def success_response(data, code=status.HTTP_200_OK):
    return Response(
        {"success": True, "data": data},
        status=code,
    )


def broadcast_call_status(call, action):
    """Notify both call participants about an accepted/rejected/ended call."""
    channel_layer = get_channel_layer()

    if channel_layer is None:
        return

    event = {
        "type": "call_status_event",
        "call_id": str(call.pk),
        "action": action,
        "sender_id": None,
    }

    for user_id in {call.caller_id, call.callee_id}:
        async_to_sync(channel_layer.group_send)(
            f"call_user_{user_id}",
            event,
        )


def broadcast_incoming_call(call):
    """Notify the recipient's active WebSocket connection."""
    channel_layer = get_channel_layer()

    if channel_layer is None:
        return

    payload = {
        "id": str(call.pk),
        "conversation_id": call.conversation_id,
        "caller_id": call.caller_id,
        "callee_id": call.callee_id,
        "call_type": call.call_type,
        "status": call.status,
    }

    async_to_sync(channel_layer.group_send)(
        f"call_user_{call.callee_id}",
        {
            "type": "incoming_call",
            "call": payload,
        },
    )


def conversation_queryset(user):
    queryset = Conversation.objects.select_related("admin", "user")

    if is_admin(user):
        return queryset.filter(admin=user)

    return queryset.filter(user=user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chat_users(request):
    """GET /api/chat/users/?search=... — list contacts permitted for this role."""
    if not is_chat_user(request.user):
        return error_response("Your account is not enabled for chat.", status.HTTP_403_FORBIDDEN)

    student_ids = Student.objects.filter(
        is_active=True, user__is_active=True
    ).values_list("user_id", flat=True)
    mentor_ids = MentorProfile.objects.filter(
        is_active=True, user__is_active=True
    ).values_list("user_id", flat=True)

    eligible_ids = set(student_ids) | set(mentor_ids)

    # Include active accounts by role too, so a role-linked account is not
    # omitted from the contacts list just because its profile is not linked.
    # The custom User model may store role as a relation or as a plain string.
    for role_name in ("student", "mentor", "admin"):
        try:
            eligible_ids.update(
                User.objects.filter(
                    is_active=True,
                    **{"role__name__iexact": role_name},
                ).values_list("pk", flat=True)
            )
        except Exception:
            try:
                eligible_ids.update(
                    User.objects.filter(
                        is_active=True,
                        **{"role__role_name__iexact": role_name},
                    ).values_list("pk", flat=True)
                )
            except Exception:
                try:
                    eligible_ids.update(
                        User.objects.filter(
                            is_active=True,
                            **{"role__iexact": role_name},
                        ).values_list("pk", flat=True)
                    )
                except Exception:
                    # This role representation is not supported by this model.
                    pass

    eligible_ids.update(
        User.objects.filter(is_active=True).filter(
            Q(is_superuser=True) | Q(is_staff=True)
        ).values_list("pk", flat=True)
    )

    search = request.query_params.get("search", "").strip().lower()
    users = User.objects.filter(pk__in=eligible_ids, is_active=True).exclude(pk=request.user.pk)
    matches = []
    for candidate in users:
        if not can_contact(request.user, candidate):
            continue
        name = candidate.get_full_name().strip()
        email = getattr(candidate, "email", "") or ""
        if search and search not in f"{name} {email}".lower():
            continue
        matches.append(candidate)

    matches.sort(key=lambda item: (item.get_full_name() or getattr(item, "email", "") or "").lower())
    return success_response(ChatUserSerializer(matches, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversations_list_create(request):
    """GET conversations or POST {"user_id": id} to open a permitted chat."""
    if not is_chat_user(request.user):
        return error_response("Your account is not enabled for chat.", status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        queryset = conversation_queryset(request.user).filter(is_archived=False).annotate(
            latest_message_time=Max("messages__created_at")
        ).order_by("-latest_message_time", "-updated_at")
        serializer = ConversationSerializer(queryset, many=True, context={"request": request})
        return success_response(serializer.data)

    user_id = request.data.get("user_id")
    if not user_id:
        return error_response("user_id is required.")

    target = get_object_or_404(User, pk=user_id, is_active=True)
    if not can_contact(request.user, target):
        return error_response(
            "You cannot start a chat with this account. Choose an authorized student, mentor, or admin.",
            status.HTTP_403_FORBIDDEN,
        )

    conversation, created = get_or_create_pair_conversation(request.user, target)
    if conversation.is_archived:
        conversation.is_archived = False
        conversation.save(update_fields=["is_archived", "updated_at"])

    serializer = ConversationSerializer(conversation, context={"request": request})
    return success_response(serializer.data, status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def conversation_detail(request, conversation_id):
    """
    GET   /api/chat/conversations/<id>/
    PATCH /api/chat/conversations/<id>/ {"is_archived": true}
    """
    conversation = get_object_or_404(
        Conversation.objects.select_related("admin", "user"),
        pk=conversation_id,
    )

    if not can_access_conversation(request.user, conversation):
        return error_response(
            "You do not have access to this conversation.",
            status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        serializer = ConversationSerializer(
            conversation,
            context={"request": request},
        )
        return success_response(serializer.data)

    archived = request.data.get("is_archived")

    if not isinstance(archived, bool):
        return error_response("is_archived must be true or false.")

    conversation.is_archived = archived
    conversation.save(
        update_fields=["is_archived", "updated_at"]
    )

    serializer = ConversationSerializer(
        conversation,
        context={"request": request},
    )

    return success_response(serializer.data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversation_messages(request, conversation_id):
    """
    GET  /api/chat/conversations/<id>/messages/
    POST /api/chat/conversations/<id>/messages/ {"body": "Hello"}
    """
    conversation = get_object_or_404(
        Conversation.objects.select_related("admin", "user"),
        pk=conversation_id,
    )

    if not can_access_conversation(request.user, conversation):
        return error_response(
            "You do not have access to this conversation.",
            status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        messages = (
            conversation.messages.select_related("sender")
            .filter(is_deleted=False)
            .order_by("created_at", "id")
        )

        serializer = ChatMessageSerializer(
            messages,
            many=True,
            context={"request": request},
        )

        return success_response(serializer.data)

    body = request.data.get("body", "")

    if not isinstance(body, str) or not body.strip():
        return error_response("Message body cannot be empty.")

    body = body.strip()

    if len(body) > 5000:
        return error_response("Messages cannot exceed 5000 characters.")

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

    serializer = ChatMessageSerializer(
        message,
        context={"request": request},
    )

    return success_response(
        serializer.data,
        status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_conversation_read(request, conversation_id):
    """
    POST /api/chat/conversations/<id>/read/
    Mark incoming messages as read.
    """
    conversation = get_object_or_404(
        Conversation,
        pk=conversation_id,
    )

    if not can_access_conversation(request.user, conversation):
        return error_response(
            "You do not have access to this conversation.",
            status.HTTP_403_FORBIDDEN,
        )

    updated_count = (
        conversation.messages.filter(
            read_at__isnull=True,
            is_deleted=False,
        )
        .exclude(sender=request.user)
        .update(read_at=timezone.now())
    )

    return success_response({"marked_read": updated_count})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_call(request, conversation_id):
    """
    POST /api/chat/conversations/<id>/calls/
    {"call_type": "voice"} or {"call_type": "video"}

    Creates a call session. Actual audio/video requires a WebRTC
    media and signaling implementation.
    """
    conversation = get_object_or_404(
        Conversation.objects.select_related("admin", "user"),
        pk=conversation_id,
    )

    if not can_access_conversation(request.user, conversation):
        return error_response(
            "You do not have access to this conversation.",
            status.HTTP_403_FORBIDDEN,
        )

    call_type = request.data.get("call_type")

    if call_type not in {
        CallSession.CallType.VOICE,
        CallSession.CallType.VIDEO,
    }:
        return error_response(
            "call_type must be 'voice' or 'video'."
        )

    callee = (
        conversation.user
        if request.user.pk == conversation.admin_id
        else conversation.admin
    )

    call = CallSession.objects.create(
        conversation=conversation,
        caller=request.user,
        callee=callee,
        call_type=call_type,
        status=CallSession.Status.RINGING,
    )
    broadcast_incoming_call(call)
    return success_response(
        CallSessionSerializer(call).data,
        status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def calls_list(request):
    """GET /api/chat/calls/ — recent call sessions involving the signed-in user."""
    calls = CallSession.objects.filter(
        Q(caller=request.user) | Q(callee=request.user)
    ).select_related("conversation", "caller", "callee").order_by("-created_at")[:30]
    return success_response(CallSessionSerializer(calls, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def call_detail(request, call_id):
    """
    GET  /api/chat/calls/<uuid>/
    POST /api/chat/calls/<uuid>/
         {"action": "accept" | "reject" | "end"}
    """
    call = get_object_or_404(
        CallSession.objects.select_related(
            "conversation",
            "caller",
            "callee",
        ),
        pk=call_id,
    )

    if request.user.pk not in {call.caller_id, call.callee_id}:
        return error_response(
            "You are not a participant in this call.",
            status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        return success_response(CallSessionSerializer(call).data)

    action = request.data.get("action")

    if action == "accept":
        if request.user.pk != call.callee_id:
            return error_response(
                "Only the recipient can accept the call.",
                status.HTTP_403_FORBIDDEN,
            )

        if call.status != CallSession.Status.RINGING:
            return error_response("This call is no longer ringing.")

        call.status = CallSession.Status.ACCEPTED
        call.accepted_at = timezone.now()
        call.save(update_fields=["status", "accepted_at"])
        broadcast_call_status(call, "accepted")

    elif action == "reject":
        if request.user.pk != call.callee_id:
            return error_response(
                "Only the recipient can reject the call.",
                status.HTTP_403_FORBIDDEN,
            )

        if call.status != CallSession.Status.RINGING:
            return error_response("This call is no longer ringing.")

        call.status = CallSession.Status.REJECTED
        call.ended_at = timezone.now()
        call.save(update_fields=["status", "ended_at"])
        broadcast_call_status(call, "rejected")

    elif action == "end":
        if call.status not in {
            CallSession.Status.RINGING,
            CallSession.Status.ACCEPTED,
            CallSession.Status.INITIATED,
        }:
            return error_response("This call has already finished.")

        call.status = CallSession.Status.ENDED
        call.ended_at = timezone.now()
        call.save(update_fields=["status", "ended_at"])
        broadcast_call_status(call, "ended")

    else:
        return error_response(
            "action must be 'accept', 'reject', or 'end'."
        )

    return success_response(CallSessionSerializer(call).data)
