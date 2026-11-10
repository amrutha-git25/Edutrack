
from django.urls import path

from .views import (
    student_profile,
    upload_student_profile_picture,
    student_change_password,
)
from .password_reset_views import (
    password_reset_request,
    password_reset_confirm,
)
from .views import (
    api_status,
    send_registration_otp,
    verify_registration_otp,
    resend_registration_otp,
    login_view,
    refresh_token_view,
    logout_view,
    get_profile,
    update_profile,
    change_password,
    upload_profile_picture,
    delete_profile_picture,
    AdminSystemSettingsView,
)
from .views import get_profile_picture_content
urlpatterns = [
    path("status/", api_status, name="api-status"),

    path(
        "register/send-otp/",
        send_registration_otp,
        name="register-send-otp",
    ),
    path(
        "register/verify-otp/",
        verify_registration_otp,
        name="register-verify-otp",
    ),
    path(
        "register/resend-otp/",
        resend_registration_otp,
        name="register-resend-otp",
    ),

    path("login/", login_view, name="login"),
    path("token/refresh/", refresh_token_view, name="token-refresh"),
    path("logout/", logout_view, name="logout"),

    # Admin profile
    path("me/", get_profile, name="my-profile"),
    path("profile/", get_profile, name="admin-profile"),
    path("profile/update/", update_profile, name="update-admin-profile"),
    path(
        "profile/photo/",
        upload_profile_picture,
        name="upload-admin-profile-picture",
    ),
    path(
        "profile/photo/remove/",
        delete_profile_picture,
        name="delete-admin-profile-picture",
    ),
    path("change-password/", change_password, name="change-password"),

    # Admin system settings
    path(
        "admin-settings/",
        AdminSystemSettingsView.as_view(),
        name="admin-system-settings",
    ),
    path(
    "student/profile/",
    student_profile,
    name="student-profile",
),
path(
    "student/profile/picture/",
    upload_student_profile_picture,
    name="student-profile-picture",
),
path(
    "student/profile/change-password/",
    student_change_password,
    name="student-change-password",
),
path(
    "password-reset/",
    password_reset_request,
    name="password-reset-request",
),
path(
    "password-reset/confirm/",
    password_reset_confirm,
    name="password-reset-confirm",
),
path(
    "auth/profile/photo/content/",
    get_profile_picture_content,
    name="get_profile_picture_content",
),

]
