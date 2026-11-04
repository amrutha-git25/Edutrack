from rest_framework.permissions import BasePermission


def normalized_role(user):
    """Support projects that store role as a field or as a Django Group."""
    role = getattr(user, "role", "") or ""
    role = str(role).upper()
    if role:
        return role
    try:
        group_names = {name.upper() for name in user.groups.values_list("name", flat=True)}
    except Exception:
        group_names = set()
    for candidate in ("STUDENT", "MENTOR", "ADMIN"):
        if candidate in group_names:
            return candidate
    if getattr(user, "is_superuser", False):
        return "ADMIN"
    return ""


class IsStudentUser(BasePermission):
    message = "Only authenticated students can access the student dashboard."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and normalized_role(request.user) == "STUDENT"
        )
