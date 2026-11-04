
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FeeRecord, Payment
from .serializers import FeeRecordSerializer, PaymentSerializer


def is_admin(user):
    return (
        user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "").lower() == "admin"
        )
    )


class IsEduTrackAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)


class FeeRecordListCreateView(generics.ListCreateAPIView):
    serializer_class = FeeRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = FeeRecord.objects.select_related(
            "student", "course", "created_by"
        )

        if is_admin(user):
            queryset = queryset.filter(is_archived=False)
        else:
            queryset = queryset.filter(
                student=user,
                is_archived=False,
            )

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(student__email__icontains=search)
                | Q(course__title__icontains=search)
            )

        fee_status = self.request.query_params.get("status")
        if fee_status:
            queryset = queryset.filter(status=fee_status)

        return queryset

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated(), IsEduTrackAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class FeeRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FeeRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "put", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        queryset = FeeRecord.objects.select_related(
            "student", "course", "created_by"
        )

        if is_admin(user):
            return queryset

        return queryset.filter(
            student=user,
            is_archived=False,
        )

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "DELETE"):
            return [permissions.IsAuthenticated(), IsEduTrackAdmin()]
        return super().get_permissions()

    def perform_update(self, serializer):
        instance = self.get_object()

        if instance.is_archived:
            raise ValidationError("Archived fee records cannot be updated.")

        serializer.save()

    def perform_destroy(self, instance):
        # Preserve financial history rather than deleting the record.
        instance.is_archived = True
        instance.status = FeeRecord.Status.ARCHIVED
        instance.save(update_fields=["is_archived", "status", "updated_at"])


class PaymentListCreateView(generics.ListCreateAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Payment.objects.select_related(
            "fee_record", "student", "recorded_by"
        )

        if not is_admin(user):
            queryset = queryset.filter(student=user)

        payment_status = self.request.query_params.get("status")
        if payment_status:
            queryset = queryset.filter(status=payment_status)

        fee_record_id = self.request.query_params.get("fee_record")
        if fee_record_id:
            queryset = queryset.filter(fee_record_id=fee_record_id)

        return queryset

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated(), IsEduTrackAdmin()]
        return super().get_permissions()


class PaymentDetailView(generics.RetrieveAPIView):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Payment.objects.select_related(
            "fee_record", "student", "recorded_by"
        )

        if is_admin(self.request.user):
            return queryset

        return queryset.filter(student=self.request.user)


class PaymentReceiptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        queryset = Payment.objects.select_related(
            "fee_record", "student"
        )

        if not is_admin(request.user):
            queryset = queryset.filter(student=request.user)

        payment = generics.get_object_or_404(queryset, pk=pk)

        return Response({
            "receipt_number": f"EDU-PAY-{payment.pk:06d}",
            "payment_id": payment.pk,
            "student": payment.student.get_full_name()
            or getattr(payment.student, "email", str(payment.student)),
            "fee_record_id": payment.fee_record_id,
            "amount": str(payment.amount),
            "payment_method": payment.get_payment_method_display(),
            "transaction_id": payment.transaction_id,
            "status": payment.get_status_display(),
            "paid_at": (
                payment.paid_at.isoformat()
                if payment.paid_at else None
            ),
        })


class FeeSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        queryset = FeeRecord.objects.filter(is_archived=False)

        if not is_admin(user):
            queryset = queryset.filter(student=user)

        total_fee = sum(
            (record.net_fee for record in queryset),
            start=0,
        )
        pending = sum(
            (record.pending_amount for record in queryset),
            start=0,
        )
        collected = total_fee - pending

        return Response({
            "total_fee": str(total_fee),
            "collected_amount": str(collected),
            "pending_amount": str(pending),
            "total_records": queryset.count(),
            "overdue_records": queryset.filter(
                due_date__lt=timezone.localdate()
            ).exclude(
                status__in=[
                    FeeRecord.Status.PAID,
                    FeeRecord.Status.ARCHIVED,
                ]
            ).count(),
        })


from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Payment
from .serializers import PaymentSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_payments(request):
    payments = Payment.objects.filter(
        student=request.user
    ).select_related("fee_record", "student")

    serializer = PaymentSerializer(
        payments,
        many=True,
        context={"request": request},
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_detail(request, pk):
    try:
        payment = Payment.objects.select_related(
            "fee_record", "student"
        ).get(pk=pk, student=request.user)
    except Payment.DoesNotExist:
        return Response(
            {"detail": "Payment not found."},
            status=404,
        )

    serializer = PaymentSerializer(
        payment,
        context={"request": request},
    )
    return Response(serializer.data)
