"""
Student course-reading APIs for EduTrack.

Uses existing apps.courses models (Course, Enrollment, Topic, Material).
No new database models or migrations are required.

Endpoints:
GET /api/student/courses/
GET /api/student/courses/<course_id>/topics/
GET /api/student/courses/<course_id>/topics/<topic_id>/materials/
"""
from django.apps import apps
from django.core.exceptions import FieldDoesNotExist
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _get_model(name):
    """Resolve a model by class name from the existing courses app."""
    try:
        return apps.get_model("courses", name)
    except (LookupError, ValueError):
        return None


def _field_map(model):
    return {field.name: field for field in model._meta.get_fields() if getattr(field, "concrete", False)}


def _first_field(model, candidates, relation_only=False):
    fields = _field_map(model)
    for name in candidates:
        field = fields.get(name)
        if field is None:
            continue
        if relation_only and not getattr(field, "is_relation", False):
            continue
        return field
    return None


def _value(obj, candidates, default=None):
    """Return the first non-empty field value from a set of common field names."""
    for name in candidates:
        try:
            value = getattr(obj, name)
        except (AttributeError, FieldDoesNotExist):
            continue
        if value is not None and value != "":
            return value
    return default


def _as_text(value):
    if value is None:
        return ""
    if hasattr(value, "url"):
        try:
            return value.url
        except (ValueError, AttributeError):
            return ""
    return str(value)


def _absolute_media_url(request, value):
    value = _as_text(value)
    if value.startswith(("http://", "https://")):
        return value
    if value.startswith("/"):
        return request.build_absolute_uri(value)
    return value


def _is_student(user):
    if not user or not user.is_authenticated:
        return False

    # This project assigns role membership through Django Groups.
    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    # Compatibility with installations whose custom User has a role field.
    role = getattr(user, "role", None)
    if role:
        role_value = getattr(role, "name", role)
        if str(role_value).strip().lower() == "student":
            return True

    return False


def _require_student(request):
    if not _is_student(request.user):
        return Response(
            {"success": False, "message": "Student access is required."},
            status=403,
        )
    return None


def _related_field_for(model, candidates, related_model=None):
    field = _first_field(model, candidates, relation_only=True)
    if field is None:
        return None
    if related_model is not None and getattr(field, "related_model", None) is not related_model:
        return None
    return field


def _student_enrollments(user):
    Enrollment = _get_model("Enrollment")
    Course = _get_model("Course")
    if Enrollment is None or Course is None:
        return None, None, "Course or Enrollment model was not found in apps.courses."

    student_field = _related_field_for(
        Enrollment,
        ("student", "user", "student_profile", "learner"),
    )
    course_field = _related_field_for(
        Enrollment,
        ("course", "enrolled_course"),
        related_model=Course,
    )
    if student_field is None or course_field is None:
        return None, None, (
            "Enrollment must have a student/user relation and a course relation. "
            "Update the relation field names in apps/courses/student_course_views.py "
            "to match your models."
        )

    # Typical EduTrack schema: Enrollment.student points to the AUTH_USER_MODEL.
    related_model = student_field.related_model
    if related_model is user.__class__:
        queryset = Enrollment.objects.filter(**{student_field.name: user})
    else:
        # Support a StudentProfile FK if the profile has a one-to-one/foreign-key to User.
        profile_user_field = _related_field_for(
            related_model,
            ("user", "account", "auth_user"),
            related_model=user.__class__,
        )
        if profile_user_field is None:
            return None, None, (
                "Enrollment's student relation does not point to the logged-in user "
                "and no user relation was found on the student profile."
            )
        try:
            profile = related_model.objects.get(
                **{profile_user_field.name: user}
            )
        except related_model.DoesNotExist:
            return None, None, (
                "No Student profile is linked to this account. "
                "Please link the logged-in user to an existing Student profile."
            )

        queryset = Enrollment.objects.filter(**{student_field.name: profile})

    return queryset, course_field, None


def _course_payload(request, course, enrollment=None):
    image = _value(
        course,
        ("image", "thumbnail", "cover_image", "course_image", "image_url", "thumbnail_url"),
    )
    category = _value(course, ("category", "category_name", "course_category"), "")
    if category and not isinstance(category, str):
        category = _value(category, ("name", "title"), str(category))

    progress = _value(
        enrollment,
        ("progress_percentage", "progress", "completion_percentage"),
        0,
    ) if enrollment is not None else 0
    try:
        progress = max(0, min(100, round(float(progress or 0))))
    except (TypeError, ValueError):
        progress = 0

    return {
        "id": course.pk,
        "name": str(_value(course, ("name", "title", "course_name"), str(course))),
        "description": str(_value(course, ("description", "overview", "short_description"), "") or ""),
        "category": str(category or ""),
        "image_url": _absolute_media_url(request, image),
        "progress_percentage": progress,
        "enrollment_status": str(_value(enrollment, ("status",), "Enrolled") or "Enrolled"),
        "enrolled_at": _value(enrollment, ("enrollment_date", "enrolled_at", "created_at")),
    }


def _get_student_course(request, course_id):
    Enrollment = _get_model("Enrollment")
    queryset, course_field, error = _student_enrollments(request.user)
    if error:
        error_status = (
            404 if error.startswith("No Student profile is linked") else 500
        )
        return None, None, Response(
            {"success": False, "message": error},
            status=error_status,
        )

    # Limit course lookup through this student's enrollment to prevent IDOR access.
    enrollment = queryset.filter(**{f"{course_field.name}_id": course_id}).select_related(
        course_field.name
    ).first()
    if enrollment is None:
        return None, None, Response(
            {"success": False, "message": "This course is not enrolled by your account."},
            status=404,
        )
    course = getattr(enrollment, course_field.name)
    return course, enrollment, None


def _topic_payload(topic):
    return {
        "id": topic.pk,
        "name": str(_value(topic, ("name", "title", "topic_name"), str(topic))),
        "description": str(_value(topic, ("description", "summary"), "") or ""),
        "course_name": "",
        "order": _value(topic, ("order", "sequence", "position", "sort_order"), 0) or 0,
    }


def _material_payload(request, material):
    file_value = _value(
        material,
        ("file", "document", "video", "material_file", "attachment", "file_url", "url", "video_url"),
    )
    material_type = _value(material, ("material_type", "type", "content_type", "kind"), "")
    title = _value(material, ("title", "name", "file_name", "original_name"), "Learning material")
    return {
        "id": material.pk,
        "title": str(title),
        "description": str(_value(material, ("description", "notes"), "") or ""),
        "material_type": str(getattr(material_type, "label", material_type) or ""),
        "file_url": _absolute_media_url(request, file_value),
        "created_at": _value(material, ("created_at", "uploaded_at", "created_on")),
    }


class StudentCoursesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_student(request)
        if denied:
            return denied

        queryset, course_field, error = _student_enrollments(request.user)
        if error:
            error_status = (
                404 if error.startswith("No Student profile is linked") else 500
            )
            return Response(
                {"success": False, "message": error},
                status=error_status,
            )

        queryset = queryset.select_related(course_field.name).order_by("-pk")
        search = (request.query_params.get("search") or "").strip()
        if search:
            course_model = course_field.related_model
            name_field = _first_field(course_model, ("name", "title", "course_name"))
            description_field = _first_field(course_model, ("description", "overview", "short_description"))
            filters = Q()
            if name_field:
                filters |= Q(**{f"{course_field.name}__{name_field.name}__icontains": search})
            if description_field:
                filters |= Q(**{f"{course_field.name}__{description_field.name}__icontains": search})
            if filters:
                queryset = queryset.filter(filters)

        results = []
        seen = set()
        for enrollment in queryset:
            course = getattr(enrollment, course_field.name)
            if course.pk in seen:
                continue
            seen.add(course.pk)
            results.append(_course_payload(request, course, enrollment))

        return Response({
            "success": True,
            "count": len(results),
            "results": results,
        })


class StudentCourseTopicsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id):
        denied = _require_student(request)
        if denied:
            return denied

        course, enrollment, error_response = _get_student_course(request, course_id)
        if error_response:
            return error_response

        Topic = _get_model("Topic")
        if Topic is None:
            return Response(
                {"success": False, "message": "Topic model was not found in apps.courses."},
                status=500,
            )

        course_field = _related_field_for(Topic, ("course", "parent_course"), related_model=course.__class__)
        if course_field is None:
            return Response(
                {"success": False, "message": "Topic must have a course relation. Update the field mapping in student_course_views.py."},
                status=500,
            )

        topics = Topic.objects.filter(**{course_field.name: course})
        search = (request.query_params.get("search") or "").strip()
        if search:
            name_field = _first_field(Topic, ("name", "title", "topic_name"))
            description_field = _first_field(Topic, ("description", "summary"))
            filters = Q()
            if name_field:
                filters |= Q(**{f"{name_field.name}__icontains": search})
            if description_field:
                filters |= Q(**{f"{description_field.name}__icontains": search})
            if filters:
                topics = topics.filter(filters)

        order_field = _first_field(Topic, ("order", "sequence", "position", "sort_order"))
        topics = topics.order_by(order_field.name, "pk") if order_field else topics.order_by("pk")

        results = []
        for topic in topics:
            item = _topic_payload(topic)
            item["course_name"] = str(_value(course, ("name", "title", "course_name"), str(course)))
            results.append(item)

        return Response({
            "success": True,
            "course": _course_payload(request, course, enrollment),
            "count": len(results),
            "results": results,
        })


class StudentTopicMaterialsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, course_id, topic_id):
        denied = _require_student(request)
        if denied:
            return denied

        course, enrollment, error_response = _get_student_course(request, course_id)
        if error_response:
            return error_response

        Topic = _get_model("Topic")
        Material = _get_model("Material")
        if Topic is None or Material is None:
            return Response(
                {"success": False, "message": "Topic or Material model was not found in apps.courses."},
                status=500,
            )

        topic_course_field = _related_field_for(Topic, ("course", "parent_course"), related_model=course.__class__)
        if topic_course_field is None:
            return Response({"success": False, "message": "Topic course relation is not configured."}, status=500)

        topic = get_object_or_404(
            Topic,
            pk=topic_id,
            **{topic_course_field.name: course},
        )
        topic_field = _related_field_for(Material, ("topic", "course_topic"), related_model=Topic)
        if topic_field is None:
            return Response(
                {"success": False, "message": "Material must have a topic relation. Update the field mapping in student_course_views.py."},
                status=500,
            )

        materials = Material.objects.filter(**{topic_field.name: topic})
        # Students should only see material explicitly made available/published, if the model has such a flag.
        published_field = _first_field(Material, ("is_published", "published", "is_visible", "available_to_students"))
        if published_field is not None:
            materials = materials.filter(**{published_field.name: True})

        results = [_material_payload(request, material) for material in materials.order_by("pk")]
        return Response({
            "success": True,
            "course": _course_payload(request, course, enrollment),
            "topic": _topic_payload(topic),
            "count": len(results),
            "results": results,
        })
