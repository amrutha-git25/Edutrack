
# backend/apps/mentor_dashboard/topic_material_views.py

from pathlib import Path
import os
import uuid

from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from supabase_client import supabase


MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".txt", ".csv",
    ".mp4", ".webm", ".mov", ".m4v",
    ".mp3", ".wav", ".ogg",
    ".png", ".jpg", ".jpeg", ".webp",
}

COURSE_NAMES = ("course", "parent_course")
TOPIC_NAMES = ("topic", "course_topic")
TOPIC_TITLE_NAMES = ("title", "name", "topic_name")
FILE_NAMES = (
    "file", "document", "video", "material_file",
    "attachment", "upload",
)


def _model(name):
    try:
        return apps.get_model("courses", name)
    except (LookupError, ValueError):
        return None

def _fields(model):
    return {
        field.name: field
        for field in model._meta.get_fields()
        if getattr(field, "concrete", False)
    }


def _field(model, names, relation=False):
    for name in names:
        candidate = _fields(model).get(name)
        if candidate is None:
            continue
        if relation and not getattr(candidate, "is_relation", False):
            continue
        return candidate
    return None


def _read(obj, names, default=None):
    if obj is None:
        return default

    for name in names:
        try:
            value = getattr(obj, name)
        except (AttributeError, FieldDoesNotExist):
            continue

        if value is not None and value != "":
            return value

    return default


def _text(value):
    if value is None:
        return ""
    if hasattr(value, "url"):
        try:
            return value.url
        except (ValueError, AttributeError):
            return ""
    return str(value)


def _file_url(request, value):
    result = _text(value)
    if not result:
        return ""
    if result.startswith(("http://", "https://")):
        return result
    if result.startswith("/"):
        return request.build_absolute_uri(result)
    return request.build_absolute_uri(f"/{result}")


def _is_mentor(user):
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        # A superuser can access Django administration, but this does not
        # automatically grant mentor-only API access.
        pass

    try:
        if user.groups.filter(name__iexact="mentor").exists():
            return True
    except (AttributeError, TypeError):
        pass

    role = getattr(user, "role", None)
    role = getattr(role, "name", role)
    return str(role or "").strip().lower() == "mentor"


def _mentor_denied(request):
    if not _is_mentor(request.user):
        return Response(
            {"success": False, "message": "Mentor access is required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None



def _course_access_queryset(user):
    """
    Return courses assigned to the authenticated mentor through:
    1. Course.mentor / assigned_mentor / instructor
    2. CourseMentor, if present
    3. MentorAssignment -> MentorProfile -> authenticated user

    Never expose all courses when no assignment is found.
    """
    Course = _model("Course")
    if Course is None:
        return None, "Course model was not found in apps.courses."

    allowed_ids = set()

    # 1. Direct assignment on Course
    direct_mentor = _field(
        Course,
        ("mentor", "assigned_mentor", "instructor"),
        relation=True,
    )

    if direct_mentor:
        if direct_mentor.related_model == user.__class__:
            allowed_ids.update(
                Course.objects.filter(
                    **{direct_mentor.name: user}
                ).values_list("pk", flat=True)
            )
        else:
            profile_model = direct_mentor.related_model
            profile_user = _field(
                profile_model,
                ("user", "account", "auth_user"),
                relation=True,
            )

            if (
                profile_user
                and profile_user.related_model == user.__class__
            ):
                profile_ids = profile_model.objects.filter(
                    **{profile_user.name: user}
                ).values_list("pk", flat=True)

                allowed_ids.update(
                    Course.objects.filter(
                        **{
                            f"{direct_mentor.name}_id__in": profile_ids
                        }
                    ).values_list("pk", flat=True)
                )

    # 2. Optional CourseMentor model
    CourseMentor = _model("CourseMentor")

    if CourseMentor is not None:
        course_relation = _field(
            CourseMentor,
            ("course", "assigned_course"),
            relation=True,
        )
        mentor_relation = _field(
            CourseMentor,
            ("mentor", "user", "assigned_mentor"),
            relation=True,
        )

        if course_relation and mentor_relation:
            if mentor_relation.related_model == user.__class__:
                ids = CourseMentor.objects.filter(
                    **{mentor_relation.name: user}
                ).values_list(
                    f"{course_relation.name}_id",
                    flat=True,
                )
                allowed_ids.update(ids)
            else:
                profile_model = mentor_relation.related_model
                profile_user = _field(
                    profile_model,
                    ("user", "account", "auth_user"),
                    relation=True,
                )

                if (
                    profile_user
                    and profile_user.related_model == user.__class__
                ):
                    profile_ids = profile_model.objects.filter(
                        **{profile_user.name: user}
                    ).values_list("pk", flat=True)

                    ids = CourseMentor.objects.filter(
                        **{
                            f"{mentor_relation.name}_id__in": profile_ids
                        }
                    ).values_list(
                        f"{course_relation.name}_id",
                        flat=True,
                    )
                    allowed_ids.update(ids)

    # 3. Actual project assignment model: MentorAssignment
    # Your schema links MentorAssignment.mentor to MentorProfile.
    MentorAssignment = _model("MentorAssignment")

    # Support installations where the model is registered in users instead.
    if MentorAssignment is None:
        try:
            MentorAssignment = apps.get_model(
                "users", "MentorAssignment"
            )
        except (LookupError, ValueError):
            MentorAssignment = None

    if MentorAssignment is not None:
        assignment_course = _field(
            MentorAssignment,
            ("course", "assigned_course"),
            relation=True,
        )
        assignment_mentor = _field(
            MentorAssignment,
            ("mentor", "assigned_mentor"),
            relation=True,
        )

        if assignment_course and assignment_mentor:
            if assignment_mentor.related_model == user.__class__:
                assigned_ids = MentorAssignment.objects.filter(
                    **{assignment_mentor.name: user}
                ).values_list(
                    f"{assignment_course.name}_id",
                    flat=True,
                )
                allowed_ids.update(assigned_ids)
            else:
                profile_model = assignment_mentor.related_model
                profile_user = _field(
                    profile_model,
                    ("user", "account", "auth_user"),
                    relation=True,
                )

                if (
                    profile_user
                    and profile_user.related_model == user.__class__
                ):
                    profile_ids = profile_model.objects.filter(
                        **{profile_user.name: user}
                    ).values_list("pk", flat=True)

                    assigned_ids = MentorAssignment.objects.filter(
                        **{
                            f"{assignment_mentor.name}_id__in": profile_ids
                        }
                    ).values_list(
                        f"{assignment_course.name}_id",
                        flat=True,
                    )
                    allowed_ids.update(assigned_ids)

    return Course.objects.filter(
        pk__in=allowed_ids
    ).distinct(), None


def _topic_queryset_for_course(course):
    Topic = _model("Topic")
    if Topic is None:
        return None, None, "Topic model was not found in apps.courses."

    course_field = _field(
        Topic, COURSE_NAMES, relation=True
    )
    if course_field is None or course_field.related_model != course.__class__:
        return None, None, (
            "Topic must have a foreign key to Course. "
            "Check the Topic model in apps.courses.models."
        )

    return Topic.objects.filter(**{course_field.name: course}), course_field, None


def _material_queryset_for_topic(topic):
    Material = _model("Material")
    if Material is None:
        return None, None, "Material model was not found in apps.courses."

    topic_field = _field(
        Material, TOPIC_NAMES, relation=True
    )
    if topic_field is None or topic_field.related_model != topic.__class__:
        return None, None, (
            "Material must have a foreign key to Topic. "
            "Check the Material model in apps.courses.models."
        )

    return Material.objects.filter(**{topic_field.name: topic}), topic_field, None


def _topic_data(topic):
    return {
        "id": topic.pk,
        "name": str(_read(topic, TOPIC_TITLE_NAMES, str(topic))),
        "description": str(_read(topic, ("description", "summary"), "") or ""),
        "order": _read(topic, ("order", "sequence", "position", "sort_order"), 0) or 0,
        "created_at": _read(topic, ("created_at", "created_on")),
        "updated_at": _read(topic, ("updated_at", "modified_at")),
    }


def _material_data(request, material):
    file_value = _read(material, ("supabase_url", "file_url", "url", "video_url") + FILE_NAMES)
    material_type = _read(
        material, ("material_type", "type", "content_type", "kind"), ""
    )
    return {
        "id": material.pk,
        "title": str(_read(material, ("title", "name", "file_name"), "Learning material")),
        "description": str(_read(material, ("description", "notes"), "") or ""),
        "material_type": str(getattr(material_type, "label", material_type) or ""),
        "file_url": _file_url(request, file_value),
        "file_name": Path(_text(file_value)).name if file_value else "",
        "created_at": _read(material, ("created_at", "uploaded_at", "created_on")),
        "updated_at": _read(material, ("updated_at", "modified_at")),
    }


def _set_if_present(model, instance, candidates, value):
    field = _field(model, candidates)
    if field is not None and not field.is_relation and field.editable:
        setattr(instance, field.name, value)
        return field.name
    return None


def _set_relation_if_present(model, instance, candidates, value):
    field = _field(model, candidates, relation=True)
    if field is not None and field.related_model == value.__class__:
        setattr(instance, field.name, value)
        return field.name
    return None


def _validate_upload(upload):
    if not upload:
        return "Choose a file to upload."

    extension = Path(upload.name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return (
            "Unsupported file type. Allowed types include PDF, Office documents, "
            "text files, common video/audio formats, and images."
        )

    if upload.size > MAX_UPLOAD_BYTES:
        return "File is too large. Maximum upload size is 100 MB."

    return None


def _owned_course_or_response(request, course_id):
    queryset, error = _course_access_queryset(request.user)
    if error:
        return None, Response(
            {"success": False, "message": error},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    course = queryset.filter(pk=course_id).first()
    if course is None:
        return None, Response(
            {
                "success": False,
                "message": "Course not found or you are not assigned to this course.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return course, None


def _owned_topic_or_response(request, topic_id):
    Topic = _model("Topic")
    if Topic is None:
        return None, Response(
            {"success": False, "message": "Topic model was not found."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    topic = Topic.objects.filter(pk=topic_id).first()
    if topic is None:
        return None, Response(
            {"success": False, "message": "Topic not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    course_relation = _field(Topic, COURSE_NAMES, relation=True)
    if course_relation is None:
        return None, Response(
            {"success": False, "message": "Topic-to-course relation is not configured."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    course = getattr(topic, course_relation.name)
    queryset, error = _course_access_queryset(request.user)
    if error:
        return None, Response(
            {"success": False, "message": error},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not queryset.filter(pk=course.pk).exists():
        return None, Response(
            {"success": False, "message": "You are not assigned to this topic's course."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return topic, None


def _owned_material_or_response(request, material_id):
    Material = _model("Material")
    if Material is None:
        return None, Response(
            {"success": False, "message": "Material model was not found."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    material = Material.objects.filter(pk=material_id).first()
    if material is None:
        return None, Response(
            {"success": False, "message": "Material not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    topic_relation = _field(Material, TOPIC_NAMES, relation=True)
    if topic_relation is None:
        return None, Response(
            {"success": False, "message": "Material-to-topic relation is not configured."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    topic = getattr(material, topic_relation.name)
    owned_topic, denied = _owned_topic_or_response(request, topic.pk)
    if denied:
        return None, denied

    return material, None


class MentorAssignedCoursesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _mentor_denied(request)
        if denied:
            return denied

        courses, error = _course_access_queryset(request.user)
        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        search = (request.query_params.get("search") or "").strip()
        if search:
            filters = Q()
            title_field = _field(courses.model, ("title", "name", "course_name"))
            description_field = _field(
                courses.model, ("description", "overview", "short_description")
            )
            if title_field:
                filters |= Q(**{f"{title_field.name}__icontains": search})
            if description_field:
                filters |= Q(**{f"{description_field.name}__icontains": search})
            if filters:
                courses = courses.filter(filters)

        results = []
        for course in courses.order_by("pk"):
            topics_qs, _, topic_error = _topic_queryset_for_course(course)
            results.append({
                "id": course.pk,
                "name": str(_read(course, ("title", "name", "course_name"), str(course))),
                "description": str(_read(course, ("description", "overview"), "") or ""),
                "category": str(_read(course, ("category", "category_name"), "") or ""),
                "status": str(_read(course, ("status",), "") or ""),
                "thumbnail_url": _file_url(
                    request, _read(course, ("thumbnail", "image", "cover_image"))
                ),
                "topics_count": topics_qs.count() if topics_qs is not None else 0,
            })

        return Response({"success": True, "count": len(results), "results": results})


class MentorTopicListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser]

    def get(self, request, course_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        course, denied = _owned_course_or_response(request, course_id)
        if denied:
            return denied

        topics, _, error = _topic_queryset_for_course(course)
        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        search = (request.query_params.get("search") or "").strip()
        if search:
            filters = Q()
            title_field = _field(topics.model, TOPIC_TITLE_NAMES)
            description_field = _field(topics.model, ("description", "summary"))
            if title_field:
                filters |= Q(**{f"{title_field.name}__icontains": search})
            if description_field:
                filters |= Q(**{f"{description_field.name}__icontains": search})
            if filters:
                topics = topics.filter(filters)

        order_field = _field(topics.model, ("order", "sequence", "position", "sort_order"))
        topics = topics.order_by(order_field.name, "pk") if order_field else topics.order_by("pk")

        results = []
        for topic in topics:
            item = _topic_data(topic)
            materials, _, material_error = _material_queryset_for_topic(topic)
            item["materials_count"] = materials.count() if materials is not None else 0
            results.append(item)

        return Response({
            "success": True,
            "course": {
                "id": course.pk,
                "name": str(_read(course, ("title", "name", "course_name"), str(course))),
            },
            "count": len(results),
            "results": results,
        })

    @transaction.atomic
    def post(self, request, course_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        course, denied = _owned_course_or_response(request, course_id)
        if denied:
            return denied

        Topic = _model("Topic")
        if Topic is None:
            return Response(
                {"success": False, "message": "Topic model was not found."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        title_field = _field(Topic, TOPIC_TITLE_NAMES)
        if title_field is None:
            return Response(
                {"success": False, "message": "Topic model has no supported title field."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        name = str(request.data.get("name") or request.data.get("title") or "").strip()
        if not name:
            return Response(
                {"success": False, "message": "Topic name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(name) > title_field.max_length if getattr(title_field, "max_length", None) else False:
            return Response(
                {"success": False, "message": f"Topic name cannot exceed {title_field.max_length} characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        topic = Topic()
        _set_relation_if_present(Topic, topic, COURSE_NAMES, course)
        _set_if_present(Topic, topic, TOPIC_TITLE_NAMES, name)
        _set_if_present(Topic, topic, ("description", "summary"),
                         str(request.data.get("description") or "").strip())

        order = request.data.get("order")
        if order not in (None, ""):
            try:
                order = int(order)
                if order < 0:
                    raise ValueError
            except (TypeError, ValueError):
                return Response(
                    {"success": False, "message": "Order must be a non-negative integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _set_if_present(Topic, topic, ("order", "sequence", "position", "sort_order"), order)

        if _field(Topic, COURSE_NAMES, relation=True) is None:
            return Response(
                {"success": False, "message": "Topic model must have a course foreign key."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        topic.save()
        return Response(
            {"success": True, "message": "Topic created successfully.", "data": _topic_data(topic)},
            status=status.HTTP_201_CREATED,
        )


class MentorTopicDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser]

    def patch(self, request, topic_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        topic, denied = _owned_topic_or_response(request, topic_id)
        if denied:
            return denied

        Topic = topic.__class__
        title_field = _field(Topic, TOPIC_TITLE_NAMES)
        incoming_name = request.data.get("name", request.data.get("title"))
        if incoming_name is not None:
            incoming_name = str(incoming_name).strip()
            if not incoming_name:
                return Response(
                    {"success": False, "message": "Topic name cannot be empty."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if title_field and title_field.max_length and len(incoming_name) > title_field.max_length:
                return Response(
                    {"success": False, "message": f"Topic name cannot exceed {title_field.max_length} characters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _set_if_present(Topic, topic, TOPIC_TITLE_NAMES, incoming_name)

        if "description" in request.data:
            _set_if_present(
                Topic, topic, ("description", "summary"),
                str(request.data.get("description") or "").strip()
            )

        if "order" in request.data:
            try:
                order = int(request.data["order"])
                if order < 0:
                    raise ValueError
            except (TypeError, ValueError):
                return Response(
                    {"success": False, "message": "Order must be a non-negative integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _set_if_present(Topic, topic, ("order", "sequence", "position", "sort_order"), order)

        topic.save()
        return Response({
            "success": True,
            "message": "Topic updated successfully.",
            "data": _topic_data(topic),
        })

    @transaction.atomic
    def delete(self, request, topic_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        topic, denied = _owned_topic_or_response(request, topic_id)
        if denied:
            return denied

        topic.delete()
        return Response(
            {"success": True, "message": "Topic deleted successfully."},
            status=status.HTTP_200_OK,
        )


class MentorTopicMaterialUploadUrlView(APIView):
    """Create a short-lived signed URL for direct browser-to-Supabase uploads."""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser]

    def post(self, request, topic_id):
        denied = _mentor_denied(request)
        if denied:
            return denied
        topic, denied = _owned_topic_or_response(request, topic_id)
        if denied:
            return denied

        file_name = Path(str(request.data.get("file_name") or "").strip()).name
        content_type = str(request.data.get("content_type") or "application/octet-stream").strip()
        try:
            file_size = int(request.data.get("file_size") or 0)
        except (TypeError, ValueError):
            return Response({"success": False, "message": "Invalid file size."}, status=status.HTTP_400_BAD_REQUEST)

        if not file_name:
            return Response({"success": False, "message": "File name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if Path(file_name).suffix.lower() not in ALLOWED_EXTENSIONS:
            return Response({"success": False, "message": "Unsupported file type."}, status=status.HTTP_400_BAD_REQUEST)
        if file_size <= 0 or file_size > MAX_UPLOAD_BYTES:
            return Response({"success": False, "message": "File must be between 1 byte and 100 MB."}, status=status.HTTP_400_BAD_REQUEST)

        bucket = os.environ.get("SUPABASE_BUCKET", "edutrack-videos")
        file_path = f"topic_{topic.pk}/{uuid.uuid4().hex}_{file_name}"
        try:
            signed = supabase.storage.from_(bucket).create_signed_upload_url(file_path)
            data = signed if isinstance(signed, dict) else getattr(signed, "data", {})
            token = data.get("token") if isinstance(data, dict) else None
            returned_path = data.get("path") if isinstance(data, dict) else None
            if not token:
                raise ValueError("Supabase did not return an upload token.")
            return Response({"success": True, "path": returned_path or file_path, "token": token, "content_type": content_type})
        except Exception as exc:
            return Response({"success": False, "message": f"Could not create signed upload URL: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MentorTopicMaterialListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, topic_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        topic, denied = _owned_topic_or_response(request, topic_id)
        if denied:
            return denied

        materials, _, error = _material_queryset_for_topic(topic)
        if error:
            return Response(
                {"success": False, "message": error},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        results = [_material_data(request, item) for item in materials.order_by("pk")]
        return Response({"success": True, "count": len(results), "results": results})

    @transaction.atomic
    def post(self, request, topic_id):
        denied = _mentor_denied(request)
        if denied:
            return denied
        topic, denied = _owned_topic_or_response(request, topic_id)
        if denied:
            return denied

        Material = _model("Material")
        if Material is None:
            return Response({"success": False, "message": "Material model was not found."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        file_name = Path(str(request.data.get("file_name") or "").strip()).name
        storage_path = str(request.data.get("storage_path") or "").strip()
        video_url = str(request.data.get("supabase_url") or "").strip()
        try:
            file_size = int(request.data.get("file_size") or 0)
        except (TypeError, ValueError):
            file_size = 0

        if not file_name or not storage_path or not video_url:
            return Response({"success": False, "message": "file_name, storage_path, and supabase_url are required."}, status=status.HTTP_400_BAD_REQUEST)
        if not storage_path.startswith(f"topic_{topic.pk}/"):
            return Response({"success": False, "message": "Storage path does not belong to this topic."}, status=status.HTTP_400_BAD_REQUEST)

        bucket = os.environ.get("SUPABASE_BUCKET", "edutrack-videos")
        marker = f"/storage/v1/object/public/{bucket}/"
        if marker not in video_url or video_url.split(marker, 1)[1] != storage_path:
            return Response({"success": False, "message": "Supabase URL does not match the storage path."}, status=status.HTTP_400_BAD_REQUEST)

        if Path(file_name).suffix.lower() not in ALLOWED_EXTENSIONS:
            return Response({"success": False, "message": "Unsupported file type."}, status=status.HTTP_400_BAD_REQUEST)
        if file_size <= 0 or file_size > MAX_UPLOAD_BYTES:
            return Response({"success": False, "message": "File must be between 1 byte and 100 MB."}, status=status.HTTP_400_BAD_REQUEST)
        if _field(Material, TOPIC_NAMES, relation=True) is None:
            return Response({"success": False, "message": "Material model must have a topic foreign key."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        material = Material()
        _set_relation_if_present(Material, material, TOPIC_NAMES, topic)
        _set_if_present(Material, material, ("title", "name", "file_name"), str(request.data.get("title") or file_name).strip())
        _set_if_present(Material, material, ("description", "notes"), str(request.data.get("description") or "").strip())
        _set_if_present(Material, material, ("supabase_url",), video_url)

        file_field = _field(Material, FILE_NAMES)
        if file_field is not None and hasattr(file_field, "upload_to"):
            setattr(material, file_field.name, "")

        type_field = _field(Material, ("material_type", "type", "content_type", "kind"))
        if type_field is not None and not type_field.is_relation:
            requested_type = str(request.data.get("material_type") or "").strip().lower()
            if requested_type:
                valid_choices = {str(value).lower() for value, _label in getattr(type_field, "choices", [])}
                if valid_choices and requested_type not in valid_choices:
                    return Response({"success": False, "message": "Invalid material_type for this project."}, status=status.HTTP_400_BAD_REQUEST)
                setattr(material, type_field.name, requested_type)

        published_field = _field(Material, ("is_published", "published", "is_visible", "available_to_students"))
        if published_field is not None and not published_field.is_relation:
            setattr(material, published_field.name, True)

        material.save()
        return Response({"success": True, "message": "Material uploaded successfully.", "data": _material_data(request, material)}, status=status.HTTP_201_CREATED)


class MentorMaterialDetailView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, material_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        material, denied = _owned_material_or_response(request, material_id)
        if denied:
            return denied

        Material = material.__class__

        # React uploads the new object directly to Supabase. This endpoint stores metadata.
        storage_path = str(request.data.get("storage_path") or "").strip()
        video_url = str(request.data.get("supabase_url") or "").strip()
        file_name = Path(str(request.data.get("file_name") or "").strip()).name

        if storage_path or video_url:
            if not storage_path or not video_url or not file_name:
                return Response({"success": False, "message": "file_name, storage_path, and supabase_url are required together."}, status=status.HTTP_400_BAD_REQUEST)
            topic_relation = _field(Material, TOPIC_NAMES, relation=True)
            topic = getattr(material, topic_relation.name) if topic_relation else None
            if topic is None or not storage_path.startswith(f"topic_{topic.pk}/"):
                return Response({"success": False, "message": "Storage path does not belong to this material's topic."}, status=status.HTTP_400_BAD_REQUEST)
            bucket = os.environ.get("SUPABASE_BUCKET", "edutrack-videos")
            marker = f"/storage/v1/object/public/{bucket}/"
            if marker not in video_url or video_url.split(marker, 1)[1] != storage_path:
                return Response({"success": False, "message": "Supabase URL does not match the storage path."}, status=status.HTTP_400_BAD_REQUEST)
            if Path(file_name).suffix.lower() not in ALLOWED_EXTENSIONS:
                return Response({"success": False, "message": "Unsupported file type."}, status=status.HTTP_400_BAD_REQUEST)
            _set_if_present(Material, material, ("supabase_url",), video_url)
            title_field = _field(Material, ("title", "name", "file_name"))
            if title_field and not request.data.get("title"):
                setattr(material, title_field.name, file_name)
            file_field = _field(Material, FILE_NAMES)
            if file_field is not None and hasattr(file_field, "upload_to"):
                setattr(material, file_field.name, "")

        if "title" in request.data or "name" in request.data:
            title = str(request.data.get("title", request.data.get("name", ""))).strip()
            if not title:
                return Response(
                    {"success": False, "message": "Material title cannot be empty."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _set_if_present(Material, material, ("title", "name", "file_name"), title)

        if "description" in request.data:
            _set_if_present(
                Material, material, ("description", "notes"),
                str(request.data.get("description") or "").strip()
            )

        material.save()
        return Response({
            "success": True,
            "message": "Material updated successfully.",
            "data": _material_data(request, material),
        })

    @transaction.atomic
    def delete(self, request, material_id):
        denied = _mentor_denied(request)
        if denied:
            return denied

        material, denied = _owned_material_or_response(request, material_id)
        if denied:
            return denied

        Material = material.__class__
        file_field = _field(Material, FILE_NAMES)
        stored_file = getattr(material, file_field.name, None) if file_field else None
        supabase_url = _read(material, ("supabase_url",), "")

        # Best-effort remove Supabase object if its URL is a public bucket URL.
        if supabase_url:
            bucket = os.environ.get("SUPABASE_BUCKET", "edutrack-videos")
            marker = f"/storage/v1/object/public/{bucket}/"
            if marker in str(supabase_url):
                storage_path = str(supabase_url).split(marker, 1)[1]
                try:
                    supabase.storage.from_(bucket).remove([storage_path])
                except Exception:
                    pass

        material.delete()

        if stored_file and hasattr(stored_file, "delete"):
            try:
                stored_file.delete(save=False)
            except Exception:
                pass

        return Response(
            {"success": True, "message": "Material removed successfully."},
            status=status.HTTP_200_OK,
        )
