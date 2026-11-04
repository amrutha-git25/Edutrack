
from django.urls import path

from . import views

urlpatterns = [
    # Fee management
    path(
        "fee-records/",
        views.FeeRecordListCreateView.as_view(),
        name="fee-record-list-create",
    ),
    path(
        "fee-records/<int:pk>/",
        views.FeeRecordDetailView.as_view(),
        name="fee-record-detail",
    ),
    path(
        "summary/",
        views.FeeSummaryView.as_view(),
        name="fee-summary",
    ),

    # Payment management
    path(
        "",
        views.PaymentListCreateView.as_view(),
        name="payment-list-create",
    ),
    path(
        "my/",
        views.my_payments,
        name="my-payments",
    ),
    path(
        "<int:pk>/",
        views.PaymentDetailView.as_view(),
        name="payment-detail",
    ),
    path(
        "<int:pk>/receipt/",
        views.PaymentReceiptView.as_view(),
        name="payment-receipt",
    ),
]
