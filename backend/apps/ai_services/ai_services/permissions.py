
from rest_framework.permissions import BasePermission


class IsEduTrackAdmin(BasePermission):
    """
    Restrict AI exam generation and management to EduTrack admins.
    """

    message = "Only administrators can manage AI-generated exams."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        role = getattr(user, "role", "")
        role = str(role).upper()

        return user.is_superuser or role == "ADMIN"
