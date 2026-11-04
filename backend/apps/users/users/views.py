import secrets
import csv
from django.db import transaction
from django.db.models.deletion import ProtectedError
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .models import Student
from .serializers import StudentSerializer, AdminCreateSerializer
from django.contrib.auth.models import Group
from .models import MentorProfile

User = get_user_model()

class MentorSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    specialization = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=20)

    password = serializers.CharField(
        write_only=True,
        min_length=8,
        required=False,
        trim_whitespace=False,
    )

    def validate_phone_number(self, value):
        cleaned = "".join(
            char for char in value.strip() if char.isdigit()
        )

        if not 10 <= len(cleaned) <= 15:
            raise serializers.ValidationError(
                "Enter a valid phone number with 10 to 15 digits."
            )

        return (
            ("+" if value.strip().startswith("+") else "")
            + cleaned
        )

    def validate_email(self, value):
        value = value.strip().lower()
        existing_users = User.objects.filter(email__iexact=value)

        current_user = self.context.get("user")
        if current_user:
            existing_users = existing_users.exclude(
                pk=current_user.pk
            )

        if existing_users.exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return value


class AdminCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        trim_whitespace=False,
    )


def pending_persistence(resource, action, identifier=None):
    data = {
        "success": False,
        "message": (
            f"{resource} {action} requires data persistence, "
            "which has not been implemented."
        ),
    }
    if identifier is not None:
        data["id"] = identifier

    return Response(data, status=status.HTTP_501_NOT_IMPLEMENTED)


# ---------------- STUDENTS ----------------

# ---------------- STUDENTS ----------------

@extend_schema(
    summary="List or create students",
    request=StudentSerializer,
    responses={200: dict, 201: dict, 400: dict, 501: dict},
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def student_list_create(request):
    if request.method == "GET":
        return pending_persistence("Student", "listing")

    serializer = StudentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    return Response(
        {
            "success": False,
            "message": (
                "Student data validated successfully but was not saved. "
                "Persistence is pending."
            ),
            "data": serializer.validated_data,
        },
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )


@extend_schema(
    summary="Retrieve, update, or deactivate a student",
    request=StudentSerializer,
    responses={200: dict, 204: None, 400: dict, 501: dict},
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def student_detail(request, student_id):
    if request.method == "GET":
        return pending_persistence(
            "Student", "detail retrieval", student_id
        )

    if request.method == "PATCH":
        serializer = StudentSerializer(
            data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        return pending_persistence("Student", "update", student_id)

    return pending_persistence("Student", "deactivation", student_id)



# ---------------- MENTORS ----------------


def mentor_response(profile):
    user = profile.user
    return {
        "id": profile.id,
        "user_id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "specialization": profile.specialization,
        "phone_number": profile.phone_number,
        "is_active": profile.is_active and user.is_active,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


@extend_schema(
    summary="List or create mentors",
    request=MentorSerializer,
    responses={200: dict, 201: dict, 400: dict, 409: dict},
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def mentor_list_create(request):
    if request.method == "GET":
        profiles = (
            MentorProfile.objects.select_related("user")
            .filter(is_active=True, user__is_active=True)
            .order_by("-created_at")
        )
        return Response({
            "success": True,
            "count": profiles.count(),
            "mentors": [mentor_response(profile) for profile in profiles],
        })

    serializer = MentorSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    email = data["email"]

    if User.objects.filter(email__iexact=email).exists():
        return Response({
            "success": False,
            "message": "An account with this email already exists.",
        }, status=status.HTTP_409_CONFLICT)

    username = email
    if User.objects.filter(username=username).exists():
        return Response({
            "success": False,
            "message": "This username is already in use.",
        }, status=status.HTTP_409_CONFLICT)

    password = data.get("password") or secrets.token_urlsafe(16)

    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=data["first_name"],
            last_name=data["last_name"],
        )
        mentor_group, _ = Group.objects.get_or_create(name="MENTOR")
        user.groups.add(mentor_group)
        profile = MentorProfile.objects.create(
            user=user,
            specialization=data["specialization"],
            phone_number=data.get("phone_number") or data.get("phone", ""),
        )

    return Response({
        "success": True,
        "message": "Mentor created successfully.",
        "mentor": mentor_response(profile),
        "temporary_password_generated": "password" not in data,
    }, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="Retrieve, update, or deactivate a mentor",
    request=MentorSerializer,
    responses={200: dict, 400: dict, 404: dict, 409: dict},
)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def mentor_detail(request, mentor_id):
    profile = get_object_or_404(
        MentorProfile.objects.select_related("user"),
        pk=mentor_id,
    )
    user = profile.user

    if request.method == "GET":
        return Response({
            "success": True,
            "mentor": mentor_response(profile),
        })

    if request.method == "DELETE":
        profile.is_active = False
        profile.save(update_fields=["is_active", "updated_at"])
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({
            "success": True,
            "message": "Mentor deactivated successfully.",
        }, status=status.HTTP_200_OK)

    serializer = MentorSerializer(
        data=request.data,
        partial=True,
        context={"user": user},
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    email = data.get("email")
    if email:
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            return Response({
                "success": False,
                "message": "An account with this email already exists.",
            }, status=status.HTTP_409_CONFLICT)

        if User.objects.filter(username=email).exclude(pk=user.pk).exists():
            return Response({
                "success": False,
                "message": "This username is already in use.",
            }, status=status.HTTP_409_CONFLICT)

    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if email:
        user.email = email
        user.username = email
    if data.get("password"):
        user.set_password(data["password"])

    if any(key in data for key in ("first_name", "last_name", "email", "password")):
        user.save()

    if "specialization" in data:
        profile.specialization = data["specialization"]
    if "phone_number" in data:
        profile.phone_number = data["phone_number"]

    profile.save()

    return Response({
        "success": True,
        "message": "Mentor updated successfully.",
        "mentor": mentor_response(profile),
    }, status=status.HTTP_200_OK)


# ---------------- ADMIN CREATION ----------------

@extend_schema(
    summary="List or create admin accounts",
    request=AdminCreateSerializer,
    responses={200: dict, 201: dict, 400: dict, 403: dict, 409: dict},
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def admin_create(request):
    # GET: return saved administrator accounts
    if request.method == "GET":
        admins = User.objects.filter(
            is_staff=True
        ).order_by("-id")

        data = [
            {
                "id": admin.pk,
                "username": admin.username,
                "first_name": admin.first_name,
                "last_name": admin.last_name,
                "email": admin.email,
                "is_active": admin.is_active,
                "status": "Active" if admin.is_active else "Inactive",
            }
            for admin in admins
        ]

        return Response(
            {
                "success": True,
                "message": "Admin accounts retrieved successfully.",
                "data": data,
            },
            status=status.HTTP_200_OK,
        )

    # POST: create a new administrator
    serializer = AdminCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    email = data["email"].strip().lower()
    username = data["username"].strip()

    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {
                "success": False,
                "message": "An account with this email already exists.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {
                "success": False,
                "message": "This username is already in use.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=data["password"],
        first_name=data["first_name"].strip(),
        last_name=data["last_name"].strip(),
        is_staff=True,
    )

    return Response(
        {
            "success": True,
            "message": "Admin account created successfully.",
            "data": {
                "id": user.pk,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "is_active": user.is_active,
                "status": "Active" if user.is_active else "Inactive",
            },
        },
        status=status.HTTP_201_CREATED,
    )

# ---------------- EXPORT USERS ----------------

@extend_schema(
    summary="Export users",
    responses={200: dict, 400: dict, 501: dict},
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def export_users(request):
    export_format = request.query_params.get("format", "").lower()

    if export_format not in {"csv", "pdf"}:
        return Response(
            {
                "success": False,
                "message": "Use ?format=csv or ?format=pdf.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if export_format == "csv":
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="edutrack_users.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(
            ["id", "username", "first_name", "last_name", "email", "is_active"]
        )

        for user in User.objects.all().order_by("id"):
            writer.writerow(
                [
                    user.pk,
                    user.username,
                    user.first_name,
                    user.last_name,
                    user.email,
                    user.is_active,
                ]
            )

        return response

    return pending_persistence(
        "PDF user export",
        "generation",
    )

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def student_list_create(request):
    if request.method == "GET":
        return Response({
            "success": False,
            "message": "Student listing is pending data integration."
        }, status=status.HTTP_501_NOT_IMPLEMENTED)

    return student_create(request)


# Student Management API
# API-only implementation; no database models or migrations.

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def student_list_create(request):
    if request.method == "GET":
        return Response({
            "message": "Student list API is ready.",
            "students": []
        })

    return Response(
        {
            "message": "Student creation requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsAdminUser])
def student_detail(request, student_id):
    return Response(
        {
            "message": "Student detail API is ready for database integration.",
            "student_id": student_id
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


class StudentCreateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        trim_whitespace=False,
    )
    pin_number = serializers.CharField(max_length=30)
    percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100,
    )
    branch = serializers.CharField(max_length=100)
    section = serializers.CharField(max_length=20)
    phone_number = serializers.RegexField(
        regex=r"^\+?[0-9]{10,15}$",
        error_messages={
            "invalid": "Enter a valid phone number with 10 to 15 digits."
        },
    )

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value

    def validate_pin_number(self, value):
        if Student.objects.filter(pin_number=value).exists():
            raise serializers.ValidationError(
                "This student PIN already exists."
            )
        return value


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def student_list_create(request):
    if request.method == "GET":
        students = Student.objects.select_related("user").all()
        serializer = StudentSerializer(students, many=True)
        return Response({
            "success": True,
            "count": students.count(),
            "students": serializer.data,
        })

    serializer = StudentCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    username = data["pin_number"]
    if User.objects.filter(username=username).exists():
        return Response(
            {
                "success": False,
                "message": "This PIN is already used as a username.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    with transaction.atomic():
        user = User.objects.create_user(
            username=username,
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"],
            last_name=data["last_name"],
        )

        student = Student.objects.create(
            user=user,
            pin_number=data["pin_number"],
            percentage=data["percentage"],
            branch=data["branch"],
            section=data["section"],
            phone_number=data["phone_number"],
        )

    return Response(
        {
            "success": True,
            "message": "Student created successfully.",
            "student": StudentSerializer(student).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def student_detail(request, student_id):
    student = get_object_or_404(
        Student.objects.select_related("user"),
        pk=student_id,
    )

    if request.method == "GET":
        return Response({
            "success": True,
            "student": StudentSerializer(student).data,
        })

    if request.method == "DELETE":
        # Permanently delete both the Student profile and its login account.
        # The atomic block prevents a partial deletion if related records
        # protect either object from being deleted.
        student_user = student.user

        try:
            with transaction.atomic():
                student.delete()
                student_user.delete()
        except ProtectedError:
            return Response(
                {
                    "success": False,
                    "message": (
                        "This student cannot be deleted because other records "
                        "depend on the student or account. Remove or reassign "
                        "those related records first."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            {
                "success": True,
                "message": "Student deleted successfully.",
            },
            status=status.HTTP_200_OK,
        )

    serializer = StudentSerializer(
        student,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)

    validated = serializer.validated_data
    user_data = validated.pop("user", {})

    for field, value in validated.items():
        setattr(student, field, value)

    for field, value in user_data.items():
        setattr(student.user, field, value)

    if user_data:
        student.user.save()

    student.save()

    return Response({
        "success": True,
        "message": "Student updated successfully.",
        "student": StudentSerializer(student).data,
    })


@extend_schema(
    summary="Refresh access token",
    responses={200: dict, 400: dict},
)
@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token_view(request):
    serializer = TokenRefreshSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    return Response(
        {
            "success": True,
            "data": serializer.validated_data,
        },
        status=status.HTTP_200_OK,
    )


from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import StudentSettings
from .serializers import StudentSettingsSerializer


def is_student_user(user):
    # Check the existing Student profile relationship.
    has_student_profile = Student.objects.filter(user=user).exists()

    # Also support the project's existing STUDENT group.
    belongs_to_student_group = user.groups.filter(
        name__iexact="STUDENT"
    ).exists()

    return has_student_profile or belongs_to_student_group


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def student_settings(request):
    if not is_student_user(request.user):
        return Response(
            {
                "success": False,
                "message": "Student access is required.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    settings_obj, _ = StudentSettings.objects.get_or_create(
        user=request.user
    )

    if request.method == "GET":
        serializer = StudentSettingsSerializer(settings_obj)

        return Response(
            {
                "success": True,
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    serializer = StudentSettingsSerializer(
        settings_obj,
        data=request.data,
        partial=True,
    )

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer.save()

    return Response(
        {
            "success": True,
            "message": "Student settings saved successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )

from django.contrib.auth import get_user_model
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

User = get_user_model()


def is_admin_account(user):
    """
    Identify administrator accounts.
    Adjust this function if your custom User model
    uses a different role field or admin flag.
    """
    if user.is_superuser or user.is_staff:
        return True

    role = getattr(user, "role", "")

    # Supports a string role field or a related role object.
    role = getattr(role, "name", role)

    return str(role).strip().lower() == "admin"


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def admin_list_delete(request, admin_id=None):
    """
    GET    /api/users/admins/
    DELETE /api/users/admins/<admin_id>/
    """

    # Only authorized administrators can manage admin accounts.
    if not is_admin_account(request.user):
        return Response(
            {
                "success": False,
                "message": "Only administrators can manage admin accounts."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "GET":
        admins = User.objects.filter(
            Q(is_staff=True) | Q(is_superuser=True)
        ).order_by("-id")

        # Also include users with role='admin', when the model has
        # a string role field.
        if any(field.name == "role" for field in User._meta.get_fields()):
            try:
                admins = User.objects.filter(
                    Q(is_staff=True) |
                    Q(is_superuser=True) |
                    Q(role__iexact="admin")
                ).order_by("-id")
            except Exception:
                pass

        data = [
            {
                "id": admin.pk,
                "username": admin.get_username(),
                "first_name": admin.first_name,
                "last_name": admin.last_name,
                "email": admin.email,
                "is_active": admin.is_active,
                "status": "Active" if admin.is_active else "Inactive",
            }
            for admin in admins
        ]

        return Response(
            {
                "success": True,
                "admins": data
            },
            status=status.HTTP_200_OK
        )

    # DELETE
    try:
        admin = User.objects.get(pk=admin_id)
    except User.DoesNotExist:
        return Response(
            {
                "success": False,
                "message": "Administrator account not found."
            },
            status=status.HTTP_404_NOT_FOUND
        )

    if not is_admin_account(admin):
        return Response(
            {
                "success": False,
                "message": "The selected account is not an administrator."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Prevent deleting the currently logged-in administrator.
    if admin.pk == request.user.pk:
        return Response(
            {
                "success": False,
                "message": "You cannot delete your own administrator account."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    username = admin.get_username()
    admin.delete()

    return Response(
        {
            "success": True,
            "message": f"Administrator '{username}' deleted successfully."
        },
        status=status.HTTP_200_OK
    )