
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import FeeRecord, Payment


class FeeRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    course_name = serializers.CharField(
        source="course.title",
        read_only=True,
        default=None,
    )
    net_fee = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = FeeRecord
        fields = [
            "id",
            "student",
            "student_name",
            "course",
            "course_name",
            "total_fee",
            "discount",
            "net_fee",
            "pending_amount",
            "payment_type",
            "due_date",
            "notes",
            "status",
            "is_archived",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "pending_amount",
            "status",
            "is_archived",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def get_student_name(self, obj):
        user = obj.student
        full_name = user.get_full_name()
        return full_name or getattr(user, "email", str(user))

    def validate(self, attrs):
        total_fee = attrs.get(
            "total_fee",
            getattr(self.instance, "total_fee", None),
        )
        discount = attrs.get(
            "discount",
            getattr(self.instance, "discount", Decimal("0.00")),
        )

        if total_fee is not None and discount is not None:
            if discount > total_fee:
                raise serializers.ValidationError({
                    "discount": "Discount cannot exceed the total fee."
                })

        return attrs

    def create(self, validated_data):
        validated_data["pending_amount"] = (
            validated_data["total_fee"] - validated_data.get(
                "discount", Decimal("0.00")
            )
        )
        return super().create(validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    fee_record_id = serializers.IntegerField(
        source="fee_record.id",
        read_only=True,
    )

    class Meta:
        model = Payment
        fields = [
            "id",
            "fee_record",
            "fee_record_id",
            "student",
            "student_name",
            "amount",
            "payment_method",
            "transaction_id",
            "status",
            "notes",
            "recorded_by",
            "paid_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "student",
            "status",
            "recorded_by",
            "paid_at",
            "created_at",
        ]

    def get_student_name(self, obj):
        user = obj.student
        full_name = user.get_full_name()
        return full_name or getattr(user, "email", str(user))

    def validate(self, attrs):
        fee_record = attrs.get(
            "fee_record",
            getattr(self.instance, "fee_record", None),
        )
        amount = attrs.get(
            "amount",
            getattr(self.instance, "amount", None),
        )

        if fee_record and amount is not None:
            if fee_record.is_archived:
                raise serializers.ValidationError(
                    "Payments cannot be recorded against an archived fee."
                )

            if amount > fee_record.pending_amount:
                raise serializers.ValidationError({
                    "amount": "Payment cannot exceed the pending amount."
                })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        fee_record = validated_data["fee_record"]

        fee_record = FeeRecord.objects.select_for_update().get(
            pk=fee_record.pk
        )

        amount = validated_data["amount"]

        if fee_record.is_archived:
            raise serializers.ValidationError(
                "This fee record is archived."
            )

        if amount > fee_record.pending_amount:
            raise serializers.ValidationError({
                "amount": "Payment exceeds the remaining fee."
            })

        request = self.context.get("request")
        validated_data["student"] = fee_record.student

        if request and request.user and request.user.is_authenticated:
            validated_data["recorded_by"] = request.user

        payment = Payment.objects.create(**validated_data)

        fee_record.pending_amount -= amount

        if fee_record.pending_amount == Decimal("0.00"):
            fee_record.status = FeeRecord.Status.PAID
        else:
            fee_record.status = FeeRecord.Status.PARTIALLY_PAID

        fee_record.save(update_fields=[
            "pending_amount",
            "status",
            "updated_at",
        ])

        return payment
