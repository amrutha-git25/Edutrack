from django.urls import path

from . import views


urlpatterns = [
    path(
        "",
        views.placements_list_create,
        name="placements-list-create",
    ),
    path(
        "applications/my/",
        views.my_placement_applications,
        name="my-placement-applications",
    ),
    path(
        "<int:placement_id>/",
        views.placement_detail,
        name="placement-detail",
    ),
    path(
        "<int:placement_id>/apply/",
        views.apply_for_placement,
        name="apply-for-placement",
    ),
]